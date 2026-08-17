/**
 * Comprobación de Deepgram contra la API real.
 *
 * Existe porque la única pregunta que no se puede responder leyendo código es
 * si la separación de voces funciona con **español ecuatoriano, varias personas
 * y ruido de aula**. Y hacer una reunión completa en la aplicación para
 * averiguarlo es un ciclo demasiado lento.
 *
 * Uso:
 *   npm --prefix web run verify:deepgram -- ruta/al/audio.m4a
 *
 * Sirve cualquier grabación de voz: una nota de voz del iPad vale. Lo útil es
 * que hablen al menos dos personas y que alguna se interrumpa, que es lo que
 * ocurre de verdad en una reunión.
 *
 * La clave se lee de `.env.local`. Este script no la imprime nunca.
 */

import { readFile } from 'node:fs/promises';
import { basename, isAbsolute, resolve } from 'node:path';

const argument = process.argv[2];
if (!argument) {
  console.error(
    '\nFalta el archivo de audio.\n\n' +
      '  npm --prefix web run verify:deepgram -- C:\\ruta\\a\\tu\\audio.m4a\n' +
      '  npm --prefix web run verify:deepgram -- audio.m4a en    (para forzar otro idioma)\n' +
      '  npm --prefix web run verify:deepgram -- https://…/audio.wav\n\n' +
      'Sirve cualquier nota de voz. Lo útil es que hablen al menos dos personas.\n',
  );
  process.exit(1);
}

/** También se acepta una URL pública, para poder probar sin grabar nada. */
const isUrl = /^https?:\/\//i.test(argument);

/*
 * `npm --prefix web` ejecuta el script con el directorio de trabajo dentro de
 * `web/`, así que una ruta relativa se buscaría allí y no donde está la persona.
 * `INIT_CWD` conserva el directorio original.
 */
const file = isUrl
  ? argument
  : isAbsolute(argument)
    ? argument
    : resolve(process.env.INIT_CWD ?? process.cwd(), argument);

/* ── Configuración ───────────────────────────────────────────────────────── */

// Se lee `.env.local` a mano: este script corre fuera de Next.
try {
  const env = await readFile(new URL('../.env.local', import.meta.url), 'utf8');
  for (const line of env.split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
} catch {
  // Sin .env.local se usan las variables del entorno.
}

const key = process.env.DEEPGRAM_API_KEY;
if (!key) {
  console.error(
    '\nFalta DEEPGRAM_API_KEY.\n' +
      'Escríbela en web/.env.local (está en .gitignore) y vuelve a ejecutar.\n',
  );
  process.exit(1);
}

const model = process.env.DEEPGRAM_MODEL ?? 'nova-2';

/**
 * Idioma. Por defecto español, que es el de las reuniones.
 *
 * Se puede cambiar con un segundo argumento porque importa saberlo: si el
 * idioma no corresponde al audio, **Deepgram responde 200 con la transcripción
 * vacía**, sin ningún error. Comprobado contra la API real.
 */
const language = process.argv[3] ?? 'es';

/* ── Petición ────────────────────────────────────────────────────────────── */

let audio: Buffer | null = null;
if (!isUrl) {
  try {
    audio = await readFile(file);
  } catch {
    console.error(`\nNo encuentro el archivo:\n  ${file}\n\nComprueba la ruta y vuelve a intentarlo.\n`);
    process.exit(1);
  }
  if (audio.length < 1024) {
    console.error('\nEl archivo está vacío o es demasiado pequeño para contener voz.\n');
    process.exit(1);
  }
}

const mime =
  file.endsWith('.m4a') || file.endsWith('.mp4')
    ? 'audio/mp4'
    : file.endsWith('.wav')
      ? 'audio/wav'
      : file.endsWith('.mp3')
        ? 'audio/mpeg'
        : 'audio/webm';

const params = new URLSearchParams({
  model,
  language,
  diarize: 'true',
  utterances: 'true',
  punctuate: 'true',
  smart_format: 'true',
});

console.log(`\nACTA PRO · comprobación de Deepgram`);
console.log(
  audio
    ? `  archivo : ${basename(file)} (${Math.round(audio.length / 1024)} KB, ${mime})`
    : `  audio   : ${file}`,
);
console.log(`  modelo  : ${model}   ·   idioma: ${language}\n`);

const started = Date.now();
const response = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
  method: 'POST',
  headers: audio
    ? { Authorization: `Token ${key}`, 'Content-Type': mime }
    : { Authorization: `Token ${key}`, 'Content-Type': 'application/json' },
  body: audio ? new Uint8Array(audio) : JSON.stringify({ url: file }),
});
const elapsed = ((Date.now() - started) / 1000).toFixed(1);

