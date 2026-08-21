import 'server-only';
import type { Teacher } from '@/lib/types';
import { hashPassword, verifyCredentials, type Credentials, type VerifyResult } from '@/lib/auth';
import { getRepositories } from '@/repositories';
import { invalido, noEncontrado } from './errors';
import * as audit from './audit.service';

/**
 * Cuentas del claustro.
 *
 * Sustituye a la contraseña compartida que vivía en una variable de entorno.
 * Con datos de demostración eso era una comodidad; con familias reales es lo
 * que separa «cada docente ve sus reuniones» de «quien entra lo ve todo».
 *
 * La contraseña en claro no sale nunca de aquí: llega, se convierte en huella y
 * se descarta. Ni se registra en la auditoría ni se devuelve.
 */

/** Mínimo razonable. Corta lo obviamente inseguro sin imponer teatro. */
const MIN_LONGITUD = 12;

export async function find(teacherId: string): Promise<Teacher | null> {
  const cuenta = await getRepositories().teachers.find(teacherId);
  if (!cuenta) return null;
  const { password_hash, ...docente } = cuenta;
  void password_hash;
  return docente;
}

export async function list(): Promise<Teacher[]> {
  return getRepositories().teachers.list();
}

export async function register(teacher: Teacher): Promise<Teacher> {
  return getRepositories().teachers.upsert(teacher);
}

/**
 * Comprueba unas credenciales.
 *
 * El registro de auditoría anota los intentos fallidos con el identificador
 * probado, pero **nunca** la contraseña: un log que guarda contraseñas
 * fallidas acaba guardando la buena, escrita con una errata.
 */
export async function authenticate(credentials: Credentials): Promise<VerifyResult> {
  const cuenta = await getRepositories().teachers.find(credentials.teacherId);
  const resultado = await verifyCredentials(credentials, cuenta);

  if (!resultado.ok) {
    await audit.record({
      meetingId: null,
      service: 'teacher',
      event: `intento de acceso fallido (${resultado.reason})`,
      details: { teacher_id: credentials.teacherId.trim() },
    });
  }

  return resultado;
}

export async function setPassword(teacherId: string, password: string): Promise<void> {
  if (password.length < MIN_LONGITUD) {
    throw invalido(`La contraseña debe tener al menos ${MIN_LONGITUD} caracteres.`);
  }

  const repos = getRepositories();
  const cuenta = await repos.teachers.find(teacherId);
  if (!cuenta) throw noEncontrado(`No existe la cuenta ${teacherId}.`);

  await repos.teachers.setPasswordHash(cuenta.teacher_id, await hashPassword(password));
  await audit.record({
    meetingId: null,
    service: 'teacher',
    event: 'contraseña actualizada',
    details: { teacher_id: cuenta.teacher_id },
  });
}
