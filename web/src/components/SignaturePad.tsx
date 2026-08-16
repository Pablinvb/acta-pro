'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Pad de firma manuscrita.
 *
 * Usa Pointer Events, así que el mismo código sirve para dedo, Apple Pencil y
 * ratón — en iPad la firma se hace con el dedo sobre el propio documento, que
 * es como ocurre en una reunión real.
 *
 * El trazo se suaviza con curvas cuadráticas entre puntos medios: firmar con el
 * dedo produce muestras irregulares y unirlas con rectas da un garabato
 * anguloso que no se parece a la firma de nadie.
 *
 * `touch-action: none` es imprescindible: sin él, iPadOS interpreta el arrastre
 * como scroll y la firma nunca llega a dibujarse.
 */

interface Point {
  x: number;
  y: number;
}

export function SignaturePad({
  label,
  onChange,
  disabled = false,
}: {
  label: string;
  /** Recibe el PNG en data URI, o `null` cuando se limpia. */
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const points = useRef<Point[]>([]);
  /**
   * Se lleva en una referencia además de en estado: al soltar el dedo, el
   * estado de React puede no haberse aplicado todavía, y una firma rápida se
   * perdería silenciosamente si `end` consultara el valor del closure.
   */
  const inked = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  /** Reajusta el lienzo a su tamaño real en píxeles del dispositivo. */
  const setup = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim();
  }, []);

  useEffect(() => {
    setup();
    const observer = new ResizeObserver(setup);
    if (canvasRef.current) observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [setup]);

  const pointFrom = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    try {
      // Mantiene el trazo aunque el dedo se salga del lienzo. Puede fallar si el
      // puntero ya no está activo; capturarlo o no es secundario, dibujar no.
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* sin captura, el trazo sigue funcionando dentro del lienzo */
    }
    drawing.current = true;
    points.current = [pointFrom(e)];
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    points.current.push(pointFrom(e));
    const pts = points.current;
    if (pts.length < 3) return;

    // Curva entre los puntos medios de los dos últimos segmentos.
    const [a, b, c] = pts.slice(-3);
    const from = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const to = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };

    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.quadraticCurveTo(b.x, b.y, to.x, to.y);
    ctx.stroke();
    inked.current = true;
    if (!hasInk) setHasInk(true);
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    points.current = [];
    const canvas = canvasRef.current;
    if (canvas && inked.current) onChange(canvas.toDataURL('image/png'));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    inked.current = false;
    setHasInk(false);
    onChange(null);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-medium text-ink-2">{label}</span>
        {hasInk && (
          <button
            type="button"
            onClick={clear}
            disabled={disabled}
            className="ml-auto min-h-0 rounded-md px-2 py-1 text-[11px] text-ink-3 transition hover:bg-surface-2 hover:text-ink"
          >
            Borrar y repetir
          </button>
        )}
      </div>

      <div
        className={`relative overflow-hidden rounded-[10px] border transition-colors ${
          hasInk ? 'border-ok-border bg-ok-soft/30' : 'border-dashed border-line-strong bg-surface-2'
        } ${disabled ? 'pointer-events-none opacity-50' : ''}`}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
          aria-label={`Zona para firmar: ${label}`}
          className="block h-[150px] w-full cursor-crosshair touch-none"
        />

        {!hasInk && (
          <p className="pointer-events-none absolute inset-0 grid place-items-center text-[13px] text-ink-3">
            Firma aquí con el dedo o el lápiz
          </p>
        )}

        {/* Línea de firma, como en el papel. */}
        <div aria-hidden className="pointer-events-none absolute right-6 bottom-7 left-6 border-b border-line-strong" />
      </div>
    </div>
  );
}
