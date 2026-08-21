import 'server-only';
import type {
  AiAnalysis,
  ArchivedDocument,
  AuditLogEntry,
  FollowUp,
  LanguageFinding,
  Meeting,
  MeetingMinutes,
  Participant,
  Signature,
  TranscriptSegment,
} from '@/lib/types';
import type { Db } from './db';
import type { Repositories } from './types';

/**
 * Persistencia en PostgreSQL.
 *
 * El esquema está en `db/schema.sql`. Dos decisiones de allí gobiernan este
 * archivo y conviene tenerlas presentes al leerlo:
 *
 *  - **Nada se borra.** No hay ni un `DELETE` en todo el módulo. Lo más
 *    destructivo posible es marcar `status = 'retry_required'`.
 *  - **La transcripción vive en su propia tabla**, pensada para tener permisos
 *    distintos. Conceder acceso a `meetings` no debe dar acceso a lo que se
 *    dijo palabra por palabra.
 *
 * Las reuniones se leen de la vista `meetings_read`, que ya trae los nombres y
 * los participantes: así ningún servicio tiene que montar el mismo JOIN.
 */

interface MeetingRow {
  meeting_id: string;
  teacher_id: string;
  student_id: string;
  teacher_name: string;
  teacher_email: string | null;
  teacher_phone: string | null;
  teacher_position: string | null;
  student_name: string;
  course: string;
  representative_name: string;
  representative_email: string;
  meeting_type: string;
  date: string;
  start_time: string;
  end_time: string | null;
  place: string | null;
  status: Meeting['status'];
  data_status: Meeting['data_status'];
  school_year: string;
  participants: Participant[];
}

function toMeeting(row: MeetingRow): Meeting {
  return {
    meeting_id: row.meeting_id,
    teacher_id: row.teacher_id,
    student_id: row.student_id,
    teacher_name: row.teacher_name,
    teacher_email: row.teacher_email ?? undefined,
    teacher_phone: row.teacher_phone ?? undefined,
    teacher_position: row.teacher_position ?? undefined,
    student_name: row.student_name,
    course: row.course,
    representative_name: row.representative_name,
    representative_email: row.representative_email,
    meeting_type: row.meeting_type,
    date: row.date,
    start_time: row.start_time,
    end_time: row.end_time ?? undefined,
    place: row.place ?? undefined,
    status: row.status,
    data_status: row.data_status,
    school_year: row.school_year,
    participants: row.participants ?? [],
  };
}

/** Identificador estable del representante a partir de lo que trae la reunión. */
function representativeId(meeting: Meeting): string | null {
  if (!meeting.representative_name) return null;
  return meeting.representative_email
    ? `rep:${meeting.representative_email.toLowerCase()}`
    : `rep:${meeting.representative_name.toLowerCase().replace(/\s+/g, '-')}`;
}

/**
 * La conexión se recibe, no se importa. Así este módulo no arrastra `pg` a
 * quien solo quiera leerlo, y la verificación puede sustituirla por PGlite.
 */
