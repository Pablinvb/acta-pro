import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { Counter } from '@/components/Counter';
import { IconCalendar, IconDocument, IconMic, IconSignature } from '@/components/icons';
import { AvatarStack, PersonAvatar } from '@/components/people';
import { Banner, Card, Label, Pill, type Tone } from '@/components/ui';
import { CheckList, DocumentPreview, ProgressRing, Waveform } from '@/components/visuals';
import {
  ACTIVE_MEETING_ID,
  dashboardSummary,
  findMeeting,
  meetings,
  minutes,
  previousDocuments,
} from '@/lib/mock/data';
import { requireSession } from '@/lib/session';
import type { Meeting } from '@/lib/types';

export const metadata = { title: 'Panel · ACTA PRO' };

/** Cómo se etiqueta cada reunión y qué acción ofrece. */
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
  return { label: `A las ${m.start_time}`, tone: 'neutral', cta: 'Prepararme', href: `${base}/ficha` };
}

function saludo(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

function Tile({
  label,
  value,
  note,
  Icon,
  attention = false,
}: {
  label: string;
  value: number;
  note: string;
  Icon: React.ComponentType<{ className?: string }>;
  attention?: boolean;
}) {
  return (
    <div className="animate-card rounded-[14px] border border-line bg-surface p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-accent-border hover:shadow-float">
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`grid size-8 shrink-0 place-items-center rounded-lg ${
            attention ? 'bg-warn-soft text-warn' : 'bg-accent-soft text-accent-text'
          }`}
        >
          <Icon className="size-[17px]" />
        </span>
        <Label>{label}</Label>
      </div>
      <Counter
        value={value}
        className={`block text-[32px] leading-none font-bold tracking-tight ${attention ? 'text-warn' : ''}`}
      />
      <p className="mt-1.5 text-xs text-ink-3">{note}</p>
    </div>
  );
}

