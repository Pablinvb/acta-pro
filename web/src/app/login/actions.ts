'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sessionCookie, signSession, verifyCredentials } from '@/lib/auth';
import { teachers } from '@/lib/mock/data';

export interface LoginState {
  error: string | null;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const teacherId = String(formData.get('teacherId') ?? '');
  const password = String(formData.get('password') ?? '');

  if (!teacherId || !password) {
    return { error: 'Escribe tu identificador docente y tu contraseña.' };
  }

  const result = verifyCredentials({ teacherId, password }, teachers);

  if (!result.ok) {
    if (result.reason === 'misconfigured') {
      return {
        error:
          'El servidor no tiene configurada la contraseña docente (TEACHER_PASSWORD). Avisa a quien administra el sistema.',
      };
    }
    // Mismo mensaje para identificador inexistente y contraseña incorrecta: no
    // se revela cuáles de los dos falló.
    return { error: 'Identificador o contraseña incorrectos.' };
  }

  const store = await cookies();
  store.set(sessionCookie.name, await signSession(result.session), sessionCookie.options);
  redirect('/agenda');
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(sessionCookie.name);
  redirect('/login');
}
