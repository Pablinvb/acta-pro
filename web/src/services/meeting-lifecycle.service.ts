import 'server-only';
import { getRepositories } from '@/repositories';
import * as actaGenerator from './acta-generator.service';
import * as audit from './audit.service';
import * as calendar from './calendar.service';
import * as documents from './document.service';
import * as email from './email.service';
import * as languageReview from './language-review.service';
import * as meetingAi from './meeting-ai.service';
import * as meetings from './meeting.service';
import * as signatures from './signature.service';
import * as pdf from './pdf.service';
import * as speech from './speech.service';
import * as storage from './storage.service';
import * as transcriptCleanup from './transcript-cleanup.service';
import { ServiceError, estadoInvalido } from './errors';

/**
 * Orquestación del proceso.
 *
 * En n8n el encadenado entre workflows vivía en nodos `Execute Workflow` que no
 * se podían leer de un vistazo: había que abrir cada lienzo para saber qué
 * disparaba qué. Aquí el orden está escrito en un sitio, en dos funciones, y se
 * puede leer y probar.
 *
 * Las dos cadenas del sistema son:
 *
 *   cerrar reunión →  depurar transcripción → análisis → borrador → revisión
 *   firmar acta    →  documento PDF → archivo → envío → seguimiento
 *
 * Regla que gobierna ambas, heredada del manejador de errores: si un paso
 * falla, **nada de lo ya hecho se deshace**. La reunión queda en
 * `retry_required` con el motivo, y se puede reintentar desde donde estaba.
 */

export interface StepResult {
  step: string;
  ok: boolean;
  detail?: string;
}

/**
 * Cierra la reunión y produce el borrador listo para revisar.
 *
 * Los tres pasos son secuenciales de verdad: no hay revisión de lenguaje sin
 * acta, ni acta sin análisis.
 */
export async function closeMeetingAndDraft(meetingId: string): Promise<StepResult[]> {
  const steps: StepResult[] = [];

  try {
    // Se depura antes de analizar: el modelo extrae mucho mejor los acuerdos de
    // un texto sin muletillas ni frases a medio empezar. El original queda
    // intacto como evidencia.
    const segments = await transcriptCleanup.cleanupMeeting(meetingId);
    steps.push({ step: 'depuracion', ok: true, detail: `${segments.length} fragmento(s)` });

    await meetingAi.analyze(meetingId);
    steps.push({ step: 'analisis', ok: true });

    const minutes = await actaGenerator.generate(meetingId);
    steps.push({ step: 'borrador', ok: true, detail: minutes.document_code });

    const findings = await languageReview.review(meetingId);
    const red = findings.filter((f) => f.level === 'RED').length;
    steps.push({
      step: 'revision_lenguaje',
      ok: true,
      detail: `${findings.length} hallazgo(s), ${red} no recomendado(s)`,
    });
  } catch (error) {
    const message = error instanceof ServiceError ? error.userMessage : 'Error inesperado';
    await meetings.markRetryRequired(meetingId, message);
    steps.push({ step: 'fallo', ok: false, detail: message });
    throw error;
  }

  return steps;
}

/**
 * Cadena posterior a la firma.
 *
 * A diferencia de la anterior, aquí sí se continúa cuando un paso falla: si
 * Drive está caído no tiene sentido dejar de enviarle el acta al representante,
 * que es lo que de verdad importa. Cada fallo se registra y la reunión queda
 * marcada para reintento, pero lo que sí funcionó se conserva.
 */
export async function completeAfterSignatures(meetingId: string): Promise<StepResult[]> {
  const fullySigned = await signatures.isFullySigned(meetingId);
  if (!fullySigned) {
    throw estadoInvalido('Faltan firmas: el acta necesita la de la docente y la del representante.');
  }

  const repos = getRepositories();
  const meeting = await meetings.find(meetingId);
  const steps: StepResult[] = [];
  const failures: string[] = [];

  const run = async (step: string, fn: () => Promise<string | undefined>) => {
    try {
      const detail = await fn();
      steps.push({ step, ok: true, detail });
    } catch (error) {
      const message = error instanceof ServiceError ? error.userMessage : 'Error inesperado';
      steps.push({ step, ok: false, detail: message });
      failures.push(`${step}: ${message}`);
    }
  };

  // Documento final: el PDF es el formato que se archiva y se envía, porque es
  // lo que la docente va a imprimir y guardar. El HTML se sigue generando para
  // quien quiera verlo en pantalla.
  const final = await pdf.build(meetingId);
  steps.push({ step: 'documento_final', ok: true, detail: `${final.documentCode}.pdf` });

  // Archivo del acta, y de la transcripción por separado. La carpeta del
  // estudiante se crea aquí si es su primera reunión.
  await run('archivo_acta', async () => {
    const { document } = await storage.archiveMinutes(meeting, final.documentCode, final.pdf);
    return document.drive_path;
  });

  await run('archivo_transcripcion', async () => {
    const text = await speech.fullText(meetingId);
    if (!text.trim()) return 'sin transcripción que archivar';
    await storage.archiveTranscript(meeting, text);
    return 'guardada en la ubicación restringida';
  });

  // 15 · Envío al representante
  const analysis = await repos.minutes.findAnalysis(meetingId);
  const followUpDate = analysis?.follow_up_date ?? undefined;

  await run('envio', async () => {
    await email.sendMinutes(meeting, final.documentCode, final.pdf, followUpDate);
    return meeting.representative_email;
  });

  // 16 · Seguimiento
  if (followUpDate) {
    await run('seguimiento', async () => {
      await calendar.createFollowUpEvent(meeting, {
        meeting_id: meetingId,
        date: followUpDate,
        description: `Seguimiento · ${meeting.student_name}`,
      });
      return followUpDate;
    });
  }

  if (failures.length > 0) {
    await meetings.markRetryRequired(meetingId, failures.join(' | '));
    await audit.record({
      meetingId,
      service: 'lifecycle',
      event: `proceso posterior a la firma incompleto: ${failures.length} paso(s) fallido(s)`,
    });
  } else {
    await repos.meetings.setStatus(meetingId, 'sent');
    await audit.record({ meetingId, service: 'lifecycle', event: 'acta archivada y enviada' });
  }

  return steps;
}
