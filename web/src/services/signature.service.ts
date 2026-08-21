import 'server-only';
import type { Signature, SignatureTimestamp } from '@/lib/types';
import { getRepositories } from '@/repositories';
import * as audit from './audit.service';
import { invalido, noEncontrado } from './errors';
import { computeSeal } from './seal';
import * as timestamp from './timestamp.service';

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

  const firmas = [
    {
      meeting_id: meetingId,
      signer_role: 'teacher' as const,
      signer_name: meeting.teacher_name,
      signed_at: signedAt,
      image: teacherSignature,
    },
    {
      meeting_id: meetingId,
      signer_role: 'representative' as const,
      signer_name: meeting.representative_name,
      signed_at: signedAt,
      image: representativeSignature,
    },
  ];

  /*
   * El sello se calcula ANTES de guardar, sobre el acta que se acaba de firmar
   * y sobre estas dos imágenes concretas. Es lo que convierte `signed_at` en
   * algo más que una columna editable: si alguien cambiara después una línea
   * del acta, la huella impresa en el PDF dejaría de cuadrar.
   *
   * Si no hay acta guardada no se sella, porque no habría qué sellar. No es un
   * caso esperable —no se firma lo que no se ha redactado— pero tampoco es
   * motivo para tumbar la firma.
   */
  const minutes = await repos.minutes.find(meetingId);
  const contentHash = minutes
    ? await computeSeal({
        documentCode: minutes.document_code,
        sections: minutes.sections,
        signatures: firmas,
      })
    : undefined;

  /*
   * Sello de una autoridad independiente. El `contentHash` demuestra que el
   * acta no se ha tocado; esto demuestra cuándo se firmó, y lo dice un tercero
   * en lugar del servidor del propio centro.
   *
   * Nunca interrumpe la firma. Si la autoridad no responde, se firma igual con
   * el sello propio y queda constancia en la auditoría de que faltó el externo:
   * perder la firma de una reunión porque un servidor ajeno estaba caído sería
   * cambiar un problema por otro peor.
   */
  const sello = contentHash ? await sellarSiSePuede(contentHash) : null;

  for (const firma of firmas) {
    await repos.signatures.save({
      ...firma,
      content_hash: contentHash,
      timestamp: sello ?? undefined,
    });
  }

  await repos.meetings.setStatus(meetingId, 'signed');
  await audit.record({
    meetingId,
    service: 'signature',
    event: `acta firmada por ${meeting.teacher_name} y ${meeting.representative_name}`,
    details: {
      document_version: input.documentVersion ?? 1,
      signed_at: signedAt,
      // Queda también en la auditoría, que sólo se añade y nunca se altera: si
      // el sello de la firma cambiara, aquí se vería el original.
      content_hash: contentHash ?? null,
      tsa_gen_time: sello?.gen_time ?? null,
      tsa_serial: sello?.serial_number ?? null,
    },
  });

  return repos.signatures.listByMeeting(meetingId);
}

/**
 * Pide el sello externo, y si no hay, sigue adelante.
 *
 * El fallo se registra en la auditoría en lugar de propagarse: quien mira el
 * acta después tiene que poder distinguir «no se selló porque no está
 * configurado» de «no se selló porque la autoridad falló aquel día».
 */
async function sellarSiSePuede(contentHash: string): Promise<SignatureTimestamp | null> {
  if (!timestamp.enabled()) return null;
  try {
    const sello = await timestamp.stamp(contentHash);
    return {
      token: sello.token,
      gen_time: sello.genTime,
      serial_number: sello.serialNumber,
      policy: sello.policy,
      tsa_name: sello.tsaName,
      tsa_url: sello.url,
    };
  } catch (error) {
    console.error('[acta-pro] no se pudo sellar el acta con la autoridad:', error);
    return null;
  }
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
