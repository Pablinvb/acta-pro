/**
 * Datos ficticios de demostración.
 *
 * Basados en `docs/DATOS_DE_PRUEBA.md`. Permiten recorrer la cadena completa de
 * la Fase 1 sin depender de Runachay ni tocar datos reales de estudiantes.
 * Ninguna persona aquí es real.
 */

import type {
  ArchivedDocument,
  FollowUp,
  Meeting,
  MeetingMinutes,
  ReviewedFinding,
  Representative,
  Signature,
  Student,
  Teacher,
  TranscriptSegment,
} from '../types';

export const teacher: Teacher = {
  teacher_id: 'T-045',
  name: 'Ana Pérez',
  subject: 'Matemáticas',
  email: 'ana.perez@colegio.edu.ec',
  phone: '+593 98 445 2210',
  position: 'Docente de Matemáticas',
};

/**
 * Docentes que pueden acceder. Hoy es una lista fija porque todavía no hay
 * almacén de usuarios; sustituir por una consulta real cuando exista.
 */
export const teachers: Teacher[] = [teacher];

export const student: Student = {
  student_id: 'S-0231',
  name: 'Juan Pérez López',
  course: '8.º EGB "B"',
  average: 6.8,
  attendance_rate: 0.91,
  late_arrivals: 4,
  observations: [
    'Dos tareas de álgebra no entregadas (2 y 9 de julio de 2026).',
    'Participación regular en clase; sin novedades de comportamiento.',
    'Sin derivaciones previas al Departamento de Consejería Estudiantil.',
  ],
};

export const representative: Representative = {
  representative_id: 'R-0188',
  name: 'María López',
  relation: 'madre',
  email: 'maria.lopez@email.com',
  phone: '+593 99 812 4470',
  language: 'Español',
};

export const SCHOOL_YEAR = '2026-2027';
export const ACTIVE_MEETING_ID = 'ACTA-2026-0001';

export const meetings: Meeting[] = [
  {
    meeting_id: ACTIVE_MEETING_ID,
    teacher_id: 'T-045',
    student_id: 'S-0231',
    teacher_name: 'Ana Pérez',
    teacher_email: 'ana.perez@colegio.edu.ec',
    teacher_phone: '+593 98 445 2210',
    teacher_position: 'Docente de Matemáticas',
    student_name: 'Juan Pérez López',
    course: '8.º EGB "B"',
    representative_name: 'María López',
    representative_email: 'maria.lopez@email.com',
    meeting_type: 'Rendimiento académico',
    date: '2026-08-14',
    start_time: '10:00',
    end_time: '10:41',
    place: 'Sala de reuniones · Bloque A',
    status: 'awaiting_teacher_review',
    data_status: 'verified',
    school_year: SCHOOL_YEAR,
    participants: [
      { role: 'teacher', name: 'Ana Pérez', present: true },
      { role: 'mother', name: 'María López', present: true },
      { role: 'student', name: 'Juan Pérez', present: true },
    ],
  },
  {
    meeting_id: 'ACTA-2026-0002',
    teacher_id: 'T-045',
    student_id: 'S-0244',
    teacher_name: 'Ana Pérez',
    teacher_email: 'ana.perez@colegio.edu.ec',
    teacher_phone: '+593 98 445 2210',
    teacher_position: 'Docente de Matemáticas',
    student_name: 'Camila Andrade Ruiz',
    course: '8.º EGB "B"',
    representative_name: 'Jorge Andrade',
    representative_email: 'jorge.andrade@email.com',
    meeting_type: 'Convivencia escolar',
    date: '2026-08-14',
    start_time: '11:30',
    place: 'Sala de reuniones · Bloque A',
    status: 'scheduled',
    data_status: 'verified',
    school_year: SCHOOL_YEAR,
    participants: [
      { role: 'teacher', name: 'Ana Pérez' },
      { role: 'father', name: 'Jorge Andrade' },
      { role: 'student', name: 'Camila Andrade' },
    ],
  },
  {
    meeting_id: 'ACTA-2026-0003',
    teacher_id: 'T-045',
    student_id: 'S-0119',
    teacher_name: 'Ana Pérez',
    teacher_email: 'ana.perez@colegio.edu.ec',
    teacher_phone: '+593 98 445 2210',
    teacher_position: 'Docente de Matemáticas',
    student_name: 'Mateo Chávez Salinas',
    course: '9.º EGB "A"',
    representative_name: 'Rosa Salinas',
    representative_email: '',
    meeting_type: 'Seguimiento de compromisos',
    date: '2026-08-14',
    start_time: '14:15',
    place: 'Oficina de tutoría',
    status: 'scheduled',
    // Runachay no devolvió el correo: el WF 15 no podría enviar el acta.
    data_status: 'manual_verification_required',
    school_year: SCHOOL_YEAR,
    participants: [
      { role: 'teacher', name: 'Ana Pérez' },
      { role: 'mother', name: 'Rosa Salinas' },
      { role: 'student', name: 'Mateo Chávez' },
    ],
  },
];