export default async function PanelPage() {
  const session = await requireSession();
  const proxima = meetings.find((m) => m.status === 'scheduled') ?? meetings[0];
  const activa = findMeeting(ACTIVE_MEETING_ID)!;
  const incompletas = meetings.filter((m) => m.data_status === 'manual_verification_required');

  const acuerdos = minutes.sections.find((s) => s.title === 'Acuerdos')?.items ?? [];
  const compromisos = minutes.sections.find((s) => s.title === 'Compromisos')?.items ?? [];

  return (
    <AppShell meeting={activa} teacherName={session.name} teacherId={session.teacherId}>
      <div className="flex flex-col gap-4 p-5.5">
        {/* ── Saludo ── */}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <h1 className="text-[26px] leading-tight font-bold tracking-tight text-balance">
              {saludo()}, {session.name.split(' ')[0]}
            </h1>
            <p className="mt-1 text-[13px] text-ink-3">
              Tienes {meetings.length} reuniones hoy · sincronizado desde Google Calendar
            </p>
          </div>
        </div>

        {/* ── Lo primero que necesita: su próxima reunión ── */}
        <Card className="animate-card overflow-hidden" bodyClassName="p-0">
          <div className="flex flex-wrap items-center gap-4 p-5">
            <PersonAvatar name={proxima.student_name} size={56} ring />
            <div className="min-w-0 flex-1">
              <span className="mb-1 flex items-center gap-2">
                <Pill tone="accent">Próxima reunión</Pill>
                <span className="tabular font-data text-[12px] text-ink-2">
                  {proxima.start_time}
                </span>
              </span>
              <p className="truncate text-[19px] font-semibold">{proxima.student_name}</p>
              <p className="truncate text-[13px] text-ink-3">
                {proxima.course} · {proxima.meeting_type} · con {proxima.representative_name}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <AvatarStack names={proxima.participants.map((p) => p.name)} size={32} />
              <Link
                href={`/reuniones/${encodeURIComponent(proxima.meeting_id)}/ficha`}
                role="button"
                className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-[10px] border border-accent bg-accent px-5 text-sm font-semibold text-accent-on shadow-glow-soft transition hover:brightness-110"
              >
                Prepararme
              </Link>
            </div>
          </div>
        </Card>

        {/* ── Cifras del día ── */}
        <div className="grid grid-cols-4 gap-3.5 max-md:grid-cols-2">
          <Tile label="Reuniones hoy" value={dashboardSummary.meetingsToday} note="1 en curso · 2 programadas" Icon={IconCalendar} />
          <Tile label="Actas por revisar" value={dashboardSummary.pendingReview} note="La más antigua: hace 2 días" Icon={IconDocument} attention />
          <Tile label="Enviadas esta semana" value={dashboardSummary.sentThisWeek} note="Confirmadas por el representante" Icon={IconSignature} />
          <Tile label="Seguimientos vencidos" value={dashboardSummary.overdueFollowUps} note="Mateo Chávez · vencía el 11 ago" Icon={IconMic} attention />
        </div>

        <div className="flex items-start gap-3.5 max-lg:flex-col">
          {/* ── La agenda del día ── */}
          <div className="flex min-w-0 flex-1 flex-col gap-3.5 max-lg:w-full">
            <Card className="animate-card" title="Hoy" bodyClassName="px-2 py-1">
              <ul className="stagger flex list-none flex-col">
                {meetings.map((m) => {
                  const state = rowState(m);
                  return (
                    <li key={m.meeting_id}>
                      <Link
                        href={state.href}
                        className="flex items-center gap-3.5 rounded-xl px-2.5 py-3 transition-colors hover:bg-surface-2 max-md:flex-wrap"
                      >
                        <span className="tabular w-12 shrink-0 font-data text-[13px] text-ink-2">
                          {m.start_time}
                        </span>
                        <PersonAvatar name={m.student_name} size={38} />
                        {/*
                          El nombre del estudiante es el dato que la docente
                          busca al mirar la lista, así que se lleva todo el
                          espacio sobrante y lo demás se reparte lo que queda.
                        */}
                        <span className="min-w-[7rem] flex-1 basis-0">
                          <span className="block truncate text-sm font-semibold">
                            {m.student_name}
                          </span>
                          <span className="block truncate text-xs text-ink-3">
                            {m.course} · {m.meeting_type}
                          </span>
                        </span>
                        <span className="hidden w-40 shrink-0 items-center gap-2 xl:flex">
                          <PersonAvatar name={m.representative_name} size={26} />
                          <span className="truncate text-[13px] text-ink-2">
                            {m.representative_name}
                          </span>
                        </span>
                        <Pill tone={state.tone}>{state.label}</Pill>
                        {/*
                          Toda la fila es un enlace, así que cuando el ancho
                          aprieta basta la flecha: el texto es una cortesía, no
                          la forma de llegar.
                        */}
                        <span className="shrink-0 text-[13px] font-medium text-accent-text">
                          <span className="hidden 2xl:inline">{state.cta} </span>→
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>

            {incompletas.length > 0 && (
              <Banner tone="warn" title={`${incompletas.length} reunión requiere verificación manual`}>
                <p className="mt-0.5">
                  Runachay no devolvió el correo del representante de{' '}
                  {incompletas.map((m) => m.student_name).join(', ')}. El acta no se podrá enviar
                  hasta completar el dato.
                </p>
              </Banner>
            )}
          </div>

          {/* ── El estado del trabajo ── */}
          <div className="flex w-[330px] shrink-0 flex-col gap-3.5 max-lg:w-full">
            <Card className="animate-card" title="Cumplimiento de acuerdos">
              <div className="flex items-center gap-4">
                <ProgressRing value={9} total={12} label="cumplidos" />
                <ul className="flex list-none flex-col gap-2 text-[13px]">
                  {[
                    ['Cumplidos', 9, 'bg-ok'],
                    ['En curso', 3, 'bg-accent'],
                    ['Vencidos', 1, 'bg-warn'],
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

            <Card className="animate-card" title="Reunión en curso" aside={<Pill tone="crit">En vivo</Pill>}>
              <p className="mb-2 truncate text-[13px] font-medium">{activa.student_name}</p>
              <Waveform seed={activa.meeting_id} active bars={38} className="h-10" />
              <Link
                href={`/reuniones/${encodeURIComponent(activa.meeting_id)}/revision`}
                className="mt-3 block text-[13px] font-medium text-accent-text hover:underline"
              >
                Revisar el acta →
              </Link>
            </Card>

            <Card className="animate-card" title="Última acta">
              <div className="flex gap-3.5">
                <div className="w-[84px] shrink-0">
                  <DocumentPreview signed />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">
                    {previousDocuments[0].student_name}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-3">{previousDocuments[0].meeting_type}</p>
                  <p className="tabular mt-1 font-data text-[11px] text-ink-3">
                    {previousDocuments[0].date}
                  </p>
                  <Link
                    href="/repositorio"
                    className="mt-2.5 inline-block text-[13px] font-medium text-accent-text hover:underline"
                  >
                    Ver el repositorio →
                  </Link>
                </div>
              </div>
            </Card>

            <Card className="animate-card" title="Lo que la IA extrajo" tag="ÚLTIMA REUNIÓN">
              <CheckList
                items={[
                  ...acuerdos.slice(0, 2).map((t) => ({ text: t, done: true })),
                  ...compromisos.slice(0, 2).map((t) => ({ text: t, done: true })),
                ]}
              />
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
