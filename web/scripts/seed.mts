/**
 * Carga los datos de demostración en la base configurada.
 *
 * Con persistencia en memoria, esos datos se cargan solos al arrancar. Con una
 * base de verdad, no: la base nace vacía y la aplicación no enseña nada, lo
 * cual parece una avería y no lo es.
 *
 *   npm --prefix web run db:seed
 *
 * Es idempotente: se puede ejecutar las veces que haga falta. Escribe con los
 * mismos métodos que usa la aplicación —nada de INSERT a mano— para que si un
 * repositorio se rompe, esto se rompa también en lugar de disimularlo.
 *
 * Los datos son ficticios y están en `docs/DATOS_DE_PRUEBA.md`. Ninguna persona
 * aquí es real.
 */

import { createPostgresRepositories } from '../src/repositories/postgres.repository.ts';
import type { Db } from '../src/repositories/db.ts';
import * as demo from '../src/lib/mock/data.ts';
import { cargarEnv } from './env.mts';

await cargarEnv(new URL('../.env.local', import.meta.url));

if (process.env.ACTA_PRO_PERSISTENCE !== 'postgres') {
  console.error(`
Esto sólo tiene sentido con ACTA_PRO_PERSISTENCE=postgres.

En memoria los datos de demostración se cargan solos al arrancar.
`);
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('\nFalta DATABASE_URL en web/.env.local.\n');
  process.exit(1);
}

const { Pool } = await import('pg');
const pool = new Pool({
  connectionString,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  max: Number(process.env.DATABASE_POOL_MAX ?? 5),
});

const repos = createPostgresRepositories(async () => pool as unknown as Db);

console.log('\nACTA PRO · datos de demostración\n');

let escritos = 0;
const paso = async (que: string, hacer: () => Promise<unknown>) => {
  try {
    await hacer();
    escritos++;
    console.log(`  ✓ ${que}`);
  } catch (error) {
    console.log(`  ✗ ${que}\n      ${(error as Error).message}`);
    process.exitCode = 1;
  }
};

try {
  /*
   * El orden importa: una reunión referencia a su docente y a su estudiante, y
   * `upsert` los crea de paso. Las reuniones previas van antes que las de hoy
   * para que el historial tenga de dónde tirar.
   */
  for (const m of [...demo.previousMeetings, ...demo.meetings]) {
    await paso(`reunión ${m.meeting_id} · ${m.student_name}`, () => repos.meetings.upsert(m));
  }

  for (const a of demo.previousMinutes) {
    await paso(`acta anterior ${a.document_code}`, () => repos.minutes.save(a));
  }

  await paso(`acta ${demo.minutes.document_code}`, () => repos.minutes.save(demo.minutes));

  await paso('revisión de lenguaje', () =>
    repos.minutes.saveLanguageReview(demo.ACTIVE_MEETING_ID, demo.languageFindings),
  );

  await paso(`transcripción (${demo.transcript.length} intervenciones)`, () =>
    repos.transcripts.replaceAll(demo.ACTIVE_MEETING_ID, demo.transcript),
  );

  for (const d of demo.previousDocuments) {
    await paso(`documento archivado ${d.document_code}`, () => repos.documents.save(d));
  }

  for (const f of [demo.followUp, ...demo.previousFollowUps]) {
    await paso(`seguimiento ${f.meeting_id} · ${f.date}`, () => repos.followUps.save(f));
  }

  console.log(`\n${escritos} registros escritos.`);
  console.log('Vuelve a ejecutarlo cuando quieras: es idempotente.\n');
} finally {
  await pool.end();
}
