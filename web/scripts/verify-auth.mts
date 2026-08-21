/**
 * Verificación del acceso: contraseñas y sesión.
 *
 * Es la puerta de entrada a datos de familias reales, así que conviene tenerla
 * probada y no solamente escrita.
 *
 *   npm --prefix web run verify:auth
 */

import {
  hashPassword,
  verifyPassword,
  verifyCredentials,
  signSession,
  verifySession,
  timingSafeEqual,
} from '../src/lib/auth.ts';

let ok = 0;
let fallos = 0;

function comprobar(descripcion: string, condicion: boolean, detalle = '') {
  if (condicion) {
    ok++;
    console.log(`  ✓ ${descripcion}`);
  } else {
    fallos++;
    console.log(`  ✗ ${descripcion}${detalle ? `\n      ${detalle}` : ''}`);
  }
}

console.log('\nACTA PRO · acceso docente\n');

/* ── Contraseñas ─────────────────────────────────────────────────────────── */

console.log('Contraseñas');

const CLAVE = 'CcKsAN-HGktSG-tg8Kgw';
const huella = await hashPassword(CLAVE);

comprobar(
  'la huella lleva algoritmo, iteraciones y sal',
  /^pbkdf2\$sha256\$\d+\$[\w-]+\$[\w-]+$/.test(huella),
  huella,
);
comprobar('la contraseña NO aparece en la huella', !huella.includes(CLAVE));
comprobar('la contraseña correcta verifica', await verifyPassword(CLAVE, huella));
comprobar('una incorrecta no', !(await verifyPassword(CLAVE + 'x', huella)));
comprobar('la cadena vacía tampoco', !(await verifyPassword('', huella)));

comprobar(
  'dos huellas de la MISMA contraseña son distintas',
  (await hashPassword(CLAVE)) !== huella,
  'sin sal por contraseña, dos docentes con la misma clave tendrían la misma huella',
);

comprobar(
  'una huella con menos iteraciones de las razonables se rechaza',
  !(await verifyPassword(CLAVE, 'pbkdf2$sha256$10$AAAA$AAAA')),
);
comprobar('una huella con otro algoritmo se rechaza', !(await verifyPassword(CLAVE, `bcrypt$x$y$z$w`)));
comprobar('una huella con basura no revienta', !(await verifyPassword(CLAVE, 'cualquier cosa')));

/* ── Credenciales ────────────────────────────────────────────────────────── */

console.log('\nCredenciales');

const cuenta = { teacher_id: 'T-045', name: 'Ana Pérez', password_hash: huella };

{
  const r = await verifyCredentials({ teacherId: 'T-045', password: CLAVE }, cuenta);
  comprobar('entra con su contraseña', r.ok);
  comprobar('la sesión lleva su identificador', r.ok && r.session.teacherId === 'T-045');
  comprobar('y caduca', r.ok && r.session.exp > Math.floor(Date.now() / 1000));
}

{
  const r = await verifyCredentials({ teacherId: 'T-045', password: 'otra' }, cuenta);
  comprobar('no entra con otra contraseña', !r.ok && r.reason === 'invalid');
}

{
  const r = await verifyCredentials({ teacherId: 'T-999', password: CLAVE }, null);
  comprobar('una cuenta inexistente no entra', !r.ok && r.reason === 'invalid');
}

{
  // Cuenta creada pero sin clave asignada: no se entra, y se dice por qué.
  const r = await verifyCredentials(
    { teacherId: 'T-099', password: CLAVE },
    { teacher_id: 'T-099', name: 'Carlos Vera' },
  );
  comprobar('una cuenta sin contraseña no entra', !r.ok && r.reason === 'sin_clave');
}

{
  /*
   * Una cuenta inexistente tiene que tardar lo mismo que una real con la
   * contraseña equivocada. Sin eso, medir el tiempo de respuesta revela qué
   * identificadores existen, y con ellos se puede empezar a probar claves.
   */
  const medir = async (fn: () => Promise<unknown>) => {
    const t = Date.now();
    await fn();
    return Date.now() - t;
  };
  const existente = await medir(() =>
    verifyCredentials({ teacherId: 'T-045', password: 'mal' }, cuenta),
  );
  const inexistente = await medir(() =>
    verifyCredentials({ teacherId: 'T-999', password: 'mal' }, null),
  );
  const proporcion = Math.min(existente, inexistente) / Math.max(existente, inexistente, 1);
  comprobar(
    'una cuenta inexistente tarda lo mismo que una real',
    proporcion > 0.4,
    `existente ${existente} ms · inexistente ${inexistente} ms`,
  );
}

/* ── Comparación en tiempo constante ─────────────────────────────────────── */

console.log('\nComparación');
comprobar('iguales', timingSafeEqual('abc', 'abc'));
comprobar('distintas', !timingSafeEqual('abc', 'abd'));
comprobar('longitudes distintas', !timingSafeEqual('abc', 'abcd'));

/* ── Sesión ──────────────────────────────────────────────────────────────── */

console.log('\nSesión');

const sesion = { teacherId: 'T-045', name: 'Ana Pérez', exp: Math.floor(Date.now() / 1000) + 60 };
const token = await signSession(sesion);

comprobar('se firma y se verifica', (await verifySession(token))?.teacherId === 'T-045');

{
  // Se altera la carga útil manteniendo la firma: es el ataque obvio.
  const [carga, firma] = token.split('.');
  const alterada = btoa(JSON.stringify({ ...sesion, teacherId: 'T-099' }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  comprobar(
    'cambiar el identificador invalida la firma',
    (await verifySession(`${alterada}.${firma}`)) === null,
    'sin esto, cualquiera se convierte en cualquier docente editando una cookie',
  );
  void carga;
}

comprobar(
  'una sesión caducada no vale',
  (await signSession({ ...sesion, exp: Math.floor(Date.now() / 1000) - 1 }).then(verifySession)) ===
    null,
);
comprobar('una cookie inventada no vale', (await verifySession('basura.basura')) === null);
comprobar('sin cookie tampoco', (await verifySession(undefined)) === null);

console.log(`\n${ok} comprobaciones correctas, ${fallos} fallidas\n`);
process.exitCode = fallos === 0 ? 0 : 1;
