import 'server-only';
import { sinConfigurar } from '@/services/errors';
import { memoryRepositories } from './memory.repository';
import type { Repositories } from './types';

export type { Repositories } from './types';

export type PersistenceDriver = 'memory' | 'postgres';

export const persistenceDriver: PersistenceDriver =
  process.env.ACTA_PRO_PERSISTENCE === 'postgres' ? 'postgres' : 'memory';

/**
 * Selector de persistencia.
 *
 * `memory` funciona hoy de principio a fin y es con lo que se desarrolla y se
 * demuestra. `postgres` es el destino de producción: el esquema está definido
 * en `db/schema.sql`, pero el adaptador todavía no está escrito, y prefiero que
 * eso falle en voz alta al arrancar antes que fingir que existe.
 */
export function getRepositories(): Repositories {
  if (persistenceDriver === 'postgres') {
    throw sinConfigurar(
      'el adaptador de PostgreSQL, que aún no está implementado. El esquema está en db/schema.sql. ' +
        'Usa ACTA_PRO_PERSISTENCE=memory mientras tanto',
    );
  }
  return memoryRepositories;
}

export function describePersistence(): string {
  return persistenceDriver === 'memory'
    ? 'En memoria: el estado se pierde al reiniciar el servidor.'
    : 'PostgreSQL';
}
