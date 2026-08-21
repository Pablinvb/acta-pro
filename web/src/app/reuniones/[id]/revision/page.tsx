import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { requireSession } from '@/lib/session';
import type { ReviewedFinding } from '@/lib/types';
import { RevisionClient } from './RevisionClient';
import { actaGenerator, languageReview, meetings } from '@/services';
import { collectFragments } from '@/services/language-review.service';

export const metadata = { title: 'Revisión del acta · ACTA PRO' };

export default async function RevisionPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const meeting = await meetings.findOrNull(decodeURIComponent(id));
  if (!meeting) notFound();

  const acta = await actaGenerator.find(meeting.meeting_id);
  if (!acta) notFound();

  const hallazgos = await languageReview.findByMeeting(meeting.meeting_id);

  /*
   * El cliente necesita saber en qué sección vive cada fragmento para poder
   * saltar hasta él. La revisión de lenguaje no lo devuelve —trabaja sobre
   * texto suelto—, así que se localiza aquí, contra el acta guardada.
   */
  const seccionDe = (fragmento: string): number =>
    acta.sections.find((s) =>
      [...(s.paragraphs ?? []), ...(s.items ?? [])].some((t) => t.includes(fragmento)),
    )?.number ?? 0;

  const initialFindings: ReviewedFinding[] = hallazgos.map((f, i) => ({
    ...f,
    // Identificador estable dentro de la pantalla: la revisión no numera sus
    // hallazgos y el cliente los necesita para recordar qué se decidió.
    id: `h${i + 1}`,
    section: seccionDe(f.fragment),
    resolution: 'open',
  }));

  // Los fragmentos adecuados no piden decisión, así que no se listan: solo cuentan.
  const totalReviewed = collectFragments(acta.sections).length;
  const greenCount = Math.max(0, totalReviewed - initialFindings.length);

  return (
    <AppShell
      meeting={{ ...meeting, status: 'awaiting_teacher_review' }}
      teacherName={session.name}
      teacherId={session.teacherId}
    >
      <RevisionClient
        minutes={acta}
        initialFindings={initialFindings}
        greenCount={greenCount}
        totalReviewed={totalReviewed}
      />
    </AppShell>
  );
}
