import type { NextRequest } from 'next/server';
import { handle } from '@/app/api/_handler';
import { speaker } from '@/services';

/**
 * Confirmación de hablantes — antes WF 07.
 *
 * La diarización automática es Fase 3; en Fase 1 confirma la docente, que
 * estuvo en la reunión.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await request.json()) as { timestamp: string; speaker: string };

  return handle((session) =>
    speaker.confirm({
      meetingId: decodeURIComponent(id),
      timestamp: body.timestamp,
      speaker: body.speaker,
      teacherId: session.teacherId,
    }),
  );
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handle(() => speaker.pending(decodeURIComponent(id)));
}
