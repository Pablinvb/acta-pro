'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { Banner, Button, Pill, WfTag } from '@/components/ui';
import { useDraft } from '@/lib/useDraft';
import type {
  FindingResolution,
  LanguageLevel,
  MeetingMinutes,
  MinutesSection,
  ReviewedFinding,
} from '@/lib/types';

/**
 * Revisión del acta — la pantalla que sostiene el producto.
 *
 * Regla no negociable de la arquitectura: la IA solo sugiere y nunca modifica
 * el contenido final en silencio. Aquí eso se traduce en dos cosas concretas:
 * ningún fragmento cambia sin que la docente pulse «Aplicar sugerencia», y la
 * aprobación queda bloqueada mientras haya fragmentos RED sin resolver.
 */

const LEVEL_LABEL: Record<LanguageLevel, string> = {
  GREEN: 'Adecuado',
  YELLOW: 'Revisar',
  RED: 'No recomendado',
};

const LEVEL_TONE = { GREEN: 'ok', YELLOW: 'warn', RED: 'crit' } as const;

/** Subrayado del fragmento dentro del acta, según su estado. */
const MARK_STYLE: Record<string, string> = {
  RED: 'bg-crit-soft shadow-[inset_0_-2px_0_var(--crit)]',
  YELLOW: 'bg-warn-soft shadow-[inset_0_-2px_0_var(--warn)]',
  applied: 'bg-ok-soft shadow-[inset_0_-2px_0_var(--ok)]',
  kept: 'shadow-[inset_0_-1px_0_var(--border-strong)]',
};

