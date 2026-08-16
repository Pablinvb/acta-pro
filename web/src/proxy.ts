import { NextResponse, type NextRequest } from 'next/server';
import { sessionCookie, verifySession } from '@/lib/auth';

/**
 * Puerta de entrada. Todo lo que no sea la pantalla de acceso exige sesión
 * válida, incluidas las rutas de `/api/n8n/*`: sin esto, cualquiera podría
 * disparar los webhooks de n8n desde fuera de la aplicación.
 *
 * Se llama `proxy` y no `middleware` porque Next 16 renombró la convención;
 * corre en el runtime Edge, así que todo lo que use debe funcionar allí — por
 * eso la sesión se firma con Web Crypto y no con `node:crypto`.
 */
export default async function proxy(request: NextRequest) {
  const session = await verifySession(request.cookies.get(sessionCookie.name)?.value);
  if (session) return NextResponse.next();

  // Las llamadas de datos responden 401 en lugar de redirigir: el cliente debe
  // poder distinguir «sesión caducada» de «me devolvieron una página HTML».
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'sesion_invalida', message: 'Tu sesión ha caducado. Vuelve a entrar.' },
      { status: 401 },
    );
  }

  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    /*
     * Todo excepto: la propia pantalla de acceso, los recursos internos de
     * Next, y los archivos estáticos.
     */
    '/((?!login|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)',
  ],
};
