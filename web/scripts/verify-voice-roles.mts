/**
 * Verificación de las sugerencias de rol.
 *
 * Todas las reglas se aplican en código, no se le confían al modelo: un prompt
 * es una petición, esto es una garantía. Y lo que se está garantizando es que
 * nunca se proponga atribuir una frase a quien no la dijo, en un documento que
 * las dos partes van a firmar.
 *
 *   npm --prefix web run verify:voces
 */

import {
  anonymousTranscript,
  resolveSuggestions,
  type RoleGuess,
} from '../src/services/voice-roles.ts';

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

/* ── Fixtures ────────────────────────────────────────────────────────────── */

const DOCENTE = 'He observado en clase que entrega las tareas tarde desde el segundo parcial';
const FAMILIA = 'En casa mi hijo dice que no tiene deberes y yo no puedo comprobarlo';
const ALUMNO = 'Se me juntaron las entregas y no supe organizarme con las fechas';

const TRANSCRIPCION = [
  `Voz A: ${DOCENTE}`,
  `Voz B: ${FAMILIA}`,
  `Voz C: ${ALUMNO}`,
].join('\n');

const PARTICIPANTES = [
  { role: 'teacher' as const, name: 'Ana Pérez', present: true },
  { role: 'mother' as const, name: 'María López', present: true },
  { role: 'student' as const, name: 'Juan Pérez', present: true },
];

const guess = (
  voz: string,
  rol: RoleGuess['rol'],
  evidencia: string,
  confianza: RoleGuess['confianza'] = 'alta',
): RoleGuess => ({ voz, rol, confianza, evidencia });

console.log('\nACTA PRO · sugerencia de quién es cada voz\n');

/* ── El texto que ve el modelo ───────────────────────────────────────────── */

console.log('Lo que se le manda al modelo');

{
  const segmentos = [
    { meeting_id: 'M', timestamp: '', text: DOCENTE, confidence_score: 1, speaker_tag: 'A', speaker: 'Ana Pérez' },
    { meeting_id: 'M', timestamp: '', text: FAMILIA, confidence_score: 1, speaker_tag: 'B' },
    { meeting_id: 'M', timestamp: '', text: 'sin voz', confidence_score: 1 },
  ];
  const texto = anonymousTranscript(segmentos);

  comprobar('va con etiquetas anónimas', texto.includes('Voz A:') && texto.includes('Voz B:'));
  comprobar(
    'NO va con los nombres ya puestos',
    !texto.includes('Ana Pérez'),
    'con los nombres delante el modelo no deduciría nada, sólo copiaría',
  );
  comprobar('se descarta lo que no tiene voz asignada', !texto.includes('sin voz'));
}

/* ── Lo que se acepta ────────────────────────────────────────────────────── */

console.log('\nPropuestas que se aceptan');

{
  const s = resolveSuggestions(
    [
      guess('A', 'docente', DOCENTE),
      guess('B', 'representante', FAMILIA),
      guess('C', 'estudiante', ALUMNO),
    ],
    PARTICIPANTES,
    TRANSCRIPCION,
  );

  comprobar('las tres voces se resuelven', s.length === 3, JSON.stringify(s.map((x) => x.speaker_tag)));
  comprobar('la docente', s.find((x) => x.speaker_tag === 'A')?.name === 'Ana Pérez');
  comprobar('la representante', s.find((x) => x.speaker_tag === 'B')?.name === 'María López');
  comprobar('el estudiante', s.find((x) => x.speaker_tag === 'C')?.name === 'Juan Pérez');
  comprobar('cada una lleva su evidencia', s.every((x) => x.evidence.length > 20));
}

/* ── Lo que se rechaza ───────────────────────────────────────────────────── */

console.log('\nPropuestas que se rechazan');

comprobar(
  'una cita que NADIE dijo',
  resolveSuggestions(
    [guess('A', 'docente', 'Soy la docente titular de este curso desde septiembre')],
    PARTICIPANTES,
    TRANSCRIPCION,
  ).length === 0,
  'es la comprobación que impide que una justificación inventada pase por prueba',
);

comprobar(
  'confianza media',
  resolveSuggestions([guess('A', 'docente', DOCENTE, 'media')], PARTICIPANTES, TRANSCRIPCION)
    .length === 0,
);

