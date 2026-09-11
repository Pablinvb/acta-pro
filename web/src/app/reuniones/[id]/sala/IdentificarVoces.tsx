'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/Toast';
import { roleLabel } from '@/components/people';
import { Banner, Button, Card, Label, Pill, WfTag } from '@/components/ui';
import type { Participant } from '@/lib/types';

/**
 * Identificación de voces.
 *
 * La transcripción separó las voces y sabe que hablaron tres personas
 * distintas, pero no quiénes son: nunca las ha oído. Esta pantalla existe para
 * que la docente lo diga **una vez por voz**, no una vez por frase.
 *
 * De cada voz se muestra su intervención más larga, que es lo que permite
 * reconocerla; un «buenos días» no serviría. Al asignar un nombre, todos los
 * fragmentos de esa voz quedan atribuidos de golpe.
 */

interface VoiceSample {
  speaker_tag: string;
  text: string;
  firstHeard: string;
  segmentCount: number;
  assignedTo?: string;
}

/** Lo que propone el modelo para una voz, con su justificación. */
interface Suggestion {
  speaker_tag: string;
  name: string;
  role: 'docente' | 'representante' | 'estudiante' | 'desconocido';
  /** Frase literal de la transcripción en la que se apoya. */
  evidence: string;
}

/**
 * Cómo se lee cada rol dentro de «Parece …». En minúscula porque va en mitad
 * de una frase, y aquí y no en `roleLabel` porque estos son los roles que usa
 * el modelo, no los de los participantes.
 */
const ROL_PROPUESTO: Record<Suggestion['role'], string> = {
  docente: 'la docente',
  representante: 'el representante',
  estudiante: 'el estudiante',
  desconocido: 'sin determinar',
};

