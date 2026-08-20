/**
 * Verificación del adaptador de PostgreSQL contra PostgreSQL de verdad.
 *
 * Usa PGlite, que es PostgreSQL compilado a WASM y corre dentro del propio
 * proceso. Eso permite ejecutar `schema.sql` y el adaptador completo sin
 * levantar un servidor ni instalar nada, y por tanto comprobar que el SQL de
 * verdad funciona en lugar de confiar en que compile.
 *
 * Ejecutar con:
 *   npm --prefix web run verify:db
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { createPostgresRepositories } from '../src/repositories/postgres.repository.ts';
import type { Db } from '../src/repositories/db.ts';

const here = dirname(fileURLToPath(import.meta.url));

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail === undefined ? '' : ` → ${JSON.stringify(detail)}`}`);
  }
}

const pglite = new PGlite();
const db: Db = {
  async query(sql, params) {
    const result = await pglite.query(sql, params as unknown[]);
    return { rows: result.rows as never[] };
  },
};

const repos = createPostgresRepositories(async () => db);

console.log('\nACTA PRO · verificación del esquema y del adaptador PostgreSQL\n');

/* ── Esquema ─────────────────────────────────────────────────────────────── */

console.log('Esquema');
const schema = await readFile(join(here, 'schema.sql'), 'utf8');
await pglite.exec(schema);
check('schema.sql se ejecuta sin errores', true);

const tables = await pglite.query<{ count: number }>(
  `SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'`,
);
check('las tablas y la vista existen', tables.rows[0].count >= 14, tables.rows[0]);

/* ── Reuniones ───────────────────────────────────────────────────────────── */

console.log('\nReuniones');
const meeting = {
  meeting_id: 'ACTA-2026-0001',
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
  status: 'scheduled' as const,
  data_status: 'verified' as const,
  school_year: '2026-2027',
  participants: [
    { role: 'teacher' as const, name: 'Ana Pérez', present: true },
    { role: 'mother' as const, name: 'María López', present: true },
    { role: 'student' as const, name: 'Juan Pérez', present: true },
  ],
};

const saved = await repos.meetings.upsert(meeting);
check('se guarda con sus personas y participantes', saved.meeting_id === 'ACTA-2026-0001');
check('la vista devuelve los nombres', saved.teacher_name === 'Ana Pérez' && saved.student_name === 'Juan Pérez López', saved);
check('la vista devuelve el representante', saved.representative_email === 'maria.lopez@email.com');
check('la vista agrega los participantes', saved.participants.length === 3, saved.participants);
check('las horas salen como HH:MM', saved.start_time === '10:00' && saved.end_time === '10:41', {
  start: saved.start_time,
  end: saved.end_time,
});

/* Campos que pide el acta institucional en «Datos generales». Si no sobreviven
   al viaje a la base, el acta sale con casillas vacías sin que nadie se entere. */
check('el lugar de la reunión se conserva', saved.place === 'Sala de reuniones · Bloque A', saved.place);
check(
  'la vista trae el contacto de la docente para el acta',
  saved.teacher_email === 'ana.perez@colegio.edu.ec' &&
    saved.teacher_phone === '+593 98 445 2210' &&
    saved.teacher_position === 'Docente de Matemáticas',
  { email: saved.teacher_email, phone: saved.teacher_phone, cargo: saved.teacher_position },
);

// Idempotencia: era la razón de ser del antiguo workflow 01.
await repos.meetings.upsert({ ...meeting, meeting_type: 'Rendimiento académico (actualizado)' });
const all = await repos.meetings.list();
check('volver a sincronizar no duplica la reunión', all.length === 1, all.length);
check('volver a sincronizar sí actualiza', all[0].meeting_type.includes('actualizado'));

await repos.meetings.setStatus('ACTA-2026-0001', 'in_progress');
check('cambia de estado', (await repos.meetings.find('ACTA-2026-0001'))?.status === 'in_progress');

await repos.meetings.markRetryRequired('ACTA-2026-0001', 'Drive no respondió');
const afterRetry = await repos.meetings.find('ACTA-2026-0001');
check('marca retry_required sin borrar nada', afterRetry?.status === 'retry_required');
check('la reunión sigue existiendo tras el fallo', afterRetry !== null);
check(
  'el reintento queda en auditoría',
  (await repos.audit.listByMeeting('ACTA-2026-0001')).some((e) => e.event.includes('retry_required')),
);

