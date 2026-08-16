import 'server-only';
import { Readable } from 'node:stream';
import type { ArchivedDocument, Meeting } from '@/lib/types';
import { getRepositories } from '@/repositories';
import * as audit from './audit.service';
import { driveRootFolderId, driveTranscriptFolderId, isDemo } from './config';
import { driveApi } from './google.client';
import { integracionFallida, sinConfigurar } from './errors';

/**
 * Archivo en Google Drive — antes workflow 14.
 *
 * Estructura, tal y como la fija la arquitectura:
 *
 *   ACTA PRO/Docentes/{docente}/{estudiante}/{año lectivo}/{fecha - tipo}
 *
 * Cada estudiante tiene su propio historial.
 *
 * Regla que se respeta aquí sin excepción: **la transcripción no se guarda
 * junto al acta**. Va a una carpeta distinta, con permisos distintos, y por eso
 * son dos funciones separadas con dos carpetas raíz distintas. No es una
 * convención de nombres: son dos destinos que se pueden compartir por separado.
 */

export function buildPath(meeting: Meeting): string {
  return [
    'ACTA PRO',
    'Docentes',
    meeting.teacher_name,
    meeting.student_name,
    meeting.school_year,
    `${meeting.date} - ${meeting.meeting_type}`,
  ].join('/');
}

/** Busca o crea una carpeta hija. Sin esto, cada archivo crearía un árbol nuevo. */
async function ensureFolder(name: string, parentId: string): Promise<string> {
  const drive = driveApi();
  const escaped = name.replace(/'/g, "\\'");

  const { data } = await drive.files.list({
    q: `name = '${escaped}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id)',
    pageSize: 1,
  });

  const existing = data.files?.[0]?.id;
  if (existing) return existing;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });

  if (!created.data.id) throw integracionFallida('Google Drive');
  return created.data.id;
}

async function ensurePath(segments: string[], rootId: string): Promise<string> {
  let parent = rootId;
  for (const segment of segments) {
    parent = await ensureFolder(segment, parent);
  }
  return parent;
}

export interface ArchiveResult {
  document: ArchivedDocument;
  driveFileId: string | null;
}

/** Archiva el acta final. Nunca incluye la transcripción. */
export async function archiveMinutes(
  meeting: Meeting,
  documentCode: string,
  html: string,
): Promise<ArchiveResult> {
  const path = buildPath(meeting);

  const document: ArchivedDocument = {
    meeting_id: meeting.meeting_id,
    student_id: meeting.student_id,
    document_code: documentCode,
    meeting_type: meeting.meeting_type,
    date: meeting.date,
    drive_path: path,
    signed: true,
  };

  if (isDemo) {
    await getRepositories().documents.save(document);
    return { document, driveFileId: null };
  }

  if (!driveRootFolderId) throw sinConfigurar('GOOGLE_DRIVE_ROOT_FOLDER_ID');

  try {
    // El primer segmento ("ACTA PRO") es la carpeta raíz configurada.
    const folderId = await ensurePath(path.split('/').slice(1, -1), driveRootFolderId);

    const { data } = await driveApi().files.create({
      requestBody: {
        name: `${documentCode}.html`,
        parents: [folderId],
        mimeType: 'text/html',
      },
      media: { mimeType: 'text/html', body: Readable.from([html]) },
      fields: 'id',
    });

    await getRepositories().documents.save(document);
    await audit.record({
      meetingId: meeting.meeting_id,
      service: 'storage',
      event: `acta archivada en ${path}`,
    });

    return { document, driveFileId: data.id ?? null };
  } catch (error) {
    throw integracionFallida('Google Drive', error);
  }
}

/**
 * Guarda la transcripción en la ubicación restringida.
 *
 * Carpeta raíz distinta a propósito: quien tenga acceso al historial de actas
 * de un estudiante no tiene por qué poder leer lo que se dijo palabra por
 * palabra en la reunión.
 */
export async function archiveTranscript(meeting: Meeting, text: string): Promise<string | null> {
  if (isDemo) return null;
  if (!driveTranscriptFolderId) throw sinConfigurar('GOOGLE_DRIVE_TRANSCRIPT_FOLDER_ID');

  try {
    const { data } = await driveApi().files.create({
      requestBody: {
        name: `${meeting.meeting_id} - transcripción.txt`,
        parents: [driveTranscriptFolderId],
        mimeType: 'text/plain',
      },
      media: { mimeType: 'text/plain', body: Readable.from([text]) },
      fields: 'id',
    });

    await audit.record({
      meetingId: meeting.meeting_id,
      service: 'storage',
      event: 'transcripción archivada en la ubicación restringida',
    });

    return data.id ?? null;
  } catch (error) {
    throw integracionFallida('Google Drive', error);
  }
}

export async function historyForStudent(studentId: string): Promise<ArchivedDocument[]> {
  return getRepositories().documents.listByStudent(studentId);
}
