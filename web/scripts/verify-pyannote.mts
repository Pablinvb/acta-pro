/**
 * Comprobación de pyannoteAI contra la API real.
 *
 * Su API es asíncrona y por URL: hay que pedir espacio temporal, subir el
 * audio, lanzar el trabajo y consultar hasta que termine. Este script recorre
 * ese camino e informa de en qué paso falla si falla, que es lo único útil
 * cuando una integración de cuatro pasos no responde.
 *
 *   npm --prefix web run verify:pyannote -- C:\ruta\audio.m4a
 *
 * La clave se lee de `.env.local` y no se imprime nunca.
 */

import { readFile } from 'node:fs/promises';
import { basename, isAbsolute, resolve } from 'node:path';

const API = 'https://api.pyannote.ai/v1';

/* ── Entrada ─────────────────────────────────────────────────────────────── */

const argumento = process.argv[2];
if (!argumento) {
  console.error('\nFalta el archivo de audio.\n  npm --prefix web run verify:pyannote -- audio.m4a\n');
  process.exit(1);
}

const archivo = isAbsolute(argumento)
  ? argumento
  : resolve(process.env.INIT_CWD ?? process.cwd(), argumento);

try {
  const env = await readFile(new URL('../.env.local', import.meta.url), 'utf8');
  for (const linea of env.split('\n')) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {
  /* sin .env.local se usan las variables del entorno */
}

const key = process.env.PYANNOTE_API_KEY;
if (!key) {
  console.error('\nFalta PYANNOTE_API_KEY en web/.env.local.\n');
  process.exit(1);
}

const audio = await readFile(archivo).catch(() => null);
if (!audio) {
  console.error(`\nNo encuentro el archivo:\n  ${archivo}\n`);
  process.exit(1);
}

const numSpeakers = process.argv[3] ? Number(process.argv[3]) : undefined;

console.log('\nACTA PRO · comprobación de pyannoteAI');
console.log(`  archivo : ${basename(archivo)} (${Math.round(audio.length / 1024)} KB)`);
console.log(`  personas esperadas: ${numSpeakers ?? 'sin indicar'}\n`);

const auth = { Authorization: `Bearer ${key}` };
const objeto = `media://acta-pro/prueba-${Date.now()}`;

function fallo(paso: string, detalle: string): never {
  console.error(`\n✗ Falló en el paso «${paso}»`);
  console.error(`  ${detalle.slice(0, 500)}\n`);
  process.exit(1);
}

/* ── 1 · Espacio temporal ────────────────────────────────────────────────── */

process.stdout.write('1. Pidiendo espacio temporal… ');
const espacio = await fetch(`${API}/media/input`, {
  method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: objeto }),
});

if (!espacio.ok) {
  const texto = await espacio.text();
  console.log('✗');
  if (espacio.status === 401) fallo('autenticación', 'La clave no es válida o ha caducado.');
  fallo('media/input', `${espacio.status}: ${texto}`);
}
const { url: enlaceSubida } = (await espacio.json()) as { url?: string };
if (!enlaceSubida) fallo('media/input', 'no devolvió enlace de subida');
console.log('✓');

/* ── 2 · Subida ──────────────────────────────────────────────────────────── */

process.stdout.write('2. Subiendo el audio… ');
const subida = await fetch(enlaceSubida, {
  method: 'PUT',
  body: new Uint8Array(audio),
  headers: { 'Content-Type': 'audio/mp4' },
});
if (!subida.ok) {
  console.log('✗');
  fallo('subida', `${subida.status}: ${await subida.text()}`);
}
console.log('✓');

/* ── 3 · Trabajo ─────────────────────────────────────────────────────────── */

process.stdout.write('3. Lanzando la separación de voces… ');
const lanzar = await fetch(`${API}/diarize`, {
  method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: objeto, ...(numSpeakers ? { numSpeakers } : {}) }),
});
const lanzado = (await lanzar.json()) as { jobId?: string; message?: string };
if (!lanzar.ok || !lanzado.jobId) {
  console.log('✗');
  fallo('diarize', `${lanzar.status}: ${lanzado.message ?? JSON.stringify(lanzado)}`);
}
console.log(`✓  (trabajo ${lanzado.jobId})`);

/* ── 4 · Espera ──────────────────────────────────────────────────────────── */

process.stdout.write('4. Esperando el resultado');
const inicio = Date.now();
let salida: Array<{ speaker: string; start: number; end: number }> | undefined;

while (Date.now() - inicio < 5 * 60 * 1000) {
  await new Promise((r) => setTimeout(r, 3000));
  process.stdout.write('.');

  const consulta = await fetch(`${API}/jobs/${lanzado.jobId}`, { headers: auth });
  if (!consulta.ok) {
    console.log(' ✗');
    fallo('jobs', `${consulta.status}: ${await consulta.text()}`);
  }

  const estado = (await consulta.json()) as {
    status?: string;
    output?: { diarization?: Array<{ speaker: string; start: number; end: number }> };
    error?: string;
  };

  if (estado.status === 'succeeded') {
    salida = estado.output?.diarization;
    break;
  }
  if (estado.status === 'failed' || estado.status === 'canceled') {
    console.log(' ✗');
    fallo('procesamiento', estado.error ?? String(estado.status));
  }
}

const segundos = ((Date.now() - inicio) / 1000).toFixed(0);
console.log(` ✓  (${segundos}s)`);

/* ── Resultado ───────────────────────────────────────────────────────────── */

const turnos = (salida ?? []).filter((t) => t.end > t.start).sort((a, b) => a.start - b.start);
if (turnos.length === 0) {
  console.log('\n✗ No devolvió ningún turno de habla.\n');
  process.exit(1);
}

const voces = [...new Set(turnos.map((t) => t.speaker))];
const duracion = Math.max(...turnos.map((t) => t.end));

console.log(`\n✓ ${turnos.length} turnos de habla`);
console.log(
  voces.length > 1
    ? `✓ ${voces.length} voces distintas separadas`
    : `⚠ solo ${voces.length} voz — si hablaba más de una persona, la separación falló`,
);

const tiempoPorVoz = new Map<string, number>();
for (const t of turnos) {
  tiempoPorVoz.set(t.speaker, (tiempoPorVoz.get(t.speaker) ?? 0) + (t.end - t.start));
}

console.log('\nReparto del tiempo:\n');
for (const [voz, seg] of [...tiempoPorVoz.entries()].sort((a, b) => b[1] - a[1])) {
  const pct = ((seg / duracion) * 100).toFixed(0);
  console.log(`  ${voz.padEnd(14)} ${seg.toFixed(1).padStart(6)}s   ${pct.padStart(3)}%`);
}

console.log('\nPrimeros turnos:\n');
const reloj = (s: number) => new Date(s * 1000).toISOString().slice(14, 22);
for (const t of turnos.slice(0, 12)) {
  console.log(`  ${reloj(t.start)} → ${reloj(t.end)}   ${t.speaker}`);
}
if (turnos.length > 12) console.log(`  … y ${turnos.length - 12} más`);

// Cambios de turno rápidos: son los que rompen una frase en dos personas y los
// que la alineación por palabra existe para resolver.
const rapidos = turnos.filter((t, i) => i > 0 && t.start - turnos[i - 1].end < 0.4).length;
console.log(
  `\n${rapidos} cambio(s) de turno en menos de 0,4 s.` +
    (rapidos > 0
      ? ' Son los que parten una frase entre dos personas: la alineación por palabra los resuelve.'
      : ''),
);
console.log();
