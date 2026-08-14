import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { findMeeting, languageFindings, minutes, teacher, totalFragmentsReviewed } from '@/lib/mock/data';
import { RevisionClient } from './RevisionClient';

export const metadata = { title: 'Revisión del acta · ACTA PRO' };

export default async function RevisionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meeting = findMeeting(decodeURIComponent(id));
  if (!meeting) notFound();

  // Los fragmentos GREEN no piden decisión, así que no se listan: solo cuentan.
  const greenCount = totalFragmentsReviewed - languageFindings.length;

  return (
    <AppShell
      meeting={{ ...meeting, status: 'awaiting_teacher_review' }}
      teacherName={teacher.name}
      teacherId={teacher.teacher_id}
    >
      <RevisionClient
        minutes={minutes}
        initialFindings={languageFindings}
        greenCount={greenCount}
        totalReviewed={totalFragmentsReviewed}
      />
    </AppShell>
  );
}
