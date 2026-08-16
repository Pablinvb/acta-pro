import 'server-only';
import type { Signature } from '@/lib/types';
import { getRepositories } from '@/repositories';
import * as audit from './audit.service';
import { invalido, noEncontrado } from './errors';

/**
 * Firmas digitales — antes workflow 12.
 *
 * El acta se firma entera o no se firma: se exigen la de la docente y la del
 * representante en la misma operación, igual que hacía el workflow. Firmar a
 * medias dejaría un documento a medio validar en un estado que nadie sabría
 * interpretar.
 *
 * Completar las firmas es lo que pone la reunión en `signed` y encadena el
 * resto del proceso. Ese encadenado ya no es un `Execute Workflow` invisible:
 * lo orquesta `meeting-lifecycle.service`, donde se puede leer en qué orden
 * ocurre y qué pasa si un paso falla.
 */

/** Cada firma llega como PNG en data URI desde el pad manuscrito. */
const DATA_URI_PNG = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

/** Un PNG de firma real pesa bastante más que esto; por debajo es un trazo vacío. */
const MIN_SIGNATURE_BYTES = 512;

export interface SubmitSignaturesInput {
  meetingId: string;
  teacherSignature: string;
  representativeSignature: string;
  documentVersion?: number;
}

/** `quien` llega con su artículo ya puesto: «la docente», «del representante». */
function validateImage(image: string, quien: string): void {
  if (!image) throw invalido(`Falta la firma de ${quien}.`);
  if (!DATA_URI_PNG.test(image)) {
    throw invalido(`La firma de ${quien} no tiene un formato válido.`);
  }
  // `base64` codifica 3 bytes por cada 4 caracteres.
  const bytes = (image.length - image.indexOf(',') - 1) * 0.75;
  if (bytes < MIN_SIGNATURE_BYTES) {
    throw invalido(`La firma de ${quien} está prácticamente vacía. Pide que firme de nuevo.`);
  }
}

export async function submit(input: SubmitSignaturesInput): Promise<Signature[]> {
  const { meetingId, teacherSignature, representativeSignature } = input;

  const repos = getRepositories();
  const meeting = await repos.meetings.find(meetingId);
  if (!meeting) throw noEncontrado(`No existe la reunión ${meetingId}.`);

  if (meeting.status !== 'teacher_approved' && meeting.status !== 'signed') {
    throw invalido(
      'El acta debe estar aprobada por la docente antes de firmarse. Completa primero la revisión.',
    );
  }

  validateImage(teacherSignature, 'la docente');
  validateImage(representativeSignature, 'del representante');

  const signedAt = new Date().toISOString();

  await repos.signatures.save({
    meeting_id: meetingId,
    signer_role: 'teacher',
    signer_name: meeting.teacher_name,
    signed_at: signedAt,
    image: teacherSignature,
  });
  await repos.signatures.save({
    meeting_id: meetingId,
    signer_role: 'representative',
    signer_name: meeting.representative_name,
    signed_at: signedAt,
    image: representativeSignature,
  });

  await repos.meetings.setStatus(meetingId, 'signed');
  await audit.record({
    meetingId,
    service: 'signature',
    event: `acta firmada por ${meeting.teacher_name} y ${meeting.representative_name}`,
    details: { document_version: input.documentVersion ?? 1 },
  });

  return repos.signatures.listByMeeting(meetingId);
}

export async function listByMeeting(meetingId: string): Promise<Signature[]> {
  return getRepositories().signatures.listByMeeting(meetingId);
}

/** ¿Están las dos firmas? Es la condición para que arranque el archivo y el envío. */
export async function isFullySigned(meetingId: string): Promise<boolean> {
  const signatures = await getRepositories().signatures.listByMeeting(meetingId);
  const roles = new Set(signatures.filter((s) => s.signed_at).map((s) => s.signer_role));
  return roles.has('teacher') && roles.has('representative');
}
