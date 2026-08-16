import 'server-only';
import type { TranscriptSegment } from '@/lib/types';
import { getRepositories } from '@/repositories';
import * as audit from './audit.service';
import { invalido, noEncontrado } from './errors';

/**
 * Identificación de hablantes — antes workflow 07.
 *
 * El workflow original era un `NoOp` con una nota: «Placeholder obligatorio:
 * aquí debe conectarse un servicio real de speaker diarization». La diarización
 * automática sigue siendo Fase 3.
 *
 * Así que en Fase 1 el mecanismo es la **confirmación manual de la docente**, y
 * eso no es un apaño: la docente estuvo en la reunión y sabe quién dijo qué. Un
 * acta que atribuye una frase a la persona equivocada es exactamente el tipo de
 * error que la protección documental existe para evitar, y ningún modelo lo
 * resuelve hoy con garantías suficientes para un documento que se firma.
 *
 * El servicio no adivina hablantes. Solo registra lo que la docente confirma.
 */

export interface ConfirmSpeakerInput {
  meetingId: string;
  timestamp: string;
  speaker: string;
  teacherId: string;
}

export async function confirm(input: ConfirmSpeakerInput): Promise<void> {
  const repos = getRepositories();

  const meeting = await repos.meetings.find(input.meetingId);
  if (!meeting) throw noEncontrado(`No existe la reunión ${input.meetingId}.`);

  // Solo se aceptan personas que constan como participantes de esta reunión.
  const known = meeting.participants.some((p) => p.name === input.speaker);
  if (!known) {
    throw invalido(
      `"${input.speaker}" no consta como participante de esta reunión. Añádelo a los participantes primero.`,
    );
  }

  await repos.transcripts.setSpeaker(input.meetingId, input.timestamp, input.speaker);
  await audit.record({
    meetingId: input.meetingId,
    service: 'speaker',
    actor: input.teacherId,
    event: `hablante confirmado en ${input.timestamp}: ${input.speaker}`,
  });
}

/** Fragmentos que todavía no tienen hablante confirmado. */
export async function pending(meetingId: string): Promise<TranscriptSegment[]> {
  const segments = await getRepositories().transcripts.listByMeeting(meetingId);
  return segments.filter((s) => !s.speaker_confirmed);
}
