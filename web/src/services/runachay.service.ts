import 'server-only';
import type { DataStatus, Representative, Student } from '@/lib/types';
import { externalTimeoutMs, isDemo, requireRunachay } from './config';
import * as mock from '@/lib/mock/data';

/**
 * Runachay — antes workflow 02.
 *
 * Consulta la plataforma institucional para completar los datos del estudiante
 * y su representante.
 *
 * Regla heredada, y es importante: **si Runachay no responde, el flujo no se
 * detiene**. La reunión se conserva y se marca `manual_verification_required`
 * para que la docente complete los datos a mano. Un colegio no puede quedarse
 * sin poder documentar una reunión porque un sistema externo esté caído.
 *
 * El esquema real de la respuesta todavía no se conoce — el workflow original
 * ya lo anotaba: «Ajustar el mapeo exacto de campos cuando se conozca el
 * esquema real». Por eso el mapeo vive aislado en `mapStudent` y
 * `mapRepresentative`: cuando llegue la documentación, solo hay que tocar esas
 * dos funciones.
 */

export interface LookupResult {
  student: Student | null;
  representative: Representative | null;
  dataStatus: DataStatus;
  /** Motivo por el que hizo falta verificación manual, si la hizo. */
  reason?: string;
}

interface RawStudent {
  id?: string;
  name?: string;
  course?: string;
  average?: number;
  attendance_rate?: number;
  late_arrivals?: number;
  observations?: string[];
}

interface RawRepresentative {
  id?: string;
  name?: string;
  relation?: string;
  email?: string;
  phone?: string;
  language?: string;
}

export function mapStudent(raw: RawStudent | null): Student | null {
  if (!raw?.name) return null;
  return {
    student_id: raw.id ?? '',
    name: raw.name,
    course: raw.course ?? '',
    average: raw.average,
    attendance_rate: raw.attendance_rate,
    late_arrivals: raw.late_arrivals,
    observations: raw.observations ?? [],
  };
}

export function mapRepresentative(raw: RawRepresentative | null): Representative | null {
  if (!raw?.name) return null;
  const relation =
    raw.relation === 'madre' || raw.relation === 'padre' ? raw.relation : 'representante legal';
  return {
    representative_id: raw.id ?? '',
    name: raw.name,
    relation,
    email: raw.email ?? '',
    phone: raw.phone,
    language: raw.language ?? 'Español',
  };
}

async function get<T>(url: string, apiKey: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), externalTimeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    // Silencio deliberado: un fallo aquí degrada a verificación manual, no
    // interrumpe la reunión.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function lookup(studentName: string, representativeName: string): Promise<LookupResult> {
  if (isDemo) {
    return { student: mock.student, representative: mock.representative, dataStatus: 'verified' };
  }

  const config = requireRunachay();

  // En paralelo: son dos consultas independientes y la reunión puede empezar en
  // cualquier momento.
  const [rawStudent, rawRepresentative] = await Promise.all([
    get<RawStudent>(
      `${config.baseUrl}${config.studentEndpoint}?name=${encodeURIComponent(studentName)}`,
      config.apiKey,
    ),
    get<RawRepresentative>(
      `${config.baseUrl}${config.representativeEndpoint}?name=${encodeURIComponent(representativeName)}`,
      config.apiKey,
    ),
  ]);

  const student = mapStudent(rawStudent);
  const representative = mapRepresentative(rawRepresentative);

  // Sin correo del representante, el acta no se podrá enviar: se avisa ya, no al
  // final del proceso.
  if (!student) {
    return { student, representative, dataStatus: 'manual_verification_required', reason: 'Runachay no devolvió los datos del estudiante.' };
  }
  if (!representative?.email) {
    return {
      student,
      representative,
      dataStatus: 'manual_verification_required',
      reason: 'Falta el correo del representante: sin él no se puede enviar el acta.',
    };
  }

  return { student, representative, dataStatus: 'verified' };
}
