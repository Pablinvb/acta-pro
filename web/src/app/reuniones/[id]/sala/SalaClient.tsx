'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { Waveform } from '@/components/Waveform';
import { Avatar, Banner, Button, Card, Pill, WfTag } from '@/components/ui';
import type { Meeting, TranscriptSegment } from '@/lib/types';
import { IdentificarVoces } from './IdentificarVoces';

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
  /**
   * La sala tiene dos fases: la reunión, y la identificación de voces al
   * terminar. Se separan porque son dos tareas distintas: durante la reunión la
   * docente está atendiendo a las personas, no clasificando audio.
   */
  const [phase, setPhase] = useState<'meeting' | 'identify'>('meeting');
  const [finalizing, setFinalizing] = useState(false);
  const [closing, setClosing] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunkIndex = useRef(0);
  /** Fragmentos seguidos sin voz reconocida. */
  const silentStreak = useRef(0);
  /**
   * Todo el audio de la reunión, además de enviarse por fragmentos.
   *
   * Hace falta guardarlo porque cada fragmento se diariza por separado: la
   * «Voz A» del minuto 1 no es la misma persona que la del minuto 2. Solo
   * transcribiendo la reunión entera de una vez salen etiquetas coherentes.
   * Cuarenta minutos ocupan unas decenas de megas en memoria.
   */
  const fullAudio = useRef<Blob[]>([]);
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
        const res = await fetch(`/api/reuniones/${encodeURIComponent(meeting.meeting_id)}/audio`, {
          method: 'POST',
          body: form,
        });
        setChunks((c) =>
          c.map((x) => (x.index === index ? { ...x, state: res.ok ? 'sent' : 'failed' } : x)),
        );

        if (res.ok) {
          /*
           * Un fragmento en silencio es normal — hay pausas. Varios seguidos no:
           * significa micrófono silenciado o idioma mal configurado, y en ambos
           * casos la reunión se estaría grabando en vano. Vale la pena
           * interrumpir para avisar.
           */
          const body = await res.json();
          if (body.silent) {
            silentStreak.current += 1;
            if (silentStreak.current === 3) {
              toast({
                tone: 'crit',
                title: 'No se está reconociendo voz',
                detail: 'Comprueba el micrófono: llevas minuto y medio sin transcribir nada.',
              });
            }
          } else {
            silentStreak.current = 0;
          }
        }

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
      await fetch(`/api/reuniones/${encodeURIComponent(meeting.meeting_id)}/iniciar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participants: meeting.participants.map((p) => ({
            role: p.role,
            name: p.name,
            present: present[p.name] ?? false,
          })),
        }),
      });
    } catch {
      // Si el registro de inicio falla no bloqueamos la reunión: lo importante
      // es grabar; el estado se puede reconciliar después.
    }

    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = media;
      setStream(media);
      const recorder = new MediaRecorder(media);
      recorder.ondataavailable = (e) => {
        if (e.data.size === 0) return;
        fullAudio.current.push(e.data);
        void sendChunk(e.data);
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

  /**
   * Cierra la grabación y hace la pasada final sobre el audio completo antes de
   * identificar voces. Sin esa pasada, las etiquetas de voz serían distintas en
   * cada fragmento y la identificación no significaría nada.
   */
  const finish = useCallback(() => {
    const recorder = recorderRef.current;
    setState('stopped');
    setFinalizing(true);

    const run = async () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());

      const blob = new Blob(fullAudio.current, { type: 'audio/webm' });
      if (blob.size === 0) {
        setFinalizing(false);
        setPhase('identify');
        return;
      }

      const form = new FormData();
      form.append('data', blob, 'reunion.webm');

      try {
        const res = await fetch(
          `/api/reuniones/${encodeURIComponent(meeting.meeting_id)}/transcripcion-final`,
          { method: 'POST', body: form },
        );
        const body = await res.json();

        if (!res.ok) {
          toast({
            tone: 'crit',
            title: 'No se pudo procesar la reunión completa',
            detail: body.message ?? 'Se conserva la transcripción por fragmentos.',
          });
        } else if (body.voices <= 1 && meeting.participants.filter((p) => p.present).length > 1) {
          // Vale la pena interrumpir: significa que habrá que atribuir a mano.
          toast({
            tone: 'warn',
            title: 'No se pudieron separar las voces',
            detail:
              'Hablaba más de una persona pero se detectó una sola. Revisa la atribución con cuidado.',
          });
        } else if (!body.reliable) {
          toast({
            tone: 'warn',
            title: 'Separación de voces poco fiable',
            detail: `Confianza ${(body.speakerConfidence * 100).toFixed(0)} %. Comprueba cada voz antes de confirmar.`,
          });
        }
      } catch {
        toast({
          tone: 'crit',
          title: 'Sin conexión con el servidor',
          detail: 'Se conserva la transcripción por fragmentos.',
        });
      } finally {
        setFinalizing(false);
        setPhase('identify');
      }
    };

    if (recorder && recorder.state !== 'inactive') {
      // `stop()` emite un último fragmento: hay que esperarlo o se pierde.
      recorder.onstop = () => void run();
      recorder.stop();
    } else {
      void run();
    }
  }, [meeting.meeting_id, meeting.participants, toast]);

  /**
   * Cierra la reunión: depura la transcripción, la analiza, genera el borrador
   * y lo pasa por la revisión de lenguaje. Solo entonces se va a la revisión.
   */
  const closeMeeting = useCallback(async () => {
    setClosing(true);
    try {
      const res = await fetch(`/api/reuniones/${encodeURIComponent(meeting.meeting_id)}/cerrar`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = await res.json();
        toast({
          tone: 'crit',
          title: 'No se pudo generar el acta',
          detail: body.message ?? 'La transcripción sigue guardada. Reintenta.',
        });
        return;
      }
      router.push(`/reuniones/${encodeURIComponent(meeting.meeting_id)}/revision`);
    } catch {
      toast({
        tone: 'crit',
        title: 'Sin conexión con el servidor',
        detail: 'Nada se ha perdido. Reintenta en unos segundos.',
      });
    } finally {
      setClosing(false);
    }
  }, [meeting.meeting_id, router, toast]);

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
  /** Voces distintas detectadas hasta ahora. */
  const voiceCount = new Set(segments.map((s) => s.speaker_tag).filter(Boolean)).size;

  /*
   * Terminada la grabación, la pantalla cambia de tarea: ya no hay reunión que
   * atender, hay voces que identificar. Se muestra sola esa tarea para que no
   * compita con nada.
   */
  if (phase === 'identify') {
    return (
      <IdentificarVoces
        meetingId={meeting.meeting_id}
        participants={meeting.participants}
        onDone={closeMeeting}
      />
    );
  }

  if (finalizing) {
    return (
      <Card>
        <p className="py-10 text-center text-[13px] text-ink-3">
          Procesando la reunión completa para separar las voces…
          <br />
          <span className="text-[11px]">
            Se transcribe entera de una vez: es la única forma de que cada voz sea la misma persona
            de principio a fin.
          </span>
        </p>
      </Card>
    );
  }

  if (closing) {
    return (
      <Card>
        <p className="py-10 text-center text-[13px] text-ink-3">
          Depurando la transcripción, analizándola y redactando el acta…
        </p>
      </Card>
    );
  }

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
              Finalizar e identificar voces
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
        aside={
          voiceCount > 0 ? (
            <Pill tone="accent">
              {voiceCount} voz/voces detectadas
            </Pill>
          ) : null
        }
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
                    <span className="flex flex-wrap items-center gap-2">
                      {/* Durante la reunión solo se muestra qué voz es. Ponerle
                          nombre se hace al terminar, de una vez por persona. */}
                      <span
                        className={`rounded-md border px-1.5 py-0.5 text-[11px] font-bold tracking-wide uppercase ${
                          s.speaker
                            ? 'border-ok-border bg-ok-soft text-ok'
                            : s.speaker_tag
                              ? 'border-accent-border bg-accent-soft text-accent'
                              : 'border-line bg-surface-2 text-ink-3'
                        }`}
                      >
                        {s.speaker ?? (s.speaker_tag ? `Voz ${s.speaker_tag}` : 'Sin identificar')}
                      </span>
                      {s.flagged_by_teacher && <Pill tone="accent">Acuerdo marcado</Pill>}
                    </span>
                    <span className="mt-1 block text-[13px] text-ink-2">
                      {s.clean_text ?? s.text}
                    </span>
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

        <footer className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5">
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