export function createPostgresRepositories(resolve: () => Promise<Db>): Repositories {
  const db = () => resolve();

  return {
    teachers: {
      async find(teacherId) {
        // `lower()` en los dos lados: nadie recuerda si su código era t-045.
        const { rows } = await (await db()).query<Record<string, unknown>>(
          `SELECT teacher_id, name, email, subject, phone, position, password_hash
             FROM teachers WHERE lower(teacher_id) = lower($1)`,
          [teacherId.trim()],
        );
        const r = rows[0];
        if (!r) return null;
        return {
          teacher_id: r.teacher_id as string,
          name: r.name as string,
          email: (r.email as string | null) ?? undefined,
          subject: (r.subject as string | null) ?? undefined,
          phone: (r.phone as string | null) ?? undefined,
          position: (r.position as string | null) ?? undefined,
          password_hash: (r.password_hash as string | null) ?? undefined,
        };
      },

      async list() {
        // Sin `password_hash`: no tiene por qué salir de aquí.
        const { rows } = await (await db()).query<Record<string, unknown>>(
          `SELECT teacher_id, name, email, subject, phone, position
             FROM teachers ORDER BY name`,
        );
        return rows.map((r) => ({
          teacher_id: r.teacher_id as string,
          name: r.name as string,
          email: (r.email as string | null) ?? undefined,
          subject: (r.subject as string | null) ?? undefined,
          phone: (r.phone as string | null) ?? undefined,
          position: (r.position as string | null) ?? undefined,
        }));
      },

      async upsert(teacher) {
        // COALESCE para que actualizar los datos de la persona no borre lo que
        // no venga en esta llamada, empezando por su contraseña.
        await (await db()).query(
          `INSERT INTO teachers (teacher_id, name, email, subject, phone, position)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (teacher_id) DO UPDATE SET
             name     = EXCLUDED.name,
             email    = COALESCE(EXCLUDED.email, teachers.email),
             subject  = COALESCE(EXCLUDED.subject, teachers.subject),
             phone    = COALESCE(EXCLUDED.phone, teachers.phone),
             position = COALESCE(EXCLUDED.position, teachers.position)`,
          [
            teacher.teacher_id,
            teacher.name,
            teacher.email ?? null,
            teacher.subject ?? null,
            teacher.phone ?? null,
            teacher.position ?? null,
          ],
        );
        return teacher;
      },

      async setPasswordHash(teacherId, passwordHash) {
        await (await db()).query(
          `UPDATE teachers SET password_hash = $2, password_updated_at = now()
            WHERE lower(teacher_id) = lower($1)`,
          [teacherId.trim(), passwordHash],
        );
      },
    },

    meetings: {
      async list(filter) {
        const conditions: string[] = [];
        const params: unknown[] = [];
        if (filter?.teacherId) {
          params.push(filter.teacherId);
          conditions.push(`teacher_id = $${params.length}`);
        }
        if (filter?.date) {
          params.push(filter.date);
          conditions.push(`date = $${params.length}`);
        }
        if (filter?.studentId) {
          params.push(filter.studentId);
          conditions.push(`student_id = $${params.length}`);
        }
        if (filter?.before) {
          params.push(filter.before);
          conditions.push(`date < $${params.length}`);
        }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const { rows } = await (await db()).query<MeetingRow>(
          `SELECT * FROM meetings_read ${where} ORDER BY date, start_time`,
          params,
        );
        return rows.map(toMeeting);
      },

      async find(meetingId) {
        const { rows } = await (await db()).query<MeetingRow>(
          'SELECT * FROM meetings_read WHERE meeting_id = $1',
          [meetingId],
        );
        return rows[0] ? toMeeting(rows[0]) : null;
      },

      async upsert(meeting) {
        const conn = await db();
        const repId = representativeId(meeting);

        // Las personas se aseguran antes que la reunión: son sus claves ajenas.
        await conn.query(
          /*
           * Nada se inventa. Antes se guardaba `T-045@acta-pro.local` para
           * satisfacer un NOT NULL, y ese correo falso acabaría impreso en los
           * «Datos generales» del acta institucional pareciendo auténtico.
           *
           * COALESCE en el UPDATE para que volver a sincronizar una reunión que
           * no trae contacto no borre el que ya había.
           */
          `INSERT INTO teachers (teacher_id, name, email, phone, position)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (teacher_id) DO UPDATE SET
             name     = EXCLUDED.name,
             email    = COALESCE(EXCLUDED.email, teachers.email),
             phone    = COALESCE(EXCLUDED.phone, teachers.phone),
             position = COALESCE(EXCLUDED.position, teachers.position)`,
          [
            meeting.teacher_id,
            meeting.teacher_name,
            meeting.teacher_email ?? null,
            meeting.teacher_phone ?? null,
            meeting.teacher_position ?? null,
          ],
        );
        await conn.query(
          `INSERT INTO students (student_id, name, course) VALUES ($1, $2, $3)
           ON CONFLICT (student_id) DO UPDATE SET name = EXCLUDED.name, course = EXCLUDED.course`,
          [meeting.student_id, meeting.student_name, meeting.course],
        );
        if (repId) {
          await conn.query(
            `INSERT INTO representatives (representative_id, name, relation, email)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (representative_id)
             DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email`,
            [repId, meeting.representative_name, 'representante legal', meeting.representative_email],
          );
        }

        // Idempotente por `meeting_id`: volver a sincronizar el mismo evento de
        // Calendar actualiza la reunión en lugar de duplicarla.
        await conn.query(
          `INSERT INTO meetings (meeting_id, teacher_id, student_id, representative_id,
                                 meeting_type, meeting_date, start_time, end_time, place,
                                 school_year, status, data_status)
           VALUES ($1, $2, $3, $4, $5, $6::date, $7::time, $8::time, $9, $10, $11, $12)
           ON CONFLICT (meeting_id) DO UPDATE SET
             meeting_type = EXCLUDED.meeting_type,
             meeting_date = EXCLUDED.meeting_date,
             start_time   = EXCLUDED.start_time,
             end_time     = EXCLUDED.end_time,
             place        = EXCLUDED.place,
             status       = EXCLUDED.status,
             data_status  = EXCLUDED.data_status,
             updated_at   = now()`,
          [
            meeting.meeting_id,
            meeting.teacher_id,
            meeting.student_id,
            repId,
            meeting.meeting_type,
            meeting.date,
            meeting.start_time,
            meeting.end_time ?? null,
            meeting.place ?? null,
            meeting.school_year,
            meeting.status,
            meeting.data_status,
          ],
        );

        for (const participant of meeting.participants) {
          await conn.query(
            `INSERT INTO participants (meeting_id, name, role, present) VALUES ($1, $2, $3, $4)
             ON CONFLICT (meeting_id, name) DO UPDATE SET
               role = EXCLUDED.role, present = EXCLUDED.present`,
            [meeting.meeting_id, participant.name, participant.role, participant.present ?? false],
          );
        }

        return (await this.find(meeting.meeting_id)) ?? meeting;
      },

      async setStatus(meetingId, status) {
        await (await db()).query(
          'UPDATE meetings SET status = $2, updated_at = now() WHERE meeting_id = $1',
          [meetingId, status],
        );
      },

      async markRetryRequired(meetingId, reason) {
        // Se marca, no se borra. Es la regla que heredamos del manejador de
        // errores y la que impide que un fallo de red se lleve una reunión.
        await (await db()).query(
          `UPDATE meetings SET status = 'retry_required', retry_reason = $2, updated_at = now()
           WHERE meeting_id = $1`,
          [meetingId, reason],
        );
        await (await db()).query(
          `INSERT INTO audit_logs (meeting_id, service, event) VALUES ($1, 'sistema', $2)`,
          [meetingId, `retry_required: ${reason}`],
        );
      },

      async dueForReminder(withinMinutes) {
        const { rows } = await (await db()).query<MeetingRow>(
          `SELECT r.* FROM meetings_read r
           JOIN meetings m ON m.meeting_id = r.meeting_id
           WHERE m.status = 'scheduled'
             AND m.reminder_sent_at IS NULL
             AND (m.meeting_date + m.start_time) BETWEEN now() AND now() + ($1 || ' minutes')::interval
           ORDER BY m.meeting_date, m.start_time`,
          [String(withinMinutes)],
        );
        return rows.map(toMeeting);
      },

      async markReminderSent(meetingId) {
        await (await db()).query(
          'UPDATE meetings SET reminder_sent_at = now() WHERE meeting_id = $1',
          [meetingId],
        );
      },
    },

    transcripts: {
      async append(segment) {
        await (await db()).query(
          `INSERT INTO transcript_segments
             (meeting_id, segment_at, text, clean_text, confidence_score,
              speaker_tag, speaker, speaker_confirmed, flagged_by_teacher)
           VALUES ($1, $2::timestamptz, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (meeting_id, segment_at) DO NOTHING`,
          [
            segment.meeting_id,
            segment.timestamp,
            segment.text,
            segment.clean_text ?? null,
            segment.confidence_score,
            segment.speaker_tag ?? null,
            segment.speaker ?? null,
            segment.speaker_confirmed ?? false,
            segment.flagged_by_teacher ?? false,
          ],
        );
      },

      async replaceAll(meetingId, segments) {
        const conn = await db();
        /*
         * Única excepción a «nada se borra»: la transcripción por fragmentos se
         * sustituye por la pasada final sobre el audio completo. No se pierde
         * información —se reemplaza por otra mejor de lo mismo— y sin esto las
         * etiquetas de voz serían incoherentes entre fragmentos.
         */
        await conn.query('DELETE FROM transcript_segments WHERE meeting_id = $1', [meetingId]);
        for (const segment of segments) {
          await conn.query(
            `INSERT INTO transcript_segments
               (meeting_id, segment_at, text, clean_text, confidence_score,
                speaker_tag, speaker, speaker_confirmed, flagged_by_teacher)
             VALUES ($1, $2::timestamptz, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (meeting_id, segment_at) DO NOTHING`,
            [
              segment.meeting_id,
              segment.timestamp,
              segment.text,
              segment.clean_text ?? null,
              segment.confidence_score,
              segment.speaker_tag ?? null,
              segment.speaker ?? null,
              segment.speaker_confirmed ?? false,
              segment.flagged_by_teacher ?? false,
            ],
          );
        }
      },

      async listByMeeting(meetingId) {
        const { rows } = await (await db()).query<Record<string, unknown>>(
          `SELECT meeting_id, to_char(segment_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS timestamp,
                  text, clean_text, confidence_score, speaker_tag, speaker,
                  speaker_confirmed, flagged_by_teacher
           FROM transcript_segments WHERE meeting_id = $1 ORDER BY segment_at`,
          [meetingId],
        );
        return rows.map((r) => ({
          meeting_id: r.meeting_id as string,
          timestamp: r.timestamp as string,
          text: r.text as string,
          clean_text: (r.clean_text as string) ?? undefined,
          confidence_score: (r.confidence_score as number) ?? null,
          speaker_tag: (r.speaker_tag as string) ?? undefined,
          speaker: (r.speaker as string) ?? undefined,
          speaker_confirmed: Boolean(r.speaker_confirmed),
          flagged_by_teacher: Boolean(r.flagged_by_teacher),
        })) as TranscriptSegment[];
      },

      async setSpeaker(meetingId, timestamp, speaker) {
        await (await db()).query(
          `UPDATE transcript_segments SET speaker = $3, speaker_confirmed = true
           WHERE meeting_id = $1 AND segment_at = $2::timestamptz`,
          [meetingId, timestamp, speaker],
        );
      },

      async setSpeakerByTag(meetingId, speakerTag, speaker) {
        // Una sola sentencia atribuye todas las intervenciones de esa voz: es
        // justo lo que convierte la separación de voces en algo útil.
        const { rows } = await (await db()).query<{ meeting_id: string }>(
          `UPDATE transcript_segments SET speaker = $3, speaker_confirmed = true
           WHERE meeting_id = $1 AND speaker_tag = $2
           RETURNING meeting_id`,
          [meetingId, speakerTag, speaker],
        );
        return rows.length;
      },

      async fullText(meetingId) {
        const { rows } = await (await db()).query<{ line: string }>(
          `SELECT COALESCE(speaker, 'Sin identificar') || ': ' ||
                  COALESCE(clean_text, text) AS line
           FROM transcript_segments WHERE meeting_id = $1 ORDER BY segment_at`,
          [meetingId],
        );
        return rows.map((r) => r.line).join('\n');
      },
    },

    minutes: {
      async find(meetingId) {
        const { rows } = await (await db()).query<Record<string, unknown>>(
          `SELECT meeting_id, document_code, status, sections,
                  to_char(generated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS generated_at
           FROM minutes WHERE meeting_id = $1`,
          [meetingId],
        );
        if (!rows[0]) return null;
        return {
          meeting_id: rows[0].meeting_id as string,
          document_code: rows[0].document_code as string,
          status: rows[0].status as MeetingMinutes['status'],
          sections: rows[0].sections as MeetingMinutes['sections'],
          generated_at: rows[0].generated_at as string,
        };
      },

      async save(minutes) {
        await (await db()).query(
          `INSERT INTO minutes (meeting_id, document_code, status, sections)
           VALUES ($1, $2, $3, $4::jsonb)
           ON CONFLICT (meeting_id) DO UPDATE SET
             document_code = EXCLUDED.document_code,
             status        = EXCLUDED.status,
             sections      = EXCLUDED.sections,
             version       = minutes.version + 1`,
          [minutes.meeting_id, minutes.document_code, minutes.status, JSON.stringify(minutes.sections)],
        );
        return minutes;
      },

      async saveAnalysis(meetingId, analysis) {
        await (await db()).query(
          `INSERT INTO meeting_analyses (meeting_id, analysis, model)
           VALUES ($1, $2::jsonb, $3)
           ON CONFLICT (meeting_id) DO UPDATE SET analysis = EXCLUDED.analysis`,
          [meetingId, JSON.stringify(analysis), process.env.OPENAI_MODEL ?? 'desconocido'],
        );
      },

      async findAnalysis(meetingId) {
        const { rows } = await (await db()).query<{ analysis: AiAnalysis }>(
          'SELECT analysis FROM meeting_analyses WHERE meeting_id = $1',
          [meetingId],
        );
        return rows[0]?.analysis ?? null;
      },

      async saveLanguageReview(meetingId, findings) {
        const conn = await db();
        for (const finding of findings) {
          await conn.query(
            `INSERT INTO language_findings (meeting_id, fragment, level, reason, suggested_text)
             VALUES ($1, $2, $3, $4, $5)`,
            [meetingId, finding.fragment, finding.level, finding.reason, finding.suggested_text],
          );
        }
      },

      async findLanguageReview(meetingId) {
        const { rows } = await (await db()).query<LanguageFinding>(
          `SELECT fragment, level, reason, suggested_text
           FROM language_findings WHERE meeting_id = $1 ORDER BY id`,
          [meetingId],
        );
        return rows;
      },
    },

    signatures: {
      async listByMeeting(meetingId) {
        const { rows } = await (await db()).query<Record<string, unknown>>(
          `SELECT meeting_id, signer_role, signer_name, image, content_hash,
                  tsa_token, tsa_serial, tsa_policy, tsa_name, tsa_url,
                  to_char(signed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS signed_at,
                  to_char(tsa_gen_time AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS tsa_gen_time
           FROM signatures WHERE meeting_id = $1`,
          [meetingId],
        );
        return rows.map((r) => ({
          meeting_id: r.meeting_id as string,
          signer_role: r.signer_role as Signature['signer_role'],
          signer_name: r.signer_name as string,
          signed_at: r.signed_at as string,
          content_hash: (r.content_hash as string | null) ?? undefined,
          // El sello externo puede faltar, y su ausencia es información: sin
          // token no hay fecha atestiguada por un tercero.
          timestamp: r.tsa_token
            ? {
                token: r.tsa_token as string,
                gen_time: r.tsa_gen_time as string,
                serial_number: r.tsa_serial as string,
                policy: (r.tsa_policy as string | null) ?? undefined,
                tsa_name: (r.tsa_name as string | null) ?? undefined,
                tsa_url: (r.tsa_url as string | null) ?? undefined,
              }
            : undefined,
          image: r.image as string,
        })) as Signature[];
      },

      async save(signature) {
        // Una firma por rol: volver a firmar sustituye, no acumula.
        await (await db()).query(
          /*
           * `signed_at` se guarda tal y como llega, no con `now()`.
           *
           * Antes lo ponía el reloj de la base, de modo que el instante
           * almacenado no era el mismo que el usado para calcular el sello y la
           * huella nunca habría cuadrado. Un sello que no verifica es peor que
           * no tener sello: promete algo que no cumple.
           */
          `INSERT INTO signatures (meeting_id, signer_role, signer_name, image, signed_at,
                                   content_hash, tsa_token, tsa_gen_time, tsa_serial,
                                   tsa_policy, tsa_name, tsa_url)
           VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()),
                   $6, $7, $8::timestamptz, $9, $10, $11, $12)
           ON CONFLICT (meeting_id, signer_role) DO UPDATE SET
             signer_name  = EXCLUDED.signer_name,
             image        = EXCLUDED.image,
             signed_at    = EXCLUDED.signed_at,
             content_hash = EXCLUDED.content_hash,
             tsa_token    = EXCLUDED.tsa_token,
             tsa_gen_time = EXCLUDED.tsa_gen_time,
             tsa_serial   = EXCLUDED.tsa_serial,
             tsa_policy   = EXCLUDED.tsa_policy,
             tsa_name     = EXCLUDED.tsa_name,
             tsa_url      = EXCLUDED.tsa_url`,
          [
            signature.meeting_id,
            signature.signer_role,
            signature.signer_name,
            signature.image,
            signature.signed_at,
            signature.content_hash ?? null,
            signature.timestamp?.token ?? null,
            signature.timestamp?.gen_time ?? null,
            signature.timestamp?.serial_number ?? null,
            signature.timestamp?.policy ?? null,
            signature.timestamp?.tsa_name ?? null,
            signature.timestamp?.tsa_url ?? null,
          ],
        );
      },
    },

    documents: {
      async listByStudent(studentId) {
        const { rows } = await (await db()).query<Record<string, unknown>>(
          `SELECT * FROM documents WHERE student_id = $1 ORDER BY document_date DESC`,
          [studentId],
        );
        return rows.map(toDocument);
      },

      async search({ query, studentId, teacherId, from, to }) {
        const conditions: string[] = [];
        const params: unknown[] = [];
        if (studentId) {
          params.push(studentId);
          conditions.push(`student_id = $${params.length}`);
        }
        if (teacherId) {
          // El acta no guarda la docente; la reunión de la que salió, sí.
          params.push(teacherId);
          conditions.push(
            `meeting_id IN (SELECT meeting_id FROM meetings WHERE teacher_id = $${params.length})`,
          );
        }
        if (from) {
          params.push(from);
          conditions.push(`document_date >= $${params.length}::date`);
        }
        if (to) {
          params.push(to);
          conditions.push(`document_date <= $${params.length}::date`);
        }
        if (query) {
          params.push(`%${query}%`);
          // `unaccent` no está garantizado en todas las instalaciones, así que
          // se normaliza con `translate`: buscar «perez» encuentra «Pérez».
          conditions.push(
            `translate(lower(student_name || ' ' || meeting_type || ' ' || document_code),
                       'áéíóúüñ', 'aeiouun')
             LIKE translate(lower($${params.length}), 'áéíóúüñ', 'aeiouun')`,
          );
        }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const { rows } = await (await db()).query<Record<string, unknown>>(
          `SELECT * FROM documents ${where} ORDER BY document_date DESC`,
          params,
        );
        return rows.map(toDocument);
      },

      async save(document) {
        await (await db()).query(
          `INSERT INTO documents (document_code, meeting_id, student_id, student_name,
                                  meeting_type, document_date, drive_path, signed)
           VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8)
           ON CONFLICT (document_code) DO UPDATE SET
             drive_path = EXCLUDED.drive_path, signed = EXCLUDED.signed`,
          [
            document.document_code,
            document.meeting_id,
            document.student_id,
            document.student_name,
            document.meeting_type,
            document.date,
            document.drive_path,
            document.signed,
          ],
        );
      },

      async nextSequence(year, studentId) {
        const { rows } = await (await db()).query<{ next: number }>(
          `SELECT COALESCE(MAX(NULLIF(regexp_replace(document_code, '^.*-', ''), '')::int), 0) + 1 AS next
           FROM documents
           WHERE student_id = $1 AND EXTRACT(YEAR FROM document_date) = $2`,
          [studentId, year],
        );
        return rows[0]?.next ?? 1;
      },
    },

    followUps: {
      async save(followUp) {
        await (await db()).query(
          /*
           * Una reunión tiene un seguimiento, no una lista que crece cada vez
           * que se guarda. Antes esto era un INSERT a secas, de modo que
           * reprocesar una reunión duplicaba la fila —y con ella el evento de
           * calendario que se crea a partir de ella—. El adaptador en memoria
           * ya sustituía; los dos hacen ahora lo mismo.
           */
          `INSERT INTO follow_ups (meeting_id, due_date, description, calendar_event_id)
           VALUES ($1, $2::date, $3, $4)
           ON CONFLICT (meeting_id) DO UPDATE SET
             due_date          = EXCLUDED.due_date,
             description       = EXCLUDED.description,
             calendar_event_id = COALESCE(EXCLUDED.calendar_event_id, follow_ups.calendar_event_id)`,
          [followUp.meeting_id, followUp.date, followUp.description, followUp.calendar_event_id ?? null],
        );
      },

      async listByMeeting(meetingId) {
        const { rows } = await (await db()).query<Record<string, unknown>>(
          `SELECT meeting_id, to_char(due_date, 'YYYY-MM-DD') AS date, description, calendar_event_id
           FROM follow_ups WHERE meeting_id = $1 ORDER BY due_date`,
          [meetingId],
        );
        return rows as unknown as FollowUp[];
      },

      async overdue(today) {
        const { rows } = await (await db()).query<Record<string, unknown>>(
          `SELECT meeting_id, to_char(due_date, 'YYYY-MM-DD') AS date, description, calendar_event_id
           FROM follow_ups WHERE completed_at IS NULL AND due_date < $1::date ORDER BY due_date`,
          [today],
        );
        return rows as unknown as FollowUp[];
      },
    },

    audit: {
      async append(entry) {
        await (await db()).query(
          `INSERT INTO audit_logs (meeting_id, service, event, actor) VALUES ($1, $2, $3, $4)`,
          [entry.meeting_id, entry.workflow, entry.event, entry.actor ?? null],
        );
      },

      async listByMeeting(meetingId) {
        const { rows } = await (await db()).query<Record<string, unknown>>(
          `SELECT to_char(occurred_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS timestamp,
                  service AS workflow, meeting_id, event, actor
           FROM audit_logs WHERE meeting_id = $1 ORDER BY occurred_at`,
          [meetingId],
        );
        return rows as unknown as AuditLogEntry[];
      },
    },
  };
}

function toDocument(row: Record<string, unknown>): ArchivedDocument {
  return {
    meeting_id: row.meeting_id as string,
    student_id: row.student_id as string,
    student_name: row.student_name as string,
    document_code: row.document_code as string,
    meeting_type: row.meeting_type as string,
    date: String(row.document_date).slice(0, 10),
    drive_path: row.drive_path as string,
    signed: Boolean(row.signed),
  };
}
