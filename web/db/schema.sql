-- ═══════════════════════════════════════════════════════════════════════════
-- ACTA PRO — esquema de base de datos
--
-- Sustituye a los 25 nodos `NoOp` que los workflows de n8n dejaban como
-- marcador de la base de datos. Ahora ACTA PRO es dueña de sus datos.
--
-- Dos reglas de la arquitectura quedan grabadas aquí, no solo escritas en un
-- documento:
--
--   1. La transcripción vive en su propia tabla y se pensó para tener permisos
--      distintos. Nunca se sirve junto al acta ni se adjunta a un correo.
--   2. Nada se borra ante un fallo. No hay borrado en cascada desde `meetings`:
--      lo más destructivo posible es marcar `status = 'retry_required'`.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE teachers (
  teacher_id   TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  email        TEXT UNIQUE NOT NULL,
  subject      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE students (
  student_id   TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  course       TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE representatives (
  representative_id TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  relation          TEXT NOT NULL,
  email             TEXT,
  phone             TEXT,
  language          TEXT DEFAULT 'Español',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE student_representatives (
  student_id        TEXT NOT NULL REFERENCES students(student_id),
  representative_id TEXT NOT NULL REFERENCES representatives(representative_id),
  PRIMARY KEY (student_id, representative_id)
);

CREATE TYPE meeting_status AS ENUM (
  'scheduled', 'in_progress', 'awaiting_teacher_review',
  'teacher_approved', 'rejected', 'signed', 'sent', 'retry_required'
);

CREATE TYPE data_status AS ENUM ('ok', 'verified', 'manual_verification_required');

CREATE TABLE meetings (
  meeting_id        TEXT PRIMARY KEY,
  teacher_id        TEXT NOT NULL REFERENCES teachers(teacher_id),
  student_id        TEXT NOT NULL REFERENCES students(student_id),
  representative_id TEXT REFERENCES representatives(representative_id),
  meeting_type      TEXT NOT NULL,
  meeting_date      DATE NOT NULL,
  start_time        TIME NOT NULL,
  end_time          TIME,
  school_year       TEXT NOT NULL,
  status            meeting_status NOT NULL DEFAULT 'scheduled',
  data_status       data_status NOT NULL DEFAULT 'manual_verification_required',
  -- Identificador del evento de Google Calendar que originó la reunión.
  -- UNIQUE es lo que evita duplicar una reunión si Calendar devuelve el mismo
  -- evento dos veces; era la función del antiguo workflow 01.
  calendar_event_id TEXT UNIQUE,
  reminder_sent_at  TIMESTAMPTZ,
  retry_reason      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX meetings_teacher_date_idx ON meetings (teacher_id, meeting_date);
CREATE INDEX meetings_status_idx ON meetings (status);

CREATE TABLE participants (
  meeting_id TEXT NOT NULL REFERENCES meetings(meeting_id),
  name       TEXT NOT NULL,
  role       TEXT NOT NULL,
  present    BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (meeting_id, name)
);

-- ── Transcripción: acceso restringido ──────────────────────────────────────
-- Tabla separada a propósito. Conceder permisos sobre `meetings` no debe dar
-- acceso a lo que se dijo en la reunión.
CREATE TABLE transcript_segments (
  id                BIGSERIAL PRIMARY KEY,
  meeting_id        TEXT NOT NULL REFERENCES meetings(meeting_id),
  segment_at        TIMESTAMPTZ NOT NULL,
  -- Lo que devolvió el reconocimiento de voz. NUNCA se modifica: es la
  -- evidencia de lo que se dijo.
  text              TEXT NOT NULL,
  -- Versión depurada, sin muletillas. Derivada y regenerable.
  clean_text        TEXT,
  confidence_score  REAL,
  -- Etiqueta anónima que devuelve la separación de voces: «A», «B», «C».
  speaker_tag       TEXT,
  -- Nombre real, una vez la docente ha dicho a quién corresponde la etiqueta.
  speaker           TEXT,
  speaker_confirmed BOOLEAN NOT NULL DEFAULT false,
  flagged_by_teacher BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (meeting_id, segment_at)
);

CREATE INDEX transcript_speaker_tag_idx ON transcript_segments (meeting_id, speaker_tag);

CREATE INDEX transcript_meeting_idx ON transcript_segments (meeting_id, segment_at);

-- ── Acta ────────────────────────────────────────────────────────────────────
CREATE TABLE meeting_analyses (
  meeting_id  TEXT PRIMARY KEY REFERENCES meetings(meeting_id),
  analysis    JSONB NOT NULL,
  model       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE language_findings (
  id             BIGSERIAL PRIMARY KEY,
  meeting_id     TEXT NOT NULL REFERENCES meetings(meeting_id),
  fragment       TEXT NOT NULL,
  level          TEXT NOT NULL CHECK (level IN ('GREEN', 'YELLOW', 'RED')),
  reason         TEXT NOT NULL,
  suggested_text TEXT NOT NULL,
  -- Decisión de la docente. La IA solo sugiere: sin decisión explícita, el
  -- texto original permanece intacto.
  resolution     TEXT NOT NULL DEFAULT 'open'
                 CHECK (resolution IN ('open', 'applied', 'kept')),
  resolved_at    TIMESTAMPTZ
);

CREATE INDEX findings_meeting_idx ON language_findings (meeting_id);

CREATE TABLE minutes (
  meeting_id    TEXT PRIMARY KEY REFERENCES meetings(meeting_id),
  document_code TEXT UNIQUE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft',
  sections      JSONB NOT NULL,
  version       INT NOT NULL DEFAULT 1,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at   TIMESTAMPTZ
);

-- ── Firmas ─────────────────────────────────────────────────────────────────
-- El acta se firma entera o no se firma: la validación de que están las dos
-- vive en el servicio, y aquí se garantiza una firma por rol.
CREATE TABLE signatures (
  meeting_id  TEXT NOT NULL REFERENCES meetings(meeting_id),
  signer_role TEXT NOT NULL CHECK (signer_role IN ('teacher', 'representative')),
  signer_name TEXT NOT NULL,
  image       TEXT NOT NULL,
  signed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (meeting_id, signer_role)
);

-- ── Archivo y seguimiento ──────────────────────────────────────────────────
CREATE TABLE documents (
  document_code  TEXT PRIMARY KEY,
  meeting_id     TEXT NOT NULL REFERENCES meetings(meeting_id),
  student_id     TEXT NOT NULL REFERENCES students(student_id),
  -- Desnormalizado a propósito: el repositorio busca por nombre sin tener que
  -- resolver el estudiante en cada resultado, y el nombre que consta en un acta
  -- archivada no debe cambiar si mañana se corrige el del estudiante.
  student_name   TEXT NOT NULL,
  meeting_type   TEXT NOT NULL,
  document_date  DATE NOT NULL,
  drive_file_id  TEXT,
  drive_path     TEXT NOT NULL,
  signed         BOOLEAN NOT NULL DEFAULT false,
  archived_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX documents_student_idx ON documents (student_id, document_date DESC);

CREATE TABLE follow_ups (
  id                BIGSERIAL PRIMARY KEY,
  meeting_id        TEXT NOT NULL REFERENCES meetings(meeting_id),
  due_date          DATE NOT NULL,
  description       TEXT NOT NULL,
  calendar_event_id TEXT,
  completed_at      TIMESTAMPTZ
);

CREATE INDEX follow_ups_due_idx ON follow_ups (due_date) WHERE completed_at IS NULL;

-- ── Auditoría ──────────────────────────────────────────────────────────────
-- Solo se añade. Sin UPDATE ni DELETE: un registro de auditoría que se puede
-- editar no sirve para lo que existe.
CREATE TABLE audit_logs (
  id           BIGSERIAL PRIMARY KEY,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  meeting_id   TEXT REFERENCES meetings(meeting_id),
  service      TEXT NOT NULL,
  event        TEXT NOT NULL,
  actor        TEXT,
  details      JSONB
);

CREATE INDEX audit_meeting_idx ON audit_logs (meeting_id, occurred_at DESC);

-- ── Vista de lectura ───────────────────────────────────────────────────────
-- La aplicación trabaja con la reunión como una sola cosa: nombres incluidos y
-- participantes dentro. Las tablas están normalizadas; esta vista hace de
-- puente para que ningún servicio tenga que montar el mismo JOIN otra vez.
CREATE VIEW meetings_read AS
SELECT
  m.meeting_id,
  m.teacher_id,
  m.student_id,
  t.name  AS teacher_name,
  s.name  AS student_name,
  s.course,
  COALESCE(r.name, '')  AS representative_name,
  COALESCE(r.email, '') AS representative_email,
  m.meeting_type,
  to_char(m.meeting_date, 'YYYY-MM-DD') AS date,
  to_char(m.start_time, 'HH24:MI')      AS start_time,
  to_char(m.end_time, 'HH24:MI')        AS end_time,
  m.status,
  m.data_status,
  m.school_year,
  m.reminder_sent_at,
  COALESCE(
    (SELECT json_agg(json_build_object('role', p.role, 'name', p.name, 'present', p.present)
                     ORDER BY p.name)
     FROM participants p WHERE p.meeting_id = m.meeting_id),
    '[]'::json
  ) AS participants
FROM meetings m
JOIN teachers t ON t.teacher_id = m.teacher_id
JOIN students s ON s.student_id = m.student_id
LEFT JOIN representatives r ON r.representative_id = m.representative_id;
