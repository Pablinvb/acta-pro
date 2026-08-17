'use client';

import { useEffect, useState } from 'react';

/**
 * Oscuro o claro.
 *
 * Solo dos estados, no tres. La identidad de ACTA PRO es oscura y se presenta
 * así venga el sistema como venga, de modo que un estado «seguir al sistema» no
 * significaría nada.
 *
 * El claro se conserva porque un aula con sol de frente a mediodía es un caso
 * real, y un docente que no puede leer su acta no tiene por qué aguantar una
 * decisión de marca.
 */
export function ThemeToggle() {
  const [light, setLight] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLight(localStorage.getItem('acta-pro-theme') === 'light');
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const root = document.documentElement;
    if (light) {
      root.setAttribute('data-theme', 'light');
      localStorage.setItem('acta-pro-theme', 'light');
    } else {
      root.removeAttribute('data-theme');
      localStorage.removeItem('acta-pro-theme');
    }
  }, [light, ready]);

  return (
    <button
      type="button"
      onClick={() => setLight((v) => !v)}
      className="rounded-lg border border-line-strong bg-surface-2 px-3 text-xs font-medium text-ink-2 transition hover:bg-surface-3 hover:text-ink"
      aria-label={light ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro'}
    >
      {light ? '☾ Oscuro' : '☀ Claro'}
    </button>
  );
}
