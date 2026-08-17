import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { PageHead } from '@/components/ui';
import { findMeeting, minutes } from '@/lib/mock/data';
import { requireSession } from '@/lib/session';
import { FirmasClient } from './FirmasClient';

export const metadata = { title: 'Firmas · ACTA PRO' };

export default async function FirmasPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const meeting = findMeeting(decodeURIComponent(id));
  if (!meeting) notFound();

  const section = (title: string) =>
    minutes.sections.find((s) => s.title === title)?.items ?? [];

  return (
    <AppShell
      meeting={{ ...meeting, status: 'teacher_approved' }}
      teacherName={session.name}
      teacherId={session.teacherId}
    >
      <div className="flex flex-col gap-4 p-5.5">
        <PageHead
          title="Firmas"
          subtitle="Ambas partes firman en este dispositivo, al terminar la reunión"
          tag="FIRMA DIGITAL"
        />
        <FirmasClient
          meeting={meeting}
          agreements={section('Acuerdos')}
          commitments={section('Compromisos')}
        />
      </div>
    </AppShell>
  );
}
