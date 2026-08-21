import 'server-only';
import { NextResponse } from 'next/server';
import { ServiceError, noEncontrado } from '@/services/errors';
import { meetings } from '@/services';
import { getSession } from '@/lib/session';
import type { Session } from '@/lib/auth';
import type { Meeting } from '@/lib/types';

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
/**
 * Como `handle`, pero además comprueba que la reunión sea de quien la pide.
 *
 * Existe para que el control de acceso no dependa de que quien escriba la
 * siguiente ruta se acuerde de comprobarlo. Todas las rutas de
 * `/api/reuniones/[id]/…` pasan por aquí.
 *
 * Una reunión ajena responde 404 y no 403: un 403 confirmaría que existe, que
 * es justo lo que no queremos decirle a quien va probando identificadores.
 */
export async function handleMeeting<T>(
  meetingId: string,
  run: (session: Session, meeting: Meeting) => Promise<T>,
): Promise<NextResponse> {
  return handle(async (session) => {
    const meeting = await meetings.findForTeacher(meetingId, session.teacherId);
    if (!meeting) throw noEncontrado('No existe esa reunión, o no es tuya.');
    return run(session, meeting);
  });
}

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
