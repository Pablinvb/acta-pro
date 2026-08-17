import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { Counter } from '@/components/Counter';
import { Banner, Card, Label, PageHead, Pill, WfTag, type Tone } from '@/components/ui';
import {
  ACTIVE_MEETING_ID,
  dashboardSummary,
  findMeeting,
  meetings,
  teacher,
} from '@/lib/mock/data';
import { requireSession } from '@/lib/session';
import type { Meeting } from '@/lib/types';

export const metadata = { title: 'Agenda · ACTA PRO' };

/** Cómo se etiqueta cada reunión en la lista y qué acción ofrece. */
function rowState(m: Meeting): { label: string; tone: Tone; cta: string; href: string } {
  const base = `/reuniones/${encodeURIComponent(m.meeting_id)}`;
  if (m.data_status === 'manual_verification_required') {
    return { label: 'Datos incompletos', tone: 'crit', cta: 'Completar', href: `${base}/ficha` };
  }
  if (m.status === 'awaiting_teacher_review') {
    return { label: 'Acta en borrador', tone: 'warn', cta: 'Revisar acta', href: `${base}/revision` };
  }
  if (m.status === 'in_progress') {
    return { label: 'En curso', tone: 'crit', cta: 'Volver a la sala', href: `${base}/sala` };
  }
  return { label: `A las ${m.start_time}`, tone: 'neutral', cta: 'Ficha previa', href: `${base}/ficha` };
}

function Tile({
  label,
  value,
  note,
  attention = false,
}: {
  label: string;
  value: number;
  note: string;
  attention?: boolean;
}) {
  return (
    <div className="rounded-[14px] border border-line bg-surface p-4 shadow-card transition-shadow hover:shadow-float">
      <Label>{label}</Label>
      <Counter
        value={value}
        className={`mt-1.5 block text-[30px] leading-none font-semibold tracking-tight ${attention ? 'text-warn' : ''}`}
      />
      <p className="mt-1.5 text-xs text-ink-3">{note}</p>
    </div>
  );
}

export default async function AgendaPage() {
  const session = await requireSession();
  const contextMeeting = findMeeting(ACTIVE_MEETING_ID)!;
  const incomplete = meetings.filter((m) => m.data_status === 'manual_verification_required');

  return (
    <AppShell meeting={contextMeeting} teacherName={session.name} teacherId={session.teacherId}>
      <div className="flex flex-col gap-4 p-5.5">
        <PageHead
          title="Agenda de reuniones"
          subtitle="Viernes 14 de agosto de 2026 · sincronizado desde Google Calendar"
          tag="SINCRONIZADO CON CALENDAR"
        />

        <div className="stagger grid grid-cols-4 gap-3.5 max-md:grid-cols-2">
          <Tile label="Reuniones hoy" value={dashboardSummary.meetingsToday} note="1 en curso · 2 programadas" />
          <Tile label="Actas por revisar" value={dashboardSummary.pendingReview} note="La más antigua: hace 2 días" attention />
          <Tile label="Enviadas esta semana" value={dashboardSummary.sentThisWeek} note="7 confirmadas por el representante" />
          <Tile label="Seguimientos vencidos" value={dashboardSummary.overdueFollowUps} note="Mateo Chávez · vencía el 11 ago" attention />
        </div>

        <Card title="Hoy" tag="RECORDATORIOS ACTIVOS" bodyClassName="">
          <ul className="stagger flex list-none flex-col">
            {meetings.map((m, i) => {
              const state = rowState(m);
              return (
                <li
                  key={m.meeting_id}
                  className={`flex items-center gap-3.5 px-4 py-3 transition-colors hover:bg-surface-2 max-md:flex-wrap ${i > 0 ? 'border-t border-line' : ''}`}
                >
                  <span className="tabular w-14 shrink-0 font-data text-[13px] text-ink-2">
                    {m.start_time}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{m.student_name}</span>
                    <span className="block text-xs text-ink-3">
                      {m.course} · {m.meeting_type}
                    </span>
                  </span>
                  <span className="w-40 shrink-0 text-[13px] text-ink-2 max-md:w-auto">
                    {m.representative_name}
                  </span>
                  <Pill tone={state.tone}>{state.label}</Pill>
                  <Link
                    href={state.href}
                    role="button"
                    className="inline-flex min-h-[44px] w-[132px] shrink-0 items-center justify-center rounded-[10px] border border-line-strong bg-surface px-4 text-sm font-medium transition hover:bg-surface-2"
                  >
                    {state.cta}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>

        {incomplete.length > 0 && (
          <Banner
            tone="warn"
            title={`${incomplete.length} reunión requiere verificación manual`}
          >
            <p className="mt-0.5">
              Runachay no devolvió el correo del representante de{' '}
              {incomplete.map((m) => m.student_name).join(', ')}. El acta no se podrá enviar hasta
              completar el dato.
            </p>
            <p className="mt-1.5">
              <WfTag>PENDIENTE DE VERIFICACIÓN MANUAL</WfTag>
            </p>
          </Banner>
        )}
      </div>
    </AppShell>
  );
}
