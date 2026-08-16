import 'server-only';
import type { ArchivedDocument, Meeting } from '@/lib/types';
import { getRepositories } from '@/repositories';
import * as audit from './audit.service';
import { isDemo } from './config';
import { getStorage, minutesPath, transcriptPath } from './storage/index';

/**
 * Archivo de documentos — antes workflow 14.
 *
 * La lógica de cada destino vive en su adaptador (`storage/drive.adapter.ts`,
 * `storage/s3.adapter.ts`). Aquí queda solo lo que es igual sea cual sea el
 * destino: qué se guarda, dónde en términos lógicos, y qué se registra.
 *
 * Lo que no cambia nunca: **el acta y la transcripción van por separado**. Son
 * dos llamadas distintas a dos ubicaciones con permisos distintos. Quien pueda
 * leer el historial de actas de un estudiante no tiene por qué poder leer lo
 * que se dijo palabra por palabra.
 */

export { minutesPath as buildPath } from './storage/index';

export interface ArchiveResult {
  document: ArchivedDocument;
  fileId: string | null;
}

/**
 * Archiva el acta en PDF.
 *
 * La carpeta del estudiante se crea aquí si es su primera reunión: no hay que
 * preparar nada por adelantado ni recordar hacerlo.
 */
export async function archiveMinutes(
  meeting: Meeting,
  documentCode: string,
  pdf: Buffer,
): Promise<ArchiveResult> {
  const path = minutesPath(meeting);

  const document: ArchivedDocument = {
    meeting_id: meeting.meeting_id,
    student_id: meeting.student_id,
    // Desnormalizado a propósito: el repositorio busca por nombre sin tener que
    // resolver el estudiante en cada resultado.
    student_name: meeting.student_name,
    document_code: documentCode,
    meeting_type: meeting.meeting_type,
    date: meeting.date,
    drive_path: path,
    signed: true,
  };

  if (isDemo) {
    await getRepositories().documents.save(document);
    return { document, fileId: null };
  }

  const stored = await getStorage().putMinutes(meeting, documentCode, pdf);
  await getRepositories().documents.save(document);
  await audit.record({
    meetingId: meeting.meeting_id,
    service: 'storage',
    event: `acta archivada en ${stored.path}`,
  });

  return { document, fileId: stored.id };
}

/** Guarda la transcripción en la ubicación restringida. Nunca junto al acta. */
export async function archiveTranscript(meeting: Meeting, text: string): Promise<string | null> {
  if (isDemo) return null;

  const stored = await getStorage().putTranscript(meeting, text);
  await audit.record({
    meetingId: meeting.meeting_id,
    service: 'storage',
    event: 'transcripción archivada en la ubicación restringida',
  });

  return stored.id;
}

export async function historyForStudent(studentId: string): Promise<ArchivedDocument[]> {
  return getRepositories().documents.listByStudent(studentId);
}

export { transcriptPath };
