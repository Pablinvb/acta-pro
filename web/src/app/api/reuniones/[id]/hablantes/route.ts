import type { NextRequest } from 'next/server';
import { handle } from '@/app/api/_handler';
import { speaker } from '@/services';

/**
 * Identificación de hablantes — antes WF 07.
 *
 * `GET` devuelve una muestra por voz detectada, con la intervención más larga
 * de cada una, para que la docente reconozca quién es quién.
 *
 * `POST` acepta el mapa completo `{ A: 'Ana Pérez', B: 'María López' }` y
 * atribuye de golpe todos los fragmentos de cada voz. Una decisión por persona,
 * no una por frase.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handle(async () => ({
    diarization: speaker.hasDiarization(),
    voices: await speaker.voiceSamples(decodeURIComponent(id)),
  }));
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await request.json()) as {
    assignments?: Record<string, string>;
    timestamp?: string;
    speaker?: string;
  };

  return handle(async (session) => {
    // Mapa completo de voces: el camino normal cuando hay separación de voces.
    if (body.assignments) {
      return speaker.assignVoices({
        meetingId: decodeURIComponent(id),
        assignments: body.assignments,
        teacherId: session.teacherId,
      });
    }

    // Fragmento suelto: reserva para cuando el proveedor no separa voces.
    if (body.timestamp && body.speaker) {
      await speaker.confirm({
        meetingId: decodeURIComponent(id),
        timestamp: body.timestamp,
        speaker: body.speaker,
        teacherId: session.teacherId,
      });
      return { attributed: 1 };
    }

    return { attributed: 0 };
  });
}
