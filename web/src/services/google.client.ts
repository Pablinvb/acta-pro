import 'server-only';
import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { requireGoogleCredentials } from './config';

/**
 * Cliente OAuth2 de Google, compartido por Calendar, Drive y Gmail.
 *
 * Esto es lo único que n8n hacía por nosotros y que hay que sostener a mano: la
 * gestión de credenciales. Se usa un refresh token de larga duración de la
 * cuenta institucional, y `googleapis` se encarga de renovar el access token
 * cuando caduca.
 *
 * Se prefiere OAuth2 con refresh token antes que una cuenta de servicio porque
 * Gmail tiene que enviar *como* la cuenta del centro; una cuenta de servicio sin
 * delegación de dominio no puede hacerlo.
 *
 * Scopes necesarios al generar el refresh token:
 *   https://www.googleapis.com/auth/calendar.events
 *   https://www.googleapis.com/auth/drive.file
 *   https://www.googleapis.com/auth/gmail.send
 *
 * `drive.file` en lugar de `drive` a propósito: da acceso solo a los archivos
 * que crea la propia aplicación, no a todo el Drive del centro.
 */

let cached: OAuth2Client | null = null;

export function googleAuth(): OAuth2Client {
  if (cached) return cached;

  const { clientId, clientSecret, refreshToken } = requireGoogleCredentials();
  const client = new google.auth.OAuth2(clientId, clientSecret);
  client.setCredentials({ refresh_token: refreshToken });
  cached = client;
  return client;
}

export const calendarApi = () => google.calendar({ version: 'v3', auth: googleAuth() });
export const driveApi = () => google.drive({ version: 'v3', auth: googleAuth() });
export const gmailApi = () => google.gmail({ version: 'v1', auth: googleAuth() });
