import { NextResponse, type NextRequest } from 'next/server';
import { sendAudioChunk } from '@/lib/n8n';
import { proxy } from '../_respond';

/**
 * WF 06 · POST /acta-pro/audio-chunk
 *
 * Recibe un fragmento de audio del navegador y lo reenvía a n8n. Se envía de
 * fragmento en fragmento durante la reunión: si algo falla a mitad, se pierde
 * un fragmento, no la grabación entera.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const audio = form.get('data');
  const meetingId = form.get('meeting_id');

  if (!(audio instanceof Blob) || typeof meetingId !== 'string') {
    return NextResponse.json(
      {
        error: 'fragmento_invalido',
        message: 'Falta el audio o el identificador de la reunión.',
      },
      { status: 400 },
    );
  }

  const timestamp = String(form.get('timestamp') ?? new Date().toISOString());
  let participants: string[] = [];
  try {
    participants = JSON.parse(String(form.get('participantes_esperados') ?? '[]'));
  } catch {
    participants = [];
  }

  return proxy(() =>
    sendAudioChunk({ meeting_id: meetingId, timestamp, participantes_esperados: participants }, audio),
  );
}
