import type { NextRequest } from 'next/server';
import { handleMeeting } from '@/app/api/_handler';
import { lifecycle } from '@/services';

/**
 * Cierre de la reunión — antes la cadena WF 08 → 09 → 10.
 *
 * Analiza la transcripción, genera el borrador del acta y lo pasa por la
 * revisión de lenguaje. Devuelve el resultado de cada paso para que la interfaz
 * pueda decir en cuál se quedó si algo falla.
 */
export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const meetingId = decodeURIComponent(id);
  return handleMeeting(meetingId, () => lifecycle.closeMeetingAndDraft(meetingId));
}
