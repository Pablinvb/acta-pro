import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { PageHead } from '@/components/ui';
import { drivePath, findMeeting, followUp, signatures, transcriptVaultPath } from '@/lib/mock/data';
import { requireSession } from '@/lib/session';
import { EnvioClient } from './EnvioClient';

export const metadata = { title: 'Envío y archivo · ACTA PRO' };

export default async function EnvioPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const meeting = findMeeting(decodeURIComponent(id));
  if (!meeting) notFound();

  // Sin correo verificado el WF 15 no puede enviar nada: se dice antes de intentarlo.
  const canSend =
    meeting.data_status !== 'manual_verification_required' && !!meeting.representative_email;

  // El WF 12 exige ambas firmas; hasta entonces no arranca el resto del proceso.
  const signed = signatures.every((s) => s.signed_at !== null);

  return (
    <AppShell
      meeting={{ ...meeting, status: signed ? 'signed' : 'teacher_approved' }}
      teacherName={session.name}
      teacherId={session.teacherId}
    >
      <div className="flex flex-col gap-4 p-5.5">
        <PageHead
          title="Envío y archivo"
          subtitle="Lo dispara n8n al completarse las firmas, no esta pantalla"
          tag="WF 14 DRIVE · WF 15 GMAIL · WF 16 FOLLOW-UP"
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
