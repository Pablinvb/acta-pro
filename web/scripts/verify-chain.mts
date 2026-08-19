/**
 * Verificación de la cadena completa sobre una grabación real.
 *
 *   Whisper   → qué se dijo y cuándo (palabra a palabra)
 *   pyannote  → quién habló y cuándo
 *   alineación → quién dijo qué
 *
 * Es la única prueba que responde la pregunta que importa: si el acta va a
 * atribuir cada frase a quien de verdad la dijo.
 *
 *   npm --prefix web run verify:chain -- C:\ruta\audio.m4a 2
 */

import { readFile } from 'node:fs/promises';
import { basename, isAbsolute, resolve } from 'node:path';
import { align, uncertainCount, MIN_CONFIDENCE } from '../src/services/transcription/alignment.ts';

const argumento = process.argv[2];
if (!argumento) {
  console.error('\nFalta el audio.\n  npm --prefix web run verify:chain -- audio.m4a 2\n');
  process.exit(1);
}
const archivo = isAbsolute(argumento)
  ? argumento
  : resolve(process.env.INIT_CWD ?? process.cwd(), argumento);
const numSpeakers = process.argv[3] ? Number(process.argv[3]) : undefined;

try {
  const env = await readFile(new URL('../.env.local', import.meta.url), 'utf8');
  for (const l of env.split('\n')) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {
  /* sin .env.local */
}

const openaiKey = process.env.OPENAI_API_KEY;
const pyannoteKey = process.env.PYANNOTE_API_KEY;
if (!openaiKey || !pyannoteKey) {
  console.error('\nFaltan OPENAI_API_KEY o PYANNOTE_API_KEY en web/.env.local.\n');
  process.exit(1);
}

const audio = await readFile(archivo);
console.log(`\nACTA PRO · cadena completa`);
console.log(`  archivo: ${basename(archivo)} (${Math.round(audio.length / 1024)} KB)\n`);

/* ── Whisper ─────────────────────────────────────────────────────────────── */

process.stdout.write('Whisper transcribiendo… ');
const form = new FormData();
form.append('file', new Blob([new Uint8Array(audio)], { type: 'audio/mp4' }), 'audio.m4a');
form.append('model', 'whisper-1');
form.append('language', 'es');
form.append('response_format', 'verbose_json');
form.append('timestamp_granularities[]', 'word');
form.append('timestamp_granularities[]', 'segment');
form.append('prompt', 'Runachay, DECE, EGB, quimestre, acta, representante');

interface Transcripcion {
  segments: Array<{ start: number; end: number; text: string }>;
  words: Array<{ word: string; start: number; end: number }>;
  motor: string;
}

const t0 = Date.now();
const wRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${openaiKey}` },
  body: form,
});

let whisper: Transcripcion;

if (wRes.ok) {
  const j = (await wRes.json()) as {
    segments?: Array<{ start: number; end: number; text: string }>;
    words?: Array<{ word: string; start: number; end: number }>;
  };
  whisper = { segments: j.segments ?? [], words: j.words ?? [], motor: 'Whisper' };
  console.log(`✓  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
} else {
  const detalle = await wRes.text();
  console.log('✗');
  if (wRes.status === 429) {
    console.log('   La cuenta de OpenAI no tiene saldo. La clave es válida.');
  } else {
    console.log(`   ${wRes.status}: ${detalle.slice(0, 200)}`);
  }

  /*
   * El motor de alineación no depende de quién transcriba: solo necesita
   * palabras con marca de tiempo. Deepgram también las da, así que la cadena se
   * puede demostrar igual mientras la cuenta de OpenAI no tenga saldo.
   */
  const dgKey = process.env.DEEPGRAM_API_KEY;
  if (!dgKey) {
    console.error('\nSin OpenAI ni Deepgram no hay transcripción posible.\n');
    process.exitCode = 1;
    throw new Error('sin transcriptor');
  }

  process.stdout.write('Deepgram transcribiendo (sustituto)… ');
  const p = new URLSearchParams({
    model: 'nova-2',
    language: 'es',
    punctuate: 'true',
    smart_format: 'true',
    utterances: 'true',
  });
  for (const t of ['Runachay', 'DECE', 'EGB', 'quimestre']) p.append('keywords', t);

  const dg = await fetch(`https://api.deepgram.com/v1/listen?${p}`, {
    method: 'POST',
    headers: { Authorization: `Token ${dgKey}`, 'Content-Type': 'audio/mp4' },
    body: new Uint8Array(audio),
  });
  const dj = (await dg.json()) as {
    results?: {
      utterances?: Array<{ start: number; end: number; transcript: string }>;
      channels?: Array<{
        alternatives?: Array<{
          words?: Array<{ word: string; punctuated_word?: string; start: number; end: number }>;
        }>;
      }>;
    };
  };
  const palabras = (dj.results?.channels?.[0]?.alternatives?.[0]?.words ?? []).map((w) => ({
    word: w.punctuated_word ?? w.word,
    start: w.start,
    end: w.end,
  }));
  whisper = {
    segments: (dj.results?.utterances ?? []).map((u) => ({
      start: u.start,
      end: u.end,
      text: u.transcript,
    })),
    words: palabras,
    motor: 'Deepgram (sustituto de Whisper)',
  };
  console.log('✓');
}

