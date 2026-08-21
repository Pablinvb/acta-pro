import 'server-only';
import * as seed from '@/lib/mock/data';
import type {
  AiAnalysis,
  ArchivedDocument,
  AuditLogEntry,
  FollowUp,
  LanguageFinding,
  Meeting,
  MeetingMinutes,
  MeetingStatus,
  Signature,
  TranscriptSegment,
} from '@/lib/types';
import type { Repositories, TeacherAccount } from './types';

/**
 * Adaptador en memoria.
 *
 * Es el que hace que la aplicación funcione de principio a fin sin
 * infraestructura: se arranca y se puede recorrer el ciclo completo con los
 * datos ficticios de `docs/DATOS_DE_PRUEBA.md`. Sirve para demostrar, para
 * desarrollar y para probar la lógica de los servicios sin una base de datos
 * delante.
 *
 * No sirve para producción: el estado vive en el proceso y desaparece al
 * reiniciar. Para eso está `postgres.repository.ts`.
 */

interface Store {
  teachers: Map<string, TeacherAccount>;
  meetings: Map<string, Meeting>;
  reminded: Set<string>;
  transcripts: Map<string, TranscriptSegment[]>;
  minutes: Map<string, MeetingMinutes>;
  analyses: Map<string, AiAnalysis>;
  reviews: Map<string, LanguageFinding[]>;
  signatures: Map<string, Array<Signature & { image: string }>>;
  documents: ArchivedDocument[];
  followUps: FollowUp[];
  audit: AuditLogEntry[];
}

/**
 * En desarrollo, Next recarga los módulos en caliente y un `Map` de nivel de
 * módulo se vaciaría en cada edición. Se guarda en `globalThis` para que el
 * estado sobreviva a la recarga y no parezca que la app pierde datos sola.
 */
const globalStore = globalThis as unknown as { __actaProStore?: Store };

function createStore(): Store {
  return {
    teachers: new Map(seed.teachers.map((t) => [t.teacher_id, structuredClone(t)])),
    meetings: new Map(
      [...seed.meetings, ...seed.previousMeetings].map((m) => [
        m.meeting_id,
        structuredClone(m),
      ]),
    ),
    reminded: new Set(),
    transcripts: new Map([[seed.ACTIVE_MEETING_ID, structuredClone(seed.transcript)]]),
    minutes: new Map([
      [seed.ACTIVE_MEETING_ID, structuredClone(seed.minutes)],
      ...seed.previousMinutes.map(
        (m) => [m.meeting_id, structuredClone(m)] as [string, typeof m],
      ),
    ]),
    analyses: new Map(),
    reviews: new Map([[seed.ACTIVE_MEETING_ID, structuredClone(seed.languageFindings)]]),
    signatures: new Map(),
    documents: structuredClone(seed.previousDocuments),
    // El seguimiento de demostración se carga como el resto: sin él, la columna
    // «Fecha plazo» del acta salía vacía y parecía un fallo del generador.
    followUps: [structuredClone(seed.followUp), ...structuredClone(seed.previousFollowUps)],
    audit: [],
  };
}

const store: Store = (globalStore.__actaProStore ??= createStore());

/** Solo para pruebas: devuelve el almacén a su estado inicial. */
export function resetMemoryStore(): void {
  globalStore.__actaProStore = createStore();
}

function minutesUntil(meeting: Meeting, now: Date): number {
  const [h, m] = meeting.start_time.split(':').map(Number);
  const start = new Date(`${meeting.date}T00:00:00`);
  start.setHours(h, m, 0, 0);
  return (start.getTime() - now.getTime()) / 60000;
}

