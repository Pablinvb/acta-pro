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
  Teacher,
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

/** Docente con su credencial. La huella nunca sale de la capa de servicios. */
export interface TeacherAccount extends Teacher {
  password_hash?: string;
}

/**
 * Cuentas del claustro.
 *
 * Sustituye a la contraseña compartida en variable de entorno. Deja de ser un
 * detalle de comodidad en cuanto entran datos reales: el identificador de la
 * sesión es lo que decide qué reuniones se pueden abrir.
 */
export interface TeacherRepository {
  find(teacherId: string): Promise<TeacherAccount | null>;
  list(): Promise<Teacher[]>;
  upsert(teacher: Teacher): Promise<Teacher>;
  /** Guarda la huella ya calculada. Aquí nunca llega una contraseña en claro. */
  setPasswordHash(teacherId: string, passwordHash: string): Promise<void>;
}

export interface MeetingRepository {
  /**
   * `studentId` y `before` existen para el historial: al preparar una reunión
   * hay que poder recuperar las anteriores de ese mismo estudiante, y sólo las
   * anteriores —una reunión no puede tener como antecedente algo que aún no ha
   * pasado—. `before` es una fecha ISO `YYYY-MM-DD`, exclusiva.
   */
  list(filter?: {
    teacherId?: string;
    date?: string;
    studentId?: string;
    before?: string;
  }): Promise<Meeting[]>;
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
  /**
   * Sustituye la transcripción completa de una reunión.
   *
   * Los fragmentos de 30 s se diarizan cada uno por su cuenta, así que la
   * «Voz A» de un fragmento no es la misma persona que la «Voz A» del
   * siguiente. Al cerrar la reunión se vuelve a transcribir el audio entero de
   * una vez, y esa pasada —con etiquetas de voz coherentes en toda la reunión—
   * reemplaza a la de los fragmentos.
   */
  replaceAll(meetingId: string, segments: TranscriptSegment[]): Promise<void>;
  listByMeeting(meetingId: string): Promise<TranscriptSegment[]>;
  /** Confirmación de un fragmento suelto, cuando no hay separación de voces. */
  setSpeaker(meetingId: string, timestamp: string, speaker: string): Promise<void>;
  /**
   * Asigna un nombre a TODOS los fragmentos de una misma voz.
   *
   * Es la operación que hace útil la separación de voces: la docente decide una
   * vez por hablante y no una vez por frase. Devuelve cuántos fragmentos quedaron
   * atribuidos.
   */
  setSpeakerByTag(meetingId: string, speakerTag: string, speaker: string): Promise<number>;
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

export interface DocumentSearch {
  /** Texto libre: estudiante, tipo de reunión o código del acta. */
  query?: string;
  studentId?: string;
  /**
   * Sólo las actas de las reuniones de esta docente.
   *
   * El repositorio busca por nombre de estudiante, así que sin este filtro
   * cualquiera encontraría las actas de las familias de otro docente escribiendo
   * un apellido.
   */
  teacherId?: string;
  /** ISO `YYYY-MM-DD`. */
  from?: string;
  to?: string;
}

export interface DocumentRepository {
  listByStudent(studentId: string): Promise<ArchivedDocument[]>;
  /** Búsqueda del repositorio de actas. Era el «Índice y búsqueda» del diagrama. */
  search(criteria: DocumentSearch): Promise<ArchivedDocument[]>;
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
  teachers: TeacherRepository;
  meetings: MeetingRepository;
  transcripts: TranscriptRepository;
  minutes: MinutesRepository;
  signatures: SignatureRepository;
  documents: DocumentRepository;
  followUps: FollowUpRepository;
  audit: AuditRepository;
}
