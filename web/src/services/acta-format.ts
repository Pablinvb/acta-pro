import type { MeetingMinutes, MinutesSection } from '@/lib/types';

/**
 * Traducción de las 13 secciones al formato de acta del centro.
 *
 * ACTA PRO guarda el acta como datos —trece secciones numeradas que fija la
 * arquitectura— y no como un documento. El formato institucional agrupa esa
 * misma información de otra manera: antecedentes, desarrollo, una tabla de
 * acuerdos y compromisos, y el registro de asistencia.
 *
 * Este módulo es esa correspondencia, y nada más. Está aparte del generador de
 * PDF para poder verificarlo sin producir un PDF, y porque el día que el centro
 * cambie su formulario hay un único sitio donde mirar.
 *
 * Se indexa por número de sección y no por título: el número es lo que el
 * contrato garantiza; el título es texto que alguien puede querer retocar.
 */

/** Lo que se imprime cuando una sección no tiene contenido. Nunca se inventa nada. */
const SIN_CONTENIDO = 'Sin información registrada.';

function section(minutes: MeetingMinutes, number: number): MinutesSection | undefined {
  return minutes.sections.find((s) => s.number === number);
}

function contentOf(minutes: MeetingMinutes, number: number): string[] {
  const s = section(minutes, number);
  return [...(s?.paragraphs ?? []), ...(s?.items ?? [])]
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * `ACTA-2026-JUAN-PEREZ-0001` → `0001`.
 *
 * El acta institucional se numera con un «Nº» corto. El código completo sigue
 * yendo al pie de cada página, porque el número se repite entre estudiantes y
 * el código no.
 */
export function sequenceFromCode(documentCode: string): string {
  const ultimo = documentCode.split('-').pop() ?? '';
  return /^\d+$/.test(ultimo) ? ultimo : documentCode;
}

/* ── Desarrollo de la reunión ─────────────────────────────────────────────── */

export interface DevelopmentBlock {
  label: string;
  lines: string[];
  /** Con viñetas cuando son puntos; sin ellas cuando es un texto corrido. */
  bullet: boolean;
}

/**
 * Todo lo que el acta contiene y no es antecedente, acuerdo ni firma.
 *
 * Aparecen también los apartados vacíos, con «Sin información registrada.». Un
 * acta que se salta un apartado deja la duda de si no hubo nada o si nadie lo
 * miró; decirlo explícitamente cierra esa duda, que es media razón de ser de
 * este documento.
 */
export function developmentBlocks(minutes: MeetingMinutes): DevelopmentBlock[] {
  const bloques: Array<{ label: string; number: number; bullet: boolean }> = [
    { label: 'Motivo de la Reunión', number: 2, bullet: false },
    { label: 'Temas Tratados', number: 4, bullet: true },
    { label: 'Intervenciones Relevantes', number: 5, bullet: true },
    { label: 'Situaciones Analizadas', number: 6, bullet: true },
    { label: 'Evidencias Mencionadas', number: 10, bullet: true },
    { label: 'Seguimiento', number: 11, bullet: true },
    { label: 'Observaciones', number: 12, bullet: true },
  ];

  return bloques.map(({ label, number, bullet }) => {
    const lines = contentOf(minutes, number);
    return lines.length > 0
      ? { label, lines, bullet }
      : { label, lines: [SIN_CONTENIDO], bullet: false };
  });
}

/* ── Acuerdos y compromisos ───────────────────────────────────────────────── */

export interface AgreementRow {
  text: string;
  responsible: string;
  dueDate: string;
}

/**
 * Papel con el que **empieza** un acuerdo, que es su sujeto.
 *
 * Los acuerdos casi nunca dicen «María López revisará»: dicen «la representante
 * revisará». Eso no es ambiguo —el acta sabe quién es la representante— y
 * resolverlo es leer lo que pone, no inventar.
 *
 * Pero sólo cuenta al principio de la frase. Medido contra actas reales:
 * «Reporte de avance el primer viernes de cada mes al correo de la
 * representante» menciona a la representante como **destinataria**, y quien
 * envía el reporte es la docente. Buscar el papel en cualquier posición
 * adjudicaba ese compromiso a la madre, que es justo la clase de error que este
 * documento no se puede permitir. Anclado al inicio, esa frase se queda sin
 * responsable, y una casilla vacía se corrige a mano.
 */
const ROLE_WORDS: Record<'teacher' | 'representative' | 'student', RegExp> = {
  teacher: /^\s*(la|el)\s+(docente|profesor|profesora|tutor|tutora|maestra|maestro)\b/i,
  representative: /^\s*(la|el)\s+(representante|madre|padre|apoderad[oa])\b/i,
  student: /^\s*(la|el)\s+(estudiante|alumn[oa])\b/i,
};

export interface RoleHolder {
  role: 'teacher' | 'representative' | 'student';
  name: string;
}

/**
 * A quién le toca cada acuerdo.
 *
 * El análisis devuelve la lista de responsables de la reunión entera, no uno
 * por acuerdo, así que hay que deducirlo. Tres reglas, en este orden:
 *
 *   1. Si el nombre de un responsable aparece dentro del propio acuerdo, es esa
 *      persona: «María López revisará la agenda» no admite discusión.
 *   2. Si el acuerdo **empieza** nombrando un papel —«la docente registrará la
 *      asistencia»—, es quien ocupa ese papel en esta reunión.
 *   3. Si sólo hay un responsable en toda la reunión, es esa persona.
 *
 * Y si ninguna se cumple, la casilla queda vacía. Es deliberado: adjudicar un
 * compromiso a quien no le corresponde, en un documento que las dos partes
 * firman, es exactamente el daño del que este producto tiene que proteger a la
 * docente. Una casilla vacía se rellena a mano; una atribución falsa firmada,
 * no se deshace.
 */
export function responsibleFor(
  text: string,
  candidates: string[],
  roleHolders: RoleHolder[] = [],
): string {
  const limpio = text.toLowerCase();

  const mencionado = candidates.find((c) => {
    const nombre = c.trim().toLowerCase();
    if (nombre.length === 0) return false;
    if (limpio.includes(nombre)) return true;
    // También por nombre de pila: el acuerdo suele decir «María» y la lista
    // de responsables «María López».
    const pila = nombre.split(/\s+/)[0];
    return pila.length > 2 && new RegExp(`\\b${pila}\\b`).test(limpio);
  });
  if (mencionado) return mencionado.trim();

  const porPapel = roleHolders.find((h) => ROLE_WORDS[h.role].test(text));
  if (porPapel) return porPapel.name;

  const utiles = candidates.map((c) => c.trim()).filter((c) => c.length > 0);
  return utiles.length === 1 ? utiles[0] : '';
}

/**
 * Las filas de la tabla: primero los acuerdos, después los compromisos.
 *
 * `dueDate` llega ya escrito, no como fecha ISO: así este módulo no depende de
 * nada y se puede verificar sin arrancar la aplicación.
 */
export function agreementRows(
  minutes: MeetingMinutes,
  dueDate: string,
  roleHolders: RoleHolder[] = [],
): AgreementRow[] {
  const responsables = section(minutes, 9)?.items ?? [];

  return [...contentOf(minutes, 7), ...contentOf(minutes, 8)].map((text) => ({
    text,
    responsible: responsibleFor(text, responsables, roleHolders),
    dueDate,
  }));
}
