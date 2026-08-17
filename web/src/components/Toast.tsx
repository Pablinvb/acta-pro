'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Avisos efímeros.
 *
 * Existen para confirmar que algo ocurrió de verdad — un fragmento enviado, una
 * firma registrada, un fallo de red — sin robarle a la docente el sitio donde
 * está trabajando. Los errores no se autodescartan: si algo falló, tiene que
 * poder leerse con calma.
 */

export type ToastTone = 'ok' | 'warn' | 'crit' | 'info';

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  detail?: string;
}

const TONE: Record<ToastTone, string> = {
  ok: 'border-ok-border bg-ok-soft text-ok',
  warn: 'border-warn-border bg-warn-soft text-warn',
  crit: 'border-crit-border bg-crit-soft text-crit',
  info: 'border-accent-border bg-accent-soft text-accent-text',
};

const ToastContext = createContext<((t: Omit<Toast, 'id'>) => void) | null>(null);

export function useToast() {
  const push = useContext(ToastContext);
  if (!push) throw new Error('useToast necesita estar dentro de <ToastProvider>.');
  return push;
}

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = nextId++;
      setToasts((ts) => [...ts.slice(-3), { ...toast, id }]);
      // Los fallos se quedan hasta que la persona los cierre.
      if (toast.tone !== 'crit') setTimeout(() => dismiss(id), 4200);
    },
    [dismiss],
  );

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[330px] max-w-[calc(100vw-2rem)] flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-toast-in pointer-events-auto rounded-[10px] border px-3.5 py-3 shadow-float ${TONE[t.tone]}`}
          >
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold">{t.title}</p>
                {t.detail && <p className="mt-0.5 text-xs opacity-90">{t.detail}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Cerrar aviso"
                className="-my-1 -mr-1 min-h-0 shrink-0 rounded px-1.5 text-lg leading-none opacity-60 transition hover:opacity-100"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
