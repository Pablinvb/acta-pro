import { NextResponse, type NextRequest } from 'next/server';
import { handle } from '@/app/api/_handler';
import { speech } from '@/services';

/**
 * Fragmento de audio — antes WF 06 · POST /acta-pro/audio-chunk
 *
 * Se recibe un fragmento a la vez durante la reunión. Si uno falla, se pierde
 * ese tramo y no la grabación entera.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const form = await request.formData();
  const audio = form.get('data');

  if (!(audio instanceof Blob)) {
    return NextResponse.json(
      { error: 'validacion', message: 'No llegó el fragmento de audio.' },
      { status: 400 },
    );
  }

  let expectedParticipants: string[] = [];
  try {
    expectedParticipants = JSON.parse(String(form.get('participantes_esperados') ?? '[]'));
  } catch {
    expectedParticipants = [];
  }

  return handle(() =>
    speech.transcribeChunk({
      meetingId: decodeURIComponent(id),
      audio,
      timestamp: String(form.get('timestamp') ?? new Date().toISOString()),
      expectedParticipants,
    }),
  );
}