export const memoryRepositories: Repositories = {
  teachers: {
    async find(teacherId) {
      // Sin distinguir mayúsculas: nadie recuerda si su código era t-045 o T-045.
      const clave = teacherId.trim().toLowerCase();
      return (
        [...store.teachers.values()].find((t) => t.teacher_id.toLowerCase() === clave) ?? null
      );
    },
    async list() {
      // Sin la huella: no tiene por qué salir de aquí.
      return [...store.teachers.values()].map(({ password_hash, ...t }) => {
        void password_hash;
        return t;
      });
    },
    async upsert(teacher) {
      const previo = store.teachers.get(teacher.teacher_id);
      // La contraseña no se pierde al actualizar los datos de la persona.
      const fusionado = { ...previo, ...teacher };
      store.teachers.set(teacher.teacher_id, fusionado);
      return fusionado;
    },
    async setPasswordHash(teacherId, passwordHash) {
      const t = store.teachers.get(teacherId);
      if (t) t.password_hash = passwordHash;
    },
  },

  meetings: {
    async list(filter) {
      return [...store.meetings.values()]
        .filter((m) => !filter?.teacherId || m.teacher_id === filter.teacherId)
        .filter((m) => !filter?.date || m.date === filter.date)
        .filter((m) => !filter?.studentId || m.student_id === filter.studentId)
        .filter((m) => !filter?.before || m.date < filter.before)
        .sort((a, b) => `${a.date}${a.start_time}`.localeCompare(`${b.date}${b.start_time}`));
    },
    async find(id) {
      return store.meetings.get(id) ?? null;
    },
    async upsert(meeting) {
      // Idempotente por `meeting_id`: evita duplicar la reunión si Calendar
      // devuelve el mismo evento dos veces (era la función del WF 01).
      const existing = store.meetings.get(meeting.meeting_id);
      const merged = existing ? { ...existing, ...meeting } : meeting;
      store.meetings.set(meeting.meeting_id, merged);
      return merged;
    },
    async setStatus(id, status) {
      const m = store.meetings.get(id);
      if (m) m.status = status;
    },
    async markRetryRequired(id, reason) {
      const m = store.meetings.get(id);
      if (!m) return;
      // Nunca se borra la reunión ni lo ya procesado: solo se marca.
      m.status = 'retry_required';
      store.audit.push({
        timestamp: new Date().toISOString(),
        workflow: 'sistema',
        meeting_id: id,
        event: `retry_required: ${reason}`,
      });
    },
    async dueForReminder(withinMinutes) {
      const now = new Date();
      return [...store.meetings.values()].filter((m) => {
        if (m.status !== 'scheduled' || store.reminded.has(m.meeting_id)) return false;
        const mins = minutesUntil(m, now);
        return mins > 0 && mins <= withinMinutes;
      });
    },
    async markReminderSent(id) {
      store.reminded.add(id);
    },
  },

  transcripts: {
    async append(segment) {
      const list = store.transcripts.get(segment.meeting_id) ?? [];
      list.push(segment);
      store.transcripts.set(segment.meeting_id, list);
    },
    async replaceAll(id, segments) {
      store.transcripts.set(id, segments);
    },
    async listByMeeting(id) {
      return store.transcripts.get(id) ?? [];
    },
    async setSpeaker(id, timestamp, speaker) {
      const segment = store.transcripts.get(id)?.find((s) => s.timestamp === timestamp);
      if (segment) {
        segment.speaker = speaker;
        segment.speaker_confirmed = true;
      }
    },
    async setSpeakerByTag(id, speakerTag, speaker) {
      const matching = (store.transcripts.get(id) ?? []).filter((s) => s.speaker_tag === speakerTag);
      for (const segment of matching) {
        segment.speaker = speaker;
        segment.speaker_confirmed = true;
      }
      return matching.length;
    },
    async fullText(id) {
      // Se prefiere la versión depurada; el original sigue guardado como
      // evidencia y se usa solo si aún no se ha depurado.
      return (store.transcripts.get(id) ?? [])
        .map((s) => `${s.speaker ?? 'Sin identificar'}: ${s.clean_text ?? s.text}`)
        .join('\n');
    },
  },

  minutes: {
    async find(id) {
      return store.minutes.get(id) ?? null;
    },
    async save(minutes) {
      store.minutes.set(minutes.meeting_id, minutes);
      return minutes;
    },
    async saveAnalysis(id, analysis) {
      store.analyses.set(id, analysis);
    },
    async findAnalysis(id) {
      return store.analyses.get(id) ?? null;
    },
    async saveLanguageReview(id, findings) {
      store.reviews.set(id, findings);
    },
    async findLanguageReview(id) {
      return store.reviews.get(id) ?? [];
    },
  },

  signatures: {
    async listByMeeting(id) {
      return store.signatures.get(id) ?? [];
    },
    async save(signature) {
      const list = store.signatures.get(signature.meeting_id) ?? [];
      // Una firma por rol: volver a firmar sustituye, no acumula.
      const next = list.filter((s) => s.signer_role !== signature.signer_role);
      next.push(signature);
      store.signatures.set(signature.meeting_id, next);
    },
  },

  documents: {
    async listByStudent(studentId) {
      return store.documents
        .filter((d) => d.student_id === studentId)
        .sort((a, b) => b.date.localeCompare(a.date));
    },
    async search({ query, studentId, teacherId, from, to }) {
      // Se normaliza sin tildes: buscar «perez» debe encontrar «Pérez».
      const normalize = (s: string) =>
        s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      const needle = query ? normalize(query) : '';

      // El acta no guarda la docente; la reunión de la que salió, sí.
      const propias = teacherId
        ? new Set(
            [...store.meetings.values()]
              .filter((m) => m.teacher_id === teacherId)
              .map((m) => m.meeting_id),
          )
        : null;

      return store.documents
        .filter((d) => !propias || propias.has(d.meeting_id))
        .filter((d) => !studentId || d.student_id === studentId)
        .filter((d) => !from || d.date >= from)
        .filter((d) => !to || d.date <= to)
        .filter(
          (d) =>
            !needle ||
            normalize(`${d.student_name} ${d.meeting_type} ${d.document_code}`).includes(needle),
        )
        .sort((a, b) => b.date.localeCompare(a.date));
    },
    async save(document) {
      store.documents.unshift(document);
    },
    async nextSequence(year) {
      const used = store.documents
        .map((d) => d.document_code.match(new RegExp(`^ACTA-${year}-.*-(\\d+)$`))?.[1])
        .filter(Boolean)
        .map(Number);
      return (used.length ? Math.max(...used) : 0) + 1;
    },
  },

  followUps: {
    async save(followUp) {
      store.followUps = store.followUps.filter((f) => f.meeting_id !== followUp.meeting_id);
      store.followUps.push(followUp);
    },
    async listByMeeting(id) {
      return store.followUps.filter((f) => f.meeting_id === id);
    },
    async overdue(today) {
      return store.followUps.filter((f) => f.date < today);
    },
  },

  audit: {
    async append(entry) {
      store.audit.push(entry);
    },
    async listByMeeting(id) {
      return store.audit.filter((e) => e.meeting_id === id);
    },
  },
};
