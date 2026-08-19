import 'server-only';
import { openaiTranscriptionModel } from '../config';
import { integracionFallida } from '../errors';
import { openai } from '../openai.client';
import type { TranscribeOptions, TranscriptionProvider, TranscriptionResult } from './types';

/**
 * Whisper de OpenAI.
 *
 * Transcribe bien y es barato, pero **no separa voces**: devuelve texto sin
 * saber quién habló. Mientras sea el proveedor activo, la asignación de
 * hablantes recae en la docente, fragmento a fragmento.
 *
 * Se pide el formato `verbose_json` para obtener los tiempos de cada segmento;
 * sin ellos no se podría alinear la transcripción con nada.
 */
export const openaiProvider: TranscriptionProvider = {
  name: 'openai-whisper',
  supportsDiarization: false,
  supportsStreaming: false,

  async transcribe(audio: Blob, options?: TranscribeOptions): Promise<TranscriptionResult> {
    try {
      const file = new File([audio], 'audio.webm', { type: audio.type || 'audio/webm' });

      const result = await openai().audio.transcriptions.create({
        model: openaiTranscriptionModel,
        file,
        language: options?.language ?? 'es',
        response_format: 'verbose_json',
        /*
         * Marcas por palabra, imprescindibles para el motor de alineación: sin
         * ellas una frase que mezcla a dos personas se atribuye entera a una,
         * que es justo el error que rompe un acta.
         */
        timestamp_granularities: ['word', 'segment'],
        // Orientar al modelo con los nombres propios evita que los destroce.
        prompt: options?.vocabulary?.join(', '),
      });

      // `verbose_json` trae `segments` y `words`; el tipado del SDK no siempre
      // los refleja.
      const raw = result as unknown as {
        text?: string;
        language?: string;
        segments?: Array<{ start: number; end: number; text: string }>;
        words?: Array<{ word: string; start: number; end: number }>;
      };

      const todasLasPalabras = raw.words ?? [];

      const segments = (raw.segments ?? []).map((s) => ({
        start: s.start,
        end: s.end,
        text: s.text.trim(),
        // Sin diarización no hay etiqueta: se deja vacío en lugar de inventar
        // un hablante, que sería peor que no saberlo.
        speaker_tag: undefined,
        // Las palabras llegan en una lista aparte; se reparten por tramo.
        words: todasLasPalabras.filter((w) => w.start >= s.start && w.end <= s.end + 0.01),
      }));

      return {
        segments,
        text: raw.text ?? segments.map((s) => s.text).join(' '),
        speakerTags: [],
        language: raw.language,
      };
    } catch (error) {
      throw integracionFallida('El servicio de transcripción', error);
    }
  },
};
