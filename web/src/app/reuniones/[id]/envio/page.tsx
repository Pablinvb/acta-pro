import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { PageHead } from '@/components/ui';
import {
  drivePath,
  findMeeting,
  followUp,
  signatures,
  teacher,
  transcriptVaultPath,
} from '@/lib/mock/data';
import { EnvioClient } from './EnvioClient';

export const metadata = { title: 'Envío y archivo · ACTA PRO' };

export default async function EnvioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meeting = findMeeting(decodeURIComponent(id));
  if (!meeting) notFound();

  // Sin correo verificado el WF 15 no puede enviar nada: se dice antes de intentarlo.
  const canSend =
    meeting.data_status !== 'manual_verification_required' && !!meeting.representative_email;

  return (
    <AppShell
      meeting={{ ...meeting, status: 'teacher_approved' }}
      teacherName={teacher.name}
      teacherId={teacher.teacher_id}
    >
      <div className="flex flex-col gap-4 p-5.5">
        <PageHead
          title="Envío y archivo"
          subtitle="Nada sale del sistema hasta que confirmes esta pantalla"
          tag="WF 14 DRIVE · WF 15 GMAIL · WF 16 FOLLOW-UP"
        />
        <EnvioClient
          meeting={meeting}
          signatures={signatures}
          drivePath={drivePath}
          transcriptVaultPath={transcriptVaultPath}
          followUp={followUp}
          canSend={canSend}
        />
      </div>
    </AppShell>
  );
}
