import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { pdf } from '@/services';
import { ServiceError } from '@/services/errors';

/**
 * Descarga del acta en PDF.
 *
 * Existe para que la docente pueda imprimirla y archivarla en papel, que sigue
 * siendo la evidencia que le piden. Devuelve el PDF directamente en lugar de un
 * JSON con el archivo dentro, para que el navegador lo abra o lo descargue sin
 * que el cliente tenga que reconstruir nada.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: 'sesion_invalida', message: 'Tu sesión ha caducado. Vuelve a entrar.' },
      { status: 401 },
    );
  }

  const { id } = await context.params;

  try {
    const { pdf: buffer, documentCode } = await pdf.build(decodeURIComponent(id));

    // `inline` abre el visor del navegador y deja guardar desde ahí; en iPad es
    // lo que permite mandarlo a imprimir sin descargarlo primero.
    const disposition = request.nextUrl.searchParams.has('descargar') ? 'attachment' : 'inline';

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename="${documentCode}.pdf"`,
        'Content-Length': String(buffer.length),
        // Un acta con datos de un menor no debe quedar cacheada por nadie.
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json(
        { error: error.kind, message: error.userMessage },
        { status: error.httpStatus },
      );
    }
    console.error('[acta-pro] no se pudo generar el PDF:', error);
    return NextResponse.json(
      { error: 'error_inesperado', message: 'No se pudo generar el PDF del acta.' },
      { status: 500 },
    );
  }
}
