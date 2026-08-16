import 'server-only';
import type {
  AiAnalysis,
  ArchivedDocument,
  AuditLogEntry,
  FollowUp,
  LanguageFinding,
  Meeting,
  MeetingMinutes,
  MeetingStatus,
  Signature,
  TranscriptSegment,
} from '@/lib/types';

/**
 * Persistencia de ACTA PRO.
 *
 * Sustituye a los 25 nodos `NoOp` que los workflows de n8n dejaban como
 * marcador de la base de datos. Ahora ACTA PRO es dueña de sus datos, y con eso
 * desaparece el riesgo que hacía inevitable esta refactorización: dos sistemas
 * escribiendo sobre el mismo esquema sin transacción compartida.
 *
 * Dos reglas heredadas de la arquitectura anterior que se mantienen:
 *
 *  1. La transcripción vive separada del acta, con su propio acceso. Por eso
 *     `TranscriptRepository` es una interfaz aparte y no un campo de `Meeting`.
 *  2. Nada se borra ante un fallo. No existe ningún método `delete` de reunión;
 *     lo más destructivo que se puede hacer es marcar `retry_required`.
 */

export interface MeetingRepository {
  list(filter?: { teacherId?: string; date?: string }): Promise<Meeting[]>;
  find(meetingId: string): Promise<Meeting | null>;
  /** Alta idempotente: si la reunión ya existe, no se duplica (era el WF 03). */
  upsert(meeting: Meeting): Promise<Meeting>;
  setStatus(meetingId: string, status: MeetingStatus): Promise<void>;
  /** Marca que hay que reintentar sin tocar nada de lo ya procesado. */
  markRetryRequired(meetingId: string, reason: string): Promise<void>;
  /** Reuniones que empiezan dentro de la ventana dada y sin aviso enviado (WF 04). */
  dueForReminder(withinMinutes: number): Promise<Meeting[]>;
  markReminderSent(meetingId: string): Promise<void>;
}

/**
 * Almacén separado y restringido. Nunca se sirve junto al acta ni se adjunta a
 * un correo.
 */
export interface TranscriptRepository {
  append(segment: TranscriptSegment): Promise<void>;
  listByMeeting(meetingId: string): Promise<TranscriptSegment[]>;
  /** Confirmación manual de hablantes: en Fase 1 es el mecanismo, no un apaño. */
  setSpeaker(meetingId: string, timestamp: string, speaker: string): Promise<void>;
  /** Texto corrido para el análisis con IA. */
  fullText(meetingId: string): Promise<string>;
}

export interface MinutesRepository {
  find(meetingId: string): Promise<MeetingMinutes | null>;
  save(minutes: MeetingMinutes): Promise<MeetingMinutes>;
  saveAnalysis(meetingId: string, analysis: AiAnalysis): Promise<void>;
  findAnalysis(meetingId: string): Promise<AiAnalysis | null>;
  saveLanguageReview(meetingId: string, findings: LanguageFinding[]): Promise<void>;
  findLanguageReview(meetingId: string): Promise<LanguageFinding[]>;
}

export interface SignatureRepository {
  listByMeeting(meetingId: string): Promise<Signature[]>;
  save(signature: Signature & { image: string }): Promise<void>;
}

export interface DocumentRepository {
  listByStudent(studentId: string): Promise<ArchivedDocument[]>;
  save(document: ArchivedDocument): Promise<void>;
  /** Siguiente secuencia para el código `ACTA-YYYY-ESTUDIANTE-SECUENCIA`. */
  nextSequence(year: number, studentId: string): Promise<number>;
}

export interface FollowUpRepository {
  save(followUp: FollowUp): Promise<void>;
  listByMeeting(meetingId: string): Promise<FollowUp[]>;
  overdue(today: string): Promise<FollowUp[]>;
}

/** Registro de eventos críticos. Era el workflow 17. Solo se añade, nunca se altera. */
export interface AuditRepository {
  append(entry: AuditLogEntry): Promise<void>;
  listByMeeting(meetingId: string): Promise<AuditLogEntry[]>;
}

export interface Repositories {
  meetings: MeetingRepository;
  transcripts: TranscriptRepository;
  minutes: MinutesRepository;
  signatures: SignatureRepository;
  documents: DocumentRepository;
  followUps: FollowUpRepository;
  audit: AuditRepository;
}
