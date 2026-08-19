import 'server-only';
import { requirePyannoteKey } from '../config';
import { integracionFallida } from '../errors';
import type { DiarizationProvider, DiarizationResult } from './diarization';

/**
 * pyannoteAI.
 *
 * Su API es **asíncrona y por URL**: no acepta los bytes del audio en la
 * petición. El recorrido es
 *
 *   1. pedir un espacio temporal en su almacenamiento,
 *   2. subir el audio ahí,
 *   3. lanzar el trabajo de diarización,
 *   4. consultar hasta que termine.
 *
 * Se usa su almacenamiento temporal en lugar de exponer el audio en una URL
 * pública nuestra porque una grabación de una reunión escolar no debe quedar
 * accesible en internet ni un minuto, aunque el enlace sea difícil de adivinar.
 */

const API = 'https://api.pyannote.ai/v1';

/** Cuánto se espera a que termine el trabajo antes de rendirse. */
const MAX_WAIT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 3000;

interface JobResponse {
  jobId?: string;
  status?: 'pending' | 'running' | 'succeeded' | 'failed' | 'canceled';
  output?: { diarization?: Array<{ speaker: string; start: number; end: number }> };
  error?: string;
  message?: string;
}

function headers(key: string, json = true): Record<string, string> {
  return json
    ? { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
    : { Authorization: `Bearer ${key}` };
}

async function pedirEspacioTemporal(key: string, objeto: string): Promise<string> {
  const res = await fetch(`${API}/media/input`, {
    method: 'POST',
    headers: headers(key),
    body: JSON.stringify({ url: objeto }),
  });

  if (!res.ok) {
    throw integracionFallida(`pyannote no dio espacio para el audio (${res.status})`);
  }

  const body = (await res.json()) as { url?: string };
  if (!body.url) throw integracionFallida('pyannote no devolvió el enlace de subida');
  return body.url;
}

async function subirAudio(enlace: string, audio: Blob): Promise<void> {
  const res = await fetch(enlace, {
    method: 'PUT',
    body: audio,
    headers: { 'Content-Type': audio.type || 'application/octet-stream' },
  });
  if (!res.ok) throw integracionFallida(`no se pudo subir el audio a pyannote (${res.status})`);
}

async function lanzarTrabajo(
  key: string,
  objeto: string,
  expectedSpeakers?: number,
): Promise<string> {
  const res = await fetch(`${API}/diarize`, {
    method: 'POST',
    headers: headers(key),
    body: JSON.stringify({
      url: objeto,
      // Decirle cuántas personas se esperan mejora bastante la separación, y
      // ACTA PRO lo sabe: son los participantes marcados como presentes.
      ...(expectedSpeakers ? { numSpeakers: expectedSpeakers } : {}),
    }),
  });

  const body = (await res.json()) as JobResponse;
  if (!res.ok || !body.jobId) {
    throw integracionFallida(
      `pyannote rechazó el trabajo (${res.status}): ${body.message ?? body.error ?? ''}`,
    );
  }
  return body.jobId;
}

async function esperarResultado(key: string, jobId: string): Promise<JobResponse> {
  const limite = Date.now() + MAX_WAIT_MS;

  while (Date.now() < limite) {
    const res = await fetch(`${API}/jobs/${jobId}`, { headers: headers(key, false) });
    if (!res.ok) throw integracionFallida(`pyannote falló al consultar el trabajo (${res.status})`);

    const body = (await res.json()) as JobResponse;

    if (body.status === 'succeeded') return body;
    if (body.status === 'failed' || body.status === 'canceled') {
      throw integracionFallida(`pyannote no pudo procesar el audio: ${body.error ?? body.status}`);
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw integracionFallida('pyannote tardó demasiado en separar las voces');
}

export const pyannoteProvider: DiarizationProvider = {
  name: 'pyannote',

  async diarize(audio, options): Promise<DiarizationResult> {
    const key = requirePyannoteKey();
    // Identificador irrepetible: dos reuniones distintas no deben pisarse.
    const objeto = `media://acta-pro/${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const enlace = await pedirEspacioTemporal(key, objeto);
    await subirAudio(enlace, audio);
    const jobId = await lanzarTrabajo(key, objeto, options?.expectedSpeakers);
    const resultado = await esperarResultado(key, jobId);

    const turns = (resultado.output?.diarization ?? [])
      .filter((t) => t.end > t.start)
      .map((t) => ({ speaker: t.speaker, start: t.start, end: t.end }))
      .sort((a, b) => a.start - b.start);

    return { turns, speakers: [...new Set(turns.map((t) => t.speaker))] };
  },
};
