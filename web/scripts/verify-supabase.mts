/**
 * Comprobación de la base de datos alojada.
 *
 * `verify:db` prueba el esquema y el adaptador contra PostgreSQL real, pero en
 * memoria (PGlite). Eso no cubre lo que sólo falla contra un servidor de
 * verdad: la contraseña, el TLS, la latencia, el límite de conexiones del
 * pooler y si el esquema está realmente aplicado.
 *
 *   npm --prefix web run verify:supabase
 *
 * No escribe nada que no borre después, salvo el esquema, que no toca.
 */

import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { cargarEnv } from './env.mts';

const { duplicadas } = await cargarEnv(new URL('../.env.local', import.meta.url));

const url = process.env.DATABASE_URL ?? '';

let ok = 0;
let fallos = 0;
function check(descripcion: string, condicion: boolean, detalle: unknown = '') {
  if (condicion) {
    ok++;
    console.log(`  ✓ ${descripcion}`);
  } else {
    fallos++;
    console.log(`  ✗ ${descripcion}${detalle ? `\n      ${JSON.stringify(detalle)}` : ''}`);
  }
}

console.log('\nACTA PRO · base de datos alojada\n');

/* ── Antes de tocar la red ───────────────────────────────────────────────── */

if (!url) {
  console.error('Falta DATABASE_URL en web/.env.local.\n');
  process.exit(1);
}

/*
 * El error más común, y el más desconcertante: copiar la cadena del panel de
 * Supabase sin sustituir el marcador de la contraseña. El fallo que produce es
 * un «authentication failed» que parece de credenciales mal puestas, no de un
 * texto sin rellenar.
 */
