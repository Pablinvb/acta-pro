/**
 * Verificación del historial y del formato institucional del acta.
 *
 * Dos preguntas, las dos delicadas porque acaban impresas en un documento que
 * las dos partes firman:
 *
 *   · ¿Qué arrastra una reunión de la anterior, y con qué respaldo?
 *   · ¿A quién se le adjudica cada compromiso en la tabla del acta?
 *
 *   npm --prefix web run verify:acta
 */

import { summarise, inheritedBackground, formatDate } from '../src/services/history.ts';
import {
  agreementRows,
  developmentBlocks,
  responsibleFor,
  sequenceFromCode,
} from '../src/services/acta-format.ts';

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

type Cualquiera = Parameters<typeof summarise>[0];

function reunion(id: string, date: string, tipo = 'Rendimiento académico') {
  return {
    meeting_id: id,
    teacher_id: 'T-045',
    student_id: 'S-0231',
    teacher_name: 'Ana Pérez',
    student_name: 'Juan Pérez López',
    course: '8.º EGB "B"',
    representative_name: 'María López',
    representative_email: 'maria.lopez@email.com',
    meeting_type: tipo,
    date,
    start_time: '10:00',
    status: 'sent' as const,
    data_status: 'verified' as const,
    school_year: '2026-2027',
    participants: [],
  };
}

function acta(id: string, code: string, acuerdos: string[], compromisos: string[], responsables: string[] = []) {
  return {
    meeting_id: id,
    document_code: code,
    status: 'final' as const,
    generated_at: '2026-03-02T10:00:00Z',
    sections: [
      { number: 2, title: 'Motivo de la reunión' as const, paragraphs: ['Bajo rendimiento en álgebra.'] },
      { number: 3, title: 'Antecedentes relevantes' as const, items: [] },
      { number: 4, title: 'Temas tratados' as const, items: ['Notas del primer parcial'] },
      { number: 7, title: 'Acuerdos' as const, items: acuerdos },
      { number: 8, title: 'Compromisos' as const, items: compromisos },
      { number: 9, title: 'Responsables' as const, items: responsables },
    ],
  };
}

console.log('\nACTA PRO · historial y formato institucional\n');

/* ── Historial ───────────────────────────────────────────────────────────── */

console.log('Historial del estudiante');

const registros: Cualquiera = [
  {
    meeting: reunion('M-1', '2026-03-02'),
    minutes: acta('M-1', 'ACTA-2026-JUAN-PEREZ-0001', ['Refuerzo los martes'], ['La madre revisará la agenda a diario']),
    followUps: [{ meeting_id: 'M-1', date: '2026-04-02', description: 'Revisar avance' }],
  },
  {
    meeting: reunion('M-2', '2026-06-10', 'Seguimiento de compromisos'),
    minutes: acta('M-2', 'ACTA-2026-JUAN-PEREZ-0002', ['Continuar el refuerzo'], []),
    followUps: [{ meeting_id: 'M-2', date: '2026-07-15', description: 'Nueva revisión' }],
  },
];

{
  const h = summarise(registros, '2026-08-14');
  comprobar('cuenta las reuniones previas', h.count === 2);
  comprobar('la más reciente va primero', h.meetings[0].meetingId === 'M-2');
  comprobar('«la última» es la más reciente', h.last?.meetingId === 'M-2');
  comprobar(
    'lo pendiente sale sólo de la última reunión',
    h.pending.length === 1 && h.pending[0].text === 'Continuar el refuerzo',
    `salieron ${h.pending.length}: ${h.pending.map((p) => p.text).join(' | ')}`,
  );
  comprobar(
    'marca vencido si la fecha de seguimiento ya pasó',
    h.pending[0].overdue === true,
  );
  comprobar('y dice cuál era esa fecha', h.pending[0].dueDate === '2026-07-15');
  comprobar(
    'lo pendiente lleva el código del acta que lo respalda',
    h.pending[0].documentCode === 'ACTA-2026-JUAN-PEREZ-0002',
  );
}

{
  // La misma historia mirada antes de que venza el seguimiento.
  const h = summarise(registros, '2026-07-01');
  comprobar('no marca vencido antes de la fecha', h.pending[0].overdue === false);
}

{
  const h = summarise([], '2026-08-14');
  comprobar('sin reuniones previas no hay historial', h.count === 0 && h.last === null);
  comprobar('ni nada pendiente', h.pending.length === 0);
}

{
  // Una reunión celebrada de la que todavía no hay acta guardada.
  const h = summarise(
    [{ meeting: reunion('M-3', '2026-05-01'), minutes: null, followUps: [] }],
    '2026-08-14',
  );
  comprobar('una reunión sin acta no rompe el historial', h.count === 1);
  comprobar('y no aporta nada pendiente', h.pending.length === 0);
}

/* ── Antecedentes heredados ──────────────────────────────────────────────── */

console.log('\nAntecedentes que hereda el acta');

{
  const h = summarise(registros, '2026-08-14');
  const lineas = inheritedBackground(h);

  comprobar('se redacta al menos una línea', lineas.length > 0);
  comprobar(
    'cada línea dice de qué reunión viene',
    lineas.every((l) => l.includes('10 de junio de 2026') || l.includes('15 de julio de 2026')),
    lineas.join(' / '),
  );
  comprobar(
    'y cita el código del acta, para poder comprobarlo',
    lineas[0].includes('ACTA-2026-JUAN-PEREZ-0002'),
    lineas[0],
  );
  comprobar(
    'no hereda nada de reuniones más antiguas que la última',
    !lineas.some((l) => l.includes('Refuerzo los martes')),
  );
}

