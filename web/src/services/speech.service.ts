import 'server-only';
import type { TranscriptSegment } from '@/lib/types';
import { getRepositories } from '@/repositories';
import * as audit from './audit.service';
import { isDemo, openaiTranscriptionModel } from './config';
import { integracionFallida, invalido } from './errors';
import { openai } from './openai.client';

/**
 * Transcripción — antes workflow 06.
 *
 * Recibe fragmentos de audio durante la reunión, uno a uno, y los transcribe
 * sin esperar a que la reunión termine. Esa decisión se conserva del workflow y
 * es deliberada: si algo falla a mitad, se pierde un fragmento, no la grabación
 * entera.
 *
 * El texto se guarda en el repositorio de transcripciones, que está separado
 * del acta y pensado para tener permisos propios. La transcripción nunca se
 * adjunta a un correo ni se archiva junto al documento final.
 */

const MAX_CHUNK_BYTES = 25 * 1024 * 1024; // Límite de la API de transcripción.

export interface TranscribeInput {
  meetingId: string;
  audio: Blob;
  /** Instante en que se cerró el fragmento. */
  timestamp: string;
  /** Participantes presentes, para orientar la asignación de hablante. */
  expectedParticipants: string[];
  filename?: string;
}

export async function transcribeChunk(input: TranscribeInput): Promise<TranscriptSegment> {
  const { meetingId, audio, timestamp } = input;

  if (audio.size === 0) throw invalido('El fragmento de audio está vacío.');
  if (audio.size > MAX_CHUNK_BYTES) {
    throw invalido('El fragmento de audio es demasiado grande. Reduce la duración de cada tramo.');
  }

  const text = isDemo ? '' : await callModel(audio, input.filename ?? 'chunk.webm');

  const segment: TranscriptSegment = {
    meeting_id: meetingId,
    timestamp,
    text,
    confidence_score: null,
    // El hablante lo confirma la docente: el servicio no lo adivina. Atribuir
    // una frase a la persona equivocada es peor que no atribuirla.
    speaker: undefined,
    speaker_confirmed: false,
  };

  await getRepositories().transcripts.append(segment);
  await audit.record({
    meetingId,
    service: 'speech',
    event: `fragmento transcrito (${Math.round(audio.size / 1024)} KB)`,
  });

  return segment;
}

async function callModel(audio: Blob, filename: string): Promise<string> {
  try {
    const file = new File([audio], filename, { type: audio.type || 'audio/webm' });
    const result = await openai().audio.transcriptions.create({
      model: openaiTranscriptionModel,
      file,
      language: 'es',
    });
    return result.text ?? '';
  } catch (error) {
    throw integracionFallida('El servicio de transcripción', error);
  }
}

export async function listSegments(meetingId: string): Promise<TranscriptSegment[]> {
  return getRepositories().transcripts.listByMeeting(meetingId);
}

export async function fullText(meetingId: string): Promise<string> {
  return getRepositories().transcripts.fullText(meetingId);
}
