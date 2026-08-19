import 'server-only';
import type { SpeakerTurn } from './alignment';

/**
 * Diarización: quién habló y cuándo.
 *
 * Va aparte de la transcripción a propósito. Son dos preguntas distintas
 * —«quién» y «qué»— que responden servicios distintos, y separarlas permite
 * combinar el mejor de cada uno: Whisper transcribe muy bien español, pyannote
 * separa voces muy bien, y ninguno hace bien lo del otro.
 *
 * Lo que devuelve NO es dato biométrico: son etiquetas anónimas válidas dentro
 * de una grabación —«SPEAKER_00», «SPEAKER_01»— que no identifican a nadie ni
 * sirven para reconocer a esa persona en otra reunión. Poner los nombres es de
 * la docente, y esa decisión vive en ACTA PRO, no en el proveedor.
 */

export interface DiarizationResult {
  turns: SpeakerTurn[];
  /** Voces distintas detectadas. */
  speakers: string[];
}

export interface DiarizationProvider {
  readonly name: string;
  /**
   * Separa las voces de una grabación completa.
   *
   * Recibe el audio entero y no fragmentos: las etiquetas solo son coherentes
   * dentro de una misma petición, así que diarizar por trozos daría un
   * «SPEAKER_00» distinto en cada uno.
   */
  diarize(audio: Blob, options?: { expectedSpeakers?: number }): Promise<DiarizationResult>;
}
