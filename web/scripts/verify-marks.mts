/**
 * Verificación de las marcas de la docente.
 *
 * La pregunta que responde: cuando la docente pulsa «marcar este momento» en
 * mitad de una reunión, ¿queda señalada la frase que tenía en la cabeza?
 *
 * Importa acertarlo. La marca es lo único que la docente hace a mano durante la
 * reunión, y decide qué revisa después: si señala la frase equivocada, revisará
 * la equivocada.
 *
 *   npm --prefix web run verify:marks
 */

import { applyMarks, locateMarks, MARK_WINDOW_SECONDS } from '../src/services/transcription/marks.ts';

let ok = 0;
let fallos = 0;

function comprobar(descripcion: string, condicion: boolean, detalle = '') {
  if (condicion) {
    ok++;
    console.log(`  ✓ ${descripcion}`);
  } else {
    fallos++;
    console.log(`  ✗ ${descripcion}${detalle ? `\n      ${detalle}` : ''}`);
  }
}

console.log('\nACTA PRO · marcas de la docente\n');

/*
 * Una reunión pequeña, con silencios reales entre intervenciones. Los huecos
 * son lo que hace interesante el problema: la docente casi nunca pulsa mientras
 * alguien habla.
 */
const conversacion = [
  { start: 0, end: 4.2, texto: 'Buenos días, gracias por venir.' },
  { start: 5.0, end: 11.5, texto: 'Sofía ha faltado seis veces este quimestre.' },
  { start: 13.0, end: 19.8, texto: 'Me comprometo a revisar su agenda todos los días.' },
  { start: 25.0, end: 30.0, texto: 'Volvemos a vernos en dos semanas.' },
];
const rangos = conversacion.map((c) => ({ start: c.start, end: c.end }));

/* ── Lo esencial ─────────────────────────────────────────────────────────── */

console.log('Situar la marca');

comprobar(
  'una marca dentro de una intervención señala esa intervención',
  locateMarks(rangos, [15.0])[0] === 2,
);

comprobar(
  'pulsar justo al acabar la frase señala esa frase, no la siguiente',
  locateMarks(rangos, [20.4])[0] === 2,
  `devolvió ${locateMarks(rangos, [20.4])[0]}`,
);

comprobar(
  'pulsar en mitad del silencio mira hacia atrás, no hacia adelante',
  // 22.4 s: a 2,6 s del final de la 2 y a 2,6 s del inicio de la 3.
  locateMarks(rangos, [22.4])[0] === 2,
  `devolvió ${locateMarks(rangos, [22.4])[0]}`,
);

comprobar(
  'una marca al principio, antes de que nadie hable, mira hacia adelante',
  locateMarks([{ start: 3, end: 6 }], [0])[0] === 0,
);

comprobar(
  `una marca a más de ${MARK_WINDOW_SECONDS} s de cualquier frase se descarta`,
  locateMarks(rangos, [200]).length === 0,
);

comprobar('una marca negativa se descarta', locateMarks(rangos, [-5]).length === 0);
comprobar('NaN se descarta', locateMarks(rangos, [Number.NaN]).length === 0);
comprobar('Infinity se descarta', locateMarks(rangos, [Number.POSITIVE_INFINITY]).length === 0);
comprobar('sin intervenciones no se rompe', locateMarks([], [10]).length === 0);

/* ── El caso que dio origen al botón ─────────────────────────────────────── */

console.log('\nEl compromiso');

{
  // La madre dice «me comprometo a revisar su agenda todos los días» entre los
  // segundos 13 y 19,8. La docente lo oye y pulsa un par de segundos después,
  // ya en silencio.
  const segmentos = conversacion.map((c) => ({ texto: c.texto }) as { texto: string; flagged_by_teacher?: boolean });
  const señaladas = applyMarks(segmentos, rangos, [21.6]);

  comprobar('se señala exactamente una intervención', señaladas === 1);
  comprobar(
    'y es el compromiso, no lo que vino después',
    segmentos[2].flagged_by_teacher === true && segmentos[3].flagged_by_teacher !== true,
    `señaladas: ${segmentos.map((s, i) => (s.flagged_by_teacher ? i : null)).filter((x) => x !== null).join(', ')}`,
  );
}

/* ── Recuento ────────────────────────────────────────────────────────────── */

console.log('\nRecuento');

{
  const segmentos = conversacion.map(() => ({}) as { flagged_by_teacher?: boolean });
  // Dos pulsaciones sobre la misma frase: la docente insistió.
  const señaladas = applyMarks(segmentos, rangos, [14.0, 15.5]);
  comprobar('dos marcas en la misma frase cuentan como una', señaladas === 1);
}

{
  const segmentos = conversacion.map(() => ({}) as { flagged_by_teacher?: boolean });
  const señaladas = applyMarks(segmentos, rangos, [2.0, 8.0, 15.0]);
  comprobar('tres marcas en frases distintas cuentan como tres', señaladas === 3);
  comprobar(
    'y son las tres primeras',
    [0, 1, 2].every((i) => segmentos[i].flagged_by_teacher === true) &&
      segmentos[3].flagged_by_teacher !== true,
  );
}

{
  const segmentos = conversacion.map(() => ({}) as { flagged_by_teacher?: boolean });
  comprobar('sin marcas no se toca nada', applyMarks(segmentos, rangos, []) === 0);
  comprobar(
    'y ninguna intervención queda señalada',
    segmentos.every((s) => s.flagged_by_teacher === undefined),
  );
}

/* ── Resultado ───────────────────────────────────────────────────────────── */

console.log(`\n${ok} comprobaciones correctas, ${fallos} fallidas\n`);
process.exit(fallos === 0 ? 0 : 1);