comprobar('sin historial no hay antecedentes heredados',
  inheritedBackground(summarise([], '2026-08-14')).length === 0);

/* ── Fechas ──────────────────────────────────────────────────────────────── */

console.log('\nFechas');
comprobar('formatea en castellano', formatDate('2026-08-14') === '14 de agosto de 2026');
comprobar('sin cero a la izquierda', formatDate('2026-01-05') === '5 de enero de 2026');
comprobar('una fecha ilegible se devuelve tal cual', formatDate('mañana') === 'mañana');

/* ── Numeración del acta ─────────────────────────────────────────────────── */

console.log('\nNumeración');
comprobar('extrae el número del código', sequenceFromCode('ACTA-2026-JUAN-PEREZ-0001') === '0001');
comprobar(
  'si el código no acaba en número, se usa entero',
  sequenceFromCode('BORRADOR') === 'BORRADOR',
);

/* ── Responsable de cada acuerdo ─────────────────────────────────────────── */

console.log('\nResponsable de cada compromiso');

comprobar(
  'si el nombre aparece en el acuerdo, es esa persona',
  responsibleFor('María López revisará la agenda a diario', ['Ana Pérez', 'María López']) ===
    'María López',
);

comprobar(
  'reconoce también el nombre de pila',
  responsibleFor('María revisará la agenda', ['Ana Pérez', 'María López']) === 'María López',
);

comprobar(
  'con un solo responsable en la reunión, se le asigna',
  responsibleFor('Reforzar álgebra los martes', ['Ana Pérez']) === 'Ana Pérez',
);

comprobar(
  'con varios y sin mención, la casilla queda VACÍA',
  responsibleFor('Reforzar álgebra los martes', ['Ana Pérez', 'María López']) === '',
  'atribuir un compromiso a quien no le toca, en un documento firmado, es el daño que hay que evitar',
);

comprobar('sin responsables, casilla vacía', responsibleFor('Cualquier cosa', []) === '');

/* Papeles: la regla que más fácil se equivoca, así que se prueba a conciencia. */

const papeles = [
  { role: 'teacher' as const, name: 'Ana Pérez' },
  { role: 'representative' as const, name: 'María López' },
  { role: 'student' as const, name: 'Juan Pérez' },
];
const varios = ['Ana Pérez', 'María López', 'Juan Pérez'];

comprobar(
  'si el acuerdo empieza por el papel, resuelve la persona',
  responsibleFor('La docente registrará la asistencia al refuerzo.', varios, papeles) ===
    'Ana Pérez',
);

comprobar(
  'lo mismo con la representante',
  responsibleFor('La representante revisará el cuaderno cada domingo.', varios, papeles) ===
    'María López',
);

comprobar(
  'y con el estudiante',
  responsibleFor('El estudiante asistirá puntualmente al refuerzo.', varios, papeles) ===
    'Juan Pérez',
);

comprobar(
  'un papel NOMBRADO EN MEDIO no lo convierte en responsable',
  responsibleFor(
    'Reporte de avance el primer viernes de cada mes al correo de la representante.',
    varios,
    papeles,
  ) === '',
  'ahí la representante es la destinataria, no quien se compromete: el reporte lo manda la docente',
);

comprobar(
  'una frase sin sujeto tampoco se adjudica',
  responsibleFor('Recuperación de las dos tareas pendientes.', varios, papeles) === '',
);

comprobar(
  'el nombre propio sigue teniendo prioridad sobre el papel',
  responsibleFor('La docente y María López revisarán la agenda.', ['María López'], papeles) ===
    'María López',
);

/* ── Tabla de acuerdos y compromisos ─────────────────────────────────────── */

console.log('\nTabla de acuerdos y compromisos');

{
  const a = acta(
    'M-9',
    'ACTA-2026-JUAN-PEREZ-0003',
    ['Refuerzo los martes'],
    ['María López revisará la agenda'],
    ['Ana Pérez', 'María López'],
  );
  const filas = agreementRows(a, formatDate('2026-09-15'));

  comprobar('junta acuerdos y compromisos', filas.length === 2);
  comprobar('los acuerdos van primero', filas[0].text === 'Refuerzo los martes');
  comprobar('resuelve el responsable donde puede', filas[1].responsible === 'María López');
  comprobar('y lo deja vacío donde no', filas[0].responsible === '');
  comprobar('la fecha plazo sale del seguimiento', filas[0].dueDate === '15 de septiembre de 2026');
}

{
  const filas = agreementRows(acta('M-9', 'X-1', [], [], []), '');
  comprobar('sin acuerdos, la tabla queda vacía', filas.length === 0);
}

/* ── Desarrollo de la reunión ────────────────────────────────────────────── */

console.log('\nDesarrollo de la reunión');

{
  const bloques = developmentBlocks(acta('M-9', 'X-1', [], [], []));
  comprobar('siempre aparecen todos los apartados', bloques.length === 7);
  comprobar(
    'un apartado vacío lo dice, no se omite',
    bloques.find((b) => b.label === 'Observaciones')?.lines[0] === 'Sin información registrada.',
  );
  comprobar(
    'el motivo se imprime como texto corrido, sin viñeta',
    bloques.find((b) => b.label === 'Motivo de la Reunión')?.bullet === false,
  );
  comprobar(
    'los temas se imprimen con viñetas',
    bloques.find((b) => b.label === 'Temas Tratados')?.bullet === true,
  );
}

/* ── Resultado ───────────────────────────────────────────────────────────── */

console.log(`\n${ok} comprobaciones correctas, ${fallos} fallidas\n`);
process.exit(fallos === 0 ? 0 : 1);
