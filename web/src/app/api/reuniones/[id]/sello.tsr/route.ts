import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { signatures } from '@/services';

/**
 * Descarga del sello de tiempo RFC 3161.
 *
 * Guardar el token y no poder sacarlo lo convertiría en un adorno. Esto lo
 * entrega tal cual, en el formato `.tsr` que esperan las herramientas
 * estándar, para que cualquiera —la docente, el centro, un abogado, la
 * familia— pueda comprobar por su cuenta que el acta existía en la fecha que
 * dice:
 *
 *     openssl ts -verify -in ACTA-….tsr -token_in \
 *       -digest <la huella impresa en el acta, sin espacios y en minúsculas> \
 *       -CAfile cadena-de-la-autoridad.pem
 *
 * La verificación no pasa por ACTA PRO, y ese es justo el valor: si el sello
 * sólo se pudiera comprobar con la herramienta que lo creó, no probaría nada
 * frente a quien desconfía de esa herramienta.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: 'sesion_invalida', message: 'Tu sesión ha caducado. Vuelve a entrar.' },
      { status: 401 },
    );
  }

  const { id } = await context.params;
  const meetingId = decodeURIComponent(id);

  const firmas = await signatures.listByMeeting(meetingId);
  const sello = firmas.find((s) => s.timestamp)?.timestamp;

  if (!sello) {
    return NextResponse.json(
      {
        error: 'no_encontrado',
        message:
          'Esta acta no tiene sello de tiempo externo. Puede que se firmara sin autoridad de sellado configurada, o que la autoridad no respondiera ese día.',
      },
      { status: 404 },
    );
  }

  const der = Buffer.from(sello.token, 'base64');

  return new NextResponse(new Uint8Array(der), {
    headers: {
      // Tipo que registra la IANA para un token RFC 3161.
      'Content-Type': 'application/timestamp-reply',
      'Content-Disposition': `attachment; filename="${meetingId}.tsr"`,
      'Content-Length': String(der.length),
      // Cabeceras informativas: quien descarga el sello necesita saber contra
      // qué autoridad verificarlo sin tener que abrir el token primero.
      'X-Acta-Pro-Tsa': sello.tsa_url ?? '',
      'X-Acta-Pro-Sellado': sello.gen_time,
      'X-Acta-Pro-Serie': sello.serial_number,
      'Cache-Control': 'private, no-store',
    },
  });
}