/* ── Transcripción ───────────────────────────────────────────────────────── */

console.log('\nTranscripción');
const segments = [
  { tag: 'A', at: '2026-08-14T10:02:18Z', text: 'Eh, buenos días, gracias por venir.' },
  { tag: 'B', at: '2026-08-14T10:02:51Z', text: 'Buenos días, o sea, no conocía las notas.' },
  { tag: 'A', at: '2026-08-14T10:03:34Z', text: 'El promedio actual es de 6,8.' },
  { tag: 'C', at: '2026-08-14T10:04:12Z', text: 'Sí, esas dos no las entregué.' },
];
for (const s of segments) {
  await repos.transcripts.append({
    meeting_id: 'ACTA-2026-0001',
    timestamp: s.at,
    text: s.text,
    confidence_score: 0.94,
    speaker_tag: s.tag,
    speaker_confirmed: false,
  });
}
const stored = await repos.transcripts.listByMeeting('ACTA-2026-0001');
check('se guardan los fragmentos en orden', stored.length === 4, stored.length);
check('conserva la etiqueta de voz', stored[0].speaker_tag === 'A');
check('el original se guarda sin tocar', stored[0].text.startsWith('Eh, buenos días'));

// Reenviar el mismo fragmento no debe duplicarlo.
await repos.transcripts.append({
  meeting_id: 'ACTA-2026-0001',
  timestamp: segments[0].at,
  text: 'otro texto',
  confidence_score: null,
  speaker_confirmed: false,
});
check(
  'reenviar un fragmento no lo duplica',
  (await repos.transcripts.listByMeeting('ACTA-2026-0001')).length === 4,
);

const attributed = await repos.transcripts.setSpeakerByTag('ACTA-2026-0001', 'A', 'Ana Pérez');
check('una decisión atribuye todas las intervenciones de esa voz', attributed === 2, attributed);
await repos.transcripts.setSpeakerByTag('ACTA-2026-0001', 'B', 'María López');
const text = await repos.transcripts.fullText('ACTA-2026-0001');
check('el texto completo usa los nombres asignados', text.includes('Ana Pérez: El promedio'));
check('lo no asignado queda sin identificar, no inventado', text.includes('Sin identificar:'));

/* ── Acta y revisión ─────────────────────────────────────────────────────── */

console.log('\nActa');
await repos.minutes.saveAnalysis('ACTA-2026-0001', {
  meeting_reason: 'Rendimiento en Matemáticas',
  topics: ['Calificaciones'],
  background: ['Promedio 6,8'],
  situations_discussed: [],
  teacher_actions: [],
  representative_concerns: [],
  student_interventions: [],
  agreements: ['Plan de refuerzo'],
  commitments: [],
  responsible_people: [],
  evidence_mentions: [],
  follow_up_actions: [],
  follow_up_date: '2026-09-04',
  language_risk_flags: [],
});
const analysis = await repos.minutes.findAnalysis('ACTA-2026-0001');
check('el análisis va y vuelve completo', analysis?.follow_up_date === '2026-09-04' && analysis.agreements[0] === 'Plan de refuerzo');

await repos.minutes.save({
  meeting_id: 'ACTA-2026-0001',
  document_code: 'ACTA-2026-JUAN-PEREZ-0001',
  status: 'draft',
  sections: [{ number: 1, title: 'Datos generales', fields: [{ label: 'Estudiante', value: 'Juan Pérez López' }] }],
  generated_at: new Date().toISOString(),
});
const minutes = await repos.minutes.find('ACTA-2026-0001');
check('el acta se guarda con sus secciones', minutes?.sections[0].fields?.[0].value === 'Juan Pérez López');

await repos.minutes.saveLanguageReview('ACTA-2026-0001', [
  { fragment: 'La madre se muestra despreocupada.', level: 'RED', reason: 'Juicio de valor', suggested_text: 'La representante indicó que desconocía las calificaciones.' },
  { fragment: 'Juan siempre llega tarde.', level: 'YELLOW', reason: 'Generalización', suggested_text: 'Se registran 4 atrasos en julio.' },
]);
const findings = await repos.minutes.findLanguageReview('ACTA-2026-0001');
check('los hallazgos se guardan con su nivel', findings.length === 2 && findings[0].level === 'RED');

