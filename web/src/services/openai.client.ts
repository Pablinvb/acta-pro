import 'server-only';
import OpenAI from 'openai';
import { externalTimeoutMs, requireOpenAiKey } from './config';

let client: OpenAI | null = null;

/** Cliente compartido. Se crea al primer uso para no exigir la clave en el arranque. */
export function openai(): OpenAI {
  client ??= new OpenAI({ apiKey: requireOpenAiKey(), timeout: externalTimeoutMs, maxRetries: 2 });
  return client;
}
