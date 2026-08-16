import 'server-only';
import type { Meeting } from '@/lib/types';

/**
 * Almacenamiento de archivos.
 *
 * Hay dos destinos posibles y la elección no es indiferente para la docente:
 *
 *  - **Google Drive**: puede abrir la carpeta del estudiante y ver sus actas
 *    directamente, compartirlas con dirección, imprimirlas desde ahí.
 *  - **Almacenamiento de objetos (S3 / Firebase)**: es opaco. Nadie «entra» a
 *    un bucket. Todo acceso tiene que pasar por la pantalla de repositorio de
 *    la aplicación.
 *
 * Por eso existe este interfaz en lugar de una decisión grabada en el código:
 * las dos opciones son razonables y la elección debe ser de configuración.
 *
 * Regla que cumple cualquier adaptador, sin excepción: **el acta y la
 * transcripción van a destinos separados**, con permisos independientes. Quien
 * pueda leer el historial de actas de un estudiante no tiene por qué poder leer
 * palabra por palabra lo que se dijo en la reunión.
 */

export interface StoredFile {
  /** Identificador con el que el adaptador puede recuperarlo después. */
  id: string;
  /** Ruta legible, para mostrarla en pantalla. */
  path: string;
}

export interface StorageAdapter {
  readonly name: 'drive' | 's3';

  /**
   * Guarda el acta en PDF. Debe crear la carpeta del estudiante si es su
   * primera reunión, sin que haya que preparar nada por adelantado.
   */
  putMinutes(meeting: Meeting, documentCode: string, pdf: Buffer): Promise<StoredFile>;

  /** Guarda la transcripción en la ubicación restringida, nunca junto al acta. */
  putTranscript(meeting: Meeting, text: string): Promise<StoredFile>;

  /**
   * Enlace temporal para leer un archivo ya guardado.
   *
   * Devuelve `null` cuando el destino no ofrece enlaces directos y el acceso
   * debe servirse desde la propia aplicación.
   */
  linkTo(fileId: string): Promise<string | null>;
}

/** Ruta canónica del acta, idéntica en todos los destinos. */
export function minutesPath(meeting: Meeting): string {
  return [
    'ACTA PRO',
    'Docentes',
    meeting.teacher_name,
    meeting.student_name,
    meeting.school_year,
    `${meeting.date} - ${meeting.meeting_type}`,
  ].join('/');
}

/** Ruta de la transcripción. Raíz distinta a propósito. */
export function transcriptPath(meeting: Meeting): string {
  return `ACTA PRO/Transcripciones/${meeting.school_year}/${meeting.meeting_id}`;
}
