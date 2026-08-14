import { NextResponse, type NextRequest } from 'next/server';
import { submitTeacherReview, type TeacherReviewPayload } from '@/lib/n8n';
import { proxy } from '../_respond';

const DECISIONS = ['approve', 'edit', 'reject'] as const;

/**
 * WF 11 · POST /acta-pro/teacher-review
 *
 * Único camino hacia `teacher_approved`. Se valida aquí además de en n8n para
 * que una decisión mal formada no llegue nunca a tocar el estado del acta.
 */
export async function POST(request: NextRequest) {
  const payload = (await request.json()) as TeacherReviewPayload;

  if (!payload?.meeting_id || !DECISIONS.includes(payload.decision)) {
    return NextResponse.json(
      {
        error: 'decision_invalida',
        message: 'Indica la reunión y una decisión válida: approve, edit o reject.',
      },
      { status: 400 },
    );
  }

  return proxy(() => submitTeacherReview(payload));
}
