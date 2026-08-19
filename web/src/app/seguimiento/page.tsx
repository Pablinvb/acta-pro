import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { PersonAvatar } from '@/components/people';
import { Banner, Card, Pill } from '@/components/ui';
import { ProgressRing } from '@/components/visuals';
import {
  ACTIVE_MEETING_ID,
  commitmentTracks,
  findMeeting,
  trackWeeks,
  type CommitmentState,
} from '@/lib/mock/data';
import { requireSession } from '@/lib/session';

export const metadata = { title: 'Seguimiento · ACTA PRO' };

/**
 * Seguimiento de compromisos.
 *
 * Un acta sin seguimiento es un papel. Esta pantalla existe para responder la
 * única pregunta que importa un mes después de la reunión: **¿se cumplió lo que
 * se acordó, y quién quedó a deber?**
 *
 * Se organiza por persona y no por tarea porque es como lo piensa la docente:
 * «¿la madre está cumpliendo?», no «¿cómo va la tarea 3?».
 */

const STATE_STYLE: Record<CommitmentState, { dot: string; ring: string; label: string }> = {
  completado: { dot: 'bg-ok text-white', ring: 'border-ok', label: 'Completado' },
  en_progreso: { dot: 'bg-accent text-accent-on', ring: 'border-accent', label: 'En progreso' },
  pendiente: { dot: 'bg-surface-3 text-ink-3', ring: 'border-line-strong', label: 'Pendiente' },
};

function Node({ state, index }: { state: CommitmentState; index: number }) {
  const style = STATE_STYLE[state];
  return (
    <span
      className={`grid size-9 shrink-0 place-items-center rounded-full border-2 text-[12px] font-bold transition-all ${style.ring} ${style.dot} ${
        state === 'en_progreso' ? 'shadow-glow-soft' : ''
      }`}
      title={style.label}
    >
      {state === 'completado' ? '✓' : index + 1}
    </span>
  );
}