console.log(`   ${whisper.motor}: ${whisper.segments.length} frases · ${whisper.words.length} palabras con marca de tiempo`);

/* ── pyannote ────────────────────────────────────────────────────────────── */

process.stdout.write('pyannote separando voces… ');
const auth = { Authorization: `Bearer ${pyannoteKey}` };
const objeto = `media://acta-pro/cadena-${Date.now()}`;

const espacio = await fetch('https://api.pyannote.ai/v1/media/input', {
  method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: objeto }),
});
const { url: subir } = (await espacio.json()) as { url: string };
await fetch(subir, { method: 'PUT', body: new Uint8Array(audio), headers: { 'Content-Type': 'audio/mp4' } });

const lanzar = await fetch('https://api.pyannote.ai/v1/diarize', {
  method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: objeto, ...(numSpeakers ? { numSpeakers } : {}) }),
});
const { jobId } = (await lanzar.json()) as { jobId: string };

let turns: Array<{ speaker: string; start: number; end: number }> = [];
const limite = Date.now() + 5 * 60 * 1000;
while (Date.now() < limite) {
  await new Promise((r) => setTimeout(r, 3000));
  const j = (await (await fetch(`https://api.pyannote.ai/v1/jobs/${jobId}`, { headers: auth })).json()) as {
    status?: string;
    output?: { diarization?: Array<{ speaker: string; start: number; end: number }> };
  };
  if (j.status === 'succeeded') {
    turns = j.output?.diarization ?? [];
    break;
  }
  if (j.status === 'failed' || j.status === 'canceled') {
    console.log('✗');
    process.exitCode = 1;
    throw new Error('pyannote falló');
  }
}
const voces = [...new Set(turns.map((t) => t.speaker))];
console.log(`✓`);
console.log(`   ${turns.length} turnos · ${voces.length} voces`);

/* ── Alineación ──────────────────────────────────────────────────────────── */

process.stdout.write('Alineando… ');
const segmentos = whisper.segments.map((s) => ({
  text: s.text.trim(),
  start: s.start,
  end: s.end,
  words: whisper.words.filter((w) => w.start >= s.start && w.end <= s.end + 0.01),
}));
const resultado = align(segmentos, turns);
const dudosas = uncertainCount(resultado);
console.log('✓\n');

/* ── La transcripción atribuida ──────────────────────────────────────────── */

const reloj = (s: number) => new Date(s * 1000).toISOString().slice(14, 19);
console.log('─'.repeat(78));
console.log('TRANSCRIPCIÓN ATRIBUIDA');
console.log('─'.repeat(78) + '\n');

for (const u of resultado) {
  const dudosa = u.speaker === null || u.confidence < MIN_CONFIDENCE || u.coarse;
  const marca = dudosa ? ' ⚠' : '';
  console.log(`[${reloj(u.start)}] ${(u.speaker ?? 'SIN IDENTIFICAR').padEnd(12)}${marca}`);
  console.log(`  ${u.text}\n`);
}

console.log('─'.repeat(78));
console.log(`${resultado.length} intervenciones · ${dudosas} necesitan revisión de la docente`);
const confianza = resultado.reduce((a, u) => a + u.confidence, 0) / Math.max(resultado.length, 1);
console.log(`confianza media de atribución: ${confianza.toFixed(2)}`);
console.log('─'.repeat(78) + '\n');