/* ── Firmas ──────────────────────────────────────────────────────────────── */

console.log('\nFirmas');
const png = 'data:image/png;base64,' + 'A'.repeat(800);
await repos.signatures.save({ meeting_id: 'ACTA-2026-0001', signer_role: 'teacher', signer_name: 'Ana Pérez', signed_at: null, image: png });
await repos.signatures.save({ meeting_id: 'ACTA-2026-0001', signer_role: 'representative', signer_name: 'María López', signed_at: null, image: png });
check('se guardan las dos firmas', (await repos.signatures.listByMeeting('ACTA-2026-0001')).length === 2);

await repos.signatures.save({ meeting_id: 'ACTA-2026-0001', signer_role: 'teacher', signer_name: 'Ana Pérez', signed_at: null, image: png });
check('volver a firmar sustituye, no acumula', (await repos.signatures.listByMeeting('ACTA-2026-0001')).length === 2);

/*
 * Sello de tiempo. El instante tiene que volver EXACTAMENTE como se guardó:
 * antes lo ponía `now()` de la base, de modo que el momento almacenado no era
 * el que se usó para calcular la huella y el sello impreso en el acta no habría
 * cuadrado nunca. Un sello que no verifica promete algo que no cumple.
 */
const instante = '2026-08-20T21:22:11.263Z';
const huella = 'a'.repeat(64);
await repos.signatures.save({
  meeting_id: 'ACTA-2026-0001',
  signer_role: 'teacher',
  signer_name: 'Ana Pérez',
  signed_at: instante,
  content_hash: huella,
  image: png,
});
const firmada = (await repos.signatures.listByMeeting('ACTA-2026-0001')).find(
  (s) => s.signer_role === 'teacher',
);
check('el instante de firma vuelve tal cual se guardó', firmada?.signed_at === instante, firmada?.signed_at);
check('el sello de integridad se conserva', firmada?.content_hash === huella, firmada?.content_hash);

/* ── Repositorio ─────────────────────────────────────────────────────────── */

console.log('\nRepositorio');
await repos.documents.save({
  meeting_id: 'ACTA-2026-0001',
  student_id: 'S-0231',
  student_name: 'Juan Pérez López',
  document_code: 'ACTA-2026-JUAN-PEREZ-0001',
  meeting_type: 'Rendimiento académico',
  date: '2026-08-14',
  drive_path: 'ACTA PRO/Docentes/Ana Pérez/Juan Pérez López/2026-2027/2026-08-14 - Rendimiento académico',
  signed: true,
});
check('el acta archivada se encuentra por estudiante', (await repos.documents.listByStudent('S-0231')).length === 1);
check('la búsqueda ignora tildes', (await repos.documents.search({ query: 'perez' })).length === 1);
check('la búsqueda encuentra por tipo', (await repos.documents.search({ query: 'rendimiento' })).length === 1);
check('la búsqueda filtra por fecha', (await repos.documents.search({ from: '2026-09-01' })).length === 0);
const seq = await repos.documents.nextSequence(2026, 'S-0231');
check('la secuencia del código avanza', seq === 2, seq);

/* ── Seguimiento y auditoría ─────────────────────────────────────────────── */

console.log('\nSeguimiento y auditoría');
await repos.followUps.save({ meeting_id: 'ACTA-2026-0001', date: '2026-09-04', description: 'Seguimiento del refuerzo' });
check('el seguimiento se guarda', (await repos.followUps.listByMeeting('ACTA-2026-0001'))[0]?.date === '2026-09-04');
check('los vencidos se detectan', (await repos.followUps.overdue('2026-10-01')).length === 1);

await repos.audit.append({ timestamp: new Date().toISOString(), workflow: 'approval', meeting_id: 'ACTA-2026-0001', event: 'acta aprobada', actor: 'T-045' });
const log = await repos.audit.listByMeeting('ACTA-2026-0001');
check('la auditoría acumula eventos en orden', log.length >= 2 && log[log.length - 1].event === 'acta aprobada');

/* ── Resultado ───────────────────────────────────────────────────────────── */

console.log(`\n${passed} comprobaciones correctas, ${failed} fallidas\n`);
await pglite.close();
process.exit(failed === 0 ? 0 : 1);
