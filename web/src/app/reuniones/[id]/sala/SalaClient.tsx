'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { RecordOrb } from '@/components/RecordOrb';
import { colorFor, PersonAvatar, roleLabel } from '@/components/people';
import { Banner, Button, Card, Pill } from '@/components/ui';
import type { Meeting, TranscriptSegment } from '@/lib/types';
import { IdentificarVoces } from './IdentificarVoces';
import { RevisarAtribucion } from './RevisarAtribucion';

/**
 * La sala de reunión.
 *
 * Toda la pantalla está gobernada por una idea: **la docente no puede mirarla**.
 * Tiene delante a una familia, y el aparato que hay sobre la mesa compite por
 * una atención que pertenece a esas personas. De ahí las tres decisiones que la
 * separan de un panel de control:
 *
 *  1. Una sola acción grande. Durante la reunión lo único que se hace es marcar
 *     «esto importa». Es el objetivo más grande de la pantalla y se acierta sin
 *     mirar.
 *  2. Ni un dato de ingeniería. Cuántos fragmentos se enviaron es asunto del
 *     programa, no de la docente; lo que necesita saber es si se está guardando.
 *  3. Modo discreto. El iPad queda entre dos personas y el padre o la madre lee
 *     lo que aparece. Una transcripción en crudo se equivoca a menudo, y ver una
 *     frase propia mal transcrita en mitad de la conversación hace daño.
 */

/** Duración de cada fragmento de audio, en milisegundos. */
const CHUNK_MS = 30_000;

type RecordingState = 'idle' | 'starting' | 'recording' | 'paused' | 'stopped' | 'error';

/** Momento señalado por la docente, en segundos desde el inicio de la grabación. */
interface Mark {
  id: number;
  at: number;
  label: string;
}

function formatElapsed(seconds: number): string {
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor(seconds / 60) % 60).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/* ── Agrupación del feed ──────────────────────────────────────────────────── */

type FeedItem =
  | { kind: 'speech'; key: string; tag?: string; name?: string; at: string; texts: string[] }
  | { kind: 'mark'; key: string; at: string; label: string };

/**
 * Junta las intervenciones seguidas de una misma voz en un solo bloque.
 *
 * El reconocimiento de voz corta por pausas de respiración, así que una persona
 * hablando treinta segundos produce ocho o diez fragmentos. Pintados uno por
 * uno, con su etiqueta repetida, la pantalla parece un registro de máquina en
 * lugar de una conversación.
 */
function buildFeed(segments: TranscriptSegment[], marks: Mark[], startedAt: number | null): FeedItem[] {
  const items: FeedItem[] = [];

  for (const s of segments) {
    const last = items[items.length - 1];
    const mismaVoz =
      last?.kind === 'speech' && last.tag === s.speaker_tag && last.name === s.speaker;
    const texto = (s.clean_text ?? s.text).trim();
    if (!texto) continue;

    if (mismaVoz) last.texts.push(texto);
    else {
      items.push({
        kind: 'speech',
        key: s.timestamp,
        tag: s.speaker_tag,
        name: s.speaker,
        at: s.timestamp,
        texts: [texto],
      });
    }
  }

  if (startedAt !== null) {
    for (const m of marks) {
      items.push({
        kind: 'mark',
        key: `marca-${m.id}`,
        at: new Date(startedAt + m.at * 1000).toISOString(),
        label: m.label,
      });
    }
    items.sort((a, b) => a.at.localeCompare(b.at));
  }

  return items;
}