export function findMeeting(id: string): Meeting | undefined {
  return meetings.find((m) => m.meeting_id === id);
}

/* ── Transcripción (WF 06) ────────────────────────────────────────────────── */

export const transcript: TranscriptSegment[] = [
  {
    meeting_id: ACTIVE_MEETING_ID,
    timestamp: '2026-08-14T10:02:18Z',
    speaker_tag: 'A',
    speaker_confirmed: false,
    confidence_score: 0.94,
    text: 'Buenos días, gracias por venir. El objetivo de esta reunión es revisar el rendimiento académico de Juan en Matemáticas durante el primer parcial.',
  },
  {
    meeting_id: ACTIVE_MEETING_ID,
    timestamp: '2026-08-14T10:02:51Z',
    speaker_tag: 'B',
    speaker_confirmed: false,
    confidence_score: 0.91,
    text: 'Buenos días. La verdad es que no conocía las calificaciones del parcial hasta que recibí la citación.',
  },
  {
    meeting_id: ACTIVE_MEETING_ID,
    timestamp: '2026-08-14T10:03:34Z',
    speaker_tag: 'A',
    speaker_confirmed: false,
    confidence_score: 0.95,
    text: 'El promedio actual es de 6,8. Hay además dos tareas de álgebra que no fueron entregadas, el 2 y el 9 de julio.',
  },
  {
    meeting_id: ACTIVE_MEETING_ID,
    timestamp: '2026-08-14T10:04:12Z',
    speaker_tag: 'C',
    speaker_confirmed: false,
    confidence_score: 0.88,
    text: 'Sí, esas dos no las entregué. Me confundí con las fechas del cuaderno.',
  },
  {
    meeting_id: ACTIVE_MEETING_ID,
    timestamp: '2026-08-14T10:05:07Z',
    speaker_tag: 'B',
    speaker_confirmed: false,
    confidence_score: 0.9,
    text: 'En casa no tenemos un horario fijo para las tareas, yo salgo del trabajo a las siete.',
  },
  {
    meeting_id: ACTIVE_MEETING_ID,
    timestamp: '2026-08-14T10:06:40Z',
    speaker_tag: 'A',
    speaker_confirmed: false,
    confidence_score: 0.96,
    flagged_by_teacher: true,
    text: 'Propongo un plan de refuerzo semanal los miércoles de 14:00 a 15:00, empezando el 20 de agosto.',
  },
  {
    meeting_id: ACTIVE_MEETING_ID,
    timestamp: '2026-08-14T10:07:22Z',
    speaker_tag: 'B',
    speaker_confirmed: false,
    confidence_score: 0.93,
    text: 'De acuerdo. Me comprometo a revisar el cuaderno de tareas los domingos y a firmarlo.',
  },
  {
    meeting_id: ACTIVE_MEETING_ID,
    timestamp: '2026-08-14T10:08:03Z',
    speaker_tag: 'A',
    speaker_confirmed: false,
    confidence_score: 0.94,
    text: 'Perfecto. Enviaré el reporte de avance el primer viernes de cada mes por el correo institucional.',
  },
];

/* ── Acta generada (WF 10) ────────────────────────────────────────────────── */