comprobar(
  'rol desconocido',
  resolveSuggestions([guess('A', 'desconocido', DOCENTE)], PARTICIPANTES, TRANSCRIPCION).length === 0,
);

comprobar(
  'evidencia demasiado corta para demostrar nada',
  resolveSuggestions([guess('A', 'docente', 'en clase')], PARTICIPANTES, TRANSCRIPCION).length === 0,
);

comprobar(
  'evidencia vacía',
  resolveSuggestions([guess('A', 'docente', '')], PARTICIPANTES, TRANSCRIPCION).length === 0,
);

{
  // Dos propuestas para la misma voz: el modelo se contradice.
  const s = resolveSuggestions(
    [guess('A', 'docente', DOCENTE), guess('A', 'representante', FAMILIA)],
    PARTICIPANTES,
    TRANSCRIPCION,
  );
  comprobar('dos roles para la misma voz anulan ambos', s.length === 0);
}

{
  /*
   * Dos voces reclamando «representante» habiendo una sola representante. Una
   * de las dos está mal y no se sabe cuál: no se propone ninguna.
   */
  const s = resolveSuggestions(
    [guess('A', 'representante', DOCENTE), guess('B', 'representante', FAMILIA)],
    PARTICIPANTES,
    TRANSCRIPCION,
  );
  comprobar('dos voces para una sola persona no se adjudican', s.length === 0, JSON.stringify(s));
}

{
  /*
   * Madre Y padre presentes: «representante» no dice cuál de los dos. Elegir
   * uno al azar sería peor que no proponer nada.
   */
  const dosRepresentantes = [
    { role: 'teacher' as const, name: 'Ana Pérez', present: true },
    { role: 'mother' as const, name: 'María López', present: true },
    { role: 'father' as const, name: 'Jorge Andrade', present: true },
  ];
  const s = resolveSuggestions(
    [guess('A', 'docente', DOCENTE), guess('B', 'representante', FAMILIA)],
    dosRepresentantes,
    TRANSCRIPCION,
  );
  comprobar(
    'con madre Y padre presentes, «representante» queda sin resolver',
    s.length === 1 && s[0].speaker_tag === 'A',
    JSON.stringify(s),
  );
}

comprobar(
  'un rol que nadie ocupa en esta reunión',
  resolveSuggestions(
    [guess('A', 'estudiante', ALUMNO)],
    PARTICIPANTES.filter((p) => p.role !== 'student'),
    TRANSCRIPCION,
  ).length === 0,
);

comprobar(
  'un participante marcado como ausente no se propone',
  resolveSuggestions(
    [guess('C', 'estudiante', ALUMNO)],
    PARTICIPANTES.map((p) => (p.role === 'student' ? { ...p, present: false } : p)),
    TRANSCRIPCION,
  ).length === 0,
  'no puede aparecer en el acta hablando quien no estuvo',
);

comprobar('sin propuestas, ninguna sugerencia', resolveSuggestions([], PARTICIPANTES, TRANSCRIPCION).length === 0);

/* ── Detalles de comparación ─────────────────────────────────────────────── */

console.log('\nComparación de la evidencia');

comprobar(
  'las tildes y las mayúsculas no impiden reconocer la cita',
  resolveSuggestions(
    [guess('A', 'docente', 'HE OBSERVADO EN CLASE QUE ENTREGA LAS TAREAS TARDE')],
    PARTICIPANTES,
    TRANSCRIPCION,
  ).length === 1,
);

comprobar(
  'los espacios de más tampoco',
  resolveSuggestions(
    [guess('A', 'docente', '  He  observado   en clase que entrega las tareas tarde  ')],
    PARTICIPANTES,
    TRANSCRIPCION,
  ).length === 1,
);

comprobar(
  'pero una palabra cambiada sí: ya no es una cita',
  resolveSuggestions(
    [guess('A', 'docente', 'He observado en clase que NUNCA entrega las tareas tarde')],
    PARTICIPANTES,
    TRANSCRIPCION,
  ).length === 0,
);

console.log(`\n${ok} comprobaciones correctas, ${fallos} fallidas\n`);
process.exitCode = fallos === 0 ? 0 : 1;