if (/\[YOUR-PASSWORD\]|\[TU-CONTRASE|<password>|\[password\]/i.test(url)) {
  console.error(`✗ La cadena de conexión conserva el marcador de la contraseña.

  Sustituye «[YOUR-PASSWORD]» en DATABASE_URL por la contraseña real de la base.
  Está en Supabase → Project Settings → Database → Database password.
  Si no la recuerdas, ahí mismo se puede generar una nueva.

  La contraseña va en web/.env.local, que está fuera de git.
`);
  process.exit(1);
}

/*
 * Una clave repetida en `.env.local` es el fallo más traicionero que hay aquí:
 * la aplicación se queda con la última y no avisa. Ya pasó con
 * ACTA_PRO_PERSISTENCE —`postgres` arriba, `memory` al final— y el resultado
 * fue una base perfectamente conectada que no guardaba nada.
 */
console.log('Configuración');
check(
  'ninguna variable está definida dos veces en .env.local',
  duplicadas.length === 0,
  duplicadas.length > 0 ? { duplicadas } : '',
);
if (duplicadas.length > 0) {
  console.log('      Sólo vale la ÚLTIMA aparición. Deja una sola de cada.');
}

const puerto = url.match(/:(\d+)\//)?.[1];
console.log('\nCadena de conexión');
check('lleva contraseña', !/:@|:\[/.test(url));
check(
  `usa el pooler (puerto 6543) y no la conexión directa`,
  puerto === '6543',
  `puerto ${puerto ?? '(ninguno)'}`,
);
if (puerto !== '6543') {
  console.log('      Con el puerto 5432 las conexiones se agotan en despliegues serverless.');
}
check('exige TLS', process.env.DATABASE_SSL !== 'false');
check('el modo de persistencia es postgres', process.env.ACTA_PRO_PERSISTENCE === 'postgres');

/* ── Contra el servidor ──────────────────────────────────────────────────── */

console.log('\nConexión');

const pool = new Pool({
  connectionString: url,
  ssl: process.env.DATABASE_SSL === 'false' ? undefined : { rejectUnauthorized: false },
  max: Number(process.env.DATABASE_POOL_MAX ?? 5),
  connectionTimeoutMillis: 15000,
});

try {
  const t0 = Date.now();
  const { rows } = await pool.query<{ version: string; now: string }>(
    'SELECT version() AS version, now()::text AS now',
  );
  const ms = Date.now() - t0;
  check(`responde (${ms} ms)`, true);
  console.log(`      ${rows[0].version.split(',')[0]}`);
  console.log(`      hora del servidor: ${rows[0].now}`);

  /* ── El esquema ───────────────────────────────────────────────────────── */

  console.log('\nEsquema');

  const tablas = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name`,
  );
  const nombres = tablas.rows.map((r) => r.table_name);

  /*
   * La lista se saca de `schema.sql`, no se escribe a mano. Escrita a mano ya
   * falló una vez —decía `audit_log` donde el esquema crea `audit_logs`— y un
   * verificador que da una falsa alarma enseña a ignorar sus avisos, que es
   * exactamente lo contrario de para lo que existe.
   */
  const esquema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
  const necesarias = [...esquema.matchAll(/CREATE TABLE (\w+)/g)].map((m) => m[1]);
  const faltan = necesarias.filter((t) => !nombres.includes(t));

  check(
    `están las ${necesarias.length} tablas del esquema`,
    faltan.length === 0,
    faltan.length > 0 ? { faltan } : '',
  );
  if (faltan.length > 0) {
    console.log('      Aplica el esquema:  psql "$DATABASE_URL" -f web/db/schema.sql');
    console.log('      O pégalo en Supabase → SQL Editor → Run.');
  }

  check('existe la vista meetings_read', nombres.includes('meetings_read'));

  /*
   * Columnas añadidas después del esquema inicial. Si la base se creó con una
   * versión anterior, las tablas estarían pero el acta saldría sin datos de la
   * docente y sin sello, sin que nada fallara de forma visible.
   */
  const columnas = await pool.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (table_name, column_name) IN
            (('teachers','phone'), ('teachers','position'), ('meetings','place'),
             ('signatures','content_hash'), ('signatures','tsa_token'),
             ('signatures','tsa_gen_time'))`,
  );
  check(
    'están las columnas del acta institucional y de los sellos',
    columnas.rowCount === 6,
    `encontradas ${columnas.rowCount} de 6`,
  );
  if ((columnas.rowCount ?? 0) < 6) {
    console.log('      El esquema es de una versión anterior. Vuelve a aplicar schema.sql.');
  }

  /* ── Escritura y borrado ──────────────────────────────────────────────── */

  console.log('\nEscritura');

  const id = `PRUEBA-CONEXION-${Date.now()}`;
  await pool.query(
    `INSERT INTO teachers (teacher_id, name, email) VALUES ($1, $2, $3)`,
    [id, 'Prueba de conexión', `${id}@prueba.local`],
  );
  const leido = await pool.query(`SELECT name FROM teachers WHERE teacher_id = $1`, [id]);
  check('escribe y vuelve a leer', leido.rows[0]?.name === 'Prueba de conexión');

  // Se limpia: esta fila no es un dato del centro y no debe quedarse.
  await pool.query(`DELETE FROM teachers WHERE teacher_id = $1`, [id]);
  const tras = await pool.query(`SELECT 1 FROM teachers WHERE teacher_id = $1`, [id]);
  check('la fila de prueba queda limpia', tras.rowCount === 0);

  /* ── Concurrencia ─────────────────────────────────────────────────────── */

  console.log('\nConcurrencia');
  const t1 = Date.now();
  await Promise.all(Array.from({ length: 5 }, () => pool.query('SELECT 1')));
  check(`5 consultas a la vez sin agotar el pool (${Date.now() - t1} ms)`, true);
} catch (error) {
  const e = error as Error & { code?: string };
  check('responde', false, e.message);

  if (/password authentication failed|SASL/i.test(e.message)) {
    console.log('\n  La contraseña de DATABASE_URL no es correcta.');
    console.log('  Supabase → Project Settings → Database → Database password.');
  } else if (e.code === 'ENOTFOUND' || /getaddrinfo/i.test(e.message)) {
    console.log('\n  No se resuelve el servidor. Revisa la región en la cadena de conexión.');
  } else if (/relation .* does not exist/i.test(e.message)) {
    console.log('\n  Falta aplicar el esquema:  psql "$DATABASE_URL" -f web/db/schema.sql');
  } else if (/timeout/i.test(e.message)) {
    console.log('\n  Sin respuesta a tiempo. Puede ser el cortafuegos o el proyecto en pausa.');
  }
} finally {
  await pool.end();
}

console.log(
  fallos === 0
    ? `\n✓ ${ok} comprobaciones correctas. La base está lista.\n`
    : `\n✗ ${ok} correctas, ${fallos} fallidas.\n`,
);
process.exitCode = fallos === 0 ? 0 : 1;
