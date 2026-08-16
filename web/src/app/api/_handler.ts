import 'server-only';
import { NextResponse } from 'next/server';
import { ServiceError } from '@/services/errors';
import { getSession } from '@/lib/session';
import type { Session } from '@/lib/auth';

/**
 * Envoltorio común de las rutas de la API.
 *
 * Traduce los errores de servicio a HTTP con un mensaje que se pueda leer en
 * pantalla, y conserva la distinción que importa: si el fallo es reintentable,
 * se dice, porque significa que el trabajo sigue intacto.
 *
 * El proxy ya exige sesión, pero cada ruta la vuelve a pedir: así el día que
 * alguien toque el `matcher`, ninguna ruta con datos de estudiantes se queda
 * abierta por descuido.
 */
export async function handle<T>(
  run: (session: Session) => Promise<T>,
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: 'sesion_invalida', message: 'Tu sesión ha caducado. Vuelve a entrar.' },
      { status: 401 },
    );
  }

  try {
    return NextResponse.json(await run(session));
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json(
        {
          error: error.kind,
          message: error.userMessage,
          retryable: error.retryable,
          details: error.details,
        },
        { status: error.httpStatus },
      );
    }

    console.error('[acta-pro] error no controlado en la API:', error);
    return NextResponse.json(
      {
        error: 'error_inesperado',
        message: 'Algo falló en el servidor. No se ha perdido nada; vuelve a intentarlo.',
        retryable: true,
      },
      { status: 500 },
    );
  }
}
