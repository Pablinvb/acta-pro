/**
 * Motor de alineación.
 *
 * Cruza dos informaciones que llegan por separado:
 *
 *   diarización → QUIÉN habló y CUÁNDO   (turnos con inicio y fin)
 *   transcripción → QUÉ se dijo y CUÁNDO (palabras con inicio y fin)
 *
 * y produce lo único que sirve para un acta: **quién dijo qué**.
 *
 * ── Por qué a nivel de palabra ────────────────────────────────────────────
 *
 * Lo obvio sería asignar a cada frase transcrita el hablante que más se solapa
 * con ella. No basta, y lo sabemos por una grabación real de una reunión:
 * Whisper devolvió como una sola frase
 *
 *   «¿Ha visto algo que le ha llamado la atención? Sí, pasa que Sofía no está»
 *
 * que son dos personas. Asignada por solapamiento mayoritario, la respuesta de
 * la madre habría quedado atribuida a la docente. En un acta que se firma, eso
 * es exactamente el error que este producto existe para evitar.
 *
 * Alineando palabra a palabra, el cambio de turno parte la frase donde toca.
 *
 * Sin marcas de tiempo por palabra se cae a nivel de frase, pero el resultado
 * se marca como incierto en lugar de presentarse como un hecho.
 */

export interface SpeakerTurn {
  /** Etiqueta anónima del diarizador: `SPEAKER_00`, `A`… */
  speaker: string;
  /** Segundos desde el inicio del audio. */
  start: number;
  end: number;
}

export interface TimedWord {
  word: string;
  start: number;
  end: number;
}

export interface TimedSegment {
  text: string;
  start: number;
  end: number;
  words?: TimedWord[];
}

export interface AttributedUtterance {
  speaker: string | null;
  text: string;
  start: number;
  end: number;
  /**
   * Qué proporción del tiempo hablado cae dentro del turno asignado, de 0 a 1.
   * Por debajo de `MIN_CONFIDENCE` la atribución no se presenta como segura.
   */
  confidence: number;
  /** `true` cuando hubo que alinear por frase por no haber palabras. */
  coarse: boolean;
}

/** Por debajo de esto, la atribución se marca para que la revise la docente. */
export const MIN_CONFIDENCE = 0.6;

/** Solapamiento en segundos entre dos intervalos. */
function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/**
 * Turno que más tiempo comparte con el intervalo dado.
 *
 * La confianza no es cuánto se solapa con el ganador, sino **cuánto le saca al
 * segundo**. La diferencia importa: un intervalo repartido 62/38 entre dos
 * personas se solapa un 62 % con el ganador —que suena alto— pero la
 * atribución es casi una moneda al aire. Midiendo el margen, ese caso da 0,24 y
 * se marca para revisión, que es lo correcto.
 */
function bestTurn(
  turns: SpeakerTurn[],
  start: number,
  end: number,
): { speaker: string | null; share: number } {
  const duration = Math.max(end - start, 0.001);
  let mejor: string | null = null;
  let mayor = 0;
  let segundo = 0;

  for (const turn of turns) {
    const compartido = overlap(start, end, turn.start, turn.end);
    if (compartido > mayor) {
      segundo = mayor;
      mayor = compartido;
      mejor = turn.speaker;
    } else if (compartido > segundo) {
      segundo = compartido;
    }
  }

  if (mejor !== null) {
    return { speaker: mejor, share: Math.max(0, (mayor - segundo) / duration) };
  }

  /*
   * Ninguna coincidencia: la palabra cae en el silencio entre dos turnos.
   *
   * Los diarizadores recortan los bordes de cada turno, así que una palabra a
   * caballo entre dos queda huérfana. Dejarla «sin identificar» parte la frase
   * en tres —«¿Ha visto algo» / «que» / «le ha llamado la atención?»— y en
   * pantalla parece un error del sistema.
   *
   * Se asigna al turno más cercano, pero con confianza reducida por la
   * distancia: a más silencio, menos seguridad, y a partir de cierto punto se
   * marca para que la revise la docente.
   */
  return nearestTurn(turns, start, end);
}

/** Margen en segundos dentro del cual una palabra huérfana se adopta. */
const ORPHAN_WINDOW_SECONDS = 2;

