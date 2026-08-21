import { redirect } from 'next/navigation';
import { ThemeToggle } from '@/components/ThemeToggle';
import { IconShield } from '@/components/icons';
import { getSession } from '@/lib/session';
import { LoginForm } from './LoginForm';

export const metadata = { title: 'Acceso · ACTA PRO' };

export default async function LoginPage() {
  if (await getSession()) redirect('/agenda');

  /*
   * Ya no hay pista de credenciales. Cada docente tiene su propia contraseña,
   * que se genera con `npm run usuarios` y se entrega en mano: escribir unas
   * credenciales en la pantalla de acceso las convierte en públicas.
   */
  const demoHint = null;

  return (
    <div className="grid min-h-dvh place-items-center bg-ground p-6">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 flex items-center gap-3">
          <span
            aria-hidden
            className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-accent-on shadow-glow-soft"
          >
            <IconShield className="size-6" />
          </span>
          <div>
            <h1 className="text-[19px] leading-tight font-bold tracking-wide">
              ACTA <span className="text-accent-text">PRO</span>
            </h1>
            <p className="font-data text-[10px] tracking-wider text-ink-3 uppercase">
              Gestión de reuniones con representantes
            </p>
          </div>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>

        <div className="rounded-[14px] border border-line bg-surface p-5 shadow-float">
          <h2 className="mb-1 text-[15px] font-semibold">Acceso docente</h2>
          <p className="mb-4 text-[13px] text-ink-3">
            Las actas y los datos de estudiantes solo son accesibles con sesión iniciada.
          </p>
          <LoginForm demoHint={demoHint} />
        </div>

        <p className="mt-4 text-center text-xs leading-relaxed text-ink-3">
          Esta aplicación trata datos personales de estudiantes y de sus familias. Tu sesión da
          acceso a tus actas: no la compartas ni dejes el dispositivo desbloqueado.
        </p>
      </div>
    </div>
  );
}
