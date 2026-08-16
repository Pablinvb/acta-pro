'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Borrador de trabajo que sobrevive a una recarga.
 *
 * Usa `sessionStorage`, no `localStorage`, y la diferencia importa: el borrador
 * contiene decisiones sobre el acta de un menor, y el iPad de un aula puede
 * pasar por varias manos. `sessionStorage` se vacía al cerrar la pestaña, así
 * que resuelve el problema real —perder media revisión por un toque
 * accidental— sin dejar esos datos en el dispositivo indefinidamente.
 *
 * Esto es una caché de trabajo en curso, NO una fuente de verdad. La fuente de
 * verdad es la base de datos de n8n; mientras los workflows la tengan como
 * `NoOp`, aquí solo se guarda lo que la docente aún no ha enviado.
 *
 * El valor inicial se devuelve en el primer render y la lectura ocurre después
 * de montar, para que el HTML del servidor y el del cliente coincidan.
 */
export function useDraft<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  const storageKey = useRef(`acta-pro:draft:${key}`);

  useEffect(() => {
    storageKey.current = `acta-pro:draft:${key}`;
    try {
      const saved = sessionStorage.getItem(storageKey.current);
      if (saved !== null) setValue(JSON.parse(saved) as T);
    } catch {
      // Almacenamiento bloqueado o contenido corrupto: se sigue sin borrador.
    }
    setLoaded(true);
  }, [key]);

  useEffect(() => {
    if (!loaded) return;
    try {
      sessionStorage.setItem(storageKey.current, JSON.stringify(value));
    } catch {
      // Cuota llena o modo privado: perder el borrador no debe romper la pantalla.
    }
  }, [value, loaded]);

  /** Se llama cuando el trabajo ya viajó a n8n y el borrador deja de hacer falta. */
  const clear = useCallback(() => {
    try {
      sessionStorage.removeItem(storageKey.current);
    } catch {
      /* nada que limpiar */
    }
  }, []);

  return { value, setValue, clear, loaded };
}
