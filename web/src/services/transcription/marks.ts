/**
 * Marcas de la docente sobre la transcripción.
 *
 * Durante la reunión la docente pulsa «marcar este momento». Lo que se guarda
 * es un segundo, no un texto: cuando pulsa, la frase que quiere señalar todavía
 * no está transcrita —el fragmento que la contiene se está grabando—. Situarla
 * sólo es posible al final, con la transcripción definitiva delante.
 *
 * Módulo sin dependencias a propósito, para poder verificarlo sin servidor.
 */

/** Más allá de esto, la marca y lo que se dijo ya no hablan de lo mismo. */
export const MARK_WINDOW_SECONDS = 20;

/**
 * Penalización de lo que aún no se había dicho.
 *
 * Una persona pulsa **después** de oír lo que le interesa, así que la marca cae
 * al final de la frase o ya en el silencio siguiente. Mirar hacia adelante sólo
 * sirve para una marca puesta justo antes de que alguien empiece a hablar, y es
 * lo que menos se parece a lo que la docente tenía en la cabeza: a igual
 * distancia, lo anterior gana.
 */
const FORWARD_PENALTY = 1.5;

export interface Range {
  start: number;
  end: number;
}

/**
 * Devuelve, para cada marca, el índice de la intervención que le corresponde.
 *
 * Orden de preferencia:
 *   1. la intervención que contiene ese segundo;
 *   2. la última que terminó antes;
 *   3. la primera que empieza después.
 *
 * Una marca que no encuentra nada dentro de la ventana se descarta: es
 * preferible perderla a señalar una frase que no tiene que ver.
 */
export function locateMarks(ranges: Range[], marks: number[]): number[] {
  if (ranges.length === 0) return [];

  const encontrados: number[] = [];

  for (const at of marks) {
    if (!Number.isFinite(at) || at < 0) continue;

    const dentro = ranges.findIndex((r) => at >= r.start && at <= r.end);
    if (dentro !== -1) {
      encontrados.push(dentro);
      continue;
    }

    let elegido = -1;
    let mejor = Infinity;
    for (let i = 0; i < ranges.length; i++) {
      const distancia =
        ranges[i].end <= at ? at - ranges[i].end : (ranges[i].start - at) * FORWARD_PENALTY;
      if (distancia >= 0 && distancia < mejor) {
        mejor = distancia;
        elegido = i;
      }
    }

    if (elegido !== -1 && mejor <= MARK_WINDOW_SECONDS) encontrados.push(elegido);
  }

  return encontrados;
}

/**
 * Señala las intervenciones marcadas y devuelve cuántas quedaron señaladas.
 *
 * Puede ser menos que marcas: dos pulsaciones seguidas sobre la misma frase la
 * señalan una vez.
 */
export function applyMarks<T extends { flagged_by_teacher?: boolean }>(
  segments: T[],
  ranges: Range[],
  marks: number[],
): number {
  if (marks.length === 0 || segments.length === 0) return 0;

  const señaladas = new Set<number>();
  for (const i of locateMarks(ranges, marks)) {
    if (i < segments.length) {
      segments[i].flagged_by_teacher = true;
      señaladas.add(i);
    }
  }
  return señaladas.size;
}
