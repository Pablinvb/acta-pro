import 'server-only';

/**
 * Taxonomía de errores de ACTA PRO.
 *
 * Sustituye al workflow `Error Handler` de n8n y conserva su regla central, que
 * era la más importante de aquella arquitectura:
 *
 *   Si falla una integración externa, NO se elimina la reunión y NO se elimina
 *   información ya procesada. Se marca `processing_status = retry_required`.
 *
 * Por eso los errores se clasifican por si el trabajo se puede reintentar, y
 * ningún servicio borra nada al fallar.
 */

export type ErrorKind =
  /** El dato de entrada no es válido. Reintentar igual no arregla nada. */
  | 'validacion'
  /** Un servicio externo falló o no respondió. El trabajo sigue intacto. */
  | 'integracion'
  /** No existe lo que se pide. */
  | 'no_encontrado'
  /** Falta configuración (credenciales, variables de entorno). */
  | 'configuracion'
  /** La operación no está permitida en el estado actual de la reunión. */
  | 'estado_invalido';

const RETRYABLE: ReadonlySet<ErrorKind> = new Set<ErrorKind>(['integracion']);

const STATUS: Record<ErrorKind, number> = {
  validacion: 400,
  estado_invalido: 409,
  no_encontrado: 404,
  configuracion: 503,
  integracion: 502,
};

export class ServiceError extends Error {
  readonly kind: ErrorKind;
  /** Mensaje pensado para leerse en pantalla, en mitad de una reunión. */
  readonly userMessage: string;
  readonly details?: unknown;

  constructor(kind: ErrorKind, userMessage: string, options?: { cause?: unknown; details?: unknown }) {
    super(`${kind}: ${userMessage}`);
    this.name = 'ServiceError';
    this.kind = kind;
    this.userMessage = userMessage;
    this.details = options?.details;
    if (options?.cause) this.cause = options.cause;
  }

  /** Si es cierto, el trabajo se conserva y la operación se puede repetir. */
  get retryable(): boolean {
    return RETRYABLE.has(this.kind);
  }

  get httpStatus(): number {
    return STATUS[this.kind];
  }
}

/* ── Atajos ───────────────────────────────────────────────────────────────── */

export const invalido = (mensaje: string, details?: unknown) =>
  new ServiceError('validacion', mensaje, { details });

export const noEncontrado = (mensaje: string) => new ServiceError('no_encontrado', mensaje);

export const estadoInvalido = (mensaje: string) => new ServiceError('estado_invalido', mensaje);

export const sinConfigurar = (que: string) =>
  new ServiceError(
    'configuracion',
    `Falta configurar ${que}. Revisa las variables de entorno del servidor.`,
  );

export const integracionFallida = (servicio: string, cause?: unknown) =>
  new ServiceError(
    'integracion',
    `${servicio} no respondió. No se ha perdido nada: vuelve a intentarlo.`,
    { cause },
  );
