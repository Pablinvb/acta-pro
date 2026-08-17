import 'server-only';
import type { TranscriptSegment } from '@/lib/types';
import { getRepositories } from '@/repositories';
import * as audit from './audit.service';
import { isDemo } from './config';
import { invalido } from './errors';
import { getTranscriptionProvider } from './transcription/index';

/**
 * Transcripción — antes workflow 06.
 *
 * Recibe fragmentos de audio durante la reunión, uno a uno, sin esperar a que
 * termine. Es deliberado: si algo falla a mitad, se pierde un fragmento, no la
 * grabación entera.
 *
 * El proveedor concreto se elige por configuración. Con Deepgram cada
 * intervención llega con una etiqueta anónima de hablante («A», «B»); con
 * Whisper no llega ninguna y la docente asigna a mano. El resto del sistema no
 * necesita saber cuál está activo.
 *
 * El texto se guarda en el repositorio de transcripciones, separado del acta y
 * pensado para tener permisos propios.
 */

const MAX_CHUNK_BYTES = 25 * 1024 * 1024;

export interface TranscribeInput {
  meetingId: string;
  audio: Blob;
  /** Instante en que se cerró el fragmento. */
  timestamp: string;
  /** Participantes presentes: mejora la separación de voces y el vocabulario. */
  expectedParticipants: string[];
}

export interface TranscribeResult {
  segments: TranscriptSegment[];
  /**
   * El proveedor aceptó el audio pero no reconoció ni una palabra.
   *
   * Pasa con un silencio, que es normal, pero también con el micrófono
   * silenciado o con el idioma mal configurado — y en esos dos casos la reunión
   * entera se grabaría en vano. Comprobado contra la API real: Deepgram
   * responde 200 con transcripción vacía cuando el idioma no corresponde al
   * audio, así que sin este aviso el fallo sería invisible hasta el final.
   */
  silent: boolean;
}

export async function transcribeChunk(input: TranscribeInput): Promise<TranscribeResult> {
  const { meetingId, audio, timestamp, expectedParticipants } = input;

  if (audio.size === 0) throw invalido('El fragmento de audio está vacío.');
  if (audio.size > MAX_CHUNK_BYTES) {
    throw invalido('El fragmento de audio es demasiado grande. Reduce la duración de cada tramo.');
  }

  const repos = getRepositories();

  if (isDemo) {
    const segment: TranscriptSegment = {
      meeting_id: meetingId,
      timestamp,
      text: '',
      confidence_score: null,
      speaker_confirmed: false,
    };
    await repos.transcripts.append(segment);
    return { segments: [segment], silent: false };
  }

  const provider = getTranscriptionProvider();
  const result = await provider.transcribe(audio, {
    language: 'es',
    diarize: provider.supportsDiarization,
    expectedSpeakers: expectedParticipants.length || undefined,
    // Los nombres propios se transcriben fatal si no se avisan.
    vocabulary: expectedParticipants,
  });

  const base = new Date(timestamp).getTime();
  const segments: TranscriptSegment[] = result.segments.map((s) => ({
    meeting_id: meetingId,
    // El proveedor da segundos relativos al fragmento; se convierten a instante
    // absoluto para que toda la reunión quede en una sola línea de tiempo.
    timestamp: new Date(base + Math.round(s.start * 1000)).toISOString(),
    text: s.text,
    confidence_score: s.confidence ?? null,
    speaker_tag: s.speaker_tag,
    // La etiqueta no es un nombre: hasta que la docente diga quién es cada voz,
    // el fragmento sigue sin hablante confirmado.
    speaker_confirmed: false,
  }));

  for (const segment of segments) {
    await repos.transcripts.append(segment);
  }

  const silent = segments.length === 0;

  await audit.record({
    meetingId,
    service: 'speech',
    event: silent
      ? `fragmento sin voz reconocida (${provider.name})`
      : `fragmento transcrito con ${provider.name}: ${segments.length} intervención(es), ${result.speakerTags.length} voz/voces`,
  });

  return { segments, silent };
}

export async function listSegments(meetingId: string): Promise<TranscriptSegment[]> {
  return getRepositories().transcripts.listByMeeting(meetingId);
}

export async function fullText(meetingId: string): Promise<string> {
  return getRepositories().transcripts.fullText(meetingId);
}
