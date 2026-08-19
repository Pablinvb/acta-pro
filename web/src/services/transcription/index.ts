import 'server-only';
import { sinConfigurar } from '../errors';
import { deepgramProvider } from './deepgram.provider';
import { openaiProvider } from './openai.provider';
import type { TranscriptionProvider } from './types';

export * from './types';

/**
 * Selección del proveedor de transcripción.
 *
 * Añadir uno nuevo es: escribir su adaptador implementando `TranscriptionProvider`,
 * registrarlo aquí, y poner su nombre en `TRANSCRIPTION_PROVIDER`. Nada más del
 * sistema cambia.
 */
const PROVIDERS: Record<string, TranscriptionProvider> = {
  [deepgramProvider.name]: deepgramProvider,
  [openaiProvider.name]: openaiProvider,
  openai: openaiProvider,
};

export function getTranscriptionProvider(): TranscriptionProvider {
  /*
   * Whisper por defecto, por decisión de producto.
   *
   * Transcribe muy bien en español, pero NO separa voces: no devuelve ninguna
   * etiqueta de hablante. La consecuencia no es cosmética — con un solo
   * micrófono y sin datos de quién habla, no hay forma honesta de dibujar una
   * onda por persona, y la atribución de cada intervención recae entera en la
   * docente al cerrar la reunión.
   *
   * Deepgram sigue disponible con TRANSCRIPTION_PROVIDER=deepgram para cuando
   * la separación automática compense su coste.
   */
  const configured = process.env.TRANSCRIPTION_PROVIDER ?? 'openai';
  const provider = PROVIDERS[configured];

  if (!provider) {
    throw sinConfigurar(
      `el proveedor de transcripción "${configured}". Disponibles: ${Object.keys(PROVIDERS).join(', ')}`,
    );
  }

  return provider;
}

/** Para avisar en pantalla de si hay separación de voces o hay que asignarla. */
export function describeTranscription(): string {
  const provider = getTranscriptionProvider();
  return provider.supportsDiarization
    ? `${provider.name}: separa voces automáticamente.`
    : `${provider.name}: no separa voces. La docente asigna los hablantes.`;
}
