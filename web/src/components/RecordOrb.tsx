'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * El control de grabación de la sala.
 *
 * Sustituye al punto rojo con un contador al lado. La razón no es estética: en
 * una reunión la docente está mirando a la familia, no a la pantalla. Lo que
 * necesita de reojo es una sola respuesta —¿me está oyendo?— y un anillo que
 * respira con la voz la da desde el otro lado de la mesa, cosa que un punto de
 * doce píxeles no hace.
 *
 * Las barras salen del `AnalyserNode` del stream real, así que no es una
 * animación decorativa: si el micrófono se lo queda otra aplicación o el
 * permiso se revoca, el anillo se queda plano y se ve al instante en lugar de
 * descubrirse al final, cuando ya no hay reunión que repetir.
 */

type OrbState = 'idle' | 'starting' | 'recording' | 'paused';

/** Barras alrededor del círculo. Par, para que el espejo salga simétrico. */
const BARS = 72;

export function RecordOrb({
  stream,
  state,
  size = 210,
  children,
}: {
  stream: MediaStream | null;
  state: OrbState;
  size?: number;
  /** El cronómetro y su etiqueta, en el centro. */
  children: ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /**
   * El estado se lee desde el bucle de dibujo a través de una ref: si fuera una
   * dependencia del efecto, cada pausa reconstruiría el AudioContext y el
   * micrófono daría un salto audible.
   */
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let data: Uint8Array<ArrayBuffer> | null = null;
    let frame = 0;

    if (stream) {
      audioCtx = new AudioContext();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      audioCtx.createMediaStreamSource(stream).connect(analyser);
      // ArrayBuffer explícito: `getByteFrequencyData` no acepta ArrayBufferLike.
      data = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    }

    /* Cada barra baja despacio y sube al momento: una voz que para en seco no
       debe hacer desaparecer el anillo de golpe, o parece que se cortó. */
    const suavizado = new Float32Array(BARS);

    /* Leer los tokens del tema en cada fotograma forzaría un recálculo de
       estilos sesenta veces por segundo. Se refrescan de vez en cuando, que
       basta para que un cambio de tema se note enseguida. */
    let paleta = { activo: '#1d6ff2', apagado: '#2a4b80', pista: '#17294c' };
    let desdeRefresco = 1e9;

    const dibujar = () => {
      const s = stateRef.current;
      const activo = s === 'recording';
      const dpr = window.devicePixelRatio || 1;

      if (canvas.width !== size * dpr) {
        canvas.width = size * dpr;
        canvas.height = size * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);

      if (++desdeRefresco > 30) {
        const cs = getComputedStyle(document.documentElement);
        const leer = (n: string, alt: string) => cs.getPropertyValue(n).trim() || alt;
        paleta = {
          activo: leer(s === 'paused' ? '--warn' : '--accent', '#1d6ff2'),
          apagado: leer('--border-strong', '#2a4b80'),
          pista: leer('--surface-3', '#17294c'),
        };
        desdeRefresco = 0;
      }

      const cx = size / 2;
      const cy = size / 2;
      const rInterior = size * 0.335;
      const largoMax = size * 0.125;

      if (analyser && data && activo) analyser.getByteFrequencyData(data);

      /* Aro interior: el borde del disco donde va el cronómetro. Está siempre,
         grabando o no, para que la pantalla no cambie de forma al empezar. */
      ctx.beginPath();
      ctx.arc(cx, cy, rInterior - 5, 0, Math.PI * 2);
      ctx.strokeStyle = paleta.pista;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const color = s === 'idle' || s === 'starting' ? paleta.apagado : paleta.activo;
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(2, size * 0.014);

      for (let i = 0; i < BARS; i++) {
        let nivel = 0;
        if (analyser && data && activo) {
          /* El espectro se pliega para que el anillo sea simétrico: media vuelta
             es el reflejo de la otra. Un anillo asimétrico se lee como un fallo
             de dibujo, no como sonido. */
          const plegado = i < BARS / 2 ? i : BARS - i;
          // Las frecuencias altas del habla están casi vacías y aplanarían el
          // anillo entero; se usa el tramo donde vive la voz.
          const bin = Math.floor((plegado / (BARS / 2)) * data.length * 0.62);
          nivel = data[bin] / 255;
        }

        // Sube al instante, baja despacio.
        suavizado[i] = nivel > suavizado[i] ? nivel : suavizado[i] * 0.86 + nivel * 0.14;

        // En reposo las barras no desaparecen: dejan un anillo tenue, para que
        // la pantalla no cambie de forma al empezar a grabar.
        const largo = size * 0.028 + suavizado[i] * largoMax;
        const ang = -Math.PI / 2 + (i / BARS) * Math.PI * 2;
        const cos = Math.cos(ang);
        const sen = Math.sin(ang);

        ctx.globalAlpha = activo ? 0.3 + suavizado[i] * 0.7 : 0.85;
        ctx.beginPath();
        ctx.moveTo(cx + cos * rInterior, cy + sen * rInterior);
        ctx.lineTo(cx + cos * (rInterior + largo), cy + sen * (rInterior + largo));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      if (!reduced) frame = requestAnimationFrame(dibujar);
    };

    dibujar();

    return () => {
      cancelAnimationFrame(frame);
      void audioCtx?.close();
    };
  }, [stream, size]);

  const grabando = state === 'recording';

  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      {/*
        El resplandor va detrás del canvas y solo cuando se está grabando: el
        azul de marca es la única fuente de luz de la interfaz y se reserva para
        lo que está vivo ahora mismo.
      */}
      {grabando && (
        <span
          aria-hidden
          className="absolute rounded-full"
          style={{
            width: size * 0.72,
            height: size * 0.72,
            background:
              'radial-gradient(circle, color-mix(in srgb, var(--accent) 30%, transparent), transparent 70%)',
          }}
        />
      )}

      <canvas ref={canvasRef} aria-hidden className="absolute inset-0" style={{ width: size, height: size }} />

      <div
        className="relative grid place-items-center rounded-full border text-center"
        style={{
          width: size * 0.6,
          height: size * 0.6,
          borderColor: 'var(--border)',
          background: 'var(--surface-2)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
