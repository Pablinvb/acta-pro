import { NextResponse, type NextRequest } from 'next/server';
import { handle } from '@/app/api/_handler';
import { meetings, speech } from '@/services';

/**
 * Pasada final de transcripción sobre el audio completo.
 *
 * Se llama una vez al cerrar la reunión. Los fragmentos de 30 s sirven para que
 * la docente vea que la grabación funciona, pero cada uno se diariza por su
 * cuenta: la «Voz A» de un fragmento no es la misma persona que la del
 * siguiente. Esta pasada transcribe la reunión entera de una vez y sustituye a
 * la anterior, dejando etiquetas de voz coherentes de principio a fin.
 */
export const maxDuration = 300;

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const meetingId = decodeURIComponent(id);

  const form = await request.formData();
  const audio = form.get('data');

  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json(
      { error: 'validacion', message: 'No llegó el audio de la reunión.' },
      { status: 400 },
    );
  }

  return handle(async () => {
    const meeting = await meetings.find(meetingId);
    const present = meeting.participants.filter((p) => p.present).map((p) => p.name);
    return speech.transcribeFullMeeting(meetingId, audio, present);
  });
}
