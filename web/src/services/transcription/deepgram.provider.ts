import 'server-only';
import { deepgramModel, externalTimeoutMs, requireDeepgramKey } from '../config';
import { integracionFallida } from '../errors';
import type { TranscribeOptions, TranscriptionProvider, TranscriptionResult } from './types';

/**
 * Deepgram.
 *
 * A diferencia de Whisper, **separa voces**: devuelve para cada intervención un
 * número de hablante estable dentro de la misma petición. Eso convierte la
 * asignación de hablantes de la docente en tres decisiones por reunión en lugar
 * de una por frase.
 *
 * Lo que sigue sin hacer, y ningún proveedor hace: saber que «hablante 0» es
 * María López. Deepgram no la ha oído nunca. La docente pone los nombres una
 * vez y el resto se propaga.
 *
 * Se piden `utterances`, que agrupa las palabras en intervenciones completas.
 * Sin eso habría que reconstruir las frases a partir de palabras sueltas, y los
 * cortes quedarían en mitad de una idea.
 */

const ENDPOINT = 'https://api.deepgram.com/v1/listen';

interface DeepgramUtterance {
  start: number;
  end: number;
  transcript: string;
  confidence: number;
  speaker?: number;
}

interface DeepgramResponse {
  results?: {
    channels?: Array<{ alternatives?: Array<{ transcript?: string }> }>;
    utterances?: DeepgramUtterance[];
  };
  err_msg?: string;
}

export const deepgramProvider: TranscriptionProvider = {
  name: 'deepgram',
  supportsDiarization: true,
  // Deepgram sí ofrece streaming por WebSocket. Aquí se usa el modo por lotes:
  // la separación de voces sale bastante más precisa sobre audio completo, y el
  // acta se genera al cerrar la reunión de todos modos.
  supportsStreaming: false,

  async transcribe(audio: Blob, options?: TranscribeOptions): Promise<TranscriptionResult> {
    const params = new URLSearchParams({
      model: deepgramModel,
      language: options?.language ?? 'es',
      diarize: 'true',
      utterances: 'true',
      punctuate: 'true',
      // Formatea números, fechas y horas de forma legible: en un acta escolar
      // aparecen constantemente calificaciones y fechas de entrega.
      smart_format: 'true',
    });

    // Los nombres propios del centro llegan mal si no se le avisan.
    for (const term of options?.vocabulary ?? []) {
      params.append('keyterm', term);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), externalTimeoutMs);

    try {
      const response = await fetch(`${ENDPOINT}?${params}`, {
        method: 'POST',
        headers: {
          Authorization: `Token ${requireDeepgramKey()}`,
          'Content-Type': audio.type || 'audio/webm',
        },
        body: audio,
        signal: controller.signal,
        cache: 'no-store',
      });

      if (!response.ok) {
        const detail = await response.text();
        throw integracionFallida(`Deepgram respondió ${response.status}: ${detail.slice(0, 200)}`);
      }

      const data = (await response.json()) as DeepgramResponse;
      if (data.err_msg) throw integracionFallida(`Deepgram: ${data.err_msg}`);

      const utterances = data.results?.utterances ?? [];

      const segments = utterances
        .filter((u) => u.transcript.trim().length > 0)
        .map((u) => ({
          start: u.start,
          end: u.end,
          text: u.transcript.trim(),
          // Se normaliza a letra: «Hablante A» se lee mejor que «Hablante 0», y
          // la etiqueta solo tiene que ser estable, no significar nada.
          speaker_tag: u.speaker === undefined ? undefined : String.fromCharCode(65 + u.speaker),
          confidence: u.confidence,
        }));

      const speakerTags = [...new Set(segments.map((s) => s.speaker_tag).filter(Boolean))] as string[];

      return {
        segments,
        text:
          data.results?.channels?.[0]?.alternatives?.[0]?.transcript ??
          segments.map((s) => s.text).join(' '),
        speakerTags,
        language: options?.language ?? 'es',
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw integracionFallida('Deepgram tardó demasiado en responder');
      }
      throw error instanceof Error && error.message.includes('Deepgram')
        ? error
        : integracionFallida('Deepgram', error);
    } finally {
      clearTimeout(timer);
    }
  },
};
