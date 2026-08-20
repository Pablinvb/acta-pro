import 'server-only';
import { sinConfigurar } from './errors';

/**
 * Configuración de los servicios.
 *
 * Todo se lee del servidor: ninguna variable lleva `NEXT_PUBLIC_`, así que
 * ninguna credencial puede acabar en el navegador. Cada `require*` falla en voz
 * alta con el nombre exacto de lo que falta, en vez de dejar que la llamada
 * externa se rompa con un 401 opaco a mitad de una reunión.
 */

export const isProduction = process.env.NODE_ENV === 'production';

/** Con `demo` no se llama a ningún servicio externo y todo funciona en local. */
export const runMode: 'demo' | 'live' =
  process.env.ACTA_PRO_MODE === 'live' ? 'live' : 'demo';

export const isDemo = runMode === 'demo';

/* ── OpenAI: transcripción, análisis y revisión de lenguaje ───────────────── */

export const openaiModel = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini';
export const openaiTranscriptionModel = process.env.OPENAI_TRANSCRIPTION_MODEL ?? 'whisper-1';

export function requireOpenAiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw sinConfigurar('OPENAI_API_KEY');
  return key;
}

/* ── Google: Calendar, Drive y Gmail ──────────────────────────────────────── */

export interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

/**
 * Se usa un cliente OAuth2 con refresh token de la cuenta institucional, no una
 * cuenta de servicio: Gmail necesita enviar *como* la docente, y una cuenta de
 * servicio sin delegación de dominio no puede hacerlo.
 */
export function requireGoogleCredentials(): GoogleCredentials {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw sinConfigurar('las credenciales de Google (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN)');
  }
  return { clientId, clientSecret, refreshToken };
}

export const googleCalendarId = process.env.GOOGLE_CALENDAR_ID ?? 'primary';

/** Carpeta de Drive donde cuelga el árbol `ACTA PRO/Docentes/...`. */
export const driveRootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID ?? '';

/**
 * Carpeta separada y con permisos propios para las transcripciones. La
 * arquitectura es explícita: la transcripción nunca se guarda junto al acta.
 */
export const driveTranscriptFolderId = process.env.GOOGLE_DRIVE_TRANSCRIPT_FOLDER_ID ?? '';

/* ── pyannoteAI: separación de voces ──────────────────────────────────────── */

/**
 * `true` cuando hay separación de voces disponible.
 *
 * Si no la hay, la aplicación no se rompe: la transcripción sigue funcionando y
 * la docente atribuye las intervenciones a mano. Peor, pero honesto.
 */
export const diarizationEnabled = Boolean(process.env.PYANNOTE_API_KEY);

export function requirePyannoteKey(): string {
  const key = process.env.PYANNOTE_API_KEY;
  if (!key) throw sinConfigurar('PYANNOTE_API_KEY');
  return key;
}

/**
 * Vocabulario institucional para la transcripción.
 *
 * Sin esto el reconocimiento destroza los términos propios del centro. Medido
 * con grabaciones reales: «Runachay» ha salido como «Sorronachai» y «Runner
 * Chai», y «DECE» como «Dese» y «DC». Se pasa como pista al transcriptor y
 * además se corrige de forma determinista en `transcript-fixes`.
 *
 * Se amplía con ACTA_PRO_VOCABULARIO, separando por comas.
 */
export const institutionalVocabulary: string[] = [
  'Runachay',
  'DECE',
  'EGB',
  'BGU',
  'acta',
  'representante',
  'parcial',
  'quimestre',
  ...(process.env.ACTA_PRO_VOCABULARIO ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean),
];

/* ── Identidad institucional del acta ─────────────────────────────────────── */

/**
 * Lo que va impreso en el acta como membrete.
 *
 * El acta que sale de ACTA PRO tiene que ser indistinguible de la que el centro
 * ya usa en papel: es un documento institucional que se archiva y, llegado el
 * caso, se presenta. Un formato propio, por bonito que sea, obligaría a la
 * docente a transcribirlo al de verdad.
 */
export const institutionName =
  process.env.ACTA_PRO_INSTITUCION ?? 'UNIDAD EDUCATIVA EIGHT ACADEMY';

/**
 * Lugar por defecto cuando la reunión no lo trae.
 *
 * Vacío a propósito: el formulario en papel tiene esa casilla en blanco y se
 * rellena a mano. Preferimos una casilla vacía a un lugar inventado, porque el
 * acta afirma dónde ocurrió algo.
 */
export const defaultMeetingPlace = process.env.ACTA_PRO_LUGAR ?? '';

/**
 * Zona horaria con la que se imprime la hora de las firmas.
 *
 * Un acta ecuatoriana con la hora en UTC obliga a restar cinco horas para saber
 * si la reunión fue por la mañana o por la tarde, y ese detalle puede importar
 * si alguien discute cuándo se firmó.
 */
export const institutionTimeZone = process.env.ACTA_PRO_ZONA_HORARIA ?? 'America/Guayaquil';

/* ── Almacenamiento de objetos (S3 / Firebase / R2) ───────────────────────── */

export const storageDriver: 'drive' | 's3' =
  process.env.ACTA_PRO_STORAGE === 's3' ? 's3' : 'drive';

export interface S3Config {
  bucket: string;
  region: string;
  /** Vacío para AWS; `https://storage.googleapis.com` para Firebase/GCS. */
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export function requireS3(): S3Config {
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw sinConfigurar(
      'el almacenamiento de objetos (S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY)',
    );
  }

  return {
    bucket,
    region: process.env.S3_REGION ?? 'us-east-1',
    endpoint: process.env.S3_ENDPOINT ?? '',
    accessKeyId,
    secretAccessKey,
  };
}

/* ── Runachay ─────────────────────────────────────────────────────────────── */

export interface RunachayConfig {
  baseUrl: string;
  apiKey: string;
  studentEndpoint: string;
  representativeEndpoint: string;
}

export function requireRunachay(): RunachayConfig {
  const baseUrl = process.env.RUNACHAY_API_URL;
  const apiKey = process.env.RUNACHAY_API_KEY;
  if (!baseUrl || !apiKey) throw sinConfigurar('la API de Runachay (RUNACHAY_API_URL, RUNACHAY_API_KEY)');
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey,
    studentEndpoint: process.env.RUNACHAY_STUDENT_ENDPOINT ?? '/students',
    representativeEndpoint: process.env.RUNACHAY_REPRESENTATIVE_ENDPOINT ?? '/representatives',
  };
}

/** Tiempo máximo para cualquier integración externa. */
export const externalTimeoutMs = Number(process.env.EXTERNAL_TIMEOUT_MS ?? 15000);

export function describeMode(): string {
  return isDemo
    ? 'Modo demostración: no se llama a ningún servicio externo.'
    : 'Modo real: Calendar, Drive, Gmail, OpenAI y Runachay activos.';
}
