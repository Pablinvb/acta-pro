/**
 * Alta de docentes y asignación de contraseñas.
 *
 *   npm --prefix web run usuarios                        lista el claustro
 *   npm --prefix web run usuarios -- alta T-045 "Ana Pérez" ana@colegio.edu.ec
 *   npm --prefix web run usuarios -- clave T-045         genera una nueva
 *
 * La contraseña se genera aquí y **se imprime una sola vez**: no se guarda en
 * claro en ningún sitio, así que si se pierde hay que generar otra. Es
 * deliberado —una contraseña recuperable es una contraseña que alguien puede
 * recuperar— y también lo es que la genere la máquina: elegidas a mano acaban
 * siendo el nombre del colegio y el año.
 *
 * Entregarla es cosa tuya, y en persona o por un canal que no sea el correo del
 * propio sistema.
 */

import { createPostgresRepositories } from '../src/repositories/postgres.repository.ts';
import type { Db } from '../src/repositories/db.ts';
import { hashPassword } from '../src/lib/auth.ts';
import { cargarEnv } from './env.mts';

await cargarEnv(new URL('../.env.local', import.meta.url));

/* ── Repositorio ─────────────────────────────────────────────────────────── */

/*
 * Sólo contra PostgreSQL. Con persistencia en memoria las cuentas se crearían
 * en un proceso que muere al reiniciar, así que el comando parecería funcionar
 * y al día siguiente nadie podría entrar.
 */
if (process.env.ACTA_PRO_PERSISTENCE !== 'postgres') {
  console.error(`
Las cuentas necesitan una base de datos de verdad.

En memoria se crearían dentro del proceso y desaparecerían al reiniciar, así
que este comando parecería funcionar y mañana nadie podría entrar.

Pon ACTA_PRO_PERSISTENCE=postgres y DATABASE_URL en web/.env.local.
`);
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('\nFalta DATABASE_URL en web/.env.local.\n');
  process.exit(1);
}

const { Pool } = await import('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  max: 2,
});
const cerrar = async () => {
  await pool.end();
};
const repos = createPostgresRepositories(async () => pool as unknown as Db);

/**
 * Contraseña legible pero no adivinable.
 *
 * Sin caracteres que se confunden al dictarla —l/1, O/0— porque va a viajar en
 * voz alta o en un papel, y una contraseña mal copiada acaba en «no puedo
 * entrar» y en que alguien la apunte en un pósit.
 */
function generarClave(): string {
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(new ArrayBuffer(18));
  crypto.getRandomValues(bytes);
  const cuerpo = [...bytes].map((b) => alfabeto[b % alfabeto.length]).join('');
  // En grupos de seis: se dicta y se teclea sin perderse.
  return (cuerpo.match(/.{1,6}/g) ?? []).join('-');
}

/* ── Acciones ────────────────────────────────────────────────────────────── */

const accion = process.argv[2] ?? 'lista';

try {
  if (accion === 'lista') {
    const claustro = await repos.teachers.list();
    if (claustro.length === 0) {
      console.log('No hay ninguna cuenta todavía.');
      console.log('Crea la primera:  npm --prefix web run usuarios -- alta T-045 "Ana Pérez" correo\n');
    } else {
      console.log(`\n${claustro.length} cuenta(s):\n`);
      for (const t of claustro) {
        // Se vuelve a leer para saber si tiene clave: `list` no devuelve la huella.
        const cuenta = await repos.teachers.find(t.teacher_id);
        const estado = cuenta?.password_hash ? 'con contraseña' : '⚠ SIN CONTRASEÑA';
        console.log(`  ${t.teacher_id.padEnd(10)} ${t.name.padEnd(28)} ${estado}`);
        if (t.email) console.log(`  ${''.padEnd(10)} ${t.email}`);
      }
      console.log();
    }
  } else if (accion === 'alta') {
    const [, , , teacherId, name, email, position] = process.argv;
    if (!teacherId || !name) {
      console.error('\nUso:  usuarios -- alta T-045 "Ana Pérez" correo@colegio.edu.ec "Docente"\n');
      process.exit(1);
    }

    await repos.teachers.upsert({
      teacher_id: teacherId,
      name,
      email: email || undefined,
      position: position || undefined,
    });

    const clave = generarClave();
    await repos.teachers.setPasswordHash(teacherId, await hashPassword(clave));

    console.log(`\n✓ Cuenta ${teacherId} — ${name}\n`);
    console.log(`  usuario:     ${teacherId}`);
    console.log(`  contraseña:  ${clave}\n`);
    console.log('  Se muestra UNA sola vez. Entrégala en persona; si se pierde, genera otra.\n');
  } else if (accion === 'clave') {
    const teacherId = process.argv[3];
    if (!teacherId) {
      console.error('\nUso:  usuarios -- clave T-045\n');
      process.exit(1);
    }

    const cuenta = await repos.teachers.find(teacherId);
    if (!cuenta) {
      console.error(`\nNo existe la cuenta ${teacherId}. Créala con «alta».\n`);
      process.exit(1);
    }

    const clave = generarClave();
    await repos.teachers.setPasswordHash(cuenta.teacher_id, await hashPassword(clave));

    console.log(`\n✓ Nueva contraseña para ${cuenta.teacher_id} — ${cuenta.name}\n`);
    console.log(`  contraseña:  ${clave}\n`);
    console.log('  La anterior deja de funcionar. Se muestra UNA sola vez.\n');
  } else {
    console.error(`
Uso:
  npm --prefix web run usuarios                          lista el claustro
  npm --prefix web run usuarios -- alta ID "Nombre" correo ["Cargo"]
  npm --prefix web run usuarios -- clave ID              genera una nueva
`);
    process.exitCode = 1;
  }
} finally {
  await cerrar();
}
