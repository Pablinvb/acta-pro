'use client';

import { useEffect, useState } from 'react';

type Choice = 'system' | 'light' | 'dark';

const NEXT: Record<Choice, Choice> = { system: 'light', light: 'dark', dark: 'system' };
const LABEL: Record<Choice, string> = { system: 'Sistema', light: 'Claro', dark: 'Oscuro' };

/**
 * Tres estados, no dos. «Sistema» no marca el documento y deja mandar a
 * prefers-color-scheme; una elección explícita escribe `data-theme` y gana en
 * ambos sentidos.
 */
export function ThemeToggle() {
  const [choice, setChoice] = useState<Choice>('system');

  useEffect(() => {
    const saved = localStorage.getItem('acta-pro-theme') as Choice | null;
    if (saved === 'light' || saved === 'dark') setChoice(saved);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (choice === 'system') {
      root.removeAttribute('data-theme');
      localStorage.removeItem('acta-pro-theme');
    } else {
      root.setAttribute('data-theme', choice);
      localStorage.setItem('acta-pro-theme', choice);
    }
  }, [choice]);

  return (
    <button
      type="button"
      onClick={() => setChoice((c) => NEXT[c])}
      className="rounded-lg border border-line-strong bg-surface px-3 text-xs font-medium text-ink-2 transition hover:bg-surface-2"
      aria-label={`Tema: ${LABEL[choice]}. Pulsa para cambiar.`}
    >
      Tema · {LABEL[choice]}
    </button>
  );
}
