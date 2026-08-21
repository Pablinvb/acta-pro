/**
 * Pone al día una base que ya existe.
 *
 * `schema.sql` describe la base completa y sirve para crearla de cero. Cuando
 * ya hay datos dentro no se puede volver a ejecutar, así que los cambios
 * posteriores viven aquí.
 *
 *   npm --prefix web run db:migrate
 *
 * Todas las sentencias son **aditivas e idempotentes**: `ADD COLUMN IF NOT
 * EXISTS` y poco más. No hay ni un `DROP` ni un `DELETE`, igual que en el resto
 * del proyecto: lo más destructivo que puede hacer esto es no hacer nada.
 */

import { cargarEnv } from '../scripts/env.mts';

await cargarEnv(new URL('../.env.local', import.meta.url));

if (!process.env.DATABASE_URL) {
  console.error('\nFalta DATABASE_URL en web/.env.local.\n');
  process.exit(1);
}

/** Cada paso, con el motivo por el que existe. */
const PASOS: Array<{ descripcion: string; sql: string }> = [
  {
    descripcion: 'contacto de la docente para el acta institucional',
    sql: `ALTER TABLE teachers
            ADD COLUMN IF NOT EXISTS phone TEXT,
            ADD COLUMN IF NOT EXISTS position TEXT`,
  },
  {
    descripcion: 'contraseña por docente, en lugar de una compartida',
    sql: `ALTER TABLE teachers
            ADD COLUMN IF NOT EXISTS password_hash TEXT,
            ADD COLUMN IF NOT EXISTS password_updated_at TIMESTAMPTZ`,
  },
  {
    descripcion: 'lugar de la reunión',
    sql: `ALTER TABLE meetings ADD COLUMN IF NOT EXISTS place TEXT`,
  },
  {
    descripcion: 'sello de integridad y sello de tiempo de las firmas',
    sql: `ALTER TABLE signatures
            ADD COLUMN IF NOT EXISTS content_hash TEXT,
            ADD COLUMN IF NOT EXISTS tsa_token    TEXT,
            ADD COLUMN IF NOT EXISTS tsa_gen_time TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS tsa_serial   TEXT,
            ADD COLUMN IF NOT EXISTS tsa_policy   TEXT,
            ADD COLUMN IF NOT EXISTS tsa_name     TEXT,
            ADD COLUMN IF NOT EXISTS tsa_url      TEXT`,
  },
  {
    descripcion: 'el correo de la docente deja de ser obligatorio',
    // Era NOT NULL, y para cumplirlo el repositorio inventaba una dirección que
    // acababa impresa en el acta pareciendo auténtica.
    sql: `ALTER TABLE teachers ALTER COLUMN email DROP NOT NULL`,
  },
  {
    descripcion: 'un seguimiento por reunión: se retiran los duplicados',
    // Se conserva el más reciente de cada reunión. No se pierde información: las
    // filas sobrantes son copias creadas al reprocesar la misma reunión.
    sql: `DELETE FROM follow_ups f
           WHERE EXISTS (
             SELECT 1 FROM follow_ups otro
              WHERE otro.meeting_id = f.meeting_id AND otro.id > f.id
           )`,
  },
  {
    descripcion: 'una reunión no puede tener dos seguimientos',
    sql: `DO $$ BEGIN
            ALTER TABLE follow_ups ADD CONSTRAINT follow_ups_meeting_id_key UNIQUE (meeting_id);
          EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
          END $$`,
  },
  {
    descripcion: 'la vista de reuniones expone el contacto de la docente y el lugar',
    // `CREATE OR REPLACE` no admite cambiar las columnas de una vista, así que
    // se retira y se vuelve a crear. Una vista no guarda datos: no se pierde nada.
    sql: `DROP VIEW IF EXISTS meetings_read`,
  },
];

const { Pool } = await import('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  max: 2,
});

console.log('\nACTA PRO · puesta al día de la base\n');

try {
  for (const paso of PASOS) {
    try {
      await pool.query(paso.sql);
      console.log(`  ✓ ${paso.descripcion}`);
    } catch (error) {
      console.log(`  ✗ ${paso.descripcion}\n      ${(error as Error).message}`);
      process.exitCode = 1;
    }
  }

  /*
   * La vista se recrea desde `schema.sql`, para que no haya dos definiciones
   * que puedan separarse con el tiempo.
   */
  const { readFile } = await import('node:fs/promises');
  const esquema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  const vista = esquema.slice(esquema.indexOf('CREATE VIEW meetings_read'));
  const hasta = vista.indexOf(';');
  await pool.query(vista.slice(0, hasta + 1));
  console.log('  ✓ vista meetings_read recreada desde schema.sql');

  console.log('\nListo. Comprueba con:  npm --prefix web run verify:supabase\n');
} finally {
  await pool.end();
}
