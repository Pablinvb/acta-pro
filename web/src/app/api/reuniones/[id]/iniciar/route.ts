import type { NextRequest } from 'next/server';
import { handleMeeting } from '@/app/api/_handler';
import { meetings } from '@/services';
import type { Participant } from '@/lib/types';

/** Inicio de la reunión — antes WF 05 · POST /acta-pro/start-meeting */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const meetingId = decodeURIComponent(id);
  const body = (await request.json()) as { participants?: Participant[] };

  return handleMeeting(meetingId, (session) =>
    meetings.start({
      meetingId: meetingId,
      teacherId: session.teacherId,
      participants: body.participants ?? [],
    }),
  );
}
