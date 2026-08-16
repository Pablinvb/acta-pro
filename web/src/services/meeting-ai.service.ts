import 'server-only';
import { z } from 'zod';
import type { AiAnalysis } from '@/lib/types';
import { getRepositories } from '@/repositories';
import * as audit from './audit.service';
import { isDemo, openaiModel } from './config';
import { integracionFallida, invalido } from './errors';
import { openai } from './openai.client';

/**
 * Análisis de la reunión — antes workflow 08.
 *
 * Convierte la transcripción en JSON estructurado. Las reglas del modelo son
 * las que fija la arquitectura y no son negociables: no inventar información,
 * no determinar quién tiene la razón, no emitir diagnósticos, no emitir juicios
 * personales, distinguir hechos de declaraciones y de acuerdos, y que todo
 * acuerdo sea rastreable a la transcripción.
 *
 * Lo que el workflow no hacía: validar la respuesta. El nodo original hacía
 * `JSON.parse` y confiaba. Un modelo puede devolver JSON válido con la forma
 * equivocada, y eso llegaba al acta sin que nadie lo notara. Aquí la respuesta
 * pasa por un esquema, y si no encaja se falla en voz alta en lugar de generar
 * un acta incompleta en silencio.
 */

const analysisSchema = z.object({
  meeting_reason: z.string().default(''),
  topics: z.array(z.string()).default([]),
  background: z.array(z.string()).default([]),
  situations_discussed: z.array(z.string()).default([]),
  teacher_actions: z.array(z.string()).default([]),
  representative_concerns: z.array(z.string()).default([]),
  student_interventions: z.array(z.string()).default([]),
  agreements: z.array(z.string()).default([]),
  commitments: z.array(z.string()).default([]),
  responsible_people: z.array(z.string()).default([]),
  evidence_mentions: z.array(z.string()).default([]),
  follow_up_actions: z.array(z.string()).default([]),
  follow_up_date: z.string().nullable().default(null),
  language_risk_flags: z.array(z.string()).default([]),
  requires_teacher_review: z.boolean().default(false),
});

const SYSTEM_PROMPT = `Analizas la transcripción de una reunión entre un docente y el representante de un estudiante en un centro educativo, y devuelves EXCLUSIVAMENTE un objeto JSON.

Reglas obligatorias:
1. No inventes información. Si algo no está en la transcripción, deja el campo vacío.
2. No determines quién tiene la razón.
3. No emitas diagnósticos de ningún tipo, ni clínicos ni psicopedagógicos.
4. No emitas juicios personales sobre ninguna de las partes.
5. Diferencia con claridad los hechos, las declaraciones y los acuerdos.
6. Todo acuerdo debe poder rastrearse a una frase concreta de la transcripción.
7. Si existe cualquier incertidumbre, marca requires_teacher_review = true.

Campos:
- meeting_reason: motivo de la reunión, una frase.
- topics: temas tratados.
- background: antecedentes anteriores a la reunión que se mencionan.
- situations_discussed: situaciones concretas que se analizaron durante la reunión.
- teacher_actions: acciones o propuestas del docente.
- representative_concerns: preocupaciones planteadas por el representante.
- student_interventions: intervenciones del estudiante, si estuvo presente.
- agreements: acuerdos alcanzados.
- commitments: compromisos asumidos, indicando quién los asume.
- responsible_people: responsables de cada acción.
- evidence_mentions: evidencias mencionadas (registros, calificaciones, documentos).
- follow_up_actions: acciones de seguimiento.
- follow_up_date: fecha de seguimiento en formato YYYY-MM-DD, o null.
- language_risk_flags: frases de la transcripción que podrían resultar problemáticas en un documento oficial.
- requires_teacher_review: booleano.

Responde en español y únicamente con el JSON.`;

/** Análisis de demostración, coherente con los datos de prueba del repositorio. */
const DEMO_ANALYSIS: AiAnalysis = {
  meeting_reason:
    'Revisión del rendimiento académico del estudiante en Matemáticas durante el primer parcial.',
  topics: [
    'Calificaciones del primer parcial en Matemáticas.',
    'Tareas pendientes de entrega.',
    'Organización del tiempo de estudio en casa.',
    'Propuesta de plan de refuerzo académico.',
  ],
  background: [
    'Promedio de 6,8 en Matemáticas al cierre del primer parcial.',
    'Dos tareas de álgebra sin entregar, correspondientes al 2 y al 9 de julio de 2026.',
  ],
  situations_discussed: [
    'Ausencia de un horario fijo de estudio en el hogar por razones laborales de la representante.',
  ],
  teacher_actions: [
    'La docente propuso un plan de refuerzo semanal los miércoles de 14:00 a 15:00.',
    'La docente se comprometió a enviar un reporte de avance mensual.',
  ],
  representative_concerns: [
    'La representante manifestó que desconocía las calificaciones del parcial hasta recibir la citación.',
  ],
  student_interventions: [
    'El estudiante reconoció no haber entregado dos tareas por confusión con las fechas.',
  ],
  agreements: [
    'Plan de refuerzo de Matemáticas los miércoles de 14:00 a 15:00, a partir del 20 de agosto de 2026.',
    'Recuperación de las dos tareas pendientes hasta el 22 de agosto de 2026.',
  ],
  commitments: [
    'La representante revisará y firmará el cuaderno de tareas cada domingo.',
    'El estudiante asistirá puntualmente al refuerzo semanal.',
  ],
  responsible_people: [
    'Ana Pérez — docente: ejecución y registro del plan de refuerzo.',
    'María López — representante: acompañamiento semanal en casa.',
  ],
  evidence_mentions: [
    'Registro de calificaciones del primer parcial (sistema Runachay).',
    'Registro de entregas de la asignatura, julio de 2026.',
  ],
  follow_up_actions: ['Evaluar el avance del plan de refuerzo.'],
  follow_up_date: '2026-09-04',
  language_risk_flags: [],
  requires_teacher_review: false,
};

export async function analyze(meetingId: string): Promise<AiAnalysis> {
  const repos = getRepositories();
  const transcript = await repos.transcripts.fullText(meetingId);

  if (!transcript.trim() && !isDemo) {
    throw invalido('No hay transcripción que analizar para esta reunión.');
  }

  const analysis = isDemo ? DEMO_ANALYSIS : await callModel(transcript);

  await repos.minutes.saveAnalysis(meetingId, analysis);
  await audit.record({
    meetingId,
    service: 'meeting-ai',
    event: `transcripción analizada (${isDemo ? 'demostración' : openaiModel})`,
  });

  return analysis;
}

async function callModel(transcript: string): Promise<AiAnalysis> {
  let raw: string;
  try {
    const completion = await openai().chat.completions.create({
      model: openaiModel,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: transcript },
      ],
    });
    raw = completion.choices[0]?.message?.content ?? '';
  } catch (error) {
    throw integracionFallida('El servicio de análisis', error);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw integracionFallida('El servicio de análisis devolvió una respuesta ilegible');
  }

  const result = analysisSchema.safeParse(parsed);
  if (!result.success) {
    // Preferimos fallar a generar un acta incompleta sin avisar.
    throw integracionFallida(
      'El análisis no tiene la forma esperada. Revisa el modelo configurado',
    );
  }

  return result.data;
}