function nearestTurn(
  turns: SpeakerTurn[],
  start: number,
  end: number,
): { speaker: string | null; share: number } {
  let cercano: string | null = null;
  let distancia = Infinity;

  for (const turn of turns) {
    const d = start > turn.end ? start - turn.end : turn.start > end ? turn.start - end : 0;
    if (d < distancia) {
      distancia = d;
      cercano = turn.speaker;
    }
  }

  if (cercano === null || distancia > ORPHAN_WINDOW_SECONDS) {
    return { speaker: null, share: 0 };
  }

  // Pegada a un turno vale casi tanto como estar dentro; lejos, casi nada.
  return { speaker: cercano, share: Math.max(0, 1 - distancia / ORPHAN_WINDOW_SECONDS) * 0.9 };
}

/**
 * Une palabras consecutivas del mismo hablante en una intervención.
 *
 * No se unen dos intervenciones separadas por un silencio largo aunque sean de
 * la misma persona: en un acta, «Sí.» y una explicación de treinta segundos
 * después no son la misma intervención.
 */
const MAX_GAP_SECONDS = 1.5;

export function alignWords(words: TimedWord[], turns: SpeakerTurn[]): AttributedUtterance[] {
  const atribuidas = words.map((w) => ({ ...w, ...bestTurn(turns, w.start, w.end) }));
  const salida: AttributedUtterance[] = [];

  for (const palabra of atribuidas) {
    const anterior = salida[salida.length - 1];
    const continua =
      anterior &&
      anterior.speaker === palabra.speaker &&
      palabra.start - anterior.end <= MAX_GAP_SECONDS;

    if (continua) {
      anterior.text += ` ${palabra.word.trim()}`;
      anterior.end = palabra.end;
      // La confianza de la intervención es la media de la de sus palabras.
      anterior.confidence = (anterior.confidence + palabra.share) / 2;
    } else {
      salida.push({
        speaker: palabra.speaker,
        text: palabra.word.trim(),
        start: palabra.start,
        end: palabra.end,
        confidence: palabra.share,
        coarse: false,
      });
    }
  }

  return salida.map((u) => ({ ...u, text: limpiar(u.text) }));
}

/** Alineación por frase, para cuando no hay marcas de tiempo por palabra. */
export function alignSegments(
  segments: TimedSegment[],
  turns: SpeakerTurn[],
): AttributedUtterance[] {
  return segments.map((s) => {
    const { speaker, share } = bestTurn(turns, s.start, s.end);
    return {
      speaker,
      text: limpiar(s.text),
      start: s.start,
      end: s.end,
      confidence: share,
      // Se marca siempre: sin palabras no se puede saber si la frase mezcla
      // dos personas, que es justo el caso que rompe un acta.
      coarse: true,
    };
  });
}

/**
 * Punto de entrada: usa palabras si las hay y cae a frases si no.
 */
export function align(
  segments: TimedSegment[],
  turns: SpeakerTurn[],
): AttributedUtterance[] {
  if (turns.length === 0) {
    // Sin diarización no se inventa un hablante: se devuelve sin atribuir.
    return segments.map((s) => ({
      speaker: null,
      text: limpiar(s.text),
      start: s.start,
      end: s.end,
      confidence: 0,
      coarse: true,
    }));
  }

  const palabras = segments.flatMap((s) => s.words ?? []);
  return palabras.length > 0 ? alignWords(palabras, turns) : alignSegments(segments, turns);
}

function limpiar(texto: string): string {
  return texto.replace(/\s+/g, ' ').replace(/\s+([,.;:?!])/g, '$1').trim();
}

/** Cuántas intervenciones quedaron por debajo del umbral y necesitan revisión. */
export function uncertainCount(utterances: AttributedUtterance[]): number {
  return utterances.filter((u) => u.speaker === null || u.confidence < MIN_CONFIDENCE || u.coarse)
    .length;
}

/** Etiquetas de hablante distintas, en el orden en que aparecen. */
export function speakerOrder(utterances: AttributedUtterance[]): string[] {
  const vistos: string[] = [];
  for (const u of utterances) {
    if (u.speaker && !vistos.includes(u.speaker)) vistos.push(u.speaker);
  }
  return vistos;
}
