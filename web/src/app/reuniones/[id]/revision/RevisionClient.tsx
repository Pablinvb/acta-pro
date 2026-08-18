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

/**
 * Subrayado del fragmento dentro del acta.
 *
 * Colores fijos y no tokens de tema: el acta es papel blanco en cualquier tema,
 * así que un resaltado pensado para fondo oscuro sería ilegible aquí. Se
 * mantienen los mismos tres niveles del semáforo, adaptados al papel.
 */
const MARK_STYLE: Record<string, string> = {
  RED: 'bg-[#fde3e0] shadow-[inset_0_-2px_0_#c0392b]',
  YELLOW: 'bg-[#fbeecf] shadow-[inset_0_-2px_0_#9a6708]',
  applied: 'bg-[#dcf3e5] shadow-[inset_0_-2px_0_#12784c]',
  kept: 'shadow-[inset_0_-1px_0_#c3ccda]',
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
            : 'Tu decisión queda registrada en la auditoría.',
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
            text: 'Acta rechazada: vuelve a borrador. No se ha perdido nada.',
          });
          toast({ tone: 'warn', title: 'Acta rechazada', detail: 'Vuelve a estado de borrador.' });
          return;
        }
        // El trabajo ya está en el servidor: el borrador local deja de hacer falta.
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

  /* ── Un punto del acta, resaltado si la revisión de lenguaje lo marcó ── */
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
        <h2 className="mb-2 border-b border-paper-line pb-1.5 font-ui text-[11px] font-bold tracking-[0.09em] text-paper-ink-2 uppercase">
          {section.number} · {section.title}
        </h2>

        {section.fields && (
          <dl className="grid grid-cols-[auto_1fr_auto_1fr] gap-x-3 gap-y-1 font-ui text-[13px] max-md:grid-cols-[auto_1fr]">
            {section.fields.map((f) => (
              <div key={f.label} className="contents">
                <dt className="text-paper-ink-2">{f.label}</dt>
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
            <p className="border-t border-paper-line pt-2 text-paper-ink-2">Ana Pérez — Docente</p>
            <p className="border-t border-paper-line pt-2 text-paper-ink-2">
              María López — Representante
            </p>
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="grid h-full grid-cols-[1fr_372px] max-lg:grid-cols-1">
      {/* ── El documento ── */}
      <div className="overflow-y-auto border-r border-line px-6 pt-5.5 pb-16 max-lg:border-r-0 max-lg:border-b">
        {/*
          El acta se ve como papel, no como una pantalla más. Es un documento
          institucional que alguien va a imprimir y firmar, y ese contraste con
          la interfaz oscura es lo que lo separa del software que lo produce.
          Por eso mantiene sus colores en cualquier tema.
        */}
        <article className="mx-auto max-w-[70ch] rounded-lg bg-paper px-9 py-10 font-doc text-paper-ink shadow-float">
          <h1 className="mb-1 text-center font-doc text-xl font-semibold tracking-wide text-paper-ink uppercase">
            Acta de reunión con representante
          </h1>
          <p className="mb-6 text-center font-data text-[11px] text-paper-ink-2">
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
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-text"
            >
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" />
                <path d="M18 15.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" />
              </svg>
            </span>
            <h2 className="text-sm font-semibold">Revisión asistida por IA</h2>
            <span className="ml-auto">
              {openAll.length === 0 ? (
                <Pill tone="ok">Revisada</Pill>
              ) : (
                <Pill tone="accent">En revisión</Pill>
              )}
            </span>
          </div>
          <p className="mt-1.5 text-[11px] text-ink-3">
            {totalReviewed} fragmentos analizados. La IA propone; tú decides.
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
              /*
               * Detectado → sugerencia → justificación, en ese orden y con esa
               * forma. La docente no solo necesita saber que algo está mal:
               * necesita ver qué, por qué, y qué se propone en su lugar. Una
               * lista de advertencias enseña a obedecer; esto enseña a redactar.
               */
              <article
                key={f.id}
                ref={(el) => {
                  cardRefs.current[f.id] = el;
                }}
                onClick={() => focusMark(f.id)}
                /*
                 * `shrink-0` es imprescindible: los hijos de un contenedor flex
                 * se comprimen por defecto, y con el `overflow-hidden` que
                 * redondea las esquinas eso recortaba la sugerencia, la
                 * justificación y los botones sin dejar rastro.
                 */
                className={`animate-card shrink-0 cursor-pointer overflow-hidden rounded-[12px] border bg-surface transition-all ${
                  !open
                    ? 'border-ok-border opacity-70'
                    : selected === f.id
                      ? 'border-accent-border shadow-glow'
                      : 'border-line hover:border-line-strong'
                }`}
              >
                {/* Lo detectado */}
                <div className="p-3.5">
                  <div className="mb-2.5 flex items-center gap-2">
                    <span
                      className={`size-2 shrink-0 rounded-full ${f.level === 'RED' ? 'bg-crit' : 'bg-warn'}`}
                    />
                    <span className="text-[12px] font-semibold">
                      Detectado: {LEVEL_LABEL[f.level].toLowerCase()}
                    </span>
                    <span className="ml-auto font-data text-[10px] text-ink-3">§{f.section}</span>
                  </div>

                  <blockquote
                    className={`rounded-lg border-l-2 px-3 py-2.5 font-doc text-[13.5px] leading-relaxed ${
                      f.level === 'RED'
                        ? 'border-l-crit bg-crit-soft text-ink'
                        : 'border-l-warn bg-warn-soft text-ink'
                    }`}
                  >
                    {f.fragment}
                  </blockquote>

                  {/* La flecha hace visible que una cosa sustituye a la otra. */}
                  <div className="my-2 flex justify-center text-ink-3" aria-hidden>
                    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M6 13l6 6 6-6" />
                    </svg>
                  </div>

                  <div className="mb-2.5 flex items-center gap-2">
                    <span className="size-2 shrink-0 rounded-full bg-ok" />
                    <span className="text-[12px] font-semibold">Sugerencia de redacción</span>
                  </div>

                  <blockquote className="rounded-lg border-l-2 border-l-ok bg-ok-soft px-3 py-2.5 font-doc text-[13.5px] leading-relaxed text-ink">
                    {f.suggested_text}
                  </blockquote>

                  <div className="mt-2.5">
                    <p className="text-[10px] font-bold tracking-[0.09em] text-ink-3 uppercase">
                      Justificación
                    </p>
                    <p className="mt-1 text-xs leading-snug text-ink-2">{f.reason}</p>
                  </div>
                </div>

                {/* La decisión */}
                <div className="border-t border-line bg-surface-2 px-3.5 py-2.5">
                  {open ? (
                    <div className="flex gap-2">
                      <Button
                        className="min-h-[38px] flex-1 px-3 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          resolve(f.id, 'kept');
                        }}
                      >
                        Mantener original
                      </Button>
                      <Button
                        variant="primary"
                        className="min-h-[38px] flex-1 px-3 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          resolve(f.id, 'applied');
                        }}
                      >
                        ✓ Aplicar sugerencia
                      </Button>
                    </div>
                  ) : (
                    <p className="flex items-center gap-2 text-xs font-semibold text-ok">
                      <span className="grid size-4 place-items-center rounded-full bg-ok text-[9px] text-white">
                        ✓
                      </span>
                      {f.resolution === 'applied'
                        ? 'Sugerencia aplicada'
                        : 'Original mantenido por la docente'}
                    </p>
                  )}
                </div>
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
                Puedes aprobar, pero la decisión queda en el registro de auditoría.
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
            <WfTag>DECISIÓN DE LA DOCENTE</WfTag>
          </p>
        </footer>
      </aside>
    </div>
  );
}
