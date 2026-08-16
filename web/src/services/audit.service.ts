import 'server-only';
import { getRepositories } from '@/repositories';
import type { AuditLogEntry } from '@/lib/types';

/**
 * Registro de auditoría — antes workflow 17.
 *
 * Registra los eventos críticos del sistema: quién hizo qué, cuándo y sobre qué
 * reunión. Solo se añade; no hay forma de modificar ni borrar una entrada,
 * porque un registro de auditoría editable no sirve para lo que existe.
 *
 * Ningún fallo al auditar debe tumbar la operación que se estaba auditando: si
 * el registro falla, se avisa por consola y la reunión sigue adelante. Perder
 * una línea de log es malo; perder el acta de una reunión es peor.
 */

export interface AuditEvent {
  meetingId: string;
  service: string;
  event: string;
  actor?: string;
  details?: unknown;
}

export async function record(event: AuditEvent): Promise<void> {
  const entry: AuditLogEntry = {
    timestamp: new Date().toISOString(),
    workflow: event.service,
    meeting_id: event.meetingId,
    event: event.event,
    actor: event.actor,
  };

  try {
    await getRepositories().audit.append(entry);
  } catch (error) {
    console.error('[acta-pro] no se pudo registrar en auditoría:', entry, error);
  }
}

export async function history(meetingId: string): Promise<AuditLogEntry[]> {
  return getRepositories().audit.listByMeeting(meetingId);
}
