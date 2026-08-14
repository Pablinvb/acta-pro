import 'server-only';
import type { DataStatus, Representative, Student } from './types';

/**
 * Contrato de Runachay tal y como lo define el workflow 02.
 *
 * El WF 02 hace dos GET en paralelo contra
 *   `${RUNACHAY_API_URL}${RUNACHAY_STUDENT_ENDPOINT}?name=<student_name>`
 *   `${RUNACHAY_API_URL}${RUNACHAY_REPRESENTATIVE_ENDPOINT}?name=<representative_name>`
 * ambos con `httpHeaderAuth` y timeout de 8 s, y ambos con
 * `onError: continueRegularOutput`. Después consolida y marca:
 *
 *   data_status = 'ok'                            si llegó el estudiante
 *   data_status = 'manual_verification_required'  en cualquier otro caso
 *
 * El esquema real de la respuesta todavía no se conoce — el propio workflow lo
 * anota: «Ajustar el mapeo exacto de campos cuando se conozca el esquema real».
 * Por eso aquí el mapeo está aislado en `mapStudent` / `mapRepresentative`: el
 * día que llegue la documentación de Runachay, solo hay que tocar esas dos
 * funciones, no el resto de la app.
 *
 * La app NUNCA llama a Runachay directamente. Runachay es responsabilidad del
 * WF 02; este módulo existe para tipar lo que ese workflow devuelve.
 */

/** Lo que emite el nodo «Consolidar / marcar data_status» del WF 02. */
export interface RunachayLookupResult {
  meeting_id: string;
  student: RunachayStudentRaw | null;
  representative: RunachayRepresentativeRaw | null;
  data_status: DataStatus;
}

/** Forma tentativa. Ajustar cuando exista el esquema real. */
export interface RunachayStudentRaw {
  id?: string;
  name?: string;
  course?: string;
  average?: number;
  attendance_rate?: number;
  late_arrivals?: number;
  observations?: string[];
  error?: unknown;
}

export interface RunachayRepresentativeRaw {
  id?: string;
  name?: string;
  relation?: string;
  email?: string;
  phone?: string;
  language?: string;
  error?: unknown;
}

export function mapStudent(raw: RunachayStudentRaw | null): Student | null {
  if (!raw || raw.error) return null;
  return {
    student_id: raw.id ?? '',
    name: raw.name ?? '',
    course: raw.course ?? '',
    average: raw.average,
    attendance_rate: raw.attendance_rate,
    late_arrivals: raw.late_arrivals,
    observations: raw.observations ?? [],
  };
}

export function mapRepresentative(raw: RunachayRepresentativeRaw | null): Representative | null {
  if (!raw || raw.error || !raw.email) return null;
  const relation = raw.relation === 'madre' || raw.relation === 'padre' ? raw.relation : 'representante legal';
  return {
    representative_id: raw.id ?? '',
    name: raw.name ?? '',
    relation,
    email: raw.email,
    phone: raw.phone,
    language: raw.language ?? 'Español',
  };
}

/**
 * Una reunión sin correo verificado del representante no se puede enviar (WF
 * 15). La interfaz debe avisarlo antes de la reunión, no al final.
 */
export function canSendMinutes(result: RunachayLookupResult): boolean {
  return result.data_status !== 'manual_verification_required' && !!result.representative?.email;
}