export const minutes: MeetingMinutes = {
  meeting_id: ACTIVE_MEETING_ID,
  document_code: 'ACTA-2026-JUAN-PEREZ-0001',
  status: 'draft',
  generated_at: '2026-08-14T10:44:00Z',
  sections: [
    {
      number: 1,
      title: 'Datos generales',
      fields: [
        { label: 'Estudiante', value: 'Juan Pérez López' },
        { label: 'Curso', value: '8.º EGB "B"' },
        { label: 'Representante', value: 'María López (madre)' },
        { label: 'Docente', value: 'Ana Pérez' },
        { label: 'Fecha', value: '14 de agosto de 2026' },
        { label: 'Hora', value: '10:02 – 10:41' },
      ],
    },
    {
      number: 2,
      title: 'Motivo de la reunión',
      paragraphs: [
        'Revisión del rendimiento académico del estudiante en la asignatura de Matemáticas durante el primer parcial del período lectivo 2026-2027.',
      ],
    },
    {
      number: 3,
      title: 'Antecedentes relevantes',
      items: [
        'Promedio de 6,8 en Matemáticas al cierre del primer parcial.',
        'Juan siempre llega tarde y no muestra interés por la materia.',
        'Dos tareas de álgebra sin entregar, correspondientes al 2 y al 9 de julio de 2026.',
      ],
    },
    {
      number: 4,
      title: 'Temas tratados',
      items: [
        'Calificaciones del primer parcial en Matemáticas.',
        'Tareas pendientes de entrega.',
        'Organización del tiempo de estudio en casa.',
        'Propuesta de plan de refuerzo académico.',
      ],
    },
    {
      number: 5,
      title: 'Intervenciones relevantes',
      items: [
        'La representante manifestó que desconocía las calificaciones del parcial hasta recibir la citación.',
        'El estudiante reconoció no haber entregado dos tareas por confusión con las fechas.',
        'Se nota que en casa no hay control sobre las tareas.',
      ],
    },
    {
      number: 6,
      title: 'Situaciones analizadas',
      items: [
        'La madre se muestra despreocupada por la situación académica de su hijo.',
        'Ausencia de un horario fijo de estudio en el hogar por razones laborales de la representante.',
      ],
    },
    {
      number: 7,
      title: 'Acuerdos',
      items: [
        'Plan de refuerzo de Matemáticas los miércoles de 14:00 a 15:00, a partir del 20 de agosto de 2026.',
        'Recuperación de las dos tareas pendientes hasta el 22 de agosto de 2026.',
        'Reporte de avance el primer viernes de cada mes al correo de la representante.',
      ],
    },
    {
      number: 8,
      title: 'Compromisos',
      items: [
        'La representante revisará y firmará el cuaderno de tareas cada domingo.',
        'El estudiante asistirá puntualmente al refuerzo semanal.',
        'La docente registrará la asistencia al refuerzo y notificará las inasistencias.',
      ],
    },
    {
      number: 9,
      title: 'Responsables',
      items: [
        'Ana Pérez — docente de Matemáticas: ejecución y registro del plan de refuerzo.',
        'María López — representante: acompañamiento y verificación semanal en casa.',
        'Juan Pérez López — estudiante: asistencia y entrega de tareas.',
      ],
    },
    {
      number: 10,
      title: 'Evidencias mencionadas',
      items: [
        'Registro de calificaciones del primer parcial (sistema Runachay).',
        'Registro de entregas de la asignatura, julio de 2026.',
      ],
    },
    {
      number: 11,
      title: 'Fecha o acciones de seguimiento',
      paragraphs: [
        'Próxima reunión de seguimiento: 4 de septiembre de 2026, para evaluar el avance del plan de refuerzo.',
      ],
    },
    {
      number: 12,
      title: 'Observaciones',
      items: [
        'El estudiante presenta un cuadro de déficit de atención.',
        'La reunión se desarrolló en un clima de cooperación entre las partes.',
      ],
    },
    { number: 13, title: 'Firmas' },
  ],
};

/* ── Revisión de lenguaje (WF 09) ─────────────────────────────────────────── */

/**
 * Hallazgos sobre el borrador anterior. Los `fragment` coinciden literalmente
 * con el texto del acta: así la interfaz puede resaltarlos sin heurísticas.
 *
 * El WF 09 analizó 15 fragmentos; los 11 restantes salieron GREEN y por eso no
 * aparecen aquí — solo se listan los que piden una decisión de la docente.
 */
