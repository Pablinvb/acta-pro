import 'server-only';
import type { AiAnalysis, Meeting, MeetingMinutes, MinutesSection } from '@/lib/types';
import { getRepositories } from '@/repositories';
import { invalido } from './errors';
import * as audit from './audit.service';
import * as history from './history.service';
import { inheritedBackground } from './history';

/**
 * Generación del acta — antes workflow 10.
 *
 * Toma los datos de la reunión y el análisis de la IA y arma el borrador con
 * las 13 secciones que fija la arquitectura, en orden. Lenguaje objetivo,
 * profesional, institucional y neutral. No elimina información relevante ni
 * añade hechos que no estén en el análisis.
 *
 * Dos correcciones respecto al workflow original:
 *
 *  - La sección 3 (Antecedentes) imprimía `situations_discussed`, el mismo
 *    campo que la sección 6, de modo que el acta repetía el contenido. Ahora
 *    usa `background`, un campo propio.
 *  - `teacher_actions` y `representative_concerns` no aparecían en ninguna
 *    sección: la IA los producía y se descartaban. Ahora alimentan la sección 5
 *    (Intervenciones relevantes) junto a `student_interventions`, que es
 *    exactamente lo que esa sección describe.
 *
 * A diferencia del nodo original, esto no devuelve HTML. Devuelve las secciones
 * como datos: quien las presente decide cómo — la pantalla de revisión, el PDF
 * final o el correo — y el acta deja de estar acoplada a un formato.
 */

/** Texto que aparece cuando una sección no tiene contenido. Nunca se inventa nada. */
const SIN_CONTENIDO = 'Sin información registrada.';

function items(values: string[] | undefined): string[] {
  return values?.filter((v) => v.trim().length > 0) ?? [];
}

export interface BuildMinutesInput {
  meeting: Meeting;
  analysis: AiAnalysis;
  sequence: number;
  /**
   * Antecedentes que vienen de reuniones anteriores del mismo estudiante.
   *
   * No los produce la IA: se leen de actas ya aprobadas y firmadas, y llegan
   * redactados con su fecha y su código de acta. Van los primeros de la sección
   * 3 porque cronológicamente son lo primero que pasó, y porque son la parte de
   * los antecedentes que se puede demostrar señalando un documento.
   */
  inheritedBackground?: string[];
}

/** Código único del acta: `ACTA-YYYY-ESTUDIANTE-SECUENCIA`. */
export function buildDocumentCode(meeting: Meeting, sequence: number): string {
  const year = meeting.date.slice(0, 4);
  const student = meeting.student_name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita los diacríticos ya separados por NFD
    .toUpperCase()
    .split(/\s+/)
    .slice(0, 2)
    .join('-');
  return `ACTA-${year}-${student}-${String(sequence).padStart(4, '0')}`;
}

export function buildSections({
  meeting,
  analysis,
  inheritedBackground = [],
}: BuildMinutesInput): MinutesSection[] {
  const interventions = [
    ...items(analysis.teacher_actions),
    ...items(analysis.representative_concerns),
    ...items(analysis.student_interventions),
  ];

  const followUpParagraph = analysis.follow_up_date
    ? `Próxima reunión de seguimiento: ${analysis.follow_up_date}.`
    : 'No se definió una fecha de seguimiento.';

  const observations = items(analysis.language_risk_flags);
  if (analysis.requires_teacher_review) {
    observations.unshift('El análisis presenta incertidumbre y requiere revisión docente antes de aprobar.');
  }

  return [
    {
      number: 1,
      title: 'Datos generales',
      fields: [
        { label: 'Estudiante', value: meeting.student_name },
        { label: 'Curso', value: meeting.course },
        { label: 'Representante', value: meeting.representative_name },
        { label: 'Docente', value: meeting.teacher_name },
        { label: 'Fecha', value: meeting.date },
        {
          label: 'Hora',
          value: meeting.end_time ? `${meeting.start_time} – ${meeting.end_time}` : meeting.start_time,
        },
      ],
    },
    {
      number: 2,
      title: 'Motivo de la reunión',
      paragraphs: [analysis.meeting_reason?.trim() || SIN_CONTENIDO],
    },
    {
      number: 3,
      title: 'Antecedentes relevantes',
      items: [...inheritedBackground, ...items(analysis.background)],
    },
    { number: 4, title: 'Temas tratados', items: items(analysis.topics) },
    { number: 5, title: 'Intervenciones relevantes', items: interventions },
    { number: 6, title: 'Situaciones analizadas', items: items(analysis.situations_discussed) },
    { number: 7, title: 'Acuerdos', items: items(analysis.agreements) },
    { number: 8, title: 'Compromisos', items: items(analysis.commitments) },
    { number: 9, title: 'Responsables', items: items(analysis.responsible_people) },
    { number: 10, title: 'Evidencias mencionadas', items: items(analysis.evidence_mentions) },
    {
      number: 11,
      title: 'Fecha o acciones de seguimiento',
      paragraphs: [followUpParagraph],
      items: items(analysis.follow_up_actions),
    },
    { number: 12, title: 'Observaciones', items: observations },
    { number: 13, title: 'Firmas' },
  ];
}

