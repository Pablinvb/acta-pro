import type { MeetingMinutes, Signature } from '@/lib/types';

/**
 * Sello de tiempo del acta firmada.
 *
 * Guardar la hora de la firma en una columna no prueba nada: una columna se
 * edita. Lo que sí prueba algo es una huella que dependa a la vez del contenido
 * del acta, de las dos firmas y del instante — cambiar cualquiera de las tres
 * cosas cambia la huella, y la huella va impresa en el PDF que se llevan las
 * dos partes.
 *
 * **Qué demuestra y qué no.** Demuestra integridad: que el acta archivada es
 * palabra por palabra la que se firmó, y que la fecha impresa es la que se
 * selló. No demuestra la fecha frente a un tercero, porque el instante lo pone
 * este servidor y no una autoridad de sellado independiente. Para eso haría
 * falta una TSA (RFC 3161), y decirlo es parte de hacerlo bien: un docente que
 * crea tener más respaldo del que tiene está peor protegido que uno que sabe
 * exactamente cuál es.
 *
 * Módulo puro, sin dependencias, para poder verificarlo sin base de datos.
 */

/** Versión del formato sellado. Si cambia la serialización, cambia esto. */
export const SEAL_VERSION = 'ACTA-PRO-SELLO-1';

export interface SealInput {
  documentCode: string;
  sections: MeetingMinutes['sections'];
  signatures: Array<Pick<Signature, 'signer_role' | 'signer_name' | 'signed_at'> & {
    image?: string;
  }>;
}

/**
 * Texto exacto sobre el que se calcula la huella.
 *
 * Determinista a propósito: las secciones van por número y las firmas por
 * papel, de modo que el mismo acta produce la misma huella hoy y dentro de dos
 * años, en cualquier máquina. Si esto dependiera del orden en que salieron de
 * la base, el sello sería irreproducible y por tanto inútil.
 */
export function canonicalPayload(input: SealInput): string {
  const lineas: string[] = [SEAL_VERSION, `documento:${input.documentCode}`];

  for (const s of [...input.sections].sort((a, b) => a.number - b.number)) {
    const partes = [
      ...(s.fields ?? []).map((f) => `${f.label}=${f.value}`),
      ...(s.paragraphs ?? []),
      ...(s.items ?? []),
    ];
    // El separador va escapado para que un texto que contenga «|» no pueda
    // hacerse pasar por dos campos distintos.
    lineas.push(
      `${s.number}:${s.title}:${partes.map((p) => p.replace(/\|/g, '\\|')).join('|')}`,
    );
  }

  for (const f of [...input.signatures].sort((a, b) => a.signer_role.localeCompare(b.signer_role))) {
    lineas.push(`firma:${f.signer_role}:${f.signer_name}:${f.signed_at ?? ''}:${f.image ?? ''}`);
  }

  return lineas.join('\n');
}

/** SHA-256 en hexadecimal. Web Crypto: el mismo código vale en Node y en Edge. */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function computeSeal(input: SealInput): Promise<string> {
  return sha256Hex(canonicalPayload(input));
}

/**
 * La huella partida en grupos, para poder leerla y compararla a ojo.
 *
 * Sesenta y cuatro caracteres seguidos no los compara nadie; en grupos de ocho
 * se coteja en diez segundos, que es lo que va a hacer quien tenga que
 * comprobar un acta impresa.
 */
export function formatSeal(hash: string): string {
  return (hash.match(/.{1,8}/g) ?? []).join(' ').toUpperCase();
}

/**
 * Fecha y hora de la firma, en la zona horaria del centro.
 *
 * Un acta ecuatoriana con la hora en UTC obliga a restar cinco horas mentalmente
 * para saber si la reunión fue por la mañana o por la tarde, y ese detalle puede
 * importar si alguien discute cuándo se firmó.
 */
export function formatSignedAt(iso: string, timeZone: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso;
  const d = new Intl.DateTimeFormat('es-EC', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(fecha);
  const h = new Intl.DateTimeFormat('es-EC', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(fecha);
  return `${d} a las ${h}`;
}