export const languageFindings: ReviewedFinding[] = [
  {
    id: 'f1',
    section: 6,
    level: 'RED',
    resolution: 'open',
    fragment: 'La madre se muestra despreocupada por la situación académica de su hijo.',
    reason:
      'Juicio de valor sobre la representante. Atribuye una actitud que no consta en la transcripción y expone a la docente ante un reclamo formal.',
    suggested_text:
      'La representante indicó que desconocía las calificaciones del primer parcial hasta recibir la citación.',
  },
  {
    id: 'f4',
    section: 12,
    level: 'RED',
    resolution: 'open',
    fragment: 'El estudiante presenta un cuadro de déficit de atención.',
    reason:
      'Diagnóstico clínico. El acta no puede emitir diagnósticos: corresponde al Departamento de Consejería Estudiantil.',
    suggested_text:
      'Se sugiere derivar el caso al Departamento de Consejería Estudiantil para una valoración especializada.',
  },
  {
    id: 'f2',
    section: 3,
    level: 'YELLOW',
    resolution: 'open',
    fragment: 'Juan siempre llega tarde y no muestra interés por la materia.',
    reason:
      'Generalización absoluta («siempre») y atribución de intención no verificable. Conviene sustituirla por el dato registrado.',
    suggested_text:
      'Se registran 4 atrasos durante el mes de julio de 2026 según el sistema Runachay.',
  },
  {
    id: 'f3',
    section: 5,
    level: 'YELLOW',
    resolution: 'open',
    fragment: 'Se nota que en casa no hay control sobre las tareas.',
    reason:
      'Afirmación sin evidencia sobre el entorno familiar e información sensible innecesaria para el acta.',
    suggested_text:
      'La representante señaló que no dispone de un horario fijo para acompañar la realización de tareas.',
  },
];

/** Fragmentos totales que analizó el WF 09, incluidos los GREEN. */
export const totalFragmentsReviewed = 15;

/* ── Firmas, archivo y seguimiento ────────────────────────────────────────── */

export const signatures: Signature[] = [
  { meeting_id: ACTIVE_MEETING_ID, signer_role: 'teacher', signer_name: 'Ana Pérez', signed_at: '2026-08-14T10:53:00Z' },
  { meeting_id: ACTIVE_MEETING_ID, signer_role: 'representative', signer_name: 'María López', signed_at: null },
];

export const drivePath = `ACTA PRO/Docentes/Ana Pérez/Juan Pérez López/${SCHOOL_YEAR}/2026-08-14 - Rendimiento académico`;

/** La transcripción va aparte, con acceso restringido. Nunca junto al acta. */
export const transcriptVaultPath = 'ACTA PRO/Transcripciones (acceso restringido)';

export const followUp: FollowUp = {
  meeting_id: ACTIVE_MEETING_ID,
  date: '2026-09-04',
  description: 'Seguimiento del plan de refuerzo · Juan Pérez López',
};

/* ── Seguimiento de compromisos ───────────────────────────────────────────── */

export type CommitmentState = 'completado' | 'en_progreso' | 'pendiente';

export interface CommitmentStep {
  /** Semana relativa: 0 es esta semana. */
  week: number;
  label: string;
  state: CommitmentState;
}

export interface CommitmentTrack {
  person: string;
  role: string;
  /** Fecha límite del compromiso completo. */
  due: string;
  steps: CommitmentStep[];
}

/**
 * Quién se comprometió a qué y cómo va.
 *
 * Se organiza por persona y no por tarea porque es como la docente lo piensa:
 * «¿la madre está cumpliendo?», no «¿cómo va la tarea 3?». Un acta produce
 * compromisos de personas concretas, y de eso trata el seguimiento.
 */
