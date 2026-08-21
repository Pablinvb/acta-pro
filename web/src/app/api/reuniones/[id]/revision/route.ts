import type { NextRequest } from 'next/server';
import { handleMeeting } from '@/app/api/_handler';
import { approval, languageReview } from '@/services';
import type { TeacherDecision } from '@/services/approval.service';

/**
 * Decisión de la docente — antes WF 11 · POST /acta-pro/teacher-review
 *
 * Único camino hacia `teacher_approved`. Si quedan fragmentos no recomendados
 * sin resolver, el servicio rechaza la aprobación: la regla se aplica en el
 * servidor, no solo en la pantalla.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const meetingId = decodeURIComponent(id);
  const body = (await request.json()) as {
    decision: TeacherDecision;
    appliedFragments?: string[];
    keptFragments?: string[];
  };

  return handleMeeting(meetingId, (session) =>
    approval.submit({
      meetingId: meetingId,
      decision: body.decision,
      teacherId: session.teacherId,
      appliedFragments: body.appliedFragments,
      keptFragments: body.keptFragments,
    }),
  );
}

/** Hallazgos de la revisión de lenguaje (WF 09). */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const meetingId = decodeURIComponent(id);
  return handleMeeting(meetingId, () => languageReview.findByMeeting(meetingId));
}
