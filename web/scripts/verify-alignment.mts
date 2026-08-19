/**
 * Verificación del motor de alineación.
 *
 * El caso central sale de una grabación real de una reunión: Whisper devolvió
 * como una sola frase la pregunta de la docente y el principio de la respuesta
 * de la madre. Si la alineación no parte eso, el acta atribuye a la docente algo
 * que dijo la madre.
 *
 *   npm --prefix web run verify:alignment
 */

import {
  align,
  alignSegments,
  alignWords,
  MIN_CONFIDENCE,
  speakerOrder,
  uncertainCount,
  type SpeakerTurn,
  type TimedSegment,
} from '../src/services/transcription/alignment.ts';

let ok = 0;
let fallos = 0;

function check(nombre: string, condicion: boolean, detalle?: unknown) {
  if (condicion) {
    ok++;
    console.log(`  ✓ ${nombre}`);
  } else {
    fallos++;
    console.log(`  ✗ ${nombre}${detalle === undefined ? '' : ` → ${JSON.stringify(detalle)}`}`);
  }
}

/** Convierte una frase y su tramo temporal en palabras repartidas por igual. */
function palabras(texto: string, start: number, end: number) {
  const trozos = texto.split(/\s+/).filter(Boolean);
  const paso = (end - start) / trozos.length;
  return trozos.map((word, i) => ({
    word,
    start: +(start + i * paso).toFixed(3),
    end: +(start + (i + 1) * paso).toFixed(3),
  }));
}

console.log('\nACTA PRO · verificación del motor de alineación\n');

/* ── El caso real ────────────────────────────────────────────────────────── */

console.log('Frase que mezcla dos personas (caso real)');

// La docente pregunta hasta el segundo 22,5; la madre responde a partir de ahí.
const turnos: SpeakerTurn[] = [
  { speaker: 'SPEAKER_00', start: 18.0, end: 22.5 },
  { speaker: 'SPEAKER_01', start: 22.5, end: 30.0 },
];

const preguntaMadre = '¿Ha visto algo que le ha llamado la atención?';
const respuesta = 'Sí, pasa que Sofía no está trayendo la agenda a casa';

const mezclada: TimedSegment[] = [
  {
    text: `${preguntaMadre} ${respuesta}`,
    start: 18.0,
    end: 30.0,
    words: [...palabras(preguntaMadre, 18.0, 22.4), ...palabras(respuesta, 22.6, 30.0)],
  },
];

const alineadas = align(mezclada, turnos);
check('la frase se parte en dos intervenciones', alineadas.length === 2, alineadas.length);
check('la pregunta queda en el primer hablante', alineadas[0]?.speaker === 'SPEAKER_00', alineadas[0]?.speaker);
check('la respuesta queda en el segundo', alineadas[1]?.speaker === 'SPEAKER_01', alineadas[1]?.speaker);
check('la pregunta conserva su texto', alineadas[0]?.text.includes('llamado la atención'), alineadas[0]?.text);
check('la respuesta conserva el suyo', alineadas[1]?.text.includes('trayendo la agenda'), alineadas[1]?.text);
check(
  'ninguna palabra de la madre queda con la docente',
  !alineadas[0]?.text.includes('Sofía'),
  alineadas[0]?.text,
);
check('ambas con confianza alta', alineadas.every((u) => u.confidence >= MIN_CONFIDENCE));
check('ninguna marcada como aproximada', alineadas.every((u) => !u.coarse));

/* ── Lo que pasaría sin alineación por palabra ───────────────────────────── */

console.log('\nComparación: alineación por frase');
const porFrase = alignSegments(mezclada, turnos);
check('sin palabras queda una sola intervención', porFrase.length === 1);
check(
  'y se marca como aproximada, no como un hecho',
  porFrase[0]?.coarse === true,
);
check(
  'su confianza no llega al umbral',
  porFrase[0]!.confidence < MIN_CONFIDENCE,
  porFrase[0]?.confidence,
);

/* ── Conversación normal ─────────────────────────────────────────────────── */

console.log('\nConversación con turnos limpios');
const turnos2: SpeakerTurn[] = [
  { speaker: 'SPEAKER_00', start: 0, end: 6 },
  { speaker: 'SPEAKER_01', start: 6.2, end: 11 },
  { speaker: 'SPEAKER_00', start: 11.2, end: 18 },
];
const conversacion: TimedSegment[] = [
  { text: 'Buenos días, gracias por venir', start: 0.2, end: 5.8, words: palabras('Buenos días, gracias por venir', 0.2, 5.8) },
  { text: 'Buenos días profesora', start: 6.4, end: 10.6, words: palabras('Buenos días profesora', 6.4, 10.6) },
  { text: 'El motivo de esta reunión es el rendimiento', start: 11.4, end: 17.6, words: palabras('El motivo de esta reunión es el rendimiento', 11.4, 17.6) },
];
const r2 = align(conversacion, turnos2);
check('tres intervenciones', r2.length === 3, r2.length);
check('alternan correctamente', r2.map((u) => u.speaker).join(',') === 'SPEAKER_00,SPEAKER_01,SPEAKER_00', r2.map((u) => u.speaker));
check('dos voces detectadas en orden', speakerOrder(r2).join(',') === 'SPEAKER_00,SPEAKER_01');
check('ninguna necesita revisión', uncertainCount(r2) === 0, uncertainCount(r2));

/* ── Sin diarización ─────────────────────────────────────────────────────── */

console.log('\nSin diarización disponible');
const r3 = align(conversacion, []);
check('no se inventa ningún hablante', r3.every((u) => u.speaker === null));
check('el texto se conserva entero', r3.length === 3);
check('todo queda marcado para revisar', uncertainCount(r3) === 3);

/* ── Un mismo hablante con una pausa larga ───────────────────────────────── */

console.log('\nMismo hablante, pausa larga');
const r4 = alignWords(
  [
    { word: 'Sí.', start: 1, end: 1.4 },
    { word: 'Efectivamente', start: 9, end: 9.9 },
    { word: 'coincido', start: 9.9, end: 10.6 },
  ],
  [{ speaker: 'SPEAKER_00', start: 0, end: 12 }],
);
check('una pausa larga separa intervenciones', r4.length === 2, r4.length);
check('la breve queda sola', r4[0]?.text === 'Sí.', r4[0]?.text);

/* ── Resultado ───────────────────────────────────────────────────────────── */

console.log(`\n${ok} comprobaciones correctas, ${fallos} fallidas\n`);
process.exit(fallos === 0 ? 0 : 1);
