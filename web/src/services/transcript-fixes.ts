/**
 * Correcciones de texto sobre la transcripción.
 *
 * Funciones puras, sin dependencias: no tocan la base de datos ni llaman a
 * ningún servicio. Así se pueden probar solas, que es justo lo que hace falta
 * con reglas nacidas de observar grabaciones reales.
 *
 * Todo lo de aquí se aplica sobre `clean_text`, **nunca sobre el original**: la
 * evidencia de lo que se transcribió queda intacta.
 */

/**
 * Términos del centro que el reconocimiento de voz falla de forma sistemática,
 * con las variantes observadas en grabaciones reales de reuniones.
 *
 * El refuerzo de vocabulario de Deepgram arregla algunos —«DECE» dejó de salir
 * como «Dese» al pasarlo como palabra clave— pero con nombres propios
 * inventados no basta: «Runachay» siguió saliendo como «Sorronachai» y «Runner
 * Chai» incluso reforzándolo. Corregirlo aquí es determinista y no depende de
 * que el modelo acierte.
 */
const INSTITUTIONAL_FIXES: Array<[RegExp, string]> = [
  // Medido: Deepgram escribe «Sorronachai» y «Runner Chai»; Whisper acierta
  // «runachay» pero en minúscula.
  [/\b(sorron[ae]?chai|runner\s*chai|runa\s*ch[ai]i?|runachai|runachay)\b/gi, 'Runachay'],
  // «DECE» sale como «Dese» (Deepgram) o «DC» (Whisper). Se corrige el
  // acrónimo suelto: en un acta escolar ecuatoriana no significa otra cosa.
  [/\bdese\b/gi, 'DECE'],
  [/\bd\.?\s?c\.?\s?e\.?\b/gi, 'DECE'],
  [/\bd\.?\s?c\.?\b(?=\s|,|\.|$)/gi, 'DECE'],
  [/\be\.?\s?g\.?\s?b\.?\b/gi, 'EGB'],
];

export function fixInstitutionalTerms(text: string): string {
  let result = text;
  for (const [pattern, replacement] of INSTITUTIONAL_FIXES) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/** Muletillas del habla que no aportan nada en un acta. */
const FILLERS = /\b(eh+|em+|mmm+|este|o sea|digamos|verdad|no cierto|¿no\?|¿ya\?)\b[,\s]*/gi;

/**
 * Depuración local, suficiente cuando no hay modelo disponible.
 *
 * Quita muletillas y repeticiones involuntarias, corrige la mayúscula inicial y
 * los espacios antes de puntuación. No reinterpreta nada: si la frase dice algo
 * incómodo, sigue diciéndolo.
 */
export function basicCleanup(text: string): string {
  return fixInstitutionalTerms(text)
    .replace(FILLERS, '')
    // Palabra repetida inmediatamente: «yo yo creo» → «yo creo».
    .replace(/\b(\w+)(\s+\1\b)+/gi, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    // Quitar una muletilla final deja la coma que la precedía colgando.
    .replace(/[,;:]+\s*$/, '')
    .trim()
    .replace(/^([a-záéíóúñ])/, (c) => c.toUpperCase());
}
