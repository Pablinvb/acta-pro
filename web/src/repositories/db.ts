import 'server-only';

/**
 * Acceso mínimo a la base de datos.
 *
 * Es deliberadamente pequeño: lo justo para ejecutar SQL con parámetros. Eso
 * permite respaldarlo con `pg` en producción y con PGlite —PostgreSQL real
 * compilado a WASM— en las pruebas, y por tanto **verificar el SQL de verdad**
 * sin levantar un servidor.
 *
 * No es un ORM ni pretende serlo. Las consultas se escriben a mano, con
 * parámetros posicionales; nunca se interpola nada en la cadena SQL.
 */
export interface Db {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}

let pool: Db | null = null;

/** Conexión de producción. Se crea al primer uso. */
export async function getDb(): Promise<Db> {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Falta DATABASE_URL para usar PostgreSQL.');
  }

  // Importación diferida: quien use el adaptador en memoria no carga `pg`.
  const { Pool } = await import('pg');
  const pg = new Pool({
    connectionString,
    // Los certificados gestionados de la mayoría de proveedores no verifican
    // contra la cadena del sistema.
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
  });

  pool = pg as unknown as Db;
  return pool;
}

/** Permite inyectar otra base — PGlite en las pruebas. */
export function setDb(db: Db | null): void {
  pool = db;
}