export default async function SeguimientoPage() {
  const session = await requireSession();
  const meeting = findMeeting(ACTIVE_MEETING_ID)!;

  const todos = commitmentTracks.flatMap((t) => t.steps);
  const completados = todos.filter((s) => s.state === 'completado').length;
  const enCurso = todos.filter((s) => s.state === 'en_progreso').length;
  const vencidos = 0;

  return (
    <AppShell
      meetingId={ACTIVE_MEETING_ID}
      title={`Compromisos de la reunión · ${meeting.student_name}`}
      teacherName={session.name}
      teacherId={session.teacherId}
    >
      <div className="flex flex-col gap-4 p-5.5">
        <div>
          <h1 className="text-[26px] leading-tight font-bold tracking-tight">Seguimiento</h1>
          <p className="mt-1 text-[13px] text-ink-3">
            Qué se acordó en la reunión de {meeting.student_name} y cómo va cada parte
          </p>
        </div>

        <div className="flex items-start gap-3.5 max-lg:flex-col">
          {/* ── La línea de tiempo ── */}
          <Card className="animate-card min-w-0 flex-1 max-lg:w-full" bodyClassName="p-0">
            {/* Encabezado de semanas */}
            <div className="grid grid-cols-[180px_repeat(4,1fr)_92px] items-end gap-2 border-b border-line px-4 py-3 max-xl:grid-cols-[140px_repeat(4,1fr)]">
              <span className="text-[10px] font-semibold tracking-[0.09em] text-ink-3 uppercase">
                Responsable
              </span>
              {trackWeeks.map((w, i) => (
                <span key={w.label} className="text-center">
                  <span
                    className={`block text-[11px] font-semibold ${i === 0 ? 'text-accent-text' : 'text-ink-2'}`}
                  >
                    {w.label}
                  </span>
                  <span className="tabular block font-data text-[10px] text-ink-3">{w.date}</span>
                </span>
              ))}
              <span className="text-right text-[10px] font-semibold tracking-[0.09em] text-ink-3 uppercase max-xl:hidden">
                Límite
              </span>
            </div>

            <ul className="stagger flex list-none flex-col">
              {commitmentTracks.map((track, fila) => (
                <li
                  key={track.person}
                  className={`grid grid-cols-[180px_repeat(4,1fr)_92px] items-center gap-2 px-4 py-4 max-xl:grid-cols-[140px_repeat(4,1fr)] ${
                    fila > 0 ? 'border-t border-line' : ''
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <PersonAvatar name={track.person} size={34} />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold">
                        {track.person}
                      </span>
                      <span className="block text-[11px] text-ink-3">{track.role}</span>
                    </span>
                  </span>

                  {track.steps.map((step, i) => (
                    <span key={step.week} className="relative flex flex-col items-center gap-1.5">
                      {/* La línea que une los nodos hace visible que es un recorrido. */}
                      {i > 0 && (
                        <span
                          aria-hidden
                          className={`absolute top-[18px] right-1/2 left-[-50%] -z-10 h-0.5 ${
                            step.state === 'pendiente' ? 'bg-line' : 'bg-ok/50'
                          }`}
                        />
                      )}
                      <Node state={step.state} index={i} />
                      <span className="max-w-[10rem] text-center text-[10.5px] leading-tight text-ink-3">
                        {step.label}
                      </span>
                    </span>
                  ))}

                  <span className="tabular text-right font-data text-[11px] text-ink-2 max-xl:hidden">
                    {track.due}
                  </span>
                </li>
              ))}
            </ul>

            {/* Leyenda */}
            <div className="flex flex-wrap items-center gap-4 border-t border-line px-4 py-3 text-[11px] text-ink-3">
              {(['completado', 'en_progreso', 'pendiente'] as CommitmentState[]).map((s) => (
                <span key={s} className="flex items-center gap-2">
                  <span className={`size-3 rounded-full border-2 ${STATE_STYLE[s].ring} ${STATE_STYLE[s].dot}`} />
                  {STATE_STYLE[s].label}
                </span>
              ))}
            </div>
          </Card>

          {/* ── El resumen ── */}
          <div className="flex w-[300px] shrink-0 flex-col gap-3.5 max-lg:w-full">
            <Card className="animate-card" title="Cumplimiento">
              <div className="flex items-center gap-4">
                <ProgressRing value={completados} total={todos.length} label="cumplido" />
                <ul className="flex list-none flex-col gap-2 text-[13px]">
                  {[
                    ['Completados', completados, 'bg-ok'],
                    ['En progreso', enCurso, 'bg-accent'],
                    ['Vencidos', vencidos, 'bg-warn'],
                  ].map(([label, n, color]) => (
                    <li key={label as string} className="flex items-center gap-2">
                      <span className={`size-2.5 rounded-full ${color}`} />
                      <span className="flex-1 text-ink-2">{label}</span>
                      <span className="tabular font-semibold">{n}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>

            <Card className="animate-card" title="Próxima reunión" aside={<Pill tone="accent">04 sep</Pill>}>
              <p className="text-[13px] text-ink-2">
                Seguimiento del plan de refuerzo con {meeting.representative_name}.
              </p>
              <p className="mt-2 text-[11px] text-ink-3">
                Se creó automáticamente en Google Calendar al firmarse el acta.
              </p>
            </Card>

            <Banner tone="accent" title="El acta es la fuente">
              <p className="mt-0.5">
                Cada compromiso de esta pantalla sale de la sección 8 del acta firmada. Si algo no
                consta ahí, no aparece aquí.
              </p>
            </Banner>

            <Link
              href={`/reuniones/${encodeURIComponent(ACTIVE_MEETING_ID)}/revision`}
              role="button"
              className="inline-flex min-h-[44px] items-center justify-center rounded-[10px] border border-line-strong bg-surface-2 px-4 text-sm font-medium transition hover:bg-surface-3"
            >
              Ver el acta de origen
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
