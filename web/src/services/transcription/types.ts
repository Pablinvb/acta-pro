import 'server-only';

/**
 * Proveedores de transcripción.
 *
 * Existe este interfaz porque cambiar de proveedor no debe tocar nada más que
 * un archivo. Hoy hay uno; mañana puede haber otro mejor, o hacer falta cambiar
 * por precio o por cobertura del español ecuatoriano.
 *
 * ── Sobre la identificación de hablantes ──────────────────────────────────
 *
 * Conviene tener clara una distinción que casi todos los proveedores mezclan en
 * su publicidad:
 *
 *  - **Diarización** separa voces: sabe que hablaron tres personas distintas y
 *    devuelve «Speaker A», «Speaker B», «Speaker C». Es lo que ofrecen
 *    AssemblyAI, Deepgram, Speechmatics o Google Cloud Speech-to-Text.
 *
 *  - **Identificación** pone nombres: saber que «Speaker B» es María López.
 *    Eso NINGÚN proveedor lo hace solo, porque no ha oído nunca a María López.
 *
 * De ahí que `speaker_tag` sea una etiqueta anónima y exista `speakerMap`: la
 * docente asigna una vez por reunión quién es cada etiqueta, y a partir de ahí
 * todos los fragmentos de esa voz quedan atribuidos. Tres decisiones por
 * reunión en lugar de una por frase.
 *
 * Es lo máximo que la tecnología da hoy con garantías suficientes para un
 * documento que alguien va a firmar. Atribuir una frase a la persona equivocada
 * es exactamente el error que ACTA PRO existe para evitar.
 */

export interface TranscribedSegment {
  /** Segundos desde el inicio del audio. */
  start: number;
  end: number;
  text: string;
  /**
   * Etiqueta anónima del hablante: «A», «B», «1»… Es estable dentro de una
   * misma petición, no entre peticiones distintas.
   */
  speaker_tag?: string;
  confidence?: number;
}

export interface TranscriptionResult {
  segments: TranscribedSegment[];
  /** Texto completo, por si el proveedor lo devuelve ya montado. */
  text: string;
  /** Etiquetas de hablante distintas detectadas. */
  speakerTags: string[];
  language?: string;
}

export interface TranscribeOptions {
  /** Código de idioma, p. ej. `es`. */
  language?: string;
  /** Pedir separación de voces, si el proveedor la soporta. */
  diarize?: boolean;
  /**
   * Cuántas personas se espera oír. Varios proveedores mejoran bastante la
   * separación cuando se les da este dato, y ACTA PRO lo sabe: son los
   * participantes marcados como presentes.
   */
  expectedSpeakers?: number;
  /** Nombres propios y términos del centro, para que no los transcriba mal. */
  vocabulary?: string[];
}

export interface TranscriptionProvider {
  readonly name: string;

  /** Si es `false`, la asignación de hablantes recae en la docente. */
  readonly supportsDiarization: boolean;

  /**
   * `true` si acepta audio en streaming durante la reunión.
   *
   * Aunque lo soporte, la diarización sale bastante más precisa sobre el audio
   * completo: lo habitual es transcribir en vivo para que la docente vea que
   * funciona, y hacer una pasada final al cerrar la reunión, que es la que
   * manda.
   */
  readonly supportsStreaming: boolean;

  transcribe(audio: Blob, options?: TranscribeOptions): Promise<TranscriptionResult>;
}

/**
 * Asignación de etiqueta anónima a persona real, decidida por la docente.
 * Ejemplo: `{ A: 'Ana Pérez', B: 'María López', C: 'Juan Pérez' }`.
 */
export type SpeakerMap = Record<string, string>;

/** Aplica el mapa de la docente a los fragmentos transcritos. */
export function applySpeakerMap(
  segments: TranscribedSegment[],
  map: SpeakerMap,
): Array<TranscribedSegment & { speaker?: string }> {
  return segments.map((segment) => ({
    ...segment,
    speaker: segment.speaker_tag ? map[segment.speaker_tag] : undefined,
  }));
}

/**
 * Primer fragmento de cada voz, para que la docente decida quién es.
 *
 * Se elige el más largo de cada etiqueta y no el primero: un «buenos días» no
 * basta para reconocer a alguien, y una frase con contenido sí.
 */
export function samplesForIdentification(
  segments: TranscribedSegment[],
): Array<{ speaker_tag: string; text: string; start: number }> {
  const best = new Map<string, TranscribedSegment>();

  for (const segment of segments) {
    if (!segment.speaker_tag) continue;
    const current = best.get(segment.speaker_tag);
    if (!current || segment.text.length > current.text.length) {
      best.set(segment.speaker_tag, segment);
    }
  }

  return [...best.entries()]
    .map(([speaker_tag, segment]) => ({
      speaker_tag,
      text: segment.text,
      start: segment.start,
    }))
    .sort((a, b) => a.start - b.start);
}