if (!response.ok) {
  const detail = await response.text();
  console.error(`✗ Deepgram respondió ${response.status}`);
  console.error(`  ${detail.slice(0, 400)}\n`);
  if (response.status === 401) {
    console.error('  La clave no es válida. ¿La revocaste y no actualizaste .env.local?\n');
  }
  process.exit(1);
}

const data = (await response.json()) as {
  results?: {
    utterances?: Array<{ start: number; end: number; transcript: string; speaker?: number; confidence: number }>;
    channels?: Array<{ alternatives?: Array<{ transcript?: string }> }>;
  };
};

/* ── Resultado ───────────────────────────────────────────────────────────── */

const utterances = data.results?.utterances ?? [];
const tags = new Set(utterances.map((u) => u.speaker).filter((s) => s !== undefined));

console.log(`Respondió en ${elapsed}s\n`);

if (utterances.length === 0) {
  console.log('✗ No devolvió ninguna intervención, pese a aceptar el audio (200).\n');
  console.log('  Las dos causas habituales:');
  console.log(`  · El audio no está en "${language}". Deepgram NO da error en ese caso:`);
  console.log('    devuelve 200 con la transcripción vacía. Prueba con otro idioma:');
  console.log(`      npm --prefix web run verify:deepgram -- "${argument}" en`);
  console.log('  · El audio no tiene voz audible.\n');
  process.exit(1);
}

console.log(`✓ ${utterances.length} intervenciones`);
console.log(
  tags.size > 1
    ? `✓ ${tags.size} voces distintas separadas`
    : `⚠ solo ${tags.size} voz detectada — si hablaba más de una persona, la separación falló`,
);

const lowConfidence = utterances.filter((u) => u.confidence < 0.7).length;
console.log(
  lowConfidence === 0
    ? '✓ todas las intervenciones con confianza aceptable'
    : `⚠ ${lowConfidence} intervención(es) por debajo de 0,7 de confianza`,
);

console.log('\nTranscripción por voz:\n');
for (const u of utterances) {
  const tag = u.speaker === undefined ? '?' : String.fromCharCode(65 + u.speaker);
  const time = new Date(u.start * 1000).toISOString().slice(14, 19);
  console.log(`  [${time}] Voz ${tag} · ${(u.confidence * 100).toFixed(0)}%`);
  console.log(`           ${u.transcript}\n`);
}

// Lo que la aplicación mostraría para identificar cada voz: la intervención más
// larga de cada una, que es lo que permite reconocerla.
console.log('Muestras que vería la docente para poner nombres:\n');
const longest = new Map<number, { transcript: string }>();
for (const u of utterances) {
  if (u.speaker === undefined) continue;
  const current = longest.get(u.speaker);
  if (!current || u.transcript.length > current.transcript.length) longest.set(u.speaker, u);
}
for (const [speaker, u] of [...longest.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`  Voz ${String.fromCharCode(65 + speaker)}: «${u.transcript}»\n`);
}

console.log(
  tags.size > 1
    ? 'Deepgram separa voces correctamente en esta grabación.\n'
    : 'Revisa la grabación antes de dar por buena la separación de voces.\n',
);
