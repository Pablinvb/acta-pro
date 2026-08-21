import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { Counter } from '@/components/Counter';
import { IconCalendar, IconDocument, IconMic, IconSignature } from '@/components/icons';
import { AvatarStack, PersonAvatar } from '@/components/people';
import { Banner, Card, Label, Pill, type Tone } from '@/components/ui';
import { CheckList, DocumentPreview, Waveform } from '@/components/visuals';
import { requireSession } from '@/lib/session';
import { actaGenerator, documents, meetings as meetingService } from '@/services';
import { getRepositories } from '@/repositories';
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

  /*
   * Las reuniones salen del repositorio, no de una lista fija. Se muestran las
   * que siguen abiertas: una vez enviada, el acta vive en el repositorio de
   * actas y ya no es trabajo pendiente. Sin este filtro la agenda crecería con
   * el curso hasta dejar de servir para lo que sirve, que es saber qué toca
   * ahora.
   */
  const abiertas = (await meetingService.list({ teacherId: session.teacherId })).filter(
    (m) => m.status !== 'sent',
  );

  const proxima = abiertas.find((m) => m.status === 'scheduled') ?? abiertas[0];
  /*
   * Sólo lo que de verdad está en marcha. Antes esto caía en la próxima reunión
   * cuando no había ninguna activa, y el panel anunciaba «En vivo» sobre una
   * cita que aún no había empezado.
   */
  const activa = abiertas.find(
    (m) => m.status === 'in_progress' || m.status === 'awaiting_teacher_review',
  );
  const incompletas = abiertas.filter((m) => m.data_status === 'manual_verification_required');

  // El acta que la docente tiene a medias, si la hay.
  const enRevision = abiertas.find((m) => m.status === 'awaiting_teacher_review');
  const acta = enRevision ? await actaGenerator.find(enRevision.meeting_id) : null;
  const acuerdos = acta?.sections.find((s) => s.title === 'Acuerdos')?.items ?? [];
  const compromisos = acta?.sections.find((s) => s.title === 'Compromisos')?.items ?? [];

  const archivadas = await documents.search({ teacherId: session.teacherId });

  /*
   * Cifras calculadas, no escritas a mano. Antes eran constantes de los datos
   * de demostración —«7 enviadas esta semana», «Mateo Chávez · vencía el 11
   * ago»— que con un claustro real habrían salido idénticas para todo el mundo.
   * Un panel que enseña números inventados es peor que uno sin números: se
   * toman decisiones con ellos.
   */
  const hoy = new Date().toISOString().slice(0, 10);
  const repos = getRepositories();

  /*
   * Los seguimientos se buscan sobre TODAS sus reuniones, no sólo las abiertas.
   * Un seguimiento es precisamente lo que queda pendiente después de enviar el
   * acta: filtrarlos por reunión abierta los hacía desaparecer justo cuando
   * empiezan a importar.
   */
  const todas = await meetingService.list({ teacherId: session.teacherId });
  const propios = new Set(todas.map((m) => m.meeting_id));
  const vencidos = (await repos.followUps.overdue(hoy)).filter((f) => propios.has(f.meeting_id));

  const seguimientos = (
    await Promise.all(todas.map((m) => repos.followUps.listByMeeting(m.meeting_id)))
  )
    .flat()
    .sort((a, b) => a.date.localeCompare(b.date));
  const cifras = {
    pendientes: abiertas.length,
    enCurso: abiertas.filter((m) => m.status === 'in_progress').length,
    porRevisar: abiertas.filter((m) => m.status === 'awaiting_teacher_review').length,
    archivadas: archivadas.length,
    firmadas: archivadas.filter((d) => d.signed).length,
    vencidos: vencidos.length,
  };

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
              {proxima
                ? `Tienes ${abiertas.length} ${abiertas.length === 1 ? 'reunión pendiente' : 'reuniones pendientes'} · sincronizado desde Google Calendar`
                : 'Sin reuniones pendientes · sincronizado desde Google Calendar'}
            </p>
          </div>
        </div>

        {/*
          Una docente recién dada de alta no tiene ninguna reunión, y hasta
          ahora eso reventaba la pantalla entera. Una agenda vacía es un estado
          normal —la primera vez que alguien entra— y tiene que explicarse, no
          fallar.
        */}
        {proxima ? (
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
        ) : (
          <Card className="animate-card">
            <p className="text-[15px] font-semibold">No tienes reuniones pendientes</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">
              Las reuniones aparecen aquí en cuanto se sincronizan desde Google Calendar. Si
              esperabas ver alguna, comprueba que la cita está en tu calendario y que te tiene a ti
              como responsable.
            </p>
          </Card>
        )}

        {/* ── Cifras del día ── */}
        <div className="grid grid-cols-4 gap-3.5 max-md:grid-cols-2">
          <Tile
            label="Reuniones pendientes"
            value={cifras.pendientes}
            note={cifras.enCurso > 0 ? `${cifras.enCurso} en curso` : 'Ninguna en curso'}
            Icon={IconCalendar}
          />
          <Tile
            label="Actas por revisar"
            value={cifras.porRevisar}
            note={cifras.porRevisar > 0 ? 'Esperan tu aprobación' : 'Nada pendiente'}
            Icon={IconDocument}
            attention={cifras.porRevisar > 0}
          />
          <Tile
            label="Archivadas"
            value={cifras.archivadas}
            note={`${cifras.firmadas} con las dos firmas`}
            Icon={IconSignature}
          />
          <Tile
            label="Seguimientos vencidos"
            value={cifras.vencidos}
            note={cifras.vencidos > 0 ? 'Revisa qué quedó pendiente' : 'Todo al día'}
            Icon={IconMic}
            attention={cifras.vencidos > 0}
          />
        </div>

        <div className="flex items-start gap-3.5 max-lg:flex-col">
          {/* ── La agenda del día ── */}
          <div className="flex min-w-0 flex-1 flex-col gap-3.5 max-lg:w-full">
            <Card className="animate-card" title="Hoy" bodyClassName="px-2 py-1">
              <ul className="stagger flex list-none flex-col">
                {abiertas.map((m) => {
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
            {/*
              Antes esta tarjeta decía «cumplimiento de acuerdos: 75 %». Ese
              dato no existe: nadie registra en ninguna parte si un compromiso
              se cumplió, así que el porcentaje estaba escrito a mano. Se
              sustituye por los seguimientos, que sí constan.
            */}
            <Card className="animate-card" title="Seguimientos">
              {seguimientos.length === 0 ? (
                <p className="text-[13px] leading-relaxed text-ink-3">
                  No hay revisiones pendientes. Aparecen aquí cuando una reunión acuerda una fecha
                  de seguimiento.
                </p>
              ) : (
                <ul className="flex list-none flex-col gap-2.5 text-[13px]">
                  {seguimientos.slice(0, 4).map((f) => (
                    <li key={`${f.meeting_id}-${f.date}`} className="flex items-baseline gap-2.5">
                      <span
                        className={`mt-1 size-2.5 shrink-0 rounded-full ${
                          f.date < hoy ? 'bg-warn' : 'bg-accent'
                        }`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-ink-2">{f.description}</span>
                        <span className="tabular font-data text-[11px] text-ink-3">
                          {f.date}
                          {f.date < hoy ? ' · vencido' : ''}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {activa &&
              (() => {
                // «En vivo» sólo si se está grabando. Un acta esperando revisión
                // no está en curso, y anunciarla en rojo como si lo estuviera
                // manda a la docente a una sala donde no pasa nada.
                const grabando = activa.status === 'in_progress';
                return (
                  <Card
                    className="animate-card"
                    title={grabando ? 'Reunión en curso' : 'Acta esperándote'}
                    aside={
                      grabando ? <Pill tone="crit">En vivo</Pill> : <Pill tone="warn">Borrador</Pill>
                    }
                  >
                    <p className="mb-2 truncate text-[13px] font-medium">{activa.student_name}</p>
                    <Waveform
                      seed={activa.meeting_id}
                      active={grabando}
                      bars={38}
                      className="h-10"
                    />
                    <Link
                      href={`/reuniones/${encodeURIComponent(activa.meeting_id)}/${grabando ? 'sala' : 'revision'}`}
                      className="mt-3 block text-[13px] font-medium text-accent-text hover:underline"
                    >
                      {grabando ? 'Volver a la sala →' : 'Revisar el acta →'}
                    </Link>
                  </Card>
                );
              })()}

            {archivadas[0] && (
              <Card className="animate-card" title="Última acta">
                <div className="flex gap-3.5">
                  <div className="w-[84px] shrink-0">
                    <DocumentPreview signed={archivadas[0].signed} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">
                      {archivadas[0].student_name}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-3">{archivadas[0].meeting_type}</p>
                    <p className="tabular mt-1 font-data text-[11px] text-ink-3">
                      {archivadas[0].date}
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
            )}

            {acuerdos.length + compromisos.length > 0 && (
              <Card className="animate-card" title="Lo que la IA extrajo" tag="ACTA EN BORRADOR">
                <CheckList
                  items={[
                    ...acuerdos.slice(0, 2).map((t) => ({ text: t, done: true })),
                    ...compromisos.slice(0, 2).map((t) => ({ text: t, done: true })),
                  ]}
                />
              </Card>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
