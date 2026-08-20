import 'server-only';
import type { MeetingMinutes } from '@/lib/types';
import { getRepositories } from '@/repositories';
import { summarise, type StudentHistory } from './history';

/**
 * Historial del estudiante.
 *
 * Una reunión con la familia casi nunca es la primera. Lo que se acordó en
 * marzo es exactamente lo que hay que poder poner sobre la mesa en agosto, y
 * hasta ahora la docente tenía que acordarse o buscar el acta anterior a mano.
 *
 * Hay un límite que este servicio respeta de forma deliberada: **no dice si un
 * compromiso se cumplió**. Nadie ha registrado eso en ninguna parte. Lo único
 * que sabe es qué se acordó, cuándo, y si la fecha de seguimiento pasó sin que
 * hubiera otra reunión. Presentar «incumplido» a partir de eso sería inventar
 * un hecho contra una familia, que es justo de lo que este producto tiene que
 * proteger a la docente.
 */

export type { StudentHistory, PastMeeting, PendingItem } from './history';

/**
 * Reconstruye el historial de un estudiante hasta una fecha.
 *
 * Se lee del acta guardada y no del análisis: el acta es lo que la docente
 * aprobó y las dos partes firmaron. El análisis es material intermedio y pudo
 * quedar corregido después.
 */
export async function forStudent(
  studentId: string,
  options: { before: string; excludeMeetingId?: string; today?: string } = { before: '9999-12-31' },
): Promise<StudentHistory> {
  const repos = getRepositories();

  const previas = (await repos.meetings.list({ studentId, before: options.before })).filter(
    (m) => m.meeting_id !== options.excludeMeetingId,
  );

  const registros = await Promise.all(
    previas.map(async (meeting) => ({
      meeting,
      minutes: (await repos.minutes.find(meeting.meeting_id)) as MeetingMinutes | null,
      followUps: await repos.followUps.listByMeeting(meeting.meeting_id),
    })),
  );

  return summarise(registros, options.today ?? new Date().toISOString().slice(0, 10));
}
