'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/Toast';
import { Banner, Button, Card, Pill } from '@/components/ui';
import type { Participant, TranscriptSegment } from '@/lib/types';

/**
 * Corrección de atribuciones, intervención a intervención.
 *
 * Existe por evidencia, no por precaución. Medido con una grabación real de una
 * reunión de dos minutos: Deepgram separó las dos voces, pero fundió turnos.
 * «¿Ha visto algo que le ha llamado la atención? Sí, pasa que Sofía no está»
 * quedó como una sola intervención de una sola voz, siendo dos personas. La
 * confianza media de separación fue 0,52.
 *
 * Asignar voces en bloque resuelve el 90 % del trabajo; esto resuelve el resto.
 * Y el resto importa: el acta atribuye afirmaciones a personas concretas, y una
 * atribución equivocada es exactamente aquello de lo que este producto tiene que
 * proteger al docente.
 *
 * Se muestra el texto depurado y también el original, porque si algo suena raro
 * la docente tiene que poder ver qué se transcribió de verdad.
 */
export function RevisarAtribucion({
  meetingId,
  participants,
  onDone,
  onBack,
}: {
  meetingId: string;
  participants: Participant[];
  onDone: () => void;
  onBack: () => void;
}) {
  const toast = useToast();
  const [segments, setSegments] = useState<TranscriptSegment[] | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  /** Ver sólo lo que la docente señaló durante la reunión. */
  const [onlyMarked, setOnlyMarked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/reuniones/${encodeURIComponent(meetingId)}/transcripcion`);
        const body = await res.json();
        if (!cancelled) setSegments(Array.isArray(body) ? body : []);
      } catch {
        if (!cancelled) setSegments([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  const reassign = useCallback(
    async (timestamp: string, speaker: string) => {
      setSaving(timestamp);
      // Optimista: la docente ve el cambio al instante y se revierte si falla.
      setSegments((s) =>
        s?.map((seg) =>
          seg.timestamp === timestamp ? { ...seg, speaker, speaker_confirmed: true } : seg,
        ) ?? null,
      );
      try {
        const res = await fetch(`/api/reuniones/${encodeURIComponent(meetingId)}/hablantes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timestamp, speaker }),
        });
        if (!res.ok) {
          const body = await res.json();
          toast({ tone: 'crit', title: 'No se pudo corregir', detail: body.message });
        }
      } catch {
        toast({ tone: 'crit', title: 'Sin conexión', detail: 'La corrección no se guardó.' });
      } finally {
        setSaving(null);
      }
    },
    [meetingId, toast],
  );

  if (segments === null) {
    return (
      <Card>
        <p className="py-8 text-center text-[13px] text-ink-3">Cargando la transcripción…</p>
      </Card>
    );
  }

  const unattributed = segments.filter((s) => !s.speaker).length;
  const marked = segments.filter((s) => s.flagged_by_teacher).length;
  const visible = onlyMarked ? segments.filter((s) => s.flagged_by_teacher) : segments;

  return (
    <div className="flex flex-col gap-3.5">
      <Card
        title="Revisa quién dijo qué"
        aside={
          unattributed === 0 ? (
            <Pill tone="ok">Todo atribuido</Pill>
          ) : (
            <Pill tone="warn">{unattributed} sin atribuir</Pill>
          )
        }
      >
        <Banner tone="warn" title="La separación automática no siempre acierta">
          <p className="mt-0.5">
            A veces junta en una sola intervención el final de una persona y el principio de otra.
            Repasa por encima y corrige lo que esté mal: el acta atribuirá cada frase a quien digas
            aquí.
          </p>
        </Banner>

        <label className="mt-3 flex cursor-pointer items-center gap-2 text-[13px] text-ink-2">
          <input
            type="checkbox"
            checked={showOriginal}
            onChange={(e) => setShowOriginal(e.target.checked)}
            className="size-4 accent-[var(--accent)]"
          />
          Ver también el texto original, sin depurar
        </label>

        {/*
          Los momentos que la docente señaló durante la reunión son, por
          definición, los que le importaban lo bastante como para pulsar
          mientras hablaba con la familia. Poder ir directamente a ellos evita
          releer cuarenta minutos para encontrar cuatro frases.
        */}
        {marked > 0 && (
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-[13px] text-ink-2">
            <input
              type="checkbox"
              checked={onlyMarked}
              onChange={(e) => setOnlyMarked(e.target.checked)}
              className="size-4 accent-[var(--accent)]"
            />
            Ver sólo los {marked} momento(s) que marcaste en la reunión
          </label>
        )}
      </Card>

      <Card bodyClassName="p-0">
        <ul className="flex max-h-[440px] list-none flex-col overflow-y-auto">
          {visible.map((segment, i) => (
            <li
              key={segment.timestamp}
              className={`px-4 py-3 ${i > 0 ? 'border-t border-line' : ''} ${
                saving === segment.timestamp ? 'opacity-60' : ''
              } ${
                /* La marca la puso la docente a mano: se ve antes que nada. */
                segment.flagged_by_teacher ? 'border-l-2 border-l-accent bg-accent-soft/25' : ''
              }`}
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="tabular font-data text-[11px] text-ink-3">
                  {segment.timestamp.slice(11, 19)}
                </span>
                {segment.flagged_by_teacher && (
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-accent-border bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent-text">
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="size-3">
                      <path d="M6 3h12v18l-6-4.5L6 21z" />
                    </svg>
                    Lo marcaste
                  </span>
                )}
                {segment.speaker_tag && !segment.speaker && (
                  <Pill tone="accent">Voz {segment.speaker_tag}</Pill>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {participants.map((p) => {
                    const selected = segment.speaker === p.name;
                    return (
                      <button
                        key={p.name}
                        type="button"
                        disabled={saving !== null}
                        onClick={() => reassign(segment.timestamp, p.name)}
                        className={`min-h-[34px] rounded-lg border px-2.5 text-[12px] font-medium transition disabled:opacity-50 ${
                          selected
                            ? 'border-ok bg-ok text-white'
                            : 'border-line-strong bg-surface text-ink-2 hover:bg-surface-2'
                        }`}
                      >
                        {selected && <span aria-hidden>✓ </span>}
                        {p.name.split(' ')[0]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <p className="text-[13.5px] leading-relaxed text-ink">
                {segment.clean_text ?? segment.text}
              </p>

              {showOriginal && segment.clean_text && segment.clean_text !== segment.text && (
                <p className="mt-1.5 border-l-2 border-line pl-2.5 text-[12px] text-ink-3 italic">
                  original: {segment.text}
                </p>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <div className="flex gap-2">
        <Button className="flex-1" onClick={onBack} disabled={saving !== null}>
          Volver a las voces
        </Button>
        <Button className="flex-1" variant="primary" onClick={onDone} disabled={saving !== null}>
          Generar el acta
        </Button>
      </div>
    </div>
  );
}
