import type { Participant, TranscriptSegment } from '@/lib/types';

/**
 * Quién es cada voz, propuesto por el modelo.
 *
 * La separación de voces devuelve etiquetas anónimas —«A», «B»— y no sabe
 * quiénes son: nunca ha oído a esas personas. Pero **la conversación sí lo
 * dice**: quien habla de «mi hijo» es la familia, quien dice «en mi clase» es
 * la docente. Eso se puede leer, y leerlo es lo que hace el modelo aquí.
 *
 * Es una **sugerencia y sólo una sugerencia**. La docente sigue confirmando, y
 * la confirmación no es un trámite: el acta atribuye afirmaciones a personas
 * con nombre y apellido, en un documento que las dos partes firman. Una
 * atribución equivocada ahí es exactamente el daño del que este producto tiene
 * que proteger a la docente, y ningún ahorro de dos toques lo compensa.
 *
 * Lo que sí cambia respecto a antes: la docente pasa de elegir desde cero a
 * confirmar o corregir algo ya propuesto, con la frase que lo justifica
 * delante.
 *
 * Módulo puro, sin red ni acceso a datos, para poder verificar las reglas sin
 * gastar una llamada al modelo.
 */

export type VoiceRole = 'docente' | 'representante' | 'estudiante' | 'desconocido';

/** Lo que devuelve el modelo, antes de comprobar nada. */
export interface RoleGuess {
  voz: string;
  rol: VoiceRole;
  /** El modelo dice cuánto se fía. Sólo se aceptan las altas. */
  confianza: 'alta' | 'media' | 'baja';
  /** Frase literal de la transcripción que lo justifica. */
  evidencia: string;
}

/** Sugerencia ya comprobada, lista para enseñarse. */
export interface VoiceSuggestion {
  speaker_tag: string;
  /** Participante propuesto. Siempre alguien que consta en la reunión. */
  name: string;
  role: VoiceRole;
  /** Por qué. Se enseña a la docente para que pueda discrepar con criterio. */
  evidence: string;
}

/* ── El texto que ve el modelo ────────────────────────────────────────────── */

/**
 * La transcripción con las etiquetas anónimas, no con los nombres.
 *
 * Importa: si se le pasara el texto con los nombres ya puestos, el modelo no
 * estaría deduciendo nada, sólo copiando. Y si aún no hay nombres —que es el
 * caso— el texto que usa el resto del sistema dice «Sin identificar» en todas
 * las líneas, con lo que el modelo no podría distinguir una voz de otra.
 */
export function anonymousTranscript(segments: TranscriptSegment[]): string {
  return segments
    .filter((s) => s.speaker_tag)
    .map((s) => `Voz ${s.speaker_tag}: ${(s.clean_text ?? s.text).trim()}`)
    .filter((linea) => linea.length > 0)
    .join('\n');
}

export const SYSTEM_PROMPT = `Lees la transcripción de una reunión en un centro educativo entre un docente, el representante de un estudiante y, a veces, el propio estudiante. Cada intervención va precedida de una etiqueta de voz anónima («Voz A», «Voz B»).

Tu tarea es proponer qué papel tiene cada voz. Devuelves EXCLUSIVAMENTE un objeto JSON.

Reglas obligatorias:
1. No inventes. Si la transcripción no lo dice con claridad, usa rol "desconocido".
2. Justifica cada propuesta con una frase COPIADA LITERALMENTE de la transcripción, sin el prefijo de la voz y sin cambiar ni una palabra. Si no puedes copiar una frase que lo demuestre, el rol es "desconocido".
3. Deduce por lo que la persona dice de sí misma, no por el tono ni por suposiciones:
   - habla de "mi clase", "mis estudiantes", "he observado en clase" → docente
   - habla de "mi hijo", "mi hija", "en casa nosotros" → representante
   - habla de sí mismo como quien estudia, responde a ambos, o recibe indicaciones → estudiante
4. No supongas el papel por el sexo, la edad aparente ni por quién habla más.
5. Usa confianza "alta" sólo si la frase que copias lo demuestra por sí sola. Ante cualquier duda, "media" o "baja".
6. Una voz, un rol. No repitas el mismo rol en dos voces salvo que la transcripción deje claro que hay dos representantes.

Formato exacto:
{"asignaciones":[{"voz":"A","rol":"docente","confianza":"alta","evidencia":"frase literal"}]}

Roles admitidos: "docente", "representante", "estudiante", "desconocido".`;

