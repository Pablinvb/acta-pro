import type { NextRequest } from 'next/server';
import { handleMeeting } from '@/app/api/_handler';
import { speech } from '@/services';

/**
 * Transcripción de la reunión, para revisarla y corregir atribuciones.
 *
 * Devuelve `clean_text` cuando existe, pero **también el original**: si la
 * docente ve algo raro en el texto depurado, tiene que poder comprobar qué se
 * transcribió de verdad. Ocultarlo convertiría la depuración en un acto de fe.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const meetingId = decodeURIComponent(id);
  return handleMeeting(meetingId, () => speech.listSegments(meetingId));
}
