import 'server-only';

/**
 * Servicios de ACTA PRO.
 *
 * Cada servicio sustituye a un workflow de n8n. La correspondencia está en
 * `docs/ARQUITECTURA.md`; los workflows originales se conservan en
 * `docs/legacy-n8n/` como referencia de las reglas de negocio.
 */

export * as actaGenerator from './acta-generator.service';
export * as approval from './approval.service';
export * as audit from './audit.service';
export * as calendar from './calendar.service';
export * as documents from './document.service';
export * as email from './email.service';
export * as history from './history.service';
export * as languageReview from './language-review.service';
export * as lifecycle from './meeting-lifecycle.service';
export * as meetingAi from './meeting-ai.service';
export * as meetings from './meeting.service';
export * as pdf from './pdf.service';
export * as runachay from './runachay.service';
export * as signatures from './signature.service';
export * as speaker from './speaker.service';
export * as speech from './speech.service';
export * as storage from './storage.service';
export * as timestamp from './timestamp.service';
export * as transcriptCleanup from './transcript-cleanup.service';

export { ServiceError } from './errors';
export { describeMode, isDemo, runMode } from './config';