export function IdentificarVoces({
  meetingId,
  participants,
  onDone,
}: {
  meetingId: string;
  participants: Participant[];
  onDone: () => void;
}) {
  const toast = useToast();
  const [voices, setVoices] = useState<VoiceSample[] | null>(null);
  const [diarization, setDiarization] = useState(true);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  /**
   * Lo que propone el modelo, con la frase que lo justifica.
   *
   * Se guarda aparte de `assignments` para poder distinguir «esto lo sugirió la
   * máquina» de «esto lo decidí yo». En un documento que se firma, esa
   * diferencia importa: la docente tiene que ver qué está confirmando y qué
   * está eligiendo.
   */
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion>>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [suggesting, setSuggesting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/reuniones/${encodeURIComponent(meetingId)}/hablantes`);
        const body = await res.json();
        if (cancelled) return;
        setDiarization(Boolean(body.diarization));
        setVoices(body.voices ?? []);
        setAssignments(
          Object.fromEntries(
            (body.voices ?? [])
              .filter((v: VoiceSample) => v.assignedTo)
              .map((v: VoiceSample) => [v.speaker_tag, v.assignedTo!]),
          ),
        );
      } catch {
        if (!cancelled) setVoices([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  /*
   * Las sugerencias se piden aparte: la llamada al modelo tarda unos segundos y
   * la pantalla tiene que poder usarse desde el primer momento. Llegan encima
   * de algo que ya funciona, y si no llegan no se pierde nada.
   */
  useEffect(() => {
    if (voices === null || voices.length === 0) return;
    let cancelled = false;
    setSuggesting(true);

    (async () => {
      try {
        const res = await fetch(
          `/api/reuniones/${encodeURIComponent(meetingId)}/hablantes/sugerencias`,
        );
        if (!res.ok) return;
        const propuestas: Suggestion[] = await res.json();
        if (cancelled || propuestas.length === 0) return;

        setSuggestions(Object.fromEntries(propuestas.map((s) => [s.speaker_tag, s])));
        // Se rellena sólo lo que la docente no haya decidido ya.
        setAssignments((previo) => {
          const siguiente = { ...previo };
          for (const s of propuestas) {
            if (!siguiente[s.speaker_tag]) siguiente[s.speaker_tag] = s.name;
          }
          return siguiente;
        });
      } catch {
        /* Sin sugerencias se identifica a mano, como siempre. */
      } finally {
        if (!cancelled) setSuggesting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [meetingId, voices]);

  const assignedCount = Object.values(assignments).filter(Boolean).length;
  const total = voices?.length ?? 0;
  const allAssigned = total > 0 && assignedCount === total;

  /** Propuestas que la docente todavía no ha mirado ni corregido. */
  const sinConfirmar = Object.values(suggestions).filter(
    (s) => !touched.has(s.speaker_tag) && assignments[s.speaker_tag] === s.name,
  ).length;

  /** Una misma persona no puede ser dos voces distintas. */
  const takenBy = useCallback(
    (name: string, exceptTag: string) =>
      Object.entries(assignments).some(([tag, n]) => n === name && tag !== exceptTag),
    [assignments],
  );

  async function save(skip = false) {
    setSaving(true);
    try {
      if (!skip && assignedCount > 0) {
        const res = await fetch(`/api/reuniones/${encodeURIComponent(meetingId)}/hablantes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assignments }),
        });
        const body = await res.json();
        if (!res.ok) {
          toast({ tone: 'crit', title: 'No se pudo guardar', detail: body.message });
          return;
        }
        toast({
          tone: 'ok',
          title: `${assignedCount} voz/voces identificadas`,
          detail: `${body.attributed} intervención(es) quedaron atribuidas.`,
        });
      }
      onDone();
    } catch {
      toast({
        tone: 'crit',
        title: 'Sin conexión con el servidor',
        detail: 'La transcripción sigue guardada. Reintenta.',
      });
    } finally {
      setSaving(false);
    }
  }

  if (voices === null) {
    return (
      <Card>
        <p className="py-8 text-center text-[13px] text-ink-3">Analizando las voces de la reunión…</p>
      </Card>
    );
  }

  if (voices.length === 0) {
    return (
      <Card title="Sin voces que identificar">
        <Banner tone="warn" title="No se detectaron intervenciones">
          <p className="mt-0.5">
            {diarization
              ? 'La transcripción no devolvió ninguna voz. Puedes continuar y revisar el acta igualmente.'
              : 'El proveedor de transcripción configurado no separa voces. Tendrás que asignar los hablantes en la revisión.'}
          </p>
        </Banner>
        <div className="mt-3.5">
          <Button variant="primary" onClick={() => onDone()}>
            Continuar y generar el acta
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      <Card
        title="¿Quién es cada voz?"
        tag="IDENTIFICACIÓN DE HABLANTES"
        aside={
          allAssigned ? (
            <Pill tone="ok">Todas identificadas</Pill>
          ) : (
            <Pill tone="warn">
              {assignedCount} de {total}
            </Pill>
          )
        }
      >
        <p className="mb-4 text-[13px] leading-relaxed text-ink-3">
          La transcripción separó {total} voz/voces, pero no sabe a quién pertenece cada una. Dilo
          una vez y todas sus intervenciones quedarán atribuidas.
          {suggesting && ' Buscando pistas en la conversación…'}
        </p>

        <ul className="stagger flex list-none flex-col gap-3">
          {voices.map((voice) => {
            const value = assignments[voice.speaker_tag] ?? '';
            const sugerida = suggestions[voice.speaker_tag];
            /* Sin tocar y coincidiendo con la propuesta: sigue siendo sugerencia. */
            const soloSugerido =
              !!sugerida && !touched.has(voice.speaker_tag) && value === sugerida.name;

            return (
              <li
                key={voice.speaker_tag}
                className={`rounded-[10px] border p-3.5 transition-colors ${
                  soloSugerido
                    ? 'border-accent-border bg-accent-soft/30'
                    : value
                      ? 'border-ok-border bg-ok-soft/30'
                      : 'border-line bg-surface-2'
                }`}
              >
                <div className="mb-2 flex items-center gap-2.5">
                  <span
                    className={`grid size-8 shrink-0 place-items-center rounded-lg text-sm font-bold ${
                      soloSugerido
                        ? 'bg-accent text-accent-on'
                        : value
                          ? 'bg-ok text-white'
                          : 'bg-accent text-accent-on'
                    }`}
                  >
                    {voice.speaker_tag}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Label>Voz {voice.speaker_tag}</Label>
                    <p className="text-[11px] text-ink-3">
                      {voice.segmentCount} intervención(es) · primera a las{' '}
                      <span className="tabular font-data">{voice.firstHeard.slice(11, 19)}</span>
                    </p>
                  </div>
                  {soloSugerido && <Pill tone="accent">Sugerido · confirma</Pill>}
                </div>

                {/* La intervención más larga: es la que permite reconocer la voz. */}
                <blockquote className="mb-3 border-l-2 border-line-strong pl-3 font-doc text-[14px] leading-relaxed text-ink-2">
                  «{voice.text}»
                </blockquote>

                {/*
                  La frase en la que se apoya la propuesta. Va delante porque una
                  sugerencia sin motivo sólo se puede aceptar a ciegas, y aquí de
                  lo que se trata es de que la docente pueda discrepar con
                  criterio.
                */}
                {soloSugerido && (
                  <p className="mb-3 rounded-lg border border-accent-border bg-accent-soft px-3 py-2 text-[12px] leading-relaxed text-ink-2">
                    <span className="font-semibold text-accent-text">
                      Parece {ROL_PROPUESTO[sugerida.role]}
                    </span>{' '}
                    porque dijo: «{sugerida.evidence}»
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  {participants.map((p) => {
                    const taken = takenBy(p.name, voice.speaker_tag);
                    const selected = value === p.name;
                    return (
                      <button
                        key={p.name}
                        type="button"
                        disabled={taken || saving}
                        onClick={() => {
                          /*
                           * Tocar el nombre que el modelo proponía es confirmarlo,
                           * no quitarlo. Es el gesto natural para decir «sí, es
                           * ella», y antes lo borraba: la docente tocaba para
                           * estar de acuerdo y veía desaparecer la asignación.
                           *
                           * Deseleccionar sigue siendo posible tocándolo otra vez,
                           * ya confirmado.
                           */
                          const confirmandoSugerencia = selected && soloSugerido;
                          setTouched((t) => new Set(t).add(voice.speaker_tag));
                          setAssignments((a) => ({
                            ...a,
                            [voice.speaker_tag]:
                              selected && !confirmandoSugerencia ? '' : p.name,
                          }));
                        }}
                        /* Verde = lo has decidido tú. Azul = lo propuso el
                           modelo y sigue pendiente de que lo confirmes. */
                        className={`min-h-[44px] rounded-[10px] border px-3.5 text-[13px] font-medium transition disabled:cursor-not-allowed disabled:opacity-35 ${
                          selected && soloSugerido
                            ? 'border-accent bg-accent text-accent-on'
                            : selected
                              ? 'border-ok bg-ok text-white'
                              : 'border-line-strong bg-surface text-ink hover:bg-surface-2'
                        }`}
                      >
                        {selected && <span aria-hidden>✓ </span>}
                        {p.name}
                        <span className="ml-1.5 text-[11px] opacity-70">{roleLabel(p.role)}</span>
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {!allAssigned && assignedCount > 0 && (
        <Banner tone="warn" title={`Quedan ${total - assignedCount} voz/voces sin identificar`}>
          <p className="mt-0.5">
            Sus intervenciones aparecerán en el acta sin atribuir. Es preferible eso a atribuirlas
            mal, pero conviene completarlas.
          </p>
        </Banner>
      )}

      {sinConfirmar > 0 && (
        <Banner
          tone="accent"
          title={`${sinConfirmar} de ${total} las propuso el modelo`}
        >
          <p className="mt-0.5">
            Léelas antes de continuar. Las deduce de lo que cada persona dice de sí misma, y
            acierta casi siempre — pero el acta atribuye estas frases con nombre y apellido, y eso
            lo firmas tú.
          </p>
        </Banner>
      )}

      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => save(true)} disabled={saving}>
          Omitir por ahora
        </Button>
        <Button
          className="flex-1"
          variant="primary"
          onClick={() => save(false)}
          disabled={saving || assignedCount === 0}
        >
          {saving
            ? 'Guardando…'
            : sinConfirmar > 0
              ? 'Confirmo y repaso'
              : 'Confirmar y repasar'}
        </Button>
      </div>

      <p className="text-center">
        <WfTag>EL MODELO PROPONE · LA DOCENTE CONFIRMA</WfTag>
      </p>
    </div>
  );
}
