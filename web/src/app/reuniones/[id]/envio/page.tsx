import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { PageHead } from '@/components/ui';
import { transcriptVaultPath } from '@/lib/mock/data';
import { requireSession } from '@/lib/session';
import { EnvioClient } from './EnvioClient';
import { meetings, signatures as signatureService, storage } from '@/services';
import { getRepositories } from '@/repositories';

export const metadata = { title: 'Envío y archivo · ACTA PRO' };

export default async function EnvioPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const meeting = await meetings.findForTeacher(decodeURIComponent(id), session.teacherId);
  if (!meeting) notFound();

  // Sin correo verificado el acta no se puede enviar: se dice antes de intentarlo.
  const canSend =
    meeting.data_status !== 'manual_verification_required' && !!meeting.representative_email;

  /*
   * El estado de firma se lee de lo guardado, no de una lista fija. Antes esta
   * pantalla decía «firmada» siempre, con independencia de si alguien había
   * firmado algo.
   */
  const signed = await signatureService.isFullySigned(meeting.meeting_id);

  // Dónde queda archivada, calculado con la misma regla que usa el archivador.
  const drivePath = storage.buildPath(meeting);
  const [followUp] = await getRepositories().followUps.listByMeeting(meeting.meeting_id);

  return (
    <AppShell
      meeting={{ ...meeting, status: signed ? 'signed' : 'teacher_approved' }}
      teacherName={session.name}
      teacherId={session.teacherId}
    >
      <div className="flex flex-col gap-4 p-5.5">
        <PageHead
          title="Envío y archivo"
          subtitle="Se dispara al completarse las firmas, no desde esta pantalla"
          tag="ARCHIVO · CORREO · SEGUIMIENTO"
        />
        <EnvioClient
          meeting={meeting}
          drivePath={drivePath}
          transcriptVaultPath={transcriptVaultPath}
          followUp={followUp}
          canSend={canSend}
          signed={signed}
        />
      </div>
    </AppShell>
  );
}
