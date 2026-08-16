import 'server-only';
import { getDb } from './db';
import { memoryRepositories } from './memory.repository';
import { createPostgresRepositories } from './postgres.repository';
import type { Repositories } from './types';

const postgresRepositories = createPostgresRepositories(getDb);

export type { Repositories } from './types';

export type PersistenceDriver = 'memory' | 'postgres';

export const persistenceDriver: PersistenceDriver =
  process.env.ACTA_PRO_PERSISTENCE === 'postgres' ? 'postgres' : 'memory';

/**
 * Selector de persistencia.
 *
 * `memory` funciona de principio a fin y es con lo que se desarrolla y se
 * demuestra, pero el estado muere al reiniciar. `postgres` es el destino de
 * producción; el esquema está en `db/schema.sql`.
 */
export function getRepositories(): Repositories {
  return persistenceDriver === 'postgres' ? postgresRepositories : memoryRepositories;
}

export function describePersistence(): string {
  return persistenceDriver === 'memory'
    ? 'En memoria: el estado se pierde al reiniciar el servidor.'
    : 'PostgreSQL';
}
