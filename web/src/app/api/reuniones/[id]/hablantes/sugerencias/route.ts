import type { NextRequest } from 'next/server';
import { handleMeeting } from '@/app/api/_handler';
import { voiceRoles } from '@/services';

/**
 * Quién propone el modelo que es cada voz.
 *
 * Va en su propia ruta y no dentro de `/hablantes` a propósito: la llamada al
 * modelo tarda unos segundos y la pantalla de identificación tiene que aparecer
 * al instante. Las voces se pintan primero y la sugerencia llega después,
 * encima de algo que ya se puede usar.
 *
 * Si esto falla o tarda, la pantalla funciona igual: la docente identifica sin
 * ayuda, como hasta ahora.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const meetingId = decodeURIComponent(id);
  return handleMeeting(meetingId, () => voiceRoles.suggest(meetingId));
}
