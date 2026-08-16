import 'server-only';
import type { FollowUp, Meeting, Participant } from '@/lib/types';
import { getRepositories } from '@/repositories';
import * as audit from './audit.service';
import { googleCalendarId, isDemo } from './config';
import { calendarApi } from './google.client';
import { integracionFallida } from './errors';

/**
 * Google Calendar — antes los workflows 01 (detección de reuniones) y 16
 * (eventos de seguimiento).
 *
 * Detecta en el calendario de la docente los eventos marcados como reuniones de
 * ACTA PRO, normaliza los datos y los guarda evitando duplicados. La clave
 * contra duplicados es `calendar_event_id`, que en el esquema es `UNIQUE`:
 * volver a sincronizar el mismo evento actualiza la reunión en lugar de crear
 * otra.
 */

/** Marca que distingue una reunión de ACTA PRO del resto del calendario. */
const MARKER = '[ACTA PRO]';

export interface ParsedEvent {
  calendarEventId: string;
  studentName: string;
  representativeName: string;
  representativeEmail: string;
  meetingType: string;
  date: string;
  startTime: string;
  endTime?: string;
}

/**
 * Extrae los datos de la descripción del evento.
 *
 * Formato esperado, tal y como está documentado en `docs/DATOS_DE_PRUEBA.md`:
 *
 *   Estudiante: Juan Pérez López
 *   Representante: María López
 *   maria.lopez@email.com
 *
 * Si falta algo no se descarta el evento: se crea la reunión con lo que haya y
 * se marca `manual_verification_required`. Perder una reunión porque el docente
 * escribió mal una línea sería peor que pedirle que la complete.
 */
export function parseEventDescription(description: string): {
  studentName: string;
  representativeName: string;
  representativeEmail: string;
} {
  const line = (label: string) =>
    description.match(new RegExp(`${label}\\s*:\\s*(.+)`, 'i'))?.[1]?.trim() ?? '';
  const email = description.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? '';

  return {
    studentName: line('Estudiante'),
    representativeName: line('Representante'),
    representativeEmail: email,
  };
}

/** Lee el calendario y devuelve los eventos de ACTA PRO de la ventana pedida. */
export async function fetchMeetingEvents(from: Date, to: Date): Promise<ParsedEvent[]> {
  if (isDemo) return [];

  try {
    const { data } = await calendarApi().events.list({
      calendarId: googleCalendarId,
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      q: MARKER,
    });

    return (data.items ?? [])
      .filter((e) => e.summary?.includes(MARKER) && e.id && e.start?.dateTime)
      .map((e) => {
        const parsed = parseEventDescription(e.description ?? '');
        const start = new Date(e.start!.dateTime!);
        const end = e.end?.dateTime ? new Date(e.end.dateTime) : null;
        const hhmm = (d: Date) => d.toTimeString().slice(0, 5);
        return {
          calendarEventId: e.id!,
          studentName: parsed.studentName,
          representativeName: parsed.representativeName,
          representativeEmail: parsed.representativeEmail,
          meetingType: (e.summary ?? '').replace(MARKER, '').replace(/^[\s-]+/, '').trim() || 'Reunión con representante',
          date: start.toISOString().slice(0, 10),
          startTime: hhmm(start),
          endTime: end ? hhmm(end) : undefined,
        };
      });
  } catch (error) {
    throw integracionFallida('Google Calendar', error);
  }
}

/** Sincroniza el calendario con la base de datos. Idempotente por evento. */
export async function sync(
  teacher: { teacher_id: string; name: string },
  from: Date,
  to: Date,
): Promise<{ imported: number; incomplete: number }> {
  const events = await fetchMeetingEvents(from, to);
  const repos = getRepositories();

  let imported = 0;
  let incomplete = 0;

  for (const event of events) {
    const complete = Boolean(event.studentName && event.representativeName && event.representativeEmail);
    if (!complete) incomplete++;

    const participants: Participant[] = [
      { role: 'teacher', name: teacher.name },
      ...(event.representativeName ? [{ role: 'other' as const, name: event.representativeName }] : []),
    ];

    const meeting: Meeting = {
      meeting_id: `ACTA-${event.date.slice(0, 4)}-${event.calendarEventId.slice(0, 8).toUpperCase()}`,
      teacher_id: teacher.teacher_id,
      student_id: '',
      teacher_name: teacher.name,
      student_name: event.studentName,
      course: '',
      representative_name: event.representativeName,
      representative_email: event.representativeEmail,
      meeting_type: event.meetingType,
      date: event.date,
      start_time: event.startTime,
      end_time: event.endTime,
      status: 'scheduled',
      data_status: complete ? 'ok' : 'manual_verification_required',
      school_year: '',
      participants,
    };

    await repos.meetings.upsert(meeting);
    imported++;
  }

  return { imported, incomplete };
}

/** Crea el evento de seguimiento. Era el workflow 16. */
export async function createFollowUpEvent(
  meeting: Meeting,
  followUp: FollowUp,
): Promise<string | null> {
  if (isDemo) {
    await getRepositories().followUps.save(followUp);
    return null;
  }

  try {
    const { data } = await calendarApi().events.insert({
      calendarId: googleCalendarId,
      requestBody: {
        summary: `Seguimiento ACTA PRO — ${meeting.student_name}`,
        description: `${followUp.description}\n\nActa de origen: ${meeting.meeting_id}`,
        start: { date: followUp.date },
        end: { date: followUp.date },
      },
    });

    await getRepositories().followUps.save({ ...followUp, calendar_event_id: data.id ?? undefined });
    await audit.record({
      meetingId: meeting.meeting_id,
      service: 'calendar',
      event: `evento de seguimiento creado para el ${followUp.date}`,
    });

    return data.id ?? null;
  } catch (error) {
    throw integracionFallida('Google Calendar', error);
  }
}
