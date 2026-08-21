import 'server-only';
import type { Meeting, Participant } from '@/lib/types';
import { getRepositories } from '@/repositories';
import * as audit from './audit.service';
import { estadoInvalido, invalido, noEncontrado } from './errors';

/**
 * Ciclo de vida de la reunión — antes workflows 03 (registro preliminar) y 05
 * (inicio de la reunión).
 */

export async function list(filter?: { teacherId?: string; date?: string }): Promise<Meeting[]> {
  return getRepositories().meetings.list(filter);
}

export async function find(meetingId: string): Promise<Meeting> {
  const meeting = await getRepositories().meetings.find(meetingId);
  if (!meeting) throw noEncontrado(`No existe la reunión ${meetingId}.`);
  return meeting;
}

/**
 * Como `find`, pero devuelve `null` en lugar de lanzar.
 *
 * Para las pantallas: una reunión que no existe es un 404, no un error del
 * servidor, y las páginas quieren llamar a `notFound()` en lugar de capturar
 * una excepción.
 */
export async function findOrNull(meetingId: string): Promise<Meeting | null> {
  return getRepositories().meetings.find(meetingId);
}

/**
 * La reunión, sólo si es de esta docente.
 *
 * Es el control de acceso de todo el producto. Hasta ahora bastaba con estar
 * dentro para abrir cualquier reunión escribiendo su identificador en la barra
 * de direcciones: la agenda filtraba, pero la agenda es una pantalla, no una
 * regla. Con familias reales eso significa que un docente lee el expediente y
 * la transcripción de los estudiantes de otro.
 *
 * Devuelve `null` tanto si la reunión no existe como si no le pertenece, a
 * propósito: distinguir ambos casos permitiría averiguar qué reuniones existen
 * probando identificadores.
 */
export async function findForTeacher(
  meetingId: string,
  teacherId: string,
): Promise<Meeting | null> {
  const meeting = await getRepositories().meetings.find(meetingId);
  if (!meeting) return null;
  return meeting.teacher_id === teacherId ? meeting : null;
}

/** Registro preliminar. Idempotente: volver a llamar no duplica la reunión. */
export async function register(meeting: Meeting): Promise<Meeting> {
  const saved = await getRepositories().meetings.upsert({ ...meeting, status: 'scheduled' });
  await audit.record({
    meetingId: saved.meeting_id,
    service: 'meeting',
    event: `reunión registrada para el ${saved.date} a las ${saved.start_time}`,
  });
  return saved;
}

export interface StartMeetingInput {
  meetingId: string;
  teacherId: string;
  participants: Participant[];
}

/**
 * Inicio de la reunión.
 *
 * Se exige al menos una persona presente además de la docente: un acta sin
 * representante no documenta una reunión con representantes. El workflow
 * original solo comprobaba que el campo existiera.
 */
export async function start(input: StartMeetingInput): Promise<Meeting> {
  const repos = getRepositories();
  const meeting = await find(input.meetingId);

  if (meeting.status === 'signed' || meeting.status === 'sent') {
    throw estadoInvalido('Esta reunión ya está cerrada y firmada.');
  }

  const present = input.participants.filter((p) => p.present);
  if (present.length === 0) {
    throw invalido('Marca quién está presente antes de iniciar la reunión.');
  }
  if (!present.some((p) => p.role !== 'teacher')) {
    throw invalido(
      'No consta ningún asistente además de la docente. Un acta de reunión con representantes necesita al representante.',
    );
  }

  const updated = await repos.meetings.upsert({
    ...meeting,
    participants: input.participants,
    status: 'in_progress',
  });

  await audit.record({
    meetingId: meeting.meeting_id,
    service: 'meeting',
    actor: input.teacherId,
    event: `reunión iniciada con ${present.map((p) => p.name).join(', ')}`,
  });

  return updated;
}

/**
 * Marca que hay que reintentar. No borra nada.
 *
 * Es la traducción directa de la regla del manejador de errores de n8n: ante un
 * fallo de integración NO se elimina la reunión ni la información ya procesada.
 */
export async function markRetryRequired(meetingId: string, reason: string): Promise<void> {
  await getRepositories().meetings.markRetryRequired(meetingId, reason);
}
