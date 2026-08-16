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
    student_name: 'Juan Pérez López',
    course: '8.º EGB "B"',
    representative_name: 'María López',
    representative_email: 'maria.lopez@email.com',
    meeting_type: 'Rendimiento académico',
    date: '2026-08-14',
    start_time: '10:00',
    end_time: '10:41',
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
    student_name: 'Camila Andrade Ruiz',
    course: '8.º EGB "B"',
    representative_name: 'Jorge Andrade',
    representative_email: 'jorge.andrade@email.com',
    meeting_type: 'Convivencia escolar',
    date: '2026-08-14',
    start_time: '11:30',
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
    student_name: 'Mateo Chávez Salinas',
    course: '9.º EGB "A"',
    representative_name: 'Rosa Salinas',
    representative_email: '',
    meeting_type: 'Seguimiento de compromisos',
    date: '2026-08-14',
    start_time: '14:15',
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

/* ── Resumen del panel ────────────────────────────────────────────────────── */

export const dashboardSummary = {
  meetingsToday: 3,
  pendingReview: 2,
  sentThisWeek: 7,
  overdueFollowUps: 1,
};