export const commitmentTracks: CommitmentTrack[] = [
  {
    person: 'Ana Pérez',
    role: 'Docente',
    due: '2026-09-04',
    steps: [
      { week: 0, label: 'Plan de refuerzo entregado', state: 'completado' },
      { week: 1, label: 'Primera sesión de refuerzo', state: 'en_progreso' },
      { week: 2, label: 'Registro de asistencia', state: 'pendiente' },
      { week: 3, label: 'Reporte de avance', state: 'pendiente' },
    ],
  },
  {
    person: 'María López',
    role: 'Representante',
    due: '2026-09-02',
    steps: [
      { week: 0, label: 'Revisión del cuaderno', state: 'completado' },
      { week: 1, label: 'Firma semanal', state: 'completado' },
      { week: 2, label: 'Horario de estudio en casa', state: 'en_progreso' },
      { week: 3, label: 'Confirmación de avance', state: 'pendiente' },
    ],
  },
  {
    person: 'Juan Pérez López',
    role: 'Estudiante',
    due: '2026-08-22',
    steps: [
      { week: 0, label: 'Tareas pendientes entregadas', state: 'completado' },
      { week: 1, label: 'Asistencia al refuerzo', state: 'en_progreso' },
      { week: 2, label: 'Evaluación de recuperación', state: 'pendiente' },
      { week: 3, label: 'Revisión final', state: 'pendiente' },
    ],
  },
];

/** Las cuatro columnas de la línea de tiempo. */
export const trackWeeks = [
  { label: 'Esta semana', date: '14 ago' },
  { label: 'Próxima', date: '21 ago' },
  { label: 'Semana 3', date: '28 ago' },
  { label: 'Semana 4', date: '04 sep' },
];

function archived(
  meetingId: string,
  studentId: string,
  studentName: string,
  code: string,
  type: string,
  date: string,
  signed = true,
): ArchivedDocument {
  return {
    meeting_id: meetingId,
    student_id: studentId,
    student_name: studentName,
    document_code: code,
    meeting_type: type,
    date,
    drive_path: `ACTA PRO/Docentes/Ana Pérez/${studentName}/${SCHOOL_YEAR}/${date} - ${type}`,
    signed,
  };
}

export const previousDocuments: ArchivedDocument[] = [
  archived('ACTA-2026-0114', 'S-0231', 'Juan Pérez López', 'ACTA-2026-JUAN-PEREZ-0114', 'Seguimiento de compromisos', '2026-05-22'),
  archived('ACTA-2026-0047', 'S-0231', 'Juan Pérez López', 'ACTA-2026-JUAN-PEREZ-0047', 'Rendimiento académico', '2026-03-08'),
  archived('ACTA-2026-0098', 'S-0244', 'Camila Andrade Ruiz', 'ACTA-2026-CAMILA-ANDRADE-0098', 'Convivencia escolar', '2026-04-17'),
  archived('ACTA-2026-0061', 'S-0119', 'Mateo Chávez Salinas', 'ACTA-2026-MATEO-CHAVEZ-0061', 'Rendimiento académico', '2026-03-21'),
  archived('ACTA-2026-0132', 'S-0119', 'Mateo Chávez Salinas', 'ACTA-2026-MATEO-CHAVEZ-0132', 'Seguimiento de compromisos', '2026-06-09', false),
];

/* ── Reuniones anteriores del mismo estudiante ────────────────────────────── */

/**
 * Las reuniones previas, con sus actas.
 *
 * Existen para que el historial tenga de dónde tirar: sin ellas la ficha previa
 * enseñaría siempre «primera reunión» y no habría forma de comprobar que los
 * antecedentes se heredan bien.
 *
 * Hay **una por cada acta de `previousDocuments`**, y eso no es una comodidad:
 * el archivo referencia la reunión de la que salió cada acta. Faltaban las de
 * Camila y Mateo, y en memoria nadie lo notaba porque no hay integridad
 * referencial; contra PostgreSQL la clave foránea lo rechaza. Los datos de
 * demostración tienen que ser consistentes o esconden fallos reales.
 */
