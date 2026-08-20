import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { Historial } from '@/components/Historial';
import { Avatar, Banner, Card, Label, PageHead, WfTag } from '@/components/ui';
import { findMeeting, previousDocuments, representative, student } from '@/lib/mock/data';
import { requireSession } from '@/lib/session';
import { history } from '@/services';

export const metadata = { title: 'Ficha previa · ACTA PRO' };

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex-1 bg-surface p-3.5">
      <p className="tabular text-[21px] leading-tight font-semibold">{value}</p>
      <p className="mt-0.5 text-xs text-ink-3">{label}</p>
    </div>
  );
}

export default async function FichaPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const meeting = findMeeting(decodeURIComponent(id));
  if (!meeting) notFound();

  const verified = meeting.data_status !== 'manual_verification_required';

  /*
   * Lo que quedó abierto con esta familia. Va antes que los datos académicos:
   * el promedio se puede consultar en cualquier momento, pero llegar a la
   * reunión sin saber qué se acordó la vez anterior es lo que la convierte en
   * una conversación que empieza de cero.
   */
  const previo = await history.forStudent(meeting.student_id, {
    before: meeting.date,
    excludeMeetingId: meeting.meeting_id,
  });

  const actasDelEstudiante = previousDocuments.filter(
    (d) => d.student_id === meeting.student_id,
  );

  return (
    <AppShell meeting={meeting} teacherName={session.name} teacherId={session.teacherId}>
      <div className="flex flex-col gap-4 p-5.5">
        <PageHead
          title="Ficha previa"
          subtitle="Preparada automáticamente 30 minutos antes de la reunión"
          tag="DATOS DESDE RUNACHAY"
        />

        <div className="flex items-start gap-3.5 max-lg:flex-col">
          {/* ── Columna principal ── */}
          <div className="flex min-w-0 flex-1 flex-col gap-3.5 max-lg:w-full">
            <Historial history={previo} />

            <Card
              title="Estudiante"
              aside={<span className="font-data text-[10px] tracking-wider text-ink-3">FUENTE: RUNACHAY</span>}
            >
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3.5">
                  <Avatar initials="JP" size={52} />
                  <div>
                    <p className="text-[17px] font-semibold">{student.name}</p>
                    <p className="text-[13px] text-ink-3">
                      {student.course} · <span className="font-data text-[11px]">{student.student_id}</span>
                    </p>
                  </div>
                </div>

                <div className="flex gap-px overflow-hidden rounded-[10px] border border-line bg-line">
                  <Stat value={String(student.average ?? '—').replace('.', ',')} label="Promedio matemáticas" />
                  <Stat
                    value={student.attendance_rate ? `${Math.round(student.attendance_rate * 100)} %` : '—'}
                    label="Asistencia del parcial"
                  />
                  <Stat value={String(student.late_arrivals ?? '—')} label="Atrasos en julio" />
                </div>

                <div>
                  <Label>Observaciones registradas</Label>
                  <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-[13px] text-ink-2">
                    {student.observations?.map((o) => <li key={o}>{o}</li>)}
                  </ul>
                </div>
              </div>
            </Card>

            <Card title="Actas anteriores de este estudiante" tag="ARCHIVO" bodyClassName="px-4">
              <ul className="flex list-none flex-col">
                {/*
                  Filtrado por estudiante. Antes se pintaba el archivo entero, de
                  modo que en la ficha de Juan aparecían las actas de Camila y de
                  Mateo. En un centro educativo eso no es un fallo de maquetación:
                  es enseñar el historial de una familia a otra.
                */}
                {actasDelEstudiante.map((d, i) => (
                  <li
                    key={d.meeting_id}
                    className={`flex items-center gap-3 py-3 ${i > 0 ? 'border-t border-line' : ''}`}
                  >
                    <span className="tabular w-[84px] shrink-0 font-data text-[11px] text-ink-3">
                      {d.date}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{d.meeting_type}</span>
                      <span className="block font-data text-[10px] tracking-wider text-ink-3 uppercase">
                        {d.meeting_id} · {d.signed ? 'firmada' : 'sin firmar'}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="rounded-[10px] border border-line-strong bg-surface px-4 text-sm font-medium transition hover:bg-surface-2"
                    >
                      Abrir
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {/* ── Columna lateral ── */}
          <div className="flex w-[340px] shrink-0 flex-col gap-3.5 max-lg:w-full">
            <Card title="Representante">
              <div className="flex flex-col gap-3.5">
                <div className="flex items-center gap-3">
                  <Avatar initials="ML" size={42} />
                  <div>
                    <p className="text-[15px] font-semibold">{representative.name}</p>
                    <p className="text-[13px] text-ink-3 capitalize">
                      {representative.relation} · representante legal
                    </p>
                  </div>
                </div>
                <dl className="flex flex-col gap-1.5 text-[13px]">
                  {[
                    ['Correo', representative.email, false],
                    ['Teléfono', representative.phone ?? '—', true],
                    ['Idioma', representative.language ?? '—', false],
                  ].map(([k, v, mono]) => (
                    <div key={k as string} className="flex gap-3">
                      <dt className="w-[74px] shrink-0 text-ink-3">{k}</dt>
                      <dd className={`m-0 min-w-0 break-words ${mono ? 'font-data text-[11px]' : ''}`}>
                        {v}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </Card>

            <Card title="Motivo y puntos a tratar">
              <p className="text-[13px] text-ink-2">
                Revisión del rendimiento académico en Matemáticas durante el primer parcial del
                período {meeting.school_year}.
              </p>
              <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-[13px] text-ink-2">
                <li>Calificaciones del primer parcial</li>
                <li>Tareas pendientes de entrega</li>
                <li>Propuesta de plan de refuerzo</li>
                <li>Acuerdos de acompañamiento en casa</li>
              </ul>
            </Card>

            {verified ? (
              <Banner tone="ok" title="Datos verificados">
                <p className="mt-0.5">
                  Estudiante, representante y docente confirmados en Runachay.
                </p>
                <p className="mt-1.5">
                  <WfTag>DATOS VERIFICADOS</WfTag>
                </p>
              </Banner>
            ) : (
              <Banner tone="crit" title="Falta el correo del representante">
                <p className="mt-0.5">
                  Sin este dato el acta no se podrá enviar. Complétalo antes de iniciar
                  la reunión.
                </p>
                <p className="mt-1.5">
                  <WfTag>PENDIENTE DE VERIFICACIÓN MANUAL</WfTag>
                </p>
              </Banner>
            )}

            <Link
              href={`/reuniones/${encodeURIComponent(meeting.meeting_id)}/sala`}
              role="button"
              className="inline-flex min-h-[44px] items-center justify-center rounded-[10px] border border-accent bg-accent px-4 text-sm font-medium text-accent-on transition hover:brightness-110"
            >
              Iniciar reunión
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
