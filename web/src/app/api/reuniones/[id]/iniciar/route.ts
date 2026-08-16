import type { NextRequest } from 'next/server';
import { handle } from '@/app/api/_handler';
import { meetings } from '@/services';
import type { Participant } from '@/lib/types';

/** Inicio de la reunión — antes WF 05 · POST /acta-pro/start-meeting */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await request.json()) as { participants?: Participant[] };

  return handle((session) =>
    meetings.start({
      meetingId: decodeURIComponent(id),
      teacherId: session.teacherId,
      participants: body.participants ?? [],
    }),
  );
}
