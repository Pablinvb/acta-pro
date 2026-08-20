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

  const assignedCount = Object.values(assignments).filter(Boolean).length;
  const total = voices?.length ?? 0;
  const allAssigned = total > 0 && assignedCount === total;

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
        <p className="mb-4 text-[13px] text-ink-3">
          La transcripción separó {total} voz/voces, pero no sabe a quién pertenece cada una. Dilo
          una vez y todas sus intervenciones quedarán atribuidas.
        </p>

        <ul className="stagger flex list-none flex-col gap-3">
          {voices.map((voice) => {
            const value = assignments[voice.speaker_tag] ?? '';
            return (
              <li
                key={voice.speaker_tag}
                className={`rounded-[10px] border p-3.5 transition-colors ${
                  value ? 'border-ok-border bg-ok-soft/30' : 'border-line bg-surface-2'
                }`}
              >
                <div className="mb-2 flex items-center gap-2.5">
                  <span
                    className={`grid size-8 shrink-0 place-items-center rounded-lg text-sm font-bold ${
                      value ? 'bg-ok text-white' : 'bg-accent text-accent-on'
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
                </div>

                {/* La intervención más larga: es la que permite reconocer la voz. */}
                <blockquote className="mb-3 border-l-2 border-line-strong pl-3 font-doc text-[14px] leading-relaxed text-ink-2">
                  «{voice.text}»
                </blockquote>

                <div className="flex flex-wrap gap-2">
                  {participants.map((p) => {
                    const taken = takenBy(p.name, voice.speaker_tag);
                    const selected = value === p.name;
                    return (
                      <button
                        key={p.name}
                        type="button"
                        disabled={taken || saving}
                        onClick={() =>
                          setAssignments((a) => ({
                            ...a,
                            [voice.speaker_tag]: selected ? '' : p.name,
                          }))
                        }
                        className={`min-h-[44px] rounded-[10px] border px-3.5 text-[13px] font-medium transition disabled:cursor-not-allowed disabled:opacity-35 ${
                          selected
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
          {saving ? 'Guardando…' : 'Confirmar y repasar'}
        </Button>
      </div>

      <p className="text-center">
        <WfTag>LA TRANSCRIPCIÓN SEPARA VOCES · LOS NOMBRES LOS PONE LA DOCENTE</WfTag>
      </p>
    </div>
  );
}
