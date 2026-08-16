import 'server-only';
import type { LanguageFinding, MeetingMinutes } from '@/lib/types';
import { getRepositories } from '@/repositories';
import * as actaGenerator from './acta-generator.service';
import * as audit from './audit.service';
import { estadoInvalido, invalido, noEncontrado } from './errors';

/**
 * Aprobación docente — antes workflow 11.
 *
 * Regla central, heredada intacta: **el borrador nunca se convierte en acta
 * final por su cuenta**. Solo una decisión explícita de la docente lo mueve, y
 * este servicio es el único camino a `teacher_approved`.
 *
 * Lo que el workflow no hacía y aquí sí: comprobar la revisión de lenguaje
 * antes de aprobar. El WF 09 clasificaba fragmentos como RED y el WF 11
 * aprobaba igual, sin mirarlos. Ahora un fragmento RED sin resolver bloquea la
 * aprobación en el servidor, no solo en la pantalla — porque una regla que solo
 * vive en el frontend no es una regla, es una sugerencia.
 */

export type TeacherDecision = 'approve' | 'edit' | 'reject';

export interface ReviewDecision {
  meetingId: string;
  decision: TeacherDecision;
  teacherId: string;
  /** Fragmentos cuya sugerencia la docente aceptó. */
  appliedFragments?: string[];
  /** Fragmentos que la docente decidió dejar como estaban. */
  keptFragments?: string[];
}

export interface ReviewResult {
  meeting_id: string;
  decision: TeacherDecision;
  teacher_approved: boolean;
  status: 'teacher_approved' | 'awaiting_teacher_review' | 'rejected';
  reviewed_at: string;
  minutes: MeetingMinutes;
}

/** Fragmentos RED que la docente todavía no ha resuelto. */
export function unresolvedCritical(
  findings: LanguageFinding[],
  resolved: ReadonlySet<string>,
): LanguageFinding[] {
  return findings.filter((f) => f.level === 'RED' && !resolved.has(f.fragment));
}

export async function submit(input: ReviewDecision): Promise<ReviewResult> {
  const { meetingId, decision, teacherId } = input;

  if (!['approve', 'edit', 'reject'].includes(decision)) {
    throw invalido('La decisión debe ser approve, edit o reject.');
  }

  const repos = getRepositories();
  const minutes = await repos.minutes.find(meetingId);
  if (!minutes) throw noEncontrado(`No hay acta generada para la reunión ${meetingId}.`);

  const applied = input.appliedFragments ?? [];
  const kept = input.keptFragments ?? [];
  const resolved = new Set([...applied, ...kept]);

  if (decision === 'approve') {
    const findings = await repos.minutes.findLanguageReview(meetingId);
    const blocking = unresolvedCritical(findings, resolved);
    if (blocking.length > 0) {
      throw estadoInvalido(
        `No se puede aprobar: quedan ${blocking.length} fragmento(s) no recomendados sin resolver. ` +
          'Aplica la sugerencia o mantén el original de forma explícita.',
      );
    }
  }

  // Las sugerencias aceptadas se aplican al acta guardada: lo que se aprueba y
  // lo que se ve en pantalla tienen que ser el mismo documento.
  const findings = await repos.minutes.findLanguageReview(meetingId);
  const acceptedPairs = findings
    .filter((f) => applied.includes(f.fragment))
    .map((f) => ({ fragment: f.fragment, suggested_text: f.suggested_text }));

  const status: ReviewResult['status'] =
    decision === 'approve' ? 'teacher_approved' : decision === 'edit' ? 'awaiting_teacher_review' : 'rejected';

  const updated: MeetingMinutes = {
    ...minutes,
    sections: actaGenerator.applyAcceptedSuggestions(minutes.sections, acceptedPairs),
    status: decision === 'approve' ? 'teacher_approved' : decision === 'reject' ? 'rejected' : 'draft',
  };

  await repos.minutes.save(updated);
  await repos.meetings.setStatus(meetingId, status);
  await audit.record({
    meetingId,
    service: 'approval',
    actor: teacherId,
    event:
      decision === 'approve'
        ? `acta aprobada (${acceptedPairs.length} sugerencia(s) aplicada(s), ${kept.length} original(es) mantenido(s))`
        : decision === 'reject'
          ? 'acta rechazada: vuelve a borrador'
          : 'acta editada: sigue en revisión',
  });

  return {
    meeting_id: meetingId,
    decision,
    teacher_approved: decision === 'approve',
    status,
    reviewed_at: new Date().toISOString(),
    minutes: updated,
  };
}
