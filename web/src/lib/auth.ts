/**
 * Sesión de la docente.
 *
 * Cookie httpOnly con una carga útil firmada con HMAC-SHA256 mediante Web
 * Crypto, de modo que el mismo código sirve en Node y en el runtime Edge del
 * middleware. La firma evita que alguien se fabrique una sesión editando la
 * cookie; no cifra, así que la carga útil no lleva nada sensible: solo el
 * identificador de la docente, su nombre y la caducidad.
 *
 * Cada docente tiene su propia contraseña, guardada como huella PBKDF2 en la
 * tabla `teachers`. No queda ninguna contraseña compartida: el identificador de
 * la sesión es lo que decide qué reuniones se pueden abrir, así que una
 * credencial común equivaldría a que todo el claustro viera los expedientes de
 * todos.
 *
 * Este módulo no importa nada a propósito: usa solo Web Crypto y globals, de
 * modo que el mismo código funciona en Node y en el runtime Edge del proxy.
 */

const COOKIE_NAME = 'acta_pro_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // Una jornada escolar.

export interface Session {
  teacherId: string;
  name: string;
  /** Segundos desde epoch. */
  exp: number;
}

/* ── Configuración ────────────────────────────────────────────────────────── */

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Secreto de desarrollo. Tiene que ser DETERMINISTA, no aleatorio: este módulo
 * se carga en dos runtimes distintos —Node para las páginas y los server
 * actions, Edge para el proxy— y cada uno mantiene su propia instancia. Un
 * valor aleatorio por proceso hace que el proxy no pueda verificar la cookie
 * que acaba de firmar el server action, y la sesión entra en un bucle de
 * redirección al inicio de sesión.
 *
 * Es obviamente inseguro, y por eso en producción se exige AUTH_SECRET.
 */
const DEV_SECRET = 'acta-pro-desarrollo-secreto-no-usar-en-produccion';
let warned = false;

function getSecret(): string {
  const configured = process.env.AUTH_SECRET;
  if (configured && configured.length >= 32) return configured;

  if (isProduction) {
    throw new Error(
      'Falta AUTH_SECRET (mínimo 32 caracteres). Genéralo con: openssl rand -base64 32',
    );
  }

  if (!warned) {
    warned = true;
    console.warn(
      '[acta-pro] AUTH_SECRET no está definido: se usa un secreto de desarrollo conocido. ' +
        'Defínelo antes de desplegar.',
    );
  }
  return DEV_SECRET;
}

/* ── Firma ────────────────────────────────────────────────────────────────── */

function b64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Se reserva el `ArrayBuffer` de forma explícita: `Uint8Array.from` produce un
 * `Uint8Array<ArrayBufferLike>`, que Web Crypto no acepta como `BufferSource`.
 */
function fromB64url(text: string): Uint8Array<ArrayBuffer> {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/** Comparación en tiempo constante: no filtra por dónde difieren dos cadenas. */
export function timingSafeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  // La longitud sí se filtra, pero eso no revela nada útil de una contraseña.
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

export async function signSession(session: Session): Promise<string> {
  const payload = b64url(new TextEncoder().encode(JSON.stringify(session)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(), new TextEncoder().encode(payload));
  return `${payload}.${b64url(new Uint8Array(sig))}`;
}

export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(),
      fromB64url(signature),
      new TextEncoder().encode(payload),
    );
    if (!valid) return null;

    const session = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as Session;
    if (typeof session.exp !== 'number' || session.exp * 1000 < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

/* ── Contraseñas ──────────────────────────────────────────────────────────── */

/**
 * PBKDF2-SHA256 mediante Web Crypto.
 *
 * Se usa PBKDF2 y no scrypt o Argon2, que resistirían mejor un ataque con GPU,
 * por una razón concreta: Web Crypto no los tiene, y traerlos obligaría a
 * importar una biblioteca nativa que rompería este módulo en el runtime Edge
 * donde corre el proxy. El número de iteraciones es el que recomienda OWASP
 * para SHA-256, y el formato guarda sus parámetros, así que subirlo mañana no
 * invalida las contraseñas de hoy.
 */
const PBKDF2_ITERATIONS = 210_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

/** `pbkdf2$sha256$<iteraciones>$<sal>$<huella>`, todo en base64url. */
export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(new ArrayBuffer(SALT_BYTES));
  crypto.getRandomValues(salt);
  const hash = await derive(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$sha256$${PBKDF2_ITERATIONS}$${b64url(salt)}$${b64url(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algoritmo, digest, iteraciones, sal, huella] = stored.split('$');
  if (algoritmo !== 'pbkdf2' || digest !== 'sha256') return false;

  const n = Number(iteraciones);
  if (!Number.isFinite(n) || n < 1000) return false;

  try {
    const calculada = await derive(password, fromB64url(sal), n);
    return timingSafeEqual(b64url(calculada), huella);
  } catch {
    return false;
  }
}

/* ── Credenciales ─────────────────────────────────────────────────────────── */

export interface Credentials {
  teacherId: string;
  password: string;
}

/** Lo mínimo que hace falta para autenticar. */
export interface TeacherAccount {
  teacher_id: string;
  name: string;
  password_hash?: string;
}

export type VerifyResult =
  | { ok: true; session: Session }
  | { ok: false; reason: 'invalid' | 'sin_clave' };

/**
 * Comprueba las credenciales contra la contraseña guardada de esa docente.
 *
 * Ya no hay contraseña compartida. Antes `TEACHER_PASSWORD` valía para todo el
 * claustro, de modo que quien entraba veía las reuniones de cualquiera; con
 * familias reales eso significa que un docente lee el expediente de los
 * estudiantes de otro.
 *
 * Cuando la cuenta no existe se compara igualmente contra una huella de
 * relleno. Sin eso, un identificador inexistente respondería en un milisegundo
 * y uno válido en doscientos, que es todo lo que hace falta para averiguar qué
 * identificadores existen.
 */
const HUELLA_DE_RELLENO =
  'pbkdf2$sha256$210000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export async function verifyCredentials(
  { teacherId, password }: Credentials,
  account: TeacherAccount | null,
): Promise<VerifyResult> {
  const ok = await verifyPassword(password, account?.password_hash ?? HUELLA_DE_RELLENO);

  if (!account) return { ok: false, reason: 'invalid' };
  if (!account.password_hash) return { ok: false, reason: 'sin_clave' };
  if (!ok) return { ok: false, reason: 'invalid' };

  // El identificador se normaliza aquí para que la sesión lleve siempre el que
  // consta en la base, no el que la persona escribió.
  void teacherId;

  return {
    ok: true,
    session: {
      teacherId: account.teacher_id,
      name: account.name,
      exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
    },
  };
}

/* ── Cookie ───────────────────────────────────────────────────────────────── */

export const sessionCookie = {
  name: COOKIE_NAME,
  options: {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isProduction,
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
};
