'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { login, type LoginState } from './actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 inline-flex items-center justify-center gap-2 rounded-[10px] border border-accent bg-accent px-4 text-sm font-medium text-accent-on transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? (
        <>
          <span
            aria-hidden
            className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
          Comprobando…
        </>
      ) : (
        'Entrar'
      )}
    </button>
  );
}

const field =
  'min-h-[44px] w-full rounded-[10px] border border-line-strong bg-surface px-3 text-sm text-ink transition placeholder:text-ink-3 focus:border-accent';

export function LoginForm({ demoHint }: { demoHint: string | null }) {
  const [state, formAction] = useActionState<LoginState, FormData>(login, { error: null });

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-ink-2">Identificador docente</span>
        <input
          name="teacherId"
          autoComplete="username"
          autoCapitalize="characters"
          required
          placeholder="T-045"
          className={`${field} font-data tracking-wide`}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-ink-2">Contraseña</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={field}
        />
      </label>

      {state.error && (
        <p
          role="alert"
          className="animate-[shake_0.3s_ease-in-out] rounded-[10px] border border-crit-border bg-crit-soft px-3 py-2.5 text-[13px] text-crit"
        >
          {state.error}
        </p>
      )}

      <Submit />

      {demoHint && (
        <p className="mt-1 rounded-[10px] border border-dashed border-line-strong px-3 py-2.5 text-center text-xs text-ink-3">
          {demoHint}
        </p>
      )}
    </form>
  );
}