function reunionPrevia(
  id: string,
  date: string,
  meetingType: string,
  quien: {
    studentId: string;
    studentName: string;
    course: string;
    representativeName: string;
    representativeEmail: string;
    representativeRole: 'mother' | 'father';
  },
): Meeting {
  return {
    meeting_id: id,
    teacher_id: 'T-045',
    student_id: quien.studentId,
    teacher_name: 'Ana Pérez',
    teacher_email: 'ana.perez@colegio.edu.ec',
    teacher_phone: '+593 98 445 2210',
    teacher_position: 'Docente de Matemáticas',
    student_name: quien.studentName,
    course: quien.course,
    representative_name: quien.representativeName,
    representative_email: quien.representativeEmail,
    meeting_type: meetingType,
    date,
    start_time: '09:00',
    end_time: '09:35',
    place: 'Sala de reuniones · Bloque A',
    status: 'sent',
    data_status: 'verified',
    school_year: SCHOOL_YEAR,
    participants: [
      { role: 'teacher', name: 'Ana Pérez', present: true },
      { role: quien.representativeRole, name: quien.representativeName, present: true },
      { role: 'student', name: quien.studentName.split(' ').slice(0, 2).join(' '), present: true },
    ],
  };
}

const JUAN = {
  studentId: 'S-0231',
  studentName: 'Juan Pérez López',
  course: '8.º EGB "B"',
  representativeName: 'María López',
  representativeEmail: 'maria.lopez@email.com',
  representativeRole: 'mother' as const,
};

const CAMILA = {
  studentId: 'S-0244',
  studentName: 'Camila Andrade Ruiz',
  course: '8.º EGB "B"',
  representativeName: 'Jorge Andrade',
  representativeEmail: 'jorge.andrade@email.com',
  representativeRole: 'father' as const,
};

const MATEO = {
  studentId: 'S-0119',
  studentName: 'Mateo Chávez Salinas',
  course: '9.º EGB "A"',
  representativeName: 'Rosa Salinas',
  representativeEmail: '',
  representativeRole: 'mother' as const,
};

export const previousMeetings: Meeting[] = [
  reunionPrevia('ACTA-2026-0047', '2026-03-08', 'Rendimiento académico', JUAN),
  reunionPrevia('ACTA-2026-0114', '2026-05-22', 'Seguimiento de compromisos', JUAN),
  reunionPrevia('ACTA-2026-0098', '2026-04-17', 'Convivencia escolar', CAMILA),
  reunionPrevia('ACTA-2026-0061', '2026-03-21', 'Rendimiento académico', MATEO),
  reunionPrevia('ACTA-2026-0132', '2026-06-09', 'Seguimiento de compromisos', MATEO),
];

function actaPrevia(
  meetingId: string,
  documentCode: string,
  acuerdos: string[],
  compromisos: string[],
): MeetingMinutes {
  return {
    meeting_id: meetingId,
    document_code: documentCode,
    status: 'final',
    generated_at: '2026-05-22T10:00:00Z',
    sections: [
      { number: 7, title: 'Acuerdos', items: acuerdos },
      { number: 8, title: 'Compromisos', items: compromisos },
      { number: 9, title: 'Responsables', items: ['Ana Pérez', 'María López', 'Juan Pérez'] },
    ],
  };
}

export const previousMinutes: MeetingMinutes[] = [
  actaPrevia(
    'ACTA-2026-0047',
    'ACTA-2026-JUAN-PEREZ-0047',
    ['Tutoría de refuerzo los jueves durante el segundo parcial.'],
    ['La representante revisará el cuaderno de tareas dos veces por semana.'],
  ),
  actaPrevia(
    'ACTA-2026-0114',
    'ACTA-2026-JUAN-PEREZ-0114',
    ['Mantener la tutoría de refuerzo hasta el cierre del quimestre.'],
    [
      'El estudiante entregará las tareas atrasadas antes del 5 de junio de 2026.',
      'La docente enviará un reporte quincenal al correo de la representante.',
    ],
  ),
];

export const previousFollowUps: FollowUp[] = [
  {
    meeting_id: 'ACTA-2026-0047',
    date: '2026-05-22',
    description: 'Revisión del avance del plan de refuerzo',
  },
  {
    meeting_id: 'ACTA-2026-0114',
    date: '2026-06-20',
    description: 'Cierre de quimestre · Juan Pérez López',
  },
];

/* ── Resumen del panel ────────────────────────────────────────────────────── */

export const dashboardSummary = {
  meetingsToday: 3,
  pendingReview: 2,
  sentThisWeek: 7,
  overdueFollowUps: 1,
};
