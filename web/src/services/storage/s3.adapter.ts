import 'server-only';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Meeting } from '@/lib/types';
import { requireS3 } from '../config';
import { integracionFallida } from '../errors';
import { minutesPath, transcriptPath, type StorageAdapter, type StoredFile } from './types';

/**
 * Almacenamiento de objetos compatible con S3.
 *
 * Cubre AWS S3 y también **Firebase Storage**: los buckets de Firebase son
 * buckets de Google Cloud Storage, y GCS expone una API compatible con S3
 * mediante claves HMAC de interoperabilidad. Basta apuntar `S3_ENDPOINT` a
 * `https://storage.googleapis.com`. Sirve igual para Cloudflare R2 o MinIO.
 *
 * A diferencia de Drive, esto es opaco: nadie «entra» a un bucket. Todo acceso
 * pasa por la aplicación, y por eso `linkTo` devuelve `null` — el acta se sirve
 * desde `/api/reuniones/[id]/acta.pdf`, que comprueba la sesión. Es más
 * trabajo, pero también es control de acceso de verdad: un enlace de Drive
 * compartido por error se queda compartido.
 *
 * El acta y la transcripción usan **prefijos distintos** para poder darles
 * políticas de acceso distintas, que es el motivo de que estén separadas.
 */

let client: S3Client | null = null;

function s3(): S3Client {
  if (client) return client;
  const config = requireS3();
  client = new S3Client({
    region: config.region,
    endpoint: config.endpoint || undefined,
    // Necesario para GCS, R2 y MinIO, que no usan el estilo de host de AWS.
    forcePathStyle: Boolean(config.endpoint),
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  return client;
}

/** Las claves de objeto no admiten cualquier carácter con comodidad. */
function toKey(path: string): string {
  return path
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9/_.-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

async function put(key: string, body: Buffer | string, contentType: string): Promise<void> {
  const config = requireS3();
  try {
    await s3().send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Los datos de un menor no viajan sin cifrado en reposo.
        ServerSideEncryption: config.endpoint ? undefined : 'AES256',
      }),
    );
  } catch (error) {
    throw integracionFallida('El almacenamiento de archivos', error);
  }
}

export const s3Adapter: StorageAdapter = {
  name: 's3',

  async putMinutes(meeting: Meeting, documentCode: string, pdf: Buffer): Promise<StoredFile> {
    const path = minutesPath(meeting);
    const key = `${toKey(path)}/${documentCode}.pdf`;
    await put(key, pdf, 'application/pdf');
    return { id: key, path };
  },

  async putTranscript(meeting: Meeting, text: string): Promise<StoredFile> {
    const path = transcriptPath(meeting);
    const key = `${toKey(path)}/transcripcion.txt`;
    await put(key, text, 'text/plain; charset=utf-8');
    return { id: key, path };
  },

  async linkTo(): Promise<string | null> {
    // Sin enlace directo a propósito: el acceso se sirve desde la aplicación,
    // que es quien sabe si hay sesión válida.
    return null;
  },
};
