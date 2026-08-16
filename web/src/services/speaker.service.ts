import 'server-only';
import type { Participant, TranscriptSegment } from '@/lib/types';
import { getRepositories } from '@/repositories';
import * as audit from './audit.service';
import { invalido, noEncontrado } from './errors';
import { getTranscriptionProvider } from './transcription/index';

/**
 * Identificación de hablantes — antes workflow 07.
 *
 * El proveedor de transcripción separa voces y devuelve etiquetas anónimas:
 * «A», «B», «C». Sabe que son personas distintas. **No sabe quiénes son**, y no
 * puede saberlo: nunca ha oído a esas personas.
 *
 * Poner los nombres es de la docente, que estuvo en la reunión. Pero lo hace
 * una vez por voz, no una vez por frase: asigna «A = Ana Pérez» y los cuarenta
 * fragmentos de esa voz quedan atribuidos de golpe.
 *
 * El servicio nunca adivina. Un acta que atribuye una frase a la persona
 * equivocada es exactamente el error que ACTA PRO existe para evitar, y un mal
 * emparejamiento automático sería peor que no tener ninguno.
 */

export interface VoiceSample {
  speaker_tag: string;
  /** Intervención con la que la docente reconocerá la voz. */
  text: string;
  /** Primera vez que se oyó esta voz. */
  firstHeard: string;
  /** Cuántos fragmentos quedarán atribuidos al asignar esta voz. */
  segmentCount: number;
  /** Nombre ya asignado, si la docente ya decidió. */
  assignedTo?: string;
}

/**
 * Muestras para identificar cada voz.
 *
 * Se elige la intervención **más larga** de cada hablante y no la primera: un
 * «buenos días» no permite reconocer a nadie, y una frase con contenido sí.
 */
export async function voiceSamples(meetingId: string): Promise<VoiceSample[]> {
  const segments = await getRepositories().transcripts.listByMeeting(meetingId);
  const byTag = new Map<string, TranscriptSegment[]>();

  for (const segment of segments) {
    if (!segment.speaker_tag) continue;
    const list = byTag.get(segment.speaker_tag) ?? [];
    list.push(segment);
    byTag.set(segment.speaker_tag, list);
  }

  return [...byTag.entries()]
    .map(([speaker_tag, list]) => {
      const longest = list.reduce((best, s) =>
        (s.clean_text ?? s.text).length > (best.clean_text ?? best.text).length ? s : best,
      );
      const assigned = list.find((s) => s.speaker_confirmed)?.speaker;
      return {
        speaker_tag,
        text: longest.clean_text ?? longest.text,
        firstHeard: list[0].timestamp,
        segmentCount: list.length,
        assignedTo: assigned,
      };
    })
    .sort((a, b) => a.firstHeard.localeCompare(b.firstHeard));
}

export interface AssignVoicesInput {
  meetingId: string;
  /** `{ A: 'Ana Pérez', B: 'María López' }` */
  assignments: Record<string, string>;
  teacherId: string;
}

export async function assignVoices(input: AssignVoicesInput): Promise<{ attributed: number }> {
  const repos = getRepositories();

  const meeting = await repos.meetings.find(input.meetingId);
  if (!meeting) throw noEncontrado(`No existe la reunión ${input.meetingId}.`);

  const names = new Set(meeting.participants.map((p: Participant) => p.name));
  let attributed = 0;

  for (const [tag, name] of Object.entries(input.assignments)) {
    if (!name) continue;
    // Solo se aceptan personas que constan como participantes de esta reunión:
    // así no puede aparecer en el acta alguien que no estuvo.
    if (!names.has(name)) {
      throw invalido(
        `"${name}" no consta como participante de esta reunión. Añádelo a los participantes primero.`,
      );
    }
    attributed += await repos.transcripts.setSpeakerByTag(input.meetingId, tag, name);
  }

  await audit.record({
    meetingId: input.meetingId,
    service: 'speaker',
    actor: input.teacherId,
    event: `voces identificadas: ${Object.entries(input.assignments)
      .filter(([, n]) => n)
      .map(([tag, name]) => `${tag}=${name}`)
      .join(', ')} · ${attributed} fragmento(s) atribuidos`,
  });

  return { attributed };
}

/** Confirmación de un fragmento suelto, para cuando el proveedor no separa voces. */
export async function confirm(input: {
  meetingId: string;
  timestamp: string;
  speaker: string;
  teacherId: string;
}): Promise<void> {
  const repos = getRepositories();

  const meeting = await repos.meetings.find(input.meetingId);
  if (!meeting) throw noEncontrado(`No existe la reunión ${input.meetingId}.`);

  if (!meeting.participants.some((p) => p.name === input.speaker)) {
    throw invalido(`"${input.speaker}" no consta como participante de esta reunión.`);
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

/** ¿Hay separación de voces, o toca asignar fragmento a fragmento? */
export function hasDiarization(): boolean {
  return getTranscriptionProvider().supportsDiarization;
}
