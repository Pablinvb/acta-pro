import 'server-only';
import { isLive, n8nAuthHeader, n8nBaseUrl, n8nTimeoutMs } from './env';
import type { Participant } from './types';

/**
 * Cliente de los webhooks de n8n. Solo se ejecuta en el servidor: las rutas de
 * `src/app/api/n8n/*` son las únicas que lo invocan.
 *
 * Rutas expuestas por los workflows de este repositorio:
 *   WF 05 → POST /acta-pro/start-meeting
 *   WF 06 → POST /acta-pro/audio-chunk    (multipart, el audio va como `data`)
 *   WF 11 → POST /acta-pro/teacher-review
 *   WF 12 → POST /acta-pro/signatures
 */

export const WEBHOOKS = {
  startMeeting: '/acta-pro/start-meeting',
  audioChunk: '/acta-pro/audio-chunk',
  teacherReview: '/acta-pro/teacher-review',
  signatures: '/acta-pro/signatures',
} as const;

export type WebhookPath = (typeof WEBHOOKS)[keyof typeof WEBHOOKS];

export class N8nNotConfiguredError extends Error {
  constructor() {
    super(
      'n8n no está configurado. Define ACTA_PRO_DATA_SOURCE=n8n y N8N_WEBHOOK_BASE_URL en .env.local.',
    );
    this.name = 'N8nNotConfiguredError';
  }
}

export class N8nRequestError extends Error {
  constructor(
    readonly path: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(`El webhook ${path} respondió ${status}`);
    this.name = 'N8nRequestError';
  }
}

async function post(path: WebhookPath, init: RequestInit): Promise<unknown> {
  if (!isLive) throw new N8nNotConfiguredError();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), n8nTimeoutMs);

  try {
    const res = await fetch(`${n8nBaseUrl}${path}`, {
      method: 'POST',
      cache: 'no-store',
      signal: controller.signal,
      ...init,
      headers: { ...n8nAuthHeader, ...(init.headers ?? {}) },
    });

    const text = await res.text();
    if (!res.ok) throw new N8nRequestError(path, res.status, text);
    return text ? JSON.parse(text) : null;
  } finally {
    clearTimeout(timer);
  }
}

function postJson(path: WebhookPath, payload: unknown): Promise<unknown> {
  return post(path, {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/* ── WF 05 ────────────────────────────────────────────────────────────────── */

export interface StartMeetingPayload {
  meeting_id: string;
  teacher_id: string;
  student_id: string;
  participants: Participant[];
}

/** Devuelve `{ status: 'in_progress', meeting_id }`, o 400 con los campos que faltan. */
export function startMeeting(payload: StartMeetingPayload) {
  return postJson(WEBHOOKS.startMeeting, payload);
}

/* ── WF 06 ────────────────────────────────────────────────────────────────── */

export interface AudioChunkMeta {
  meeting_id: string;
  /** ISO 8601 del instante en que se cerró el fragmento. */
  timestamp: string;
  participantes_esperados: string[];
}

/**
 * El WF 06 espera el audio como binario en el campo `data` y los metadatos en
 * el cuerpo. Se envía un fragmento a la vez, sin esperar al final de la
 * reunión: así una caída a mitad de reunión no se lleva la grabación entera.
 */
export function sendAudioChunk(meta: AudioChunkMeta, audio: Blob, filename = 'chunk.webm') {
  const form = new FormData();
  form.append('data', audio, filename);
  form.append('meeting_id', meta.meeting_id);
  form.append('timestamp', meta.timestamp);
  form.append('participantes_esperados', JSON.stringify(meta.participantes_esperados));
  return post(WEBHOOKS.audioChunk, { body: form });
}

/* ── WF 11 ────────────────────────────────────────────────────────────────── */

export type TeacherDecision = 'approve' | 'edit' | 'reject';

export interface TeacherReviewPayload {
  meeting_id: string;
  decision: TeacherDecision;
  /** Solo con `decision: 'edit'`: el acta con los cambios de la docente. */
  edited_content?: string;
}

/**
 * El borrador nunca se convierte en acta final por su cuenta. Este webhook es
 * el único camino a `teacher_approved`, y exige una decisión explícita.
 */
export function submitTeacherReview(payload: TeacherReviewPayload) {
  return postJson(WEBHOOKS.teacherReview, payload);
}

/* ── WF 12 ────────────────────────────────────────────────────────────────── */

/**
 * El WF 12 valida las DOS firmas en la misma llamada: si falta cualquiera
 * responde 400 `firmas_incompletas`. Por eso no existe un envío por firmante —
 * la reunión se firma entera o no se firma.
 *
 * Cada firma es un PNG en data URI producido por el pad manuscrito.
 */
export interface SignaturePayload {
  meeting_id: string;
  teacher_signature: string;
  representative_signature: string;
  document_version?: number;
}

/**
 * Completar las firmas es lo que pone la reunión en `status = signed` y encadena
 * el resto del proceso en n8n (13 documento final, 14 archivo, 15 envío). No hay
 * un webhook aparte para enviar el acta: esta llamada es el disparo.
 */
export function submitSignatures(payload: SignaturePayload) {
  return postJson(WEBHOOKS.signatures, payload);
}
