import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sessionCookie, verifySession, type Session } from './auth';

/** Sesión actual, o `null` si no hay ninguna válida. */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return verifySession(store.get(sessionCookie.name)?.value);
}

/**
 * Sesión obligatoria. El middleware ya bloquea las rutas protegidas, pero cada
 * página vuelve a comprobarlo: si algún día cambia el `matcher`, ninguna
 * pantalla con datos de estudiantes queda expuesta por descuido.
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}
