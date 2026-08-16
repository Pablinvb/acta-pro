import 'server-only';
import type { Meeting } from '@/lib/types';
import * as audit from './audit.service';
import { isDemo } from './config';
import { gmailApi } from './google.client';
import { integracionFallida, invalido } from './errors';

/**
 * Envío por Gmail — antes workflows 15 (acta al representante) y 04
 * (recordatorio a la docente).
 *
 * Comprobación que no se salta nunca: sin correo verificado del representante
 * no se envía nada. La arquitectura marca esas reuniones como
 * `manual_verification_required`, y aquí eso se traduce en un error claro antes
 * de intentar el envío, no en un fallo de Gmail difícil de interpretar.
 *
 * El acta viaja como adjunto HTML. La transcripción **nunca** se adjunta.
 */

const EMAIL_RE = /^[\w.+-]+@[\w-]+\.[\w.-]+$/;

function encodeHeader(text: string): string {
  // Los asuntos con tildes o ñ necesitan codificarse o llegan rotos.
  return /[^\x20-\x7e]/.test(text)
    ? `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`
    : text;
}

function buildRawMessage(options: {
  to: string;
  from?: string;
  subject: string;
  bodyText: string;
  attachment?: { filename: string; mimeType: string; content: string };
}): string {
  const boundary = `acta-pro-${Date.now().toString(36)}`;
  const headers = [
    `To: ${options.to}`,
    options.from ? `From: ${options.from}` : null,
    `Subject: ${encodeHeader(options.subject)}`,
    'MIME-Version: 1.0',
  ].filter(Boolean);

  let message: string;

  if (options.attachment) {
    headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    message = [
      headers.join('\r\n'),
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(options.bodyText, 'utf8').toString('base64'),
      `--${boundary}`,
      `Content-Type: ${options.attachment.mimeType}; charset="UTF-8"`,
      `Content-Disposition: attachment; filename="${options.attachment.filename}"`,
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(options.attachment.content, 'utf8').toString('base64'),
      `--${boundary}--`,
    ].join('\r\n');
  } else {
    headers.push('Content-Type: text/plain; charset="UTF-8"');
    headers.push('Content-Transfer-Encoding: base64');
    message = [headers.join('\r\n'), '', Buffer.from(options.bodyText, 'utf8').toString('base64')].join('\r\n');
  }

  // Gmail espera base64url sin relleno.
  return Buffer.from(message, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function send(options: Parameters<typeof buildRawMessage>[0]): Promise<string | null> {
  if (isDemo) return null;
  try {
    const { data } = await gmailApi().users.messages.send({
      userId: 'me',
      requestBody: { raw: buildRawMessage(options) },
    });
    return data.id ?? null;
  } catch (error) {
    throw integracionFallida('Gmail', error);
  }
}

export function buildMinutesBody(meeting: Meeting, followUpDate?: string): string {
  const nombre = meeting.student_name.split(' ')[0];
  return [
    `Estimado/a ${meeting.representative_name}:`,
    '',
    `Adjunto el acta de la reunión mantenida el ${meeting.date} sobre ${meeting.meeting_type.toLowerCase()} de ${nombre}. En ella constan los acuerdos y compromisos establecidos por ambas partes.`,
    followUpDate ? `\nLa próxima reunión de seguimiento está prevista para el ${followUpDate}.` : '',
    '',
    'Atentamente,',
    `${meeting.teacher_name} — Docente`,
  ]
    .filter((l) => l !== '')
    .join('\n');
}

/** Envía el acta firmada al representante. Era el workflow 15. */
export async function sendMinutes(
  meeting: Meeting,
  documentCode: string,
  html: string,
  followUpDate?: string,
): Promise<string | null> {
  if (!meeting.representative_email || !EMAIL_RE.test(meeting.representative_email)) {
    throw invalido(
      'La reunión no tiene un correo verificado del representante, así que el acta no se puede enviar. Complétalo en la ficha previa.',
    );
  }

  const messageId = await send({
    to: meeting.representative_email,
    subject: `Acta de reunión — ${meeting.student_name} — ${meeting.date}`,
    bodyText: buildMinutesBody(meeting, followUpDate),
    attachment: { filename: `${documentCode}.html`, mimeType: 'text/html', content: html },
  });

  await audit.record({
    meetingId: meeting.meeting_id,
    service: 'email',
    event: `acta enviada a ${meeting.representative_email}`,
  });

  return messageId;
}

/** Recordatorio a la docente antes de la reunión. Era el workflow 04. */
export async function sendReminder(meeting: Meeting, teacherEmail: string): Promise<string | null> {
  const messageId = await send({
    to: teacherEmail,
    subject: `Reunión en 30 minutos — ${meeting.student_name}`,
    bodyText: [
      `Tienes una reunión a las ${meeting.start_time}.`,
      '',
      `Estudiante: ${meeting.student_name}`,
      `Representante: ${meeting.representative_name}`,
      `Motivo: ${meeting.meeting_type}`,
      '',
      'Abre ACTA PRO para revisar la ficha previa.',
    ].join('\n'),
  });

  await audit.record({
    meetingId: meeting.meeting_id,
    service: 'email',
    event: 'recordatorio enviado a la docente',
  });

  return messageId;
}
