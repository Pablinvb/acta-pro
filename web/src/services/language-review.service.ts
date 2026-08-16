import 'server-only';
import { z } from 'zod';
import type { LanguageFinding, MinutesSection } from '@/lib/types';
import { getRepositories } from '@/repositories';
import * as audit from './audit.service';
import { isDemo, openaiModel } from './config';
import { integracionFallida } from './errors';
import { openai } from './openai.client';

/**
 * Revisión de lenguaje — antes workflow 09.
 *
 * Clasifica cada fragmento del acta como GREEN (adecuado), YELLOW (requiere
 * revisión) o RED (no recomendado), y propone una redacción alternativa.
 *
 * La regla que sostiene todo el producto: **la IA solo sugiere**. Este servicio
 * no modifica el acta ni una coma. Devuelve hallazgos; quien decide es la
 * docente, y su decisión se aplica en `approval.service`.
 *
 * Esto es la protección documental del docente: un acta que dice «la madre se
 * muestra despreocupada» es un juicio de valor que puede volverse contra quien
 * la firmó. Detectarlo antes de firmar es la razón de ser de ACTA PRO.
 */

const findingSchema = z.object({
  fragment: z.string(),
  level: z.enum(['GREEN', 'YELLOW', 'RED']),
  reason: z.string(),
  suggested_text: z.string(),
});

const responseSchema = z.object({ findings: z.array(findingSchema) });

const SYSTEM_PROMPT = `Revisas fragmentos de texto de actas escolares antes de que un docente las firme.

Detectas: juicios de valor, acusaciones, generalizaciones absolutas, atribuciones de intención no verificables, lenguaje emocional o discriminatorio, afirmaciones sin evidencia, diagnósticos clínicos o psicopedagógicos, contradicciones, información sensible innecesaria y frases ambiguas.

Para cada fragmento que recibas devuelve un objeto con:
- fragment: el fragmento original, copiado LITERALMENTE y sin alterar ni un carácter.
- level: "GREEN" si es adecuado, "YELLOW" si conviene revisarlo, "RED" si no es recomendable que aparezca en un documento oficial.
- reason: por qué, en una o dos frases, explicando el riesgo para el docente.
- suggested_text: una redacción alternativa objetiva y descriptiva.

Nunca reescribas de forma definitiva: suggested_text es solo una sugerencia que el docente debe aprobar.

Responde en español con un objeto JSON de la forma { "findings": [...] }.`;

/** Fragmentos revisables de un acta: los puntos de lista y los párrafos. */
export function collectFragments(sections: MinutesSection[]): string[] {
  const out: string[] = [];
  for (const section of sections) {
    // La sección 1 son datos identificativos y la 13 son las firmas: no hay
    // redacción que revisar en ninguna de las dos.
    if (section.number === 1 || section.number === 13) continue;
    section.paragraphs?.forEach((p) => out.push(p));
    section.items?.forEach((i) => out.push(i));
  }
  return out.filter((f) => f.trim().length > 0);
}

export async function review(meetingId: string): Promise<LanguageFinding[]> {
  const repos = getRepositories();
  const minutes = await repos.minutes.find(meetingId);
  if (!minutes) return [];

  const fragments = collectFragments(minutes.sections);
  if (fragments.length === 0) return [];

  const findings = isDemo
    ? await repos.minutes.findLanguageReview(meetingId)
    : await callModel(fragments);

  await repos.minutes.saveLanguageReview(meetingId, findings);

  const red = findings.filter((f) => f.level === 'RED').length;
  const yellow = findings.filter((f) => f.level === 'YELLOW').length;
  await audit.record({
    meetingId,
    service: 'language-review',
    event: `${fragments.length} fragmento(s) revisados: ${red} no recomendados, ${yellow} a revisar`,
  });

  return findings;
}

async function callModel(fragments: string[]): Promise<LanguageFinding[]> {
  let raw: string;
  try {
    const completion = await openai().chat.completions.create({
      model: openaiModel,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(fragments) },
      ],
    });
    raw = completion.choices[0]?.message?.content ?? '';
  } catch (error) {
    throw integracionFallida('El servicio de revisión de lenguaje', error);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw integracionFallida('La revisión de lenguaje devolvió una respuesta ilegible');
  }

  const result = responseSchema.safeParse(parsed);
  if (!result.success) {
    throw integracionFallida('La revisión de lenguaje no tiene la forma esperada');
  }

  /*
   * Solo se conservan los hallazgos cuyo `fragment` coincide literalmente con
   * un fragmento del acta. Si el modelo parafrasea el original, la interfaz no
   * podría localizarlo para resaltarlo y la docente vería una advertencia sobre
   * un texto que no existe.
   */
  const known = new Set(fragments);
  return result.data.findings.filter((f) => known.has(f.fragment));
}

export async function findByMeeting(meetingId: string): Promise<LanguageFinding[]> {
  return getRepositories().minutes.findLanguageReview(meetingId);
}
