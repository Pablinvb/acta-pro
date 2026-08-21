import 'server-only';
import { externalTimeoutMs, tsaPolicy, tsaUrl } from './config';
import {
  buildTimeStampRequest,
  parseTimeStampResponse,
  sealMatches,
  type TstInfo,
} from './rfc3161';

/**
 * Sello de tiempo de una autoridad independiente (RFC 3161).
 *
 * El sello propio prueba integridad; éste prueba **cuándo**. La diferencia
 * importa: si dentro de dos años alguien sostiene que el acta se redactó
 * después de los hechos, la fecha que la desmiente no puede ser la que puso el
 * servidor del propio centro.
 *
 * Nunca bloquea la firma. Si la autoridad no responde, el acta se firma igual
 * con el sello propio y queda constancia de que faltó el sello externo. Perder
 * la firma de una reunión porque un servidor de terceros estaba caído sería
 * cambiar un problema grande por uno enorme.
 */

export interface TimestampResult {
  /** Token DER en base64. Es la prueba, y se guarda tal cual. */
  token: string;
  /** Instante atestiguado por la autoridad, en ISO 8601. */
  genTime: string;
  serialNumber: string;
  policy: string;
  tsaName?: string;
  /** De qué servidor vino, para saber a quién preguntar al verificar. */
  url: string;
}

export class TimestampError extends Error {}

/** ¿Está configurado el sellado externo? */
export const enabled = (): boolean => tsaUrl.length > 0;

/**
 * Pide a la autoridad que selle una huella SHA-256.
 *
 * Lanza si algo va mal. Quien llama decide si eso debe interrumpir su trabajo;
 * en la firma del acta, no.
 */
export async function stamp(sha256Hex: string): Promise<TimestampResult> {
  if (!enabled()) throw new TimestampError('No hay autoridad de sellado configurada.');

  /*
   * El nonce es lo que impide que alguien intercepte la respuesta y nos
   * devuelva un sello antiguo que ya tenía guardado. La autoridad tiene que
   * devolverlo idéntico, y si no coincide se descarta el sello.
   */
  const nonce = Math.floor(Math.random() * 0xffffffff);
  const peticion = buildTimeStampRequest(sha256Hex, {
    nonce,
    certReq: true,
    policy: tsaPolicy || undefined,
  });

  const control = AbortSignal.timeout(externalTimeoutMs);
  let respuesta: Response;
  try {
    respuesta = await fetch(tsaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/timestamp-query',
        Accept: 'application/timestamp-reply',
      },
      body: new Uint8Array(peticion),
      signal: control,
    });
  } catch (error) {
    throw new TimestampError(
      `No se pudo contactar con la autoridad de sellado: ${(error as Error).message}`,
    );
  }

  if (!respuesta.ok) {
    throw new TimestampError(`La autoridad de sellado respondió ${respuesta.status}.`);
  }

  const der = new Uint8Array(await respuesta.arrayBuffer());
  const leida = parseTimeStampResponse(der);

  if (leida.status !== 0 && leida.status !== 1) {
    const motivo = leida.statusMessages.join(' ');
    throw new TimestampError(
      `La autoridad rechazó el sellado (${leida.statusText})${motivo ? `: ${motivo}` : ''}.`,
    );
  }

  if (!leida.token || !leida.info) {
    throw new TimestampError('La autoridad respondió sin token de sellado.');
  }

  comprobar(leida.info, sha256Hex, nonce);

  return {
    token: base64(leida.token),
    genTime: leida.info.genTime,
    serialNumber: leida.info.serialNumber,
    policy: leida.info.policy,
    tsaName: leida.info.tsaName,
    url: tsaUrl,
  };
}

/**
 * Tres comprobaciones antes de dar un sello por bueno.
 *
 * Un token de otro documento, o uno reutilizado de otra petición, verificaría
 * igual de bien contra la autoridad. Archivarlo daría un respaldo aparente que
 * se desmoronaría justo cuando hiciera falta.
 */
function comprobar(info: TstInfo, sha256Hex: string, nonce: number): void {
  if (!sealMatches(info, sha256Hex)) {
    throw new TimestampError(
      'La autoridad selló una huella distinta de la del acta. El sello no se guarda.',
    );
  }

  if (info.nonce !== undefined && parseInt(info.nonce, 16) !== nonce) {
    throw new TimestampError(
      'El identificador de la respuesta no coincide con el de la petición: podría ser un sello reutilizado.',
    );
  }

  /*
   * Un desfase grande no invalida el sello —la hora buena es la de la
   * autoridad, no la nuestra— pero sí merece que alguien lo mire: o el reloj
   * del servidor va mal, o la respuesta no es de esta petición.
   */
  const desfase = Math.abs(Date.parse(info.genTime) - Date.now());
  if (Number.isFinite(desfase) && desfase > 24 * 60 * 60 * 1000) {
    throw new TimestampError(
      `La fecha del sello (${info.genTime}) se aleja más de un día de la del servidor.`,
    );
  }
}

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}
