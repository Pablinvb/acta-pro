'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Cifra que cuenta hasta su valor.
 *
 * Sirve para que un cambio en el panel se note: si mañana hay 5 actas
 * pendientes en lugar de 2, el número se mueve y la docente lo ve. Respeta
 * `prefers-reduced-motion` mostrando el valor final directamente.
 *
 * El primer render muestra el valor real (no cero) para que el HTML del
 * servidor y el del cliente coincidan; la animación arranca justo después.
 */
export function Counter({ value, className = '' }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value);
  // Arranca en 0 para que la primera aparición también cuente.
  const from = useRef(0);

  useEffect(() => {
    const target = value;
    const start = from.current;
    from.current = target;

    if (start === target) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(target);
      return;
    }

    const DURATION = 550;
    const t0 = performance.now();
    let frame = 0;

    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / DURATION);
      // Desaceleración cúbica: arranca rápido y se posa en el valor final.
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(start + (target - start) * eased));
      if (t < 1) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <span className={`tabular ${className}`} aria-label={String(value)}>
      {shown}
    </span>
  );
}
