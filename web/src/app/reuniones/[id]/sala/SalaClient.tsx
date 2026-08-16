'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { Waveform } from '@/components/Waveform';
import { Avatar, Banner, Button, Card, Pill, WfTag } from '@/components/ui';
import type { Meeting, TranscriptSegment } from '@/lib/types';

/** Duración de cada fragmento de audio, en milisegundos (WF 06). */
const CHUNK_MS = 30_000;

type RecordingState = 'idle' | 'starting' | 'recording' | 'paused' | 'stopped' | 'error';

interface ChunkStatus {
  index: number;
  at: string;
  state: 'sending' | 'sent' | 'failed';
}

function formatElapsed(seconds: number): string {
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor(seconds / 60) % 60).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export function SalaClient({
  meeting,
  demoTranscript,
  isMock,
}: {
  meeting: Meeting;
  demoTranscript: TranscriptSegment[];
  isMock: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [state, setState] = useState<RecordingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [chunks, setChunks] = useState<ChunkStatus[]>([]);
  const [present, setPresent] = useState<Record<string, boolean>>(
    Object.fromEntries(meeting.participants.map((p) => [p.name, p.present ?? true])),
  );
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [marks, setMarks] = useState<string[]>([]);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunkIndex = useRef(0);
  const feedRef = useRef<HTMLDivElement | null>(null);

  /* ── Cronómetro ── */
  useEffect(() => {
    if (state !== 'recording') return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [state]);

  /* ── Transcripción de demostración: aparece al ritmo de la reunión ── */
  useEffect(() => {
    if (!isMock || state !== 'recording') return;
    const shown = Math.min(Math.floor(elapsed / 6) + 1, demoTranscript.length);
    setSegments(demoTranscript.slice(0, shown));
  }, [isMock, state, elapsed, demoTranscript]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' });
  }, [segments.length, marks.length]);

  /* ── Envío de un fragmento al WF 06 ── */
  const sendChunk = useCallback(
    async (blob: Blob) => {
      const index = ++chunkIndex.current;
      const at = new Date().toISOString();
      setChunks((c) => [...c.slice(-4), { index, at, state: 'sending' }]);

      const form = new FormData();
      form.append('data', blob, `chunk-${index}.webm`);
      form.append('meeting_id', meeting.meeting_id);
      form.append('timestamp', at);
      form.append(
        'participantes_esperados',
        JSON.stringify(Object.entries(present).filter(([, v]) => v).map(([k]) => k)),
      );

      try {
        const res = await fetch('/api/n8n/audio-chunk', { method: 'POST', body: form });
        setChunks((c) =>
          c.map((x) => (x.index === index ? { ...x, state: res.ok ? 'sent' : 'failed' } : x)),
        );
        if (!res.ok) {
          toast({
            tone: 'warn',
            title: `Fragmento ${index} no llegó a n8n`,
            detail: 'La grabación continúa. Solo se perdió este tramo.',
          });
        }
      } catch {
        // Un fragmento perdido no interrumpe la reunión ni descarta los anteriores.
        setChunks((c) => c.map((x) => (x.index === index ? { ...x, state: 'failed' } : x)));
        toast({
          tone: 'warn',
          title: `Fragmento ${index} sin enviar`,
          detail: 'Sin conexión. La grabación sigue en marcha.',
        });
      }
    },
    [meeting.meeting_id, present, toast],
  );

  /* ── Iniciar ── */
  const start = useCallback(async () => {
    setError(null);
    setState('starting');

    // El WF 05 marca la reunión como in_progress antes de grabar nada.
    try {
      await fetch('/api/n8n/start-meeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meeting_id: meeting.meeting_id,
          teacher_id: meeting.teacher_id,
          student_id: meeting.student_id,
          participants: meeting.participants.map((p) => ({
            role: p.role,
            name: p.name,
            present: present[p.name] ?? false,
          })),
        }),
      });
    } catch {
      // Si el WF 05 no responde no bloqueamos la reunión: lo importante es grabar.
    }

    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = media;
      setStream(media);
      const recorder = new MediaRecorder(media);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) void sendChunk(e.data);
      };
      recorder.start(CHUNK_MS);
      recorderRef.current = recorder;
      setState('recording');
      toast({
        tone: 'ok',
        title: 'Grabación iniciada',
        detail: `Se enviará un fragmento cada ${CHUNK_MS / 1000} segundos.`,
      });
    } catch {
      setState('error');
      setError(
        'No se pudo acceder al micrófono. Revisa los permisos del navegador y vuelve a intentarlo.',
      );
      toast({
        tone: 'crit',
        title: 'Micrófono no disponible',
        detail: 'Sin micrófono no hay transcripción ni acta.',
      });
    }
  }, [meeting, present, sendChunk, toast]);

  /* ── Pausar / reanudar / detener ── */
  const togglePause = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec) return;
    if (rec.state === 'recording') {
      rec.pause();
      setState('paused');
    } else if (rec.state === 'paused') {
      rec.resume();
      setState('recording');
    }
  }, []);

  const finish = useCallback(() => {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setState('stopped');
    router.push(`/reuniones/${encodeURIComponent(meeting.meeting_id)}/revision`);
  }, [meeting.meeting_id, router]);

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const markAgreement = () => {
    setMarks((m) => [...m, formatElapsed(elapsed)]);
  };

  const recording = state === 'recording';
  const lastChunk = chunks[chunks.length - 1];

  return (
    <div className="flex items-start gap-3.5 max-lg:flex-col">
      {/* ── Control de grabación ── */}
      <div className="flex w-[340px] shrink-0 flex-col gap-3.5 max-lg:w-full">
        <Card>
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className={`size-3 shrink-0 rounded-full ${
                recording ? 'animate-pulse bg-crit' : state === 'paused' ? 'bg-warn' : 'bg-line-strong'
              }`}
            />
            <div>
              <p className="tabular font-data text-[31px] leading-none">{formatElapsed(elapsed)}</p>
              <p className="mt-1 font-data text-[10px] tracking-wider text-ink-3 uppercase">
                {recording
                  ? 'Grabando'
                  : state === 'paused'
                    ? 'En pausa'
                    : state === 'starting'
                      ? 'Iniciando…'
                      : 'Sin grabar'}
              </p>
            </div>
          </div>

          <Waveform stream={stream} active={recording} />

          {error && (
            <div className="mt-3.5">
              <Banner tone="crit" title="Micrófono no disponible">
                <p className="mt-0.5">{error}</p>
              </Banner>
            </div>
          )}

          {lastChunk && (
            <div className="mt-3 flex items-center justify-between gap-2.5 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs">
              <span>
                Fragmento <b className="tabular font-data">{lastChunk.index}</b>
              </span>
              <Pill
                tone={
                  lastChunk.state === 'sent' ? 'ok' : lastChunk.state === 'failed' ? 'crit' : 'neutral'
                }
              >
                {lastChunk.state === 'sent'
                  ? 'Enviado'
                  : lastChunk.state === 'failed'
                    ? 'Reintentará'
                    : 'Enviando…'}
              </Pill>
            </div>
          )}

          <div className="mt-3 flex flex-col gap-2">
            {state === 'idle' || state === 'error' ? (
              <Button variant="primary" onClick={start}>
                Iniciar grabación
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button className="flex-1" onClick={togglePause} disabled={state === 'starting'}>
                  {state === 'paused' ? 'Reanudar' : 'Pausar'}
                </Button>
                <Button className="flex-1" onClick={markAgreement} disabled={!recording}>
                  Marcar acuerdo
                </Button>
              </div>
            )}
            <Button variant="primary" onClick={finish} disabled={state === 'idle'}>
              Finalizar y generar acta
            </Button>
          </div>

          <p className="mt-2.5 text-center text-[11px] text-ink-3">
            El audio se envía en fragmentos de {CHUNK_MS / 1000} s. La grabación no empieza sin tu
            permiso explícito.
          </p>
        </Card>

        <Card title="Participantes presentes" bodyClassName="px-4 py-1">
          <ul className="flex list-none flex-col">
            {meeting.participants.map((p, i) => (
              <li key={p.name} className={`flex items-center gap-3 py-2.5 ${i > 0 ? 'border-t border-line' : ''}`}>
                <Avatar initials={p.name.split(' ').slice(0, 2).map((w) => w[0]).join('')} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium">{p.name}</span>
                  <span className="block text-[11px] text-ink-3 capitalize">{p.role}</span>
                </span>
                <label className="flex cursor-pointer items-center gap-2 text-[11px] text-ink-3">
                  <input
                    type="checkbox"
                    checked={present[p.name] ?? false}
                    onChange={(e) => setPresent((s) => ({ ...s, [p.name]: e.target.checked }))}
                    className="size-4 accent-[var(--accent)]"
                  />
                  Presente
                </label>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* ── Transcripción ── */}
      <Card
        className="min-w-0 flex-1 max-lg:w-full"
        title="Transcripción en vivo"
        aside={<Pill tone="warn">Hablantes por confirmar</Pill>}
        bodyClassName="p-0"
      >
        <div ref={feedRef} className="max-h-[420px] overflow-y-auto px-4 pb-4">
          {segments.length === 0 && marks.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-ink-3">
              {state === 'idle'
                ? 'La transcripción aparecerá aquí cuando inicies la grabación.'
                : 'Esperando el primer fragmento transcrito…'}
            </p>
          ) : (
            <ul className="flex list-none flex-col">
              {segments.map((s, i) => (
                <li
                  key={s.timestamp}
                  className={`grid grid-cols-[64px_1fr] gap-3 py-2.5 ${i > 0 ? 'border-t border-line' : ''}`}
                >
                  <span className="tabular pt-0.5 font-data text-[11px] text-ink-3">
                    {s.timestamp.slice(11, 19)}
                  </span>
                  <span>
                    <span className="block text-[11px] font-bold tracking-wide text-accent uppercase">
                      {s.speaker ?? 'Sin identificar'}
                      {s.flagged_by_teacher && ' · acuerdo marcado'}
                    </span>
                    <span className="mt-0.5 block text-[13px] text-ink-2">{s.text}</span>
                  </span>
                </li>
              ))}
              {marks.map((m) => (
                <li key={m} className="my-1 grid grid-cols-[64px_1fr] gap-3 rounded-lg bg-accent-soft px-2.5 py-2.5">
                  <span className="tabular pt-0.5 font-data text-[11px] text-ink-3">{m}</span>
                  <span>
                    <span className="block text-[11px] font-bold tracking-wide text-accent uppercase">
                      Marca manual de la docente
                    </span>
                    <span className="mt-0.5 block text-[13px] text-ink-2">
                      Punto marcado para revisar al generar el acta.
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="border-t border-line px-4 py-2.5">
          <WfTag>
            {isMock
              ? 'MODO DEMOSTRACIÓN · NO SE ENVÍA AUDIO A N8N'
              : 'WF 06 AUDIO-CHUNK · WF 07 SPEAKER IDENTIFICATION'}
          </WfTag>
        </footer>
      </Card>
    </div>
  );
}
