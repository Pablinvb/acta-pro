import 'server-only';

/**
 * Lectura centralizada de la configuración. Todo lo de este módulo es de
 * servidor: ninguna variable lleva prefijo `NEXT_PUBLIC_`, de modo que la URL
 * de n8n y sus cabeceras de autenticación nunca llegan al navegador.
 */

export type DataSource = 'mock' | 'n8n';

export const dataSource: DataSource =
  process.env.ACTA_PRO_DATA_SOURCE === 'n8n' ? 'n8n' : 'mock';

/** Base de los webhooks, sin barra final. */
export const n8nBaseUrl = (process.env.N8N_WEBHOOK_BASE_URL ?? '').replace(/\/+$/, '');

export const n8nTimeoutMs = Number(process.env.N8N_TIMEOUT_MS ?? 15000);

export const n8nAuthHeader: Record<string, string> =
  process.env.N8N_AUTH_HEADER_NAME && process.env.N8N_AUTH_HEADER_VALUE
    ? { [process.env.N8N_AUTH_HEADER_NAME]: process.env.N8N_AUTH_HEADER_VALUE }
    : {};

/**
 * `true` cuando la app puede hablar con n8n de verdad. Si el usuario pide modo
 * `n8n` pero no configuró la URL, preferimos decirlo en claro antes que fallar
 * con un error de red incomprensible en mitad de una reunión.
 */
export const isLive = dataSource === 'n8n' && n8nBaseUrl.length > 0;

export function describeConfig(): string {
  if (dataSource === 'mock') {
    return 'Modo demostración: los datos son ficticios y no se llama a n8n.';
  }
  if (!n8nBaseUrl) {
    return 'ACTA_PRO_DATA_SOURCE=n8n pero falta N8N_WEBHOOK_BASE_URL. Revisa tu .env.local.';
  }
  return `Conectado a n8n en ${n8nBaseUrl}`;
}