export function RevisionClient({
  minutes,
  initialFindings,
  greenCount,
  totalReviewed,
}: {
  minutes: MeetingMinutes;
  initialFindings: ReviewedFinding[];
  greenCount: number;
  totalReviewed: number;
}) {
  const router = useRouter();
  const toast = useToast();

  /**
   * Solo se guarda la decisión por hallazgo, no el acta entera: el texto viene
   * del servidor y no tiene sentido duplicarlo en el dispositivo.
   */
  const {
    value: resolutions,
    setValue: setResolutions,
    clear: clearDraft,
  } = useDraft<Record<string, FindingResolution>>(
    `revision:${minutes.meeting_id}`,
    Object.fromEntries(initialFindings.map((f) => [f.id, f.resolution])),
  );

  const findings = useMemo(
    () => initialFindings.map((f) => ({ ...f, resolution: resolutions[f.id] ?? f.resolution })),
    [initialFindings, resolutions],
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<'approve' | 'reject' | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'crit' | 'warn'; text: string } | null>(null);

  const markRefs = useRef<Record<string, HTMLElement | null>>({});
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});

  const byFragment = useMemo(
    () => new Map(findings.map((f) => [f.fragment, f])),
    [findings],
  );

  const openRed = findings.filter((f) => f.level === 'RED' && f.resolution === 'open');
  const openAll = findings.filter((f) => f.resolution === 'open');
  const applied = findings.filter((f) => f.resolution === 'applied');

  const resolve = useCallback(
    (id: string, resolution: 'applied' | 'kept') => {
      setResolutions((rs) => ({ ...rs, [id]: resolution }));
      const mark = markRefs.current[id];
      if (mark) {
        // Latido en el fragmento: confirma dónde ocurrió el cambio dentro del acta.
        mark.classList.remove('animate-mark-pulse');
        void mark.offsetWidth; // Reinicia la animación.
        mark.classList.add('animate-mark-pulse');
        mark.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      toast({
        tone: resolution === 'applied' ? 'ok' : 'info',
        title: resolution === 'applied' ? 'Sugerencia aplicada' : 'Se mantiene el original',
        detail:
          resolution === 'applied'
            ? 'El acta se actualizó con la redacción sugerida.'
            : 'Tu decisión queda registrada en el log de auditoría.',
      });
    },
    [toast, setResolutions],
  );

  const focusMark = useCallback((id: string) => {
    setSelected(id);
    const mark = markRefs.current[id];
    if (!mark) return;
    mark.classList.remove('animate-mark-pulse');
    void mark.offsetWidth;
    mark.classList.add('animate-mark-pulse');
    mark.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, []);

  const focusCard = useCallback((id: string) => {
    setSelected(id);
    cardRefs.current[id]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, []);

  const send = useCallback(
    async (decision: 'approve' | 'reject') => {
      setSubmitting(decision);
      setFeedback(null);
      try {
        /*
         * Se envían las decisiones, no el acta reescrita. El servicio aplica
         * las sugerencias aceptadas sobre el acta que él mismo guardó, así que
         * lo aprobado y lo mostrado son el mismo documento y el cliente no
         * puede colar un texto que nunca pasó por la revisión de lenguaje.
         */
        const res = await fetch(`/api/reuniones/${encodeURIComponent(minutes.meeting_id)}/revision`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            decision,
            appliedFragments: applied.map((f) => f.fragment),
            keptFragments: findings.filter((f) => f.resolution === 'kept').map((f) => f.fragment),
          }),
        });
        const body = await res.json();

        if (!res.ok) {
          setFeedback({ tone: 'crit', text: body.message ?? 'No se pudo registrar la decisión.' });
          return;
        }
        if (decision === 'reject') {
          setFeedback({
            tone: 'warn',
            text: 'Acta rechazada. El workflow 11 la devuelve a borrador; no se ha perdido nada.',
          });
          toast({ tone: 'warn', title: 'Acta rechazada', detail: 'Vuelve a estado de borrador.' });
          return;
        }
        // El trabajo ya viajó a n8n: el borrador local deja de hacer falta.
        clearDraft();
        toast({
          tone: 'ok',
          title: 'Acta aprobada',
          detail: 'Siguiente paso: recoger las firmas.',
        });
        router.push(`/reuniones/${encodeURIComponent(minutes.meeting_id)}/firmas`);
      } catch {
        setFeedback({
          tone: 'crit',
          text: 'No se pudo contactar con el servidor. El acta sigue guardada; reintenta.',
        });
      } finally {
        setSubmitting(null);
      }
    },
    [minutes.meeting_id, applied, findings, router, toast, clearDraft],
  );

  /* ── Un punto del acta, resaltado si el WF 09 lo marcó ── */
  function Item({ text }: { text: string }) {
    const f = byFragment.get(text);
    if (!f) return <li>{text}</li>;

    const style =
      f.resolution === 'applied'
        ? MARK_STYLE.applied
        : f.resolution === 'kept'
          ? MARK_STYLE.kept
          : MARK_STYLE[f.level];

    return (
      <li>
        <mark
          ref={(el) => {
            markRefs.current[f.id] = el;
          }}
          role="button"
          tabIndex={0}
          onClick={() => focusCard(f.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              focusCard(f.id);
            }
          }}
          className={`cursor-pointer rounded-[3px] bg-transparent px-0.5 text-inherit decoration-clone ${style} ${
            selected === f.id ? 'outline-2 outline-offset-2 outline-accent' : ''
          }`}
        >
          {f.resolution === 'applied' ? f.suggested_text : text}
        </mark>
      </li>
    );
  }

  function Section({ section }: { section: MinutesSection }) {
    return (
      <section className="mb-5">
        <h2 className="mb-2 border-b border-line pb-1.5 font-ui text-[11px] font-bold tracking-[0.09em] text-ink-3 uppercase">
          {section.number} · {section.title}
        </h2>

        {section.fields && (
          <dl className="grid grid-cols-[auto_1fr_auto_1fr] gap-x-3 gap-y-1 font-ui text-[13px] max-md:grid-cols-[auto_1fr]">
            {section.fields.map((f) => (
              <div key={f.label} className="contents">
                <dt className="text-ink-3">{f.label}</dt>
                <dd className="m-0">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {section.paragraphs?.map((p) => (
          <p key={p} className="mb-2 text-[15px] leading-relaxed">
            {p}
          </p>
        ))}

        {section.items && (
          <ul className="m-0 list-disc pl-5 [&>li]:mb-1.5 [&>li]:text-[15px] [&>li]:leading-relaxed">
            {section.items.map((item) => (
              <Item key={item} text={item} />
            ))}
          </ul>
        )}

        {section.title === 'Firmas' && (
          <div className="mt-3 grid grid-cols-2 gap-6 font-ui text-xs max-md:grid-cols-1">
            <p className="border-t border-line-strong pt-2 text-ink-3">Ana Pérez — Docente</p>
            <p className="border-t border-line-strong pt-2 text-ink-3">María López — Representante</p>
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="grid h-full grid-cols-[1fr_372px] max-lg:grid-cols-1">
      {/* ── El documento ── */}
      <div className="overflow-y-auto border-r border-line bg-surface px-6 pt-5.5 pb-16 max-lg:border-r-0 max-lg:border-b">
        <article className="mx-auto max-w-[63ch] font-doc">
          <h1 className="mb-1 text-center font-doc text-xl font-semibold tracking-wide uppercase">
            Acta de reunión con representante
          </h1>
          <p className="mb-6 text-center font-data text-[11px] text-ink-3">
            {minutes.document_code} · Período 2026-2027
          </p>
          {minutes.sections.map((s) => (
            <Section key={s.number} section={s} />
          ))}
        </article>
      </div>

      {/* ── La revisión de lenguaje ── */}
      <aside className="flex flex-col overflow-hidden bg-surface-2 max-lg:overflow-visible">
        <header className="border-b border-line px-4 pt-4 pb-3">
          <h2 className="text-sm font-semibold">Revisión de lenguaje</h2>
          <p className="mt-1 font-data text-[10px] tracking-wider text-ink-3 uppercase">
            WF 09 · {totalReviewed} fragmentos analizados · la IA solo sugiere
          </p>
          <div className="mt-2.5 flex gap-1.5">
            <Pill tone="ok">
              <b className="tabular">{greenCount + findings.length - openAll.length}</b> adecuados
            </Pill>
            <Pill tone="warn">
              <b className="tabular">{openAll.filter((f) => f.level === 'YELLOW').length}</b> revisar
            </Pill>
            <Pill tone="crit">
              <b className="tabular">{openRed.length}</b> no recomendados
            </Pill>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-3 max-lg:overflow-visible">
          {findings.map((f) => {
            const open = f.resolution === 'open';
            return (
              <article
                key={f.id}
                ref={(el) => {
                  cardRefs.current[f.id] = el;
                }}
                onClick={() => focusMark(f.id)}
                className={`cursor-pointer rounded-[10px] border border-l-[3px] border-line bg-surface p-3 transition ${
                  f.level === 'RED' ? 'border-l-crit' : 'border-l-warn'
                } ${!open ? 'border-l-ok opacity-60' : ''} ${
                  selected === f.id ? 'border-accent-border ring-2 ring-accent-border' : ''
                }`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <Pill tone={LEVEL_TONE[f.level]}>{LEVEL_LABEL[f.level]}</Pill>
                  <span className="ml-auto font-data text-[10px] text-ink-3">
                    §{f.section}
                  </span>
                </div>

                <p className="mb-2 font-doc text-[13.5px] leading-snug">«{f.fragment}»</p>
                <p className="mb-2.5 text-xs leading-snug text-ink-3">{f.reason}</p>

                <div className="mb-2.5 rounded-lg border border-ok-border bg-ok-soft p-2.5">
                  <p className="mb-1 text-[9.5px] font-bold tracking-[0.09em] text-ok uppercase">
                    Redacción sugerida
                  </p>
                  <p className="font-doc text-[13.5px] leading-snug">{f.suggested_text}</p>
                </div>

                {open ? (
                  <div className="flex gap-1.5">
                    <Button
                      variant="primary"
                      className="min-h-[36px] px-3 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        resolve(f.id, 'applied');
                      }}
                    >
                      Aplicar sugerencia
                    </Button>
                    <Button
                      className="min-h-[36px] px-3 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        resolve(f.id, 'kept');
                      }}
                    >
                      Mantener original
                    </Button>
                  </div>
                ) : (
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-ok">
                    ✓{' '}
                    {f.resolution === 'applied'
                      ? 'Sugerencia aplicada'
                      : 'Original mantenido por la docente'}
                  </p>
                )}
              </article>
            );
          })}
        </div>

        {/* ── La puerta de aprobación ── */}
        <footer className="sticky bottom-0 flex flex-col gap-2.5 border-t border-line bg-surface px-3.5 py-3">
          {feedback ? (
            <Banner
              tone={feedback.tone}
              title={feedback.tone === 'crit' ? 'No se pudo completar' : 'Registrado'}
            >
              <p className="mt-0.5">{feedback.text}</p>
            </Banner>
          ) : openRed.length > 0 ? (
            <Banner tone="crit" title={`${openRed.length} fragmento(s) no recomendado(s) sin resolver`}>
              <p className="mt-0.5">
                Resuélvelos antes de aprobar: quedarían en el acta tal como están.
              </p>
            </Banner>
          ) : openAll.length > 0 ? (
            <Banner tone="warn" title={`${openAll.length} fragmento(s) por revisar`}>
              <p className="mt-0.5">
                Puedes aprobar, pero la decisión queda en el log de auditoría (WF 17).
              </p>
            </Banner>
          ) : (
            <Banner tone="ok" title="Revisión completa">
              <p className="mt-0.5">Todos los fragmentos señalados fueron resueltos.</p>
            </Banner>
          )}

          <div className="flex gap-2">
            <Button
              variant="danger"
              className="flex-1"
              onClick={() => send('reject')}
              disabled={submitting !== null}
            >
              {submitting === 'reject' ? 'Enviando…' : 'Rechazar'}
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => send('approve')}
              disabled={openRed.length > 0 || submitting !== null}
            >
              {submitting === 'approve' ? 'Enviando…' : 'Aprobar acta'}
            </Button>
          </div>

          <p className="text-center">
            <WfTag>WF 11 TEACHER-REVIEW</WfTag>
          </p>
        </footer>
      </aside>
    </div>
  );
}
