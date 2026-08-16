'use client';

import { useEffect, useRef } from 'react';

/**
 * Nivel de audio en tiempo real.
 *
 * No es decoración: es la única prueba visible de que el micrófono está
 * captando algo. Si la reunión se graba en silencio por un permiso mal dado o
 * un micrófono capturado por otra aplicación, aquí se ve al instante en lugar
 * de descubrirse al final, cuando ya no hay reunión que repetir.
 *
 * Lee del `AnalyserNode` del propio stream, así que refleja el audio real que
 * se está enviando al workflow 06.
 */
export function Waveform({ stream, active }: { stream: MediaStream | null; active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const BARS = 56;

    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let data: Uint8Array<ArrayBuffer> | null = null;
    let frame = 0;

    if (stream) {
      audioCtx = new AudioContext();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;
      audioCtx.createMediaStreamSource(stream).connect(analyser);
      // ArrayBuffer explícito: `getByteFrequencyData` no acepta ArrayBufferLike.
      data = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    }

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== rect.width * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
      }

      const w = rect.width;
      const h = rect.height;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const styles = getComputedStyle(document.documentElement);
      ctx.fillStyle = styles.getPropertyValue(active ? '--accent' : '--border-strong').trim();

      const gap = 3;
      const bw = (w - gap * (BARS - 1)) / BARS;

      if (analyser && data && active) {
        analyser.getByteFrequencyData(data);
      }

      for (let i = 0; i < BARS; i++) {
        let level = 0.06;
        if (analyser && data && active) {
          // Se muestrea el espectro completo repartido entre las barras.
          const bin = Math.floor((i / BARS) * data.length);
          level = Math.max(0.06, data[bin] / 255);
        }
        const bh = Math.max(3, level * (h - 10));
        ctx.globalAlpha = 0.32 + level * 0.68;
        ctx.fillRect(i * (bw + gap), (h - bh) / 2, bw, bh);
      }
      ctx.globalAlpha = 1;

      if (!reduced) frame = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(frame);
      void audioCtx?.close();
    };
  }, [stream, active]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="mt-3.5 block h-16 w-full rounded-lg bg-surface-2"
    />
  );
}