/* ── Pantalla ─────────────────────────────────────────────────────────────── */

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
  const [startedAt, setStartedAt] = useState<number | null>(null);
  /** Tramos que no llegaron al servidor. Se cuentan, no se enumeran. */
  const [unsaved, setUnsaved] = useState(0);
  const [saving, setSaving] = useState(false);
  const [present, setPresent] = useState<Record<string, boolean>>(
    Object.fromEntries(meeting.participants.map((p) => [p.name, p.present ?? true])),
  );
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [discreet, setDiscreet] = useState(false);
  /**
   * La sala tiene tres fases: la reunión, la identificación de voces y el
   * repaso. Se separan porque son tareas distintas: durante la reunión la
   * docente está atendiendo a las personas, no clasificando audio.
   */
  const [phase, setPhase] = useState<'meeting' | 'identify' | 'review'>('meeting');
  const [finalizing, setFinalizing] = useState(false);
  const [closing, setClosing] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
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
  /** El cronómetro leído desde callbacks, sin volver a crearlos en cada tic. */
  const elapsedRef = useRef(0);
  elapsedRef.current = elapsed;
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

  const feed = useMemo(() => buildFeed(segments, marks, startedAt), [segments, marks, startedAt]);

  useEffect(() => {
    if (discreet) return;
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' });
  }, [feed.length, discreet]);

  /* ── Envío de un fragmento a transcribir ── */
  const sendChunk = useCallback(
    async (blob: Blob) => {
      const at = new Date().toISOString();
      setSaving(true);

      const form = new FormData();
      form.append('data', blob, 'chunk.webm');
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

        if (!res.ok) {
          setUnsaved((n) => n + 1);
          return;
        }

        const body = await res.json();

        /*
         * Lo que devuelve el servidor se pinta tal cual. Antes se descartaba y
         * el feed sólo tenía contenido en modo demostración: en una reunión de
         * verdad la docente veía «esperando el primer fragmento» de principio a
         * fin, sin forma de saber si se estaba transcribiendo algo.
         */
        if (Array.isArray(body.segments) && body.segments.length > 0) {
          setSegments((prev) => {
            const vistos = new Set(prev.map((s) => s.timestamp));
            const nuevos = (body.segments as TranscriptSegment[]).filter(
              (s) => !vistos.has(s.timestamp),
            );
            return nuevos.length > 0 ? [...prev, ...nuevos] : prev;
          });
        }

        /*
         * Un fragmento en silencio es normal — hay pausas. Varios seguidos no:
         * significa micrófono silenciado o idioma mal configurado, y en ambos
         * casos la reunión se estaría grabando en vano. Vale la pena
         * interrumpir para avisar.
         */
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
      } catch {
        // Un tramo perdido no interrumpe la reunión ni descarta los anteriores:
        // el audio completo se envía igualmente al finalizar.
        setUnsaved((n) => n + 1);
      } finally {
        setSaving(false);
      }
    },
    [meeting.meeting_id, present, toast],
  );

  /* ── Iniciar ── */
  const start = useCallback(async () => {
    setError(null);
    setState('starting');

    // La reunión se marca como en curso antes de grabar nada.
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
      setStartedAt(Date.now());
      setState('recording');
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

  /* ── Pausar / reanudar ── */
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
   * Señala el instante actual.
   *
   * Se guarda el segundo, no el texto: cuando la docente pulsa, la frase que
   * quiere marcar aún no está transcrita —el fragmento que la contiene sigue
   * grabándose—. Al cerrar la reunión, con la transcripción definitiva hecha,
   * el servidor marca la intervención que ocupa ese segundo.
   */
  const mark = useCallback(() => {
    const at = elapsedRef.current;
    setMarks((m) => [...m, { id: Date.now(), at, label: formatElapsed(at) }]);
  }, []);

  /**
   * Cierra la grabación y hace la pasada final sobre el audio completo antes de
   * identificar voces. Sin esa pasada, las etiquetas de voz serían distintas en
   * cada fragmento y la identificación no significaría nada.
   */
  const finish = useCallback(() => {
    const recorder = recorderRef.current;
    const marcas = marks.map((m) => m.at);
    setState('stopped');
    setFinalizing(true);

    const run = async () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      setStream(null);

      const blob = new Blob(fullAudio.current, { type: 'audio/webm' });
      if (blob.size === 0) {
        setFinalizing(false);
        setPhase('identify');
        return;
      }

      const form = new FormData();
      form.append('data', blob, 'reunion.webm');
      form.append('marcas', JSON.stringify(marcas));

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
  }, [marks, meeting.meeting_id, meeting.participants, toast]);

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

  const recording = state === 'recording';
  const started = state !== 'idle' && state !== 'error';
  /** Voces distintas detectadas hasta ahora. */
  const voiceCount = new Set(segments.map((s) => s.speaker_tag).filter(Boolean)).size;
  const presentNames = meeting.participants.filter((p) => present[p.name]).map((p) => p.name);

  /* ── Fases posteriores a la grabación ── */

  if (phase === 'identify') {
    return (
      <IdentificarVoces
        meetingId={meeting.meeting_id}
        participants={meeting.participants}
        onDone={() => setPhase('review')}
      />
    );
  }

  /*
   * Repaso de atribuciones antes de generar el acta. No es un paso opcional:
   * medido con audio real, la separación automática funde turnos, y el acta
   * atribuye afirmaciones a personas concretas.
   */
  if (phase === 'review') {
    return (
      <RevisarAtribucion
        meetingId={meeting.meeting_id}
        participants={meeting.participants}
        onBack={() => setPhase('identify')}
        onDone={closeMeeting}
      />
    );
  }

  if (finalizing || closing) {
    return (
      <Working
        title={
          finalizing
            ? 'Escuchando la reunión entera de una vez'
            : 'Redactando el acta'
        }
        detail={
          finalizing
            ? 'Es la única forma de que cada voz sea la misma persona de principio a fin.'
            : 'Depurando la transcripción, analizándola y redactando el borrador.'
        }
      />
    );
  }

  /* ── La reunión ── */

  return (
    <div className="flex items-start gap-4 max-lg:flex-col">
      {/* ── Grabación ── */}
      <div className="flex w-[352px] shrink-0 flex-col gap-4 max-lg:w-full">
        <Card bodyClassName="p-5">
          <div className="flex flex-col items-center">
            <RecordOrb stream={stream} state={recording ? 'recording' : state === 'paused' ? 'paused' : state === 'starting' ? 'starting' : 'idle'}>
              <span className="tabular font-data text-[26px] leading-none">
                {formatElapsed(elapsed)}
              </span>
              <span className="mt-1.5 flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.1em] text-ink-3 uppercase">
                {recording && <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-crit" />}
                {recording
                  ? 'Grabando'
                  : state === 'paused'
                    ? 'En pausa'
                    : state === 'starting'
                      ? 'Iniciando'
                      : 'Sin grabar'}
              </span>
            </RecordOrb>

            <SaveStatus started={started} saving={saving} unsaved={unsaved} />
          </div>

          {error && (
            <div className="mt-4">
              <Banner tone="crit" title="Micrófono no disponible">
                <p className="mt-0.5">{error}</p>
              </Banner>
            </div>
          )}

          <div className="mt-4 flex flex-col gap-2.5">
            {!started ? (
              <>
                <Button variant="primary" className="h-14 text-[15px]" onClick={start}>
                  Iniciar grabación
                </Button>
                <p className="text-center text-[11px] leading-relaxed text-ink-3">
                  No se graba nada hasta que pulses. El audio se guarda mientras dura la reunión y se
                  transcribe entero al terminar.
                </p>
              </>
            ) : (
              <>
                {/*
                  La acción principal de toda la pantalla. Grande a propósito: es
                  lo único que se pulsa durante la reunión y hay que acertarlo
                  sin apartar la vista de la familia.
                */}
                <button
                  type="button"
                  onClick={mark}
                  disabled={!recording}
                  className="group flex min-h-[76px] w-full items-center gap-3.5 rounded-[14px] border border-accent-border bg-accent-soft px-4 text-left transition hover:brightness-110 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-accent-on shadow-glow-soft">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-5">
                      <path d="M6 3h12v18l-6-4.5L6 21z" />
                    </svg>
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold text-ink">
                      Marcar este momento
                    </span>
                    <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-3">
                      Un acuerdo, un compromiso o algo que revisar después
                    </span>
                  </span>
                  {marks.length > 0 && (
                    <span className="tabular ml-auto shrink-0 rounded-full bg-accent px-2.5 py-1 font-data text-[12px] font-bold text-accent-on">
                      {marks.length}
                    </span>
                  )}
                </button>

                <div className="flex gap-2.5">
                  <Button className="h-12 flex-1" onClick={togglePause} disabled={state === 'starting'}>
                    {state === 'paused' ? 'Reanudar' : 'Pausar'}
                  </Button>
                  <Button className="h-12 flex-1" variant="primary" onClick={finish}>
                    Finalizar
                  </Button>
                </div>
              </>
            )}
          </div>
        </Card>

        <Asistentes
          participants={meeting.participants}
          present={present}
          setPresent={setPresent}
          locked={started}
          presentNames={presentNames}
        />
      </div>

      {/* ── Transcripción ── */}
      <Card
        className="min-w-0 flex-1 max-lg:w-full"
        title="Lo que se va diciendo"
        aside={
          <div className="flex items-center gap-2.5">
            {voiceCount > 0 && !discreet && (
              <Pill tone="accent">{voiceCount === 1 ? '1 voz' : `${voiceCount} voces`}</Pill>
            )}
            <button
              type="button"
              onClick={() => setDiscreet((d) => !d)}
              aria-pressed={discreet}
              /* Sin `min-h-0`: es un control que se pulsa con prisa, cuando
                 alguien se asoma a la pantalla, y necesita el objetivo táctil
                 completo de iPad. */
              className={`rounded-full border px-4 text-[11.5px] font-semibold transition ${
                discreet
                  ? 'border-accent-border bg-accent-soft text-accent-text'
                  : 'border-line bg-surface-2 text-ink-3 hover:text-ink-2'
              }`}
            >
              {discreet ? 'Texto oculto' : 'Modo discreto'}
            </button>
          </div>
        }
        bodyClassName="p-0"
      >
        {discreet ? (
          <Discreto recording={recording} voiceCount={voiceCount} marks={marks.length} />
        ) : (
          <div ref={feedRef} className="max-h-[480px] min-h-[260px] overflow-y-auto px-4 py-1">
            {feed.length === 0 ? (
              <p className="px-2 py-16 text-center text-[13px] leading-relaxed text-ink-3">
                {!started
                  ? 'Aquí aparecerá la conversación en cuanto empieces a grabar.'
                  : 'Escuchando… el primer texto tarda unos segundos en aparecer.'}
              </p>
            ) : (
              <ul className="flex list-none flex-col gap-1 py-2">
                {feed.map((item) =>
                  item.kind === 'mark' ? (
                    <li
                      key={item.key}
                      className="animate-fade-up my-1 flex items-center gap-2.5 rounded-[10px] border border-accent-border bg-accent-soft px-3 py-2"
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="size-3.5 shrink-0 text-accent-text">
                        <path d="M6 3h12v18l-6-4.5L6 21z" />
                      </svg>
                      <span className="text-[12px] font-semibold text-accent-text">
                        Momento marcado
                      </span>
                      <span className="tabular ml-auto font-data text-[11px] text-ink-3">
                        {item.label}
                      </span>
                    </li>
                  ) : (
                    <li key={item.key} className="animate-fade-up flex gap-3 py-2">
                      <VoiceMark tag={item.tag} name={item.name} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-[12px] font-semibold text-ink-2">
                            {item.name ?? (item.tag ? `Voz ${item.tag}` : 'Sin identificar')}
                          </span>
                          <span className="tabular font-data text-[10.5px] text-ink-3">
                            {item.at.slice(11, 16)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[13.5px] leading-relaxed text-ink-2">
                          {item.texts.join(' ')}
                        </p>
                      </div>
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>
        )}

        <footer className="border-t border-line px-4 py-3 text-[11.5px] leading-relaxed text-ink-3">
          {isMock
            ? 'Modo demostración: no se envía audio a ningún servicio.'
            : 'El texto de esta pantalla es provisional. Al terminar se transcribe la reunión entera de nuevo, y esa es la versión que se usa para el acta.'}
        </footer>
      </Card>
    </div>
  );
}

/* ── Piezas ───────────────────────────────────────────────────────────────── */

/**
 * Una respuesta a una sola pregunta: ¿se está guardando?
 *
 * Antes esta zona mostraba el número de fragmento y su estado de envío. Eso es
 * contabilidad interna del programa: la docente no sabe qué es un fragmento ni
 * tiene por qué, y contarlos no le dice si su reunión está a salvo.
 */
function SaveStatus({
  started,
  saving,
  unsaved,
}: {
  started: boolean;
  saving: boolean;
  unsaved: number;
}) {
  if (!started) return null;

  const [tono, texto] =
    unsaved > 0
      ? (['warn', 'Algún tramo no llegó al servidor. Se recupera al finalizar.'] as const)
      : saving
        ? (['neutral', 'Guardando…'] as const)
        : (['ok', 'Se está guardando'] as const);

  const color =
    tono === 'warn' ? 'text-warn' : tono === 'ok' ? 'text-ok' : 'text-ink-3';

  return (
    <p className={`mt-4 flex items-center gap-2 text-center text-[12px] ${color}`}>
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
      {texto}
    </p>
  );
}

/**
 * Distintivo de voz.
 *
 * Mientras la reunión dura no se sabe quién es cada voz —eso se decide al
 * terminar—, pero sí se sabe que son distintas. El color, derivado de la propia
 * etiqueta, es estable durante toda la reunión: permite seguir la conversación
 * sin leer ninguna etiqueta.
 */
function VoiceMark({ tag, name }: { tag?: string; name?: string }) {
  if (name) return <PersonAvatar name={name} size={30} />;

  if (!tag) {
    return (
      <span className="grid size-[30px] shrink-0 place-items-center rounded-full border border-dashed border-line-strong text-[11px] text-ink-3">
        ?
      </span>
    );
  }

  const color = colorFor(`voz-${tag}`);
  return (
    <span
      style={{ background: `linear-gradient(145deg, ${color.ring}, ${color.bg})` }}
      className="grid size-[30px] shrink-0 place-items-center rounded-full text-[12px] font-bold text-white"
    >
      {tag}
    </span>
  );
}

/**
 * Modo discreto.
 *
 * El iPad está sobre la mesa entre la docente y la familia, y lo que aparece en
 * pantalla lo lee todo el mundo. La transcripción en vivo se equivoca con
 * frecuencia, y leerse a uno mismo mal transcrito en plena conversación —o leer
 * lo que acaba de decir el otro— cambia la reunión.
 *
 * Se sigue grabando y transcribiendo igual: lo único que se oculta es el texto.
 */
function Discreto({
  recording,
  voiceCount,
  marks,
}: {
  recording: boolean;
  voiceCount: number;
  marks: number;
}) {
  return (
    <div className="grid min-h-[260px] place-content-center px-6 py-12 text-center">
      <span
        aria-hidden
        className={`mx-auto grid size-14 place-items-center rounded-full border border-line bg-surface-2 ${
          recording ? 'shadow-glow-soft' : ''
        }`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="size-6 text-accent-text">
          <path d="M3 12h2.5l2-5 3 10 2.5-7 2 4H21" />
        </svg>
      </span>
      <p className="mt-4 text-[14px] font-semibold">
        {recording ? 'Se sigue grabando y transcribiendo' : 'Texto oculto'}
      </p>
      <p className="mx-auto mt-1.5 max-w-[38ch] text-[12.5px] leading-relaxed text-ink-3">
        El texto está oculto para que nadie lo lea por encima del hombro. No se pierde nada: al
        terminar la reunión aparece completo.
      </p>
      {(voiceCount > 0 || marks > 0) && (
        <p className="tabular mt-4 font-data text-[11px] text-ink-3">
          {voiceCount > 0 && `${voiceCount} voz/voces`}
          {voiceCount > 0 && marks > 0 && ' · '}
          {marks > 0 && `${marks} momento(s) marcado(s)`}
        </p>
      )}
    </div>
  );
}

/**
 * Asistentes.
 *
 * Antes de empezar es una lista con casillas: decir quién está presente es un
 * paso de preparación y mejora la separación de voces. Una vez grabando deja de
 * ser editable y se encoge, porque a mitad de reunión nadie cambia la lista y el
 * espacio lo necesita lo que sí está pasando.
 */
function Asistentes({
  participants,
  present,
  setPresent,
  locked,
  presentNames,
}: {
  participants: Meeting['participants'];
  present: Record<string, boolean>;
  setPresent: (fn: (s: Record<string, boolean>) => Record<string, boolean>) => void;
  locked: boolean;
  presentNames: string[];
}) {
  if (locked) {
    return (
      <Card bodyClassName="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center">
            {presentNames.map((name, i) => (
              <span key={name} style={{ marginLeft: i === 0 ? 0 : -9, zIndex: presentNames.length - i }}>
                <PersonAvatar name={name} size={30} className="ring-2 ring-[var(--surface)]" />
              </span>
            ))}
          </div>
          <p className="min-w-0 flex-1 text-[12.5px] text-ink-3">
            {presentNames.length === 1
              ? '1 persona en la reunión'
              : `${presentNames.length} personas en la reunión`}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card title="¿Quién está en la reunión?" bodyClassName="px-4 py-1">
      <ul className="flex list-none flex-col">
        {participants.map((p, i) => {
          const marcado = present[p.name] ?? false;
          return (
            <li key={p.name} className={i > 0 ? 'border-t border-line' : ''}>
              {/* Toda la fila es el objetivo táctil, no sólo la casilla. */}
              <label className="flex cursor-pointer items-center gap-3 py-2.5">
                <PersonAvatar name={p.name} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium">{p.name}</span>
                  <span className="block text-[11px] text-ink-3">{roleLabel(p.role)}</span>
                </span>
                <input
                  type="checkbox"
                  checked={marcado}
                  onChange={(e) => setPresent((s) => ({ ...s, [p.name]: e.target.checked }))}
                  className="size-5 shrink-0 accent-[var(--accent)]"
                />
              </label>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Espera con explicación: decir qué se está haciendo y por qué tarda. */
function Working({ title, detail }: { title: string; detail: string }) {
  return (
    <Card>
      <div className="grid place-items-center px-6 py-16 text-center">
        <span aria-hidden className="flex items-end gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              style={{ animationDelay: `${i * 110}ms` }}
              className="animate-wave h-7 w-1.5 rounded-full bg-accent"
            />
          ))}
        </span>
        <p className="mt-5 text-[15px] font-semibold">{title}</p>
        <p className="mx-auto mt-1.5 max-w-[44ch] text-[12.5px] leading-relaxed text-ink-3">
          {detail}
        </p>
      </div>
    </Card>
  );
}
