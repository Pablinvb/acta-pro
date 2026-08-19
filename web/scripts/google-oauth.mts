/**
 * Ayudante para obtener el refresh token de Google.
 *
 * Conseguirlo es la parte donde todo el mundo se atasca: hay que construir una
 * URL con los permisos exactos, autorizar en el navegador, capturar un código
 * que caduca en minutos y canjearlo. Este script hace las dos partes mecánicas.
 *
 *   1) npm --prefix web run google:url
 *      Imprime el enlace. Lo abres, autorizas y Google te devuelve un código.
 *
 *   2) npm --prefix web run google:token -- EL_CODIGO
 *      Canjea el código y te da el refresh token para .env.local.
 *
 *   3) npm --prefix web run google:check
 *      Comprueba que el token funciona contra Calendar, Drive y Gmail.
 *
 * Ni el código ni el token se guardan en ningún sitio: se imprimen para que los
 * pegues tú en .env.local, que está fuera de git.
 */

import { readFile } from 'node:fs/promises';

/**
 * Los tres permisos, y ni uno más.
 *
 * `drive.file` en lugar de `drive`: da acceso únicamente a los archivos que
 * crea esta aplicación, no a todo el Drive del centro. Si algún día alguien
 * roba estas credenciales, no puede leer nada que ACTA PRO no haya escrito.
 */
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/gmail.send',
];

/**
 * Google exige que el redirect coincida con el configurado en la consola.
 * `localhost` es el que se usa para aplicaciones de escritorio y el que menos
 * pasos pide: no hace falta publicar nada.
 */
const REDIRECT = 'http://localhost:3000/oauth2callback';

try {
  const env = await readFile(new URL('../.env.local', import.meta.url), 'utf8');
  for (const l of env.split('\n')) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {
  /* sin .env.local */
}

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const accion = process.argv[2];

function faltanCredenciales(): never {
  console.error(`
Faltan GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET en web/.env.local.

Para conseguirlas:
  1. https://console.cloud.google.com  →  crea un proyecto
  2. APIs y servicios → Biblioteca → activa las tres:
       Google Calendar API · Google Drive API · Gmail API
  3. Pantalla de consentimiento OAuth → tipo Externo → añade tu correo
     como usuario de prueba
  4. Credenciales → Crear credenciales → ID de cliente OAuth
       Tipo: Aplicación web
       URI de redirección autorizado:  ${REDIRECT}
  5. Copia el ID y el secreto a web/.env.local
`);
  process.exit(1);
}

/* ── 1 · El enlace de autorización ───────────────────────────────────────── */

if (accion === 'url') {
  if (!clientId || !clientSecret) faltanCredenciales();

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', REDIRECT);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPES.join(' '));
  // `offline` es lo que hace que Google entregue un refresh token; sin esto
  // solo da uno de acceso que caduca en una hora.
  url.searchParams.set('access_type', 'offline');
  // Fuerza la pantalla de permisos aunque ya hayas autorizado antes: si no,
  // Google no vuelve a mandar el refresh token y parece que algo falla.
  url.searchParams.set('prompt', 'consent');

  console.log(`
Abre este enlace y autoriza con la cuenta institucional:

${url}

Google te llevará a una página que no carga —es normal, no hay servidor ahí—.
Copia de la barra de direcciones lo que va después de «code=» y antes de «&»:

  ${REDIRECT}?code=ESTO_ES_LO_QUE_NECESITAS&scope=...

Y ejecuta:

  npm --prefix web run google:token -- EL_CODIGO

El código caduca en pocos minutos, así que hazlo seguido.
`);
  process.exit(0);
}

/* ── 2 · El canje ────────────────────────────────────────────────────────── */

if (accion === 'token') {
  if (!clientId || !clientSecret) faltanCredenciales();

  const codigo = process.argv[3];
  if (!codigo) {
    console.error('\nFalta el código.\n  npm --prefix web run google:token -- EL_CODIGO\n');
    process.exit(1);
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: decodeURIComponent(codigo),
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT,
      grant_type: 'authorization_code',
    }),
  });

  const body = (await res.json()) as {
    refresh_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  if (!res.ok) {
    console.error(`\n✗ Google rechazó el código (${res.status}): ${body.error}`);
    console.error(`  ${body.error_description ?? ''}`);
    if (body.error === 'invalid_grant') {
      console.error('\n  Casi siempre es una de dos: el código ya caducó, o ya se usó una vez.');
      console.error('  Vuelve a ejecutar `google:url` y repite con un código nuevo.\n');
    }
    process.exit(1);
  }

  if (!body.refresh_token) {
    console.error(`
✗ Google no devolvió refresh token.

Pasa cuando ya habías autorizado antes: Google solo lo entrega la primera vez.
Revoca el acceso en https://myaccount.google.com/permissions y repite.
`);
    process.exit(1);
  }

  const otorgados = (body.scope ?? '').split(' ');
  const faltan = SCOPES.filter((s) => !otorgados.includes(s));

  console.log('\n✓ Refresh token obtenido. Pégalo en web/.env.local:\n');
  console.log(`GOOGLE_REFRESH_TOKEN=${body.refresh_token}\n`);

  if (faltan.length > 0) {
    console.log('⚠ Faltan permisos, así que algo no funcionará:');
    for (const s of faltan) console.log(`    ${s}`);
    console.log('  Repite la autorización marcando las tres casillas.\n');
  } else {
    console.log('✓ Los tres permisos concedidos: Calendar, Drive y Gmail.\n');
    console.log('Comprueba que funciona con:  npm --prefix web run google:check\n');
  }
  process.exit(0);
}

/* ── 3 · La comprobación ─────────────────────────────────────────────────── */

if (accion === 'check') {
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    console.error('\nFaltan las credenciales de Google en web/.env.local.\n');
    process.exit(1);
  }

  process.stdout.write('Renovando el token de acceso… ');
  const tok = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const t = (await tok.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!tok.ok || !t.access_token) {
    console.log('✗');
    console.error(`  ${t.error}: ${t.error_description ?? ''}\n`);
    process.exit(1);
  }
  console.log('✓');

  const auth = { Authorization: `Bearer ${t.access_token}` };
  const pruebas: Array<[string, string]> = [
    ['Calendar', 'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1'],
    ['Drive', 'https://www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id)'],
    ['Gmail', 'https://gmail.googleapis.com/gmail/v1/users/me/profile'],
  ];

  let fallos = 0;
  for (const [nombre, url] of pruebas) {
    const r = await fetch(url, { headers: auth });
    if (r.ok) {
      console.log(`  ✓ ${nombre}`);
    } else {
      fallos++;
      const detalle = await r.text();
      console.log(`  ✗ ${nombre} (${r.status})`);
      console.log(`      ${detalle.slice(0, 160)}`);
    }
  }

  console.log(
    fallos === 0
      ? '\n✓ Google configurado. Ya puedes archivar en Drive y enviar el acta por correo.\n'
      : `\n✗ ${fallos} servicio(s) sin acceso. Revisa que las tres APIs estén activadas y los tres permisos concedidos.\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

console.error(`
Uso:
  npm --prefix web run google:url                  imprime el enlace de autorización
  npm --prefix web run google:token -- EL_CODIGO   canjea el código por el refresh token
  npm --prefix web run google:check                comprueba Calendar, Drive y Gmail
`);
process.exit(1);
