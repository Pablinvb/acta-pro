import 'server-only';
import { Readable } from 'node:stream';
import type { Meeting } from '@/lib/types';
import { driveRootFolderId, driveTranscriptFolderId } from '../config';
import { integracionFallida, sinConfigurar } from '../errors';
import { driveApi } from '../google.client';
import { minutesPath, transcriptPath, type StorageAdapter, type StoredFile } from './types';

/**
 * Google Drive.
 *
 * Ventaja frente al almacenamiento de objetos: la docente puede abrir la
 * carpeta del estudiante y ver sus actas sin pasar por la aplicación, y
 * compartirlas con dirección con dos clics.
 *
 * Las carpetas se crean por demanda, nivel a nivel: la primera reunión de un
 * estudiante crea su carpeta y las siguientes la reutilizan.
 */

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
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
  });

  if (!created.data.id) throw integracionFallida('Google Drive');
  return created.data.id;
}

async function ensurePath(segments: string[], rootId: string): Promise<string> {
  let parent = rootId;
  for (const segment of segments) parent = await ensureFolder(segment, parent);
  return parent;
}

async function upload(
  name: string,
  mimeType: string,
  body: Buffer | string,
  folderId: string,
): Promise<string> {
  const { data } = await driveApi().files.create({
    requestBody: { name, parents: [folderId], mimeType },
    media: { mimeType, body: Readable.from([body]) },
    fields: 'id',
  });
  if (!data.id) throw integracionFallida('Google Drive');
  return data.id;
}

export const driveAdapter: StorageAdapter = {
  name: 'drive',

  async putMinutes(meeting: Meeting, documentCode: string, pdf: Buffer): Promise<StoredFile> {
    if (!driveRootFolderId) throw sinConfigurar('GOOGLE_DRIVE_ROOT_FOLDER_ID');
    const path = minutesPath(meeting);

    try {
      // El primer segmento («ACTA PRO») es la carpeta raíz configurada, y el
      // último es el nombre del archivo.
      const folderId = await ensurePath(path.split('/').slice(1, -1), driveRootFolderId);
      const id = await upload(`${documentCode}.pdf`, 'application/pdf', pdf, folderId);
      return { id, path };
    } catch (error) {
      throw integracionFallida('Google Drive', error);
    }
  },

  async putTranscript(meeting: Meeting, text: string): Promise<StoredFile> {
    if (!driveTranscriptFolderId) throw sinConfigurar('GOOGLE_DRIVE_TRANSCRIPT_FOLDER_ID');

    try {
      const id = await upload(
        `${meeting.meeting_id} - transcripción.txt`,
        'text/plain',
        text,
        driveTranscriptFolderId,
      );
      return { id, path: transcriptPath(meeting) };
    } catch (error) {
      throw integracionFallida('Google Drive', error);
    }
  },

  async linkTo(fileId: string): Promise<string | null> {
    // Drive sí ofrece enlace directo: la docente puede abrirlo desde su cuenta.
    return `https://drive.google.com/file/d/${fileId}/view`;
  },
};
