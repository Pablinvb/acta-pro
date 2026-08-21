import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { PageHead } from '@/components/ui';
import { isDemo } from '@/services/config';
import { transcript } from '@/lib/mock/data';
import { requireSession } from '@/lib/session';
import { SalaClient } from './SalaClient';
import { meetings } from '@/services';

export const metadata = { title: 'Sala de reunión · ACTA PRO' };

export default async function SalaPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const meeting = await meetings.findOrNull(decodeURIComponent(id));
  if (!meeting) notFound();

  return (
    <AppShell
      meeting={{ ...meeting, status: 'in_progress' }}
      teacherName={session.name}
      teacherId={session.teacherId}
    >
      <div className="flex flex-col gap-4 p-5.5">
        <PageHead
          title="Reunión en curso"
          subtitle="El audio se envía en fragmentos y se transcribe en segundo plano"
          tag="GRABACIÓN Y TRANSCRIPCIÓN"
        />
        <SalaClient
          meeting={meeting}
          demoTranscript={transcript}
          isMock={isDemo}
        />
      </div>
    </AppShell>
  );
}
