import 'server-only';
import { z } from 'zod';
import type { TranscriptSegment } from '@/lib/types';
import { getRepositories } from '@/repositories';
import * as audit from './audit.service';
import { isDemo, openaiModel } from './config';
import { integracionFallida } from './errors';
import { openai } from './openai.client';
import { basicCleanup, fixInstitutionalTerms } from './transcript-fixes';

/**
 * Depuración de la transcripción.
 *
 * El reconocimiento de voz devuelve el habla tal cual: muletillas, repeticiones,
 * frases empezadas y abandonadas, «eh», «o sea», «este». Leído en un acta suena
 * mal y hace que el análisis extraiga peor los acuerdos.
 *
 * REGLA QUE NO SE NEGOCIA: el texto original **nunca se modifica**. La versión
 * depurada se guarda aparte, en `clean_text`. Si algún día alguien discute lo
 * que dice un acta, hay que poder mostrar exactamente lo que se transcribió, no
 * una versión que un modelo consideró más presentable. Depurar sobre el
 * original destruiría la evidencia que este producto existe para producir.
 *
 * Por eso la depuración es reversible y regenerable: borrar `clean_text` y
 * volver a ejecutar deja el sistema igual.
 */

const cleanedSchema = z.object({
  segments: z.array(z.object({ timestamp: z.string(), clean_text: z.string() })),
});

const SYSTEM_PROMPT = `Depuras la transcripción automática de una reunión entre un docente y el representante de un estudiante, para que se lea con naturalidad en un documento oficial.

Qué DEBES hacer:
- Quitar muletillas y sonidos de duda: "eh", "em", "este", "o sea", "digamos", "¿no?", "¿ya?".
- Eliminar repeticiones involuntarias y falsos arranques ("yo... yo creo que" → "yo creo que").
- Corregir la puntuación y las mayúsculas.
- Corregir errores evidentes del reconocimiento de voz cuando el contexto los haga inequívocos.

Qué tienes PROHIBIDO hacer:
- Cambiar el significado de una frase, aunque suene mejor de otro modo.
- Añadir información que no se dijo.
- Suavizar, endurecer ni reinterpretar lo que alguien expresó.
- Corregir el registro de nadie: si una persona habla de forma coloquial, se conserva.
- Unir o reordenar intervenciones.
- Traducir. Todo se mantiene en el idioma original.

Si un fragmento es ininteligible, déjalo tal como está. Ante la duda, no toques.

Recibes un arreglo de objetos { timestamp, text } y devuelves un objeto JSON
{ "segments": [ { "timestamp": "...", "clean_text": "..." } ] } con el mismo
número de elementos y los mismos timestamps.`;

export async function cleanupMeeting(meetingId: string): Promise<TranscriptSegment[]> {
  const repos = getRepositories();
  const segments = await repos.transcripts.listByMeeting(meetingId);
  const pending = segments.filter((s) => s.text.trim() && !s.clean_text);

  if (pending.length === 0) return segments;

  const cleaned = isDemo
    ? pending.map((s) => ({ timestamp: s.timestamp, clean_text: basicCleanup(s.text) }))
    : await callModel(pending);

  const byTimestamp = new Map(cleaned.map((c) => [c.timestamp, c.clean_text]));
  for (const segment of segments) {
    const clean = byTimestamp.get(segment.timestamp);
    // El original queda intacto: solo se rellena el campo derivado. Los términos
    // del centro se corrigen siempre, venga la depuración del modelo o local.
    if (clean) segment.clean_text = fixInstitutionalTerms(clean);
  }

  await audit.record({
    meetingId,
    service: 'transcript-cleanup',
    event: `${pending.length} fragmento(s) depurados (${isDemo ? 'local' : openaiModel})`,
  });

  return segments;
}

async function callModel(
  segments: TranscriptSegment[],
): Promise<Array<{ timestamp: string; clean_text: string }>> {
  const input = segments.map((s) => ({ timestamp: s.timestamp, text: s.text }));

  let raw: string;
  try {
    const completion = await openai().chat.completions.create({
      model: openaiModel,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(input) },
      ],
    });
    raw = completion.choices[0]?.message?.content ?? '';
  } catch (error) {
    throw integracionFallida('El servicio de depuración de transcripción', error);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw integracionFallida('La depuración devolvió una respuesta ilegible');
  }

  const result = cleanedSchema.safeParse(parsed);
  if (!result.success) {
    throw integracionFallida('La depuración no tiene la forma esperada');
  }

  /*
   * Solo se aceptan fragmentos cuyo timestamp existe en el original. Si el
   * modelo inventa, funde o reordena intervenciones, se descarta lo que no
   * cuadre: es preferible dejar un fragmento sin depurar que atribuir a alguien
   * una frase que no dijo.
   */
  const known = new Set(segments.map((s) => s.timestamp));
  return result.data.segments.filter((s) => known.has(s.timestamp));
}

/** Texto para el análisis: depurado si existe, original si no. */
export function readableText(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => `${s.speaker ?? 'Sin identificar'}: ${s.clean_text ?? s.text}`)
    .join('\n');
}

/** Reexportadas: las transformaciones puras viven en `transcript-fixes`. */
export { basicCleanup, fixInstitutionalTerms } from './transcript-fixes';
