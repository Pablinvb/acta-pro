/**
 * Tipos del dominio de ACTA PRO.
 *
 * Derivados de `docs/ARQUITECTURA.md` (estructura de datos principal) y de los
 * payloads reales que emiten y esperan los workflows de `workflows/`. Cuando un
 * campo procede de un workflow concreto se indica en el comentario, para que al
 * cambiar el workflow se sepa qué tipo hay que tocar.
 */

/* ── Personas ─────────────────────────────────────────────────────────────── */

export interface Teacher {
  teacher_id: string;
  name: string;
  subject?: string;
  email?: string;
}

export interface Student {
  student_id: string;
  name: string;
  course: string;
  /** Datos académicos que devuelve Runachay (WF 02). */
  average?: number;
  attendance_rate?: number;
  late_arrivals?: number;
  observations?: string[];
}

export type RepresentativeRelation = 'madre' | 'padre' | 'representante legal';

export interface Representative {
  representative_id: string;
  name: string;
  relation: RepresentativeRelation;
  email: string;
  phone?: string;
  language?: string;
}

/* ── Reunión ──────────────────────────────────────────────────────────────── */

/**
 * Estados por los que pasa una reunión. `scheduled` lo escribe el WF 03,
 * `in_progress` el WF 05, `teacher_approved` / `rejected` el WF 11, y `sent`
 * el WF 15. `retry_required` lo marca el Error Handler: nunca se borra una
 * reunión ni información ya procesada.
 */
export type MeetingStatus =
  | 'scheduled'
  | 'in_progress'
  | 'awaiting_teacher_review'
  | 'teacher_approved'
  | 'rejected'
  | 'signed'
  | 'sent'
  | 'retry_required';

/** WF 02: si Runachay no responde, el flujo continúa marcando esto. */
export type DataStatus = 'ok' | 'verified' | 'manual_verification_required';

export type ParticipantRole = 'teacher' | 'mother' | 'father' | 'student' | 'other';

export interface Participant {
  role: ParticipantRole;
  name: string;
  present?: boolean;
}

export interface Meeting {
  meeting_id: string;
  teacher_id: string;
  student_id: string;
  teacher_name: string;
  student_name: string;
  course: string;
  representative_name: string;
  representative_email: string;
  meeting_type: string;
  /** ISO `YYYY-MM-DD`. */
  date: string;
  /** `HH:mm`. */
  start_time: string;
  end_time?: string;
  status: MeetingStatus;
  data_status: DataStatus;
  participants: Participant[];
  school_year: string;
}

/* ── Transcripción (WF 06 y 07) ───────────────────────────────────────────── */

export interface TranscriptSegment {
  meeting_id: string;
  /** ISO 8601. */
  timestamp: string;
  text: string;
  confidence_score: number | null;
  /** Lo rellena el WF 07; hasta entonces queda sin confirmar. */
  speaker?: string;
  speaker_confirmed?: boolean;
  /** Marca manual de la docente durante la reunión. */
  flagged_by_teacher?: boolean;
}

/* ── Análisis con IA (WF 08) ──────────────────────────────────────────────── */

/**
 * Contrato exacto del workflow 08. El modelo devuelve únicamente estos campos.
 * Reglas que impone la arquitectura: no inventar información, no determinar
 * quién tiene la razón, no emitir diagnósticos ni juicios personales, y todo
 * acuerdo debe poder rastrearse a la transcripción.
 */
export interface AiAnalysis {
  meeting_reason: string;
  topics: string[];
  /**
   * Antecedentes previos a la reunión (sección 3 del acta).
   *
   * Campo añadido en la migración a servicios propios. El workflow 10 original
   * imprimía `situations_discussed` tanto en la sección 3 como en la 6, con lo
   * que el acta repetía el mismo contenido en dos apartados distintos.
   */
  background: string[];
  situations_discussed: string[];
  teacher_actions: string[];
  representative_concerns: string[];
  student_interventions: string[];
  agreements: string[];
  commitments: string[];
  responsible_people: string[];
  evidence_mentions: string[];
  follow_up_actions: string[];
  follow_up_date: string | null;
  language_risk_flags: string[];
  /** El WF 08 lo marca cuando hay incertidumbre. */
  requires_teacher_review?: boolean;
}

/* ── Revisión de lenguaje (WF 09) ─────────────────────────────────────────── */

/** GREEN adecuado · YELLOW requiere revisión · RED no recomendado. */
export type LanguageLevel = 'GREEN' | 'YELLOW' | 'RED';

export interface LanguageFinding {
  fragment: string;
  level: LanguageLevel;
  reason: string;
  /**
   * Sugerencia, nunca un reemplazo automático. La arquitectura es explícita:
   * «La IA solo sugiere; nunca modifica el contenido final en silencio».
   */
  suggested_text: string;
}

/** Decisión de la docente sobre un hallazgo. Solo existe en el frontend. */
export type FindingResolution = 'open' | 'applied' | 'kept';

export interface ReviewedFinding extends LanguageFinding {
  id: string;
  /** Sección del acta donde aparece el fragmento, p. ej. `6`. */
  section: number;
  resolution: FindingResolution;
}

/* ── Acta (WF 10) ─────────────────────────────────────────────────────────── */

/** Las 13 secciones fijadas por la arquitectura, en orden. */
export const MINUTES_SECTIONS = [
  'Datos generales',
  'Motivo de la reunión',
  'Antecedentes relevantes',
  'Temas tratados',
  'Intervenciones relevantes',
  'Situaciones analizadas',
  'Acuerdos',
  'Compromisos',
  'Responsables',
  'Evidencias mencionadas',
  'Fecha o acciones de seguimiento',
  'Observaciones',
  'Firmas',
] as const;

export type MinutesSectionTitle = (typeof MINUTES_SECTIONS)[number];

export interface MinutesSection {
  /** 1..13 */
  number: number;
  title: MinutesSectionTitle;
  /** Párrafos sueltos. */
  paragraphs?: string[];
  /** Puntos de lista. */
  items?: string[];
  /** Pares clave/valor, solo para «Datos generales». */
  fields?: Array<{ label: string; value: string }>;
}

export interface MeetingMinutes {
  meeting_id: string;
  /** Código único: `ACTA-YYYY-ESTUDIANTE-SECUENCIA`. */
  document_code: string;
  status: 'draft' | 'teacher_approved' | 'rejected' | 'final';
  sections: MinutesSection[];
  generated_at: string;
}

/* ── Firmas (WF 12) ───────────────────────────────────────────────────────── */

export interface Signature {
  meeting_id: string;
  signer_role: 'teacher' | 'representative';
  signer_name: string;
  signed_at: string | null;
}

/* ── Seguimiento (WF 16) ──────────────────────────────────────────────────── */

export interface FollowUp {
  meeting_id: string;
  /** ISO `YYYY-MM-DD`. */
  date: string;
  description: string;
  calendar_event_id?: string;
}

/* ── Documentos archivados (WF 14) ────────────────────────────────────────── */

export interface ArchivedDocument {
  meeting_id: string;
  student_id: string;
  document_code: string;
  meeting_type: string;
  date: string;
  /**
   * Ruta en Drive: `ACTA PRO/Docentes/{docente}/{estudiante}/{año}/{fecha - tipo}`.
   * La transcripción NO vive aquí: va a una ubicación separada y restringida.
   */
  drive_path: string;
  signed: boolean;
}

/* ── Auditoría (WF 17) ────────────────────────────────────────────────────── */

export interface AuditLogEntry {
  timestamp: string;
  workflow: string;
  node?: string;
  meeting_id: string;
  event: string;
  actor?: string;
}