/** Genera el borrador y lo guarda. El acta nace siempre como `draft`. */
export async function generate(meetingId: string): Promise<MeetingMinutes> {
  const repos = getRepositories();

  const meeting = await repos.meetings.find(meetingId);
  if (!meeting) throw invalido(`No existe la reunión ${meetingId}.`);

  const analysis = await repos.minutes.findAnalysis(meetingId);
  if (!analysis) {
    throw invalido('Todavía no hay análisis de la reunión. Genera primero el análisis con IA.');
  }

  const sequence = await repos.documents.nextSequence(
    Number(meeting.date.slice(0, 4)),
    meeting.student_id,
  );

  /*
   * Lo que quedó de la reunión anterior con esta misma familia. Es la parte del
   * acta que la docente no tendría por qué recordar de memoria, y la que da
   * continuidad: sin ella cada reunión empieza de cero aunque sea la cuarta.
   */
  const previo = await history.forStudent(meeting.student_id, {
    before: meeting.date,
    excludeMeetingId: meetingId,
  });
  const heredados = inheritedBackground(previo);

  const minutes: MeetingMinutes = {
    meeting_id: meetingId,
    document_code: buildDocumentCode(meeting, sequence),
    status: 'draft',
    sections: buildSections({
      meeting,
      analysis,
      sequence,
      inheritedBackground: heredados,
    }),
    generated_at: new Date().toISOString(),
  };

  await repos.minutes.save(minutes);
  await repos.meetings.setStatus(meetingId, 'awaiting_teacher_review');
  await audit.record({
    meetingId,
    service: 'acta-generator',
    event: `borrador generado (${minutes.document_code})`,
  });

  return minutes;
}

export async function find(meetingId: string): Promise<MeetingMinutes | null> {
  return getRepositories().minutes.find(meetingId);
}

/** Aplica al acta las sugerencias que la docente aceptó, y solo esas. */
export function applyAcceptedSuggestions(
  sections: MinutesSection[],
  accepted: Array<{ fragment: string; suggested_text: string }>,
): MinutesSection[] {
  if (accepted.length === 0) return sections;
  const map = new Map(accepted.map((a) => [a.fragment, a.suggested_text]));
  return sections.map((section) => ({
    ...section,
    items: section.items?.map((item) => map.get(item) ?? item),
    paragraphs: section.paragraphs?.map((p) => map.get(p) ?? p),
  }));
}

/** Representación en texto plano, para adjuntar o enviar. */
export function toPlainText(minutes: MeetingMinutes): string {
  const lines: string[] = ['ACTA DE REUNIÓN CON REPRESENTANTE', minutes.document_code, ''];
  for (const section of minutes.sections) {
    lines.push(`${section.number}. ${section.title.toUpperCase()}`);
    section.fields?.forEach((f) => lines.push(`   ${f.label}: ${f.value}`));
    section.paragraphs?.forEach((p) => lines.push(`   ${p}`));
    section.items?.forEach((i) => lines.push(`   - ${i}`));
    if (!section.fields?.length && !section.paragraphs?.length && !section.items?.length) {
      lines.push(`   ${SIN_CONTENIDO}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
