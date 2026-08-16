import 'server-only';
import { storageDriver } from '../config';
import { driveAdapter } from './drive.adapter';
import { s3Adapter } from './s3.adapter';
import type { StorageAdapter } from './types';

export * from './types';

/**
 * Destino de los archivos, elegido por configuración.
 *
 * `ACTA_PRO_STORAGE=drive` (por defecto) o `=s3`. La diferencia que nota la
 * docente: con Drive puede abrir la carpeta del estudiante por su cuenta; con
 * S3 todo pasa por la pantalla de repositorio de la aplicación.
 */
export function getStorage(): StorageAdapter {
  return storageDriver === 's3' ? s3Adapter : driveAdapter;
}

export function describeStorage(): string {
  return storageDriver === 's3'
    ? 'Almacenamiento de objetos: el acceso se sirve desde la aplicación.'
    : 'Google Drive: la carpeta del estudiante es accesible directamente.';
}