/* ── Comprobación de lo que devuelve el modelo ────────────────────────────── */

/** Sin tildes, sin mayúsculas y sin espacios de más: para comparar textos. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Longitud mínima de la evidencia. Más corta no demuestra nada. */
const MIN_EVIDENCIA = 20;

/**
 * Convierte lo que propuso el modelo en sugerencias que se pueden enseñar.
 *
 * Todas las reglas se aplican **en código**, no se le confían al modelo. Un
 * prompt es una petición; esto es una garantía.
 */
export function resolveSuggestions(
  guesses: RoleGuess[],
  participants: Participant[],
  transcript: string,
): VoiceSuggestion[] {
  const texto = normalizar(transcript);

  /* 1 · Se descarta lo que no se sostiene por sí solo. */
  const validas = guesses.filter((g) => {
    if (g.rol === 'desconocido') return false;
    if (g.confianza !== 'alta') return false;
    if (!g.voz) return false;

    const evidencia = normalizar(g.evidencia ?? '');
    if (evidencia.length < MIN_EVIDENCIA) return false;

    /*
     * La frase tiene que estar de verdad en la transcripción. Es la comprobación
     * que impide que una cita inventada pase por justificación: el modelo puede
     * equivocarse de rol, pero no puede citar algo que nadie dijo.
     */
    return texto.includes(evidencia);
  });

  /* 2 · Una voz no puede proponerse dos veces. */
  const porVoz = new Map<string, RoleGuess>();
  for (const g of validas) {
    if (porVoz.has(g.voz)) {
      // Dos propuestas para la misma voz: ninguna es fiable.
      porVoz.delete(g.voz);
      continue;
    }
    porVoz.set(g.voz, g);
  }

  /* 3 · Un rol tampoco, salvo que la reunión tenga dos personas en él. */
  const cuantos = (rol: VoiceRole) => candidatos(rol, participants).length;
  const porRol = new Map<VoiceRole, string[]>();
  for (const g of porVoz.values()) {
    porRol.set(g.rol, [...(porRol.get(g.rol) ?? []), g.voz]);
  }

  const suggestions: VoiceSuggestion[] = [];
  const usados = new Set<string>();

  for (const [voz, g] of porVoz) {
    const posibles = candidatos(g.rol, participants);

    /*
     * Ambigüedad: si el rol lo pueden ocupar dos personas de la reunión —una
     * madre y un padre, por ejemplo— el modelo ha dicho «representante» pero no
     * cuál. Proponer uno al azar sería peor que no proponer nada.
     */
    if (posibles.length !== 1) continue;

    // Y si dos voces reclaman el mismo rol habiendo una sola persona en él,
    // una de las dos está mal y no se sabe cuál.
    if ((porRol.get(g.rol)?.length ?? 0) > cuantos(g.rol)) continue;

    const [persona] = posibles;
    if (usados.has(persona.name)) continue;
    usados.add(persona.name);

    suggestions.push({
      speaker_tag: voz,
      name: persona.name,
      role: g.rol,
      evidence: g.evidencia.trim(),
    });
  }

  return suggestions.sort((a, b) => a.speaker_tag.localeCompare(b.speaker_tag));
}

/** Participantes de la reunión que encajan en un rol. */
function candidatos(rol: VoiceRole, participants: Participant[]): Participant[] {
  const presentes = participants.filter((p) => p.present !== false);
  if (rol === 'docente') return presentes.filter((p) => p.role === 'teacher');
  if (rol === 'estudiante') return presentes.filter((p) => p.role === 'student');
  if (rol === 'representante') {
    return presentes.filter(
      (p) => p.role === 'mother' || p.role === 'father' || p.role === 'other',
    );
  }
  return [];
}
