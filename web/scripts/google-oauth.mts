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

  /* Qué permisos trae el token de verdad. Es la comprobación que de verdad
     diagnostica: si algo falla luego, aquí se ve si es por falta de permiso
     o por otra cosa. */
  const info = (await (
    await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${t.access_token}`)
  ).json()) as { scope?: string };
  const otorgados = (info.scope ?? '').split(' ').filter(Boolean);
  const faltan = SCOPES.filter((s) => !otorgados.includes(s));

  console.log('\n  Permisos del token:');
  for (const s of SCOPES) {
    const corto = s.replace('https://www.googleapis.com/auth/', '');
    console.log(`    ${otorgados.includes(s) ? '✓' : '✗ FALTA'}  ${corto}`);
  }
  if (faltan.length > 0) {
    console.error('\n✗ Faltan permisos. Repite `google:url` y concede los tres.\n');
    process.exit(1);
  }

  /*
   * Cada prueba usa un endpoint que el permiso concedido cubre, y ni uno más.
   *
   * Importa el detalle: `calendar.events` NO permite listar los calendarios de
   * la cuenta, y `gmail.send` NO permite leer el perfil del buzón. Probar con
   * esos endpoints devuelve 403 aunque todo esté bien configurado —parece un
   * fallo y no lo es—. Pedir permisos más amplios solo para que la prueba pase
   * sería exactamente al revés de lo que interesa aquí.
   */
  console.log('\n  Acceso real:');
  const pruebas: Array<[string, string]> = [
    ['Calendar', 'https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=1&fields=kind'],
    ['Drive', 'https://www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id)'],
  ];

  let fallos = 0;
  for (const [nombre, url] of pruebas) {
    const r = await fetch(url, { headers: auth });
    if (r.ok) {
      console.log(`    ✓ ${nombre}`);
    } else {
      fallos++;
      const detalle = await r.text();
      console.log(`    ✗ ${nombre} (${r.status})`);
      console.log(`        ${detalle.slice(0, 160)}`);
    }
  }

  /* Gmail no tiene forma de comprobarse sin enviar: `gmail.send` no da acceso
     de lectura a nada. Se queda en que el permiso está concedido. */
  console.log('    · Gmail: permiso concedido (solo se confirma al enviar un acta)');

  /* Las dos carpetas de Drive son configuración aparte del OAuth, pero sin
     ellas el archivado falla igual, así que se avisa aquí. */
  const carpetas: Array<[string, string | undefined]> = [
    ['GOOGLE_DRIVE_ROOT_FOLDER_ID', process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID],
    ['GOOGLE_DRIVE_TRANSCRIPT_FOLDER_ID', process.env.GOOGLE_DRIVE_TRANSCRIPT_FOLDER_ID],
  ];
  const sinCarpeta = carpetas.filter(([, v]) => !v);
  if (sinCarpeta.length > 0) {
    console.log('\n  ⚠ Faltan carpetas de Drive en .env.local:');
    for (const [n] of sinCarpeta) console.log(`      ${n}`);
    console.log('    Créalas con:  npm --prefix web run google:folders');
  }

  console.log(
    fallos === 0
      ? '\n✓ Google configurado.\n'
      : `\n✗ ${fallos} servicio(s) sin acceso.\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

/* ── 4 · Las dos carpetas de Drive ───────────────────────────────────────── */

/**
 * El acta y la transcripción van a carpetas SEPARADAS, y esto es una decisión
 * de fondo, no de orden.
 *
 * El acta es el documento que las dos partes firmaron y que ambas pueden ver.
 * La transcripción es todo lo que se dijo: frases a medias, rectificaciones,
 * comentarios sobre otros estudiantes. Si acaban en la misma carpeta, cualquier
 * permiso concedido sobre una alcanza a la otra, y compartir el acta con la
 * familia acabaría exponiendo la conversación entera.
 */
if (accion === 'folders') {
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    console.error('\nFaltan las credenciales de Google en web/.env.local.\n');
    process.exit(1);
  }

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
  const t = (await tok.json()) as { access_token?: string; error?: string };
  if (!t.access_token) {
    console.error(`\n✗ No se pudo renovar el token: ${t.error}\n`);
    process.exit(1);
  }
  const auth = { Authorization: `Bearer ${t.access_token}`, 'Content-Type': 'application/json' };
  const CARPETA = 'application/vnd.google-apps.folder';

  /**
   * Reutiliza la carpeta si ya existe, para que ejecutar esto dos veces no
   * deje carpetas duplicadas y actas repartidas entre ellas.
   *
   * Con `drive.file` la búsqueda solo ve lo que creó esta misma aplicación, así
   * que no puede tropezar con una carpeta del centro que se llame igual.
   */
  async function asegurar(nombre: string): Promise<{ id: string; nueva: boolean }> {
    const q = encodeURIComponent(
      `name='${nombre.replace(/'/g, "\\'")}' and mimeType='${CARPETA}' and trashed=false`,
    );
    const buscar = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=1&fields=files(id)`,
      { headers: auth },
    );
    const encontrado = (await buscar.json()) as { files?: Array<{ id: string }> };
    const ya = encontrado.files?.[0]?.id;
    if (ya) return { id: ya, nueva: false };

    const crear = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ name: nombre, mimeType: CARPETA }),
    });
    if (!crear.ok) {
      console.error(`\n✗ No se pudo crear «${nombre}» (${crear.status})`);
      console.error(`  ${(await crear.text()).slice(0, 200)}\n`);
      process.exit(1);
    }
    return { id: ((await crear.json()) as { id: string }).id, nueva: true };
  }

  const raiz = await asegurar('ACTA PRO');
  const transcripciones = await asegurar('ACTA PRO — Transcripciones');

  console.log('\n  ' + (raiz.nueva ? 'creada  ' : 'ya existía  ') + 'ACTA PRO');
  console.log('  ' + (transcripciones.nueva ? 'creada  ' : 'ya existía  ') + 'ACTA PRO — Transcripciones');
  console.log('\nPega estas dos líneas en web/.env.local:\n');
  console.log(`GOOGLE_DRIVE_ROOT_FOLDER_ID=${raiz.id}`);
  console.log(`GOOGLE_DRIVE_TRANSCRIPT_FOLDER_ID=${transcripciones.id}\n`);
  console.log('Las carpetas nacen privadas: solo las ve la cuenta que autorizó.');
  console.log('Comparte «ACTA PRO» con quien deba verlo; la de transcripciones, con nadie.\n');
  process.exit(0);
}

console.error(`
Uso:
  npm --prefix web run google:url                  imprime el enlace de autorización
  npm --prefix web run google:token -- EL_CODIGO   canjea el código por el refresh token
  npm --prefix web run google:check                comprueba permisos, Calendar y Drive
  npm --prefix web run google:folders              crea las dos carpetas de Drive
`);
process.exit(1);
