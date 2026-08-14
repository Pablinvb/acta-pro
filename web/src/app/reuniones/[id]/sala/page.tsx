import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { PageHead } from '@/components/ui';
import { dataSource } from '@/lib/env';
import { findMeeting, teacher, transcript } from '@/lib/mock/data';
import { SalaClient } from './SalaClient';

export const metadata = { title: 'Sala de reunión · ACTA PRO' };

export default async function SalaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meeting = findMeeting(decodeURIComponent(id));
  if (!meeting) notFound();

  return (
    <AppShell
      meeting={{ ...meeting, status: 'in_progress' }}
      teacherName={teacher.name}
      teacherId={teacher.teacher_id}
    >
      <div className="flex flex-col gap-4 p-5.5">
        <PageHead
          title="Reunión en curso"
          subtitle="El audio se envía en fragmentos y se transcribe en segundo plano"
          tag="WF 05 START-MEETING · WF 06 AUDIO-CHUNK"
        />
        <SalaClient
          meeting={meeting}
          demoTranscript={transcript}
          isMock={dataSource === 'mock'}
        />
      </div>
    </AppShell>
  );
}
