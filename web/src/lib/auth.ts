/**
 * Sesión de la docente.
 *
 * Cookie httpOnly con una carga útil firmada con HMAC-SHA256 mediante Web
 * Crypto, de modo que el mismo código sirve en Node y en el runtime Edge del
 * middleware. La firma evita que alguien se fabrique una sesión editando la
 * cookie; no cifra, así que la carga útil no lleva nada sensible: solo el
 * identificador de la docente, su nombre y la caducidad.
 *
 * Qué NO es esto todavía: no hay almacén de usuarios. Las credenciales salen de
 * variables de entorno porque los workflows 03/05/11/14 aún tienen la base de
 * datos como `NoOp`. Cuando exista, hay que sustituir `verifyCredentials` por
 * una consulta real (o delegar en Runachay / Google Workspace) — el resto de
 * este módulo no cambia.
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

/* ── Credenciales ─────────────────────────────────────────────────────────── */

/** Contraseña de desarrollo. En producción `TEACHER_PASSWORD` es obligatoria. */
const DEV_PASSWORD = 'acta-pro-demo';

export interface Credentials {
  teacherId: string;
  password: string;
}

export type VerifyResult =
  | { ok: true; session: Session }
  | { ok: false; reason: 'invalid' | 'misconfigured' };

export function verifyCredentials(
  { teacherId, password }: Credentials,
  knownTeachers: Array<{ teacher_id: string; name: string }>,
): VerifyResult {
  const expected = process.env.TEACHER_PASSWORD ?? (isProduction ? null : DEV_PASSWORD);

  if (!expected) return { ok: false, reason: 'misconfigured' };

  const teacher = knownTeachers.find(
    (t) => t.teacher_id.toLowerCase() === teacherId.trim().toLowerCase(),
  );

  // Se comprueba la contraseña aunque el identificador no exista, para que el
  // tiempo de respuesta no revele qué identificadores son válidos.
  const passwordOk = timingSafeEqual(password, expected);
  if (!teacher || !passwordOk) return { ok: false, reason: 'invalid' };

  return {
    ok: true,
    session: {
      teacherId: teacher.teacher_id,
      name: teacher.name,
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
