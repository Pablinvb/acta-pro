/**
 * Piezas visuales del panel.
 *
 * Existen para que la información se vea, no se lea. Un docente que abre la
 * aplicación entre dos clases tiene diez segundos: un anillo al 75 % o una
 * miniatura del acta se entienden en ese tiempo; una tabla de cifras, no.
 *
 * Todas se dibujan con SVG y CSS, sin dependencias, y ninguna anima por animar.
 */

/* ── Anillo de progreso ──────────────────────────────────────────────────── */

export function ProgressRing({
  value,
  total,
  label,
  size = 108,
}: {
  value: number;
  total: number;
  label: string;
  size?: number;
}) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--surface-3)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * pct) / 100}
          // El anillo se dibuja al aparecer: confirma que la cifra es de ahora.
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.2,0.8,0.2,1)' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <span className="tabular text-[22px] leading-none font-bold">{pct}%</span>
        <span className="mt-1 text-[10px] text-ink-3">{label}</span>
      </div>
    </div>
  );
}

/* ── Forma de onda ───────────────────────────────────────────────────────── */

/**
 * Onda de una grabación.
 *
 * Las alturas salen de la propia semilla —el identificador de la reunión—, de
 * modo que la misma grabación siempre se dibuja igual. Inventar una onda
 * aleatoria en cada render haría que pareciera que el audio cambia.
 */
export function Waveform({
  seed,
  bars = 44,
  active = false,
  color = 'var(--accent)',
  className = 'h-9',
}: {
  seed: string;
  bars?: number;
  active?: boolean;
  color?: string;
  className?: string;
}) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;

  const alturas = Array.from({ length: bars }, (_, i) => {
    h = (h * 1103515245 + 12345) >>> 0;
    const base = 0.25 + ((h >>> 16) % 100) / 133;
    // Las ondas reales se apagan en los extremos.
    const borde = Math.min(1, Math.min(i, bars - 1 - i) / 4 + 0.35);
    return Math.min(1, base * borde);
  });

  return (
    <div className={`flex items-center gap-[3px] ${className}`} aria-hidden>
      {alturas.map((a, i) => (
        <span
          key={i}
          style={{
            height: `${Math.round(a * 100)}%`,
            background: color,
            opacity: active ? 0.45 + a * 0.55 : 0.3 + a * 0.35,
            animationDelay: active ? `${i * 40}ms` : undefined,
          }}
          className={`w-[3px] flex-1 rounded-full ${active ? 'animate-wave' : ''}`}
        />
      ))}
    </div>
  );
}

/* ── Miniatura del acta ──────────────────────────────────────────────────── */

/**
 * El acta como hoja de papel.
 *
 * No muestra el texto real: a este tamaño no se leería. Muestra su forma —
 * encabezado, párrafos, firmas— que es lo que permite reconocer «eso es mi
 * acta» sin abrirla.
 */
export function DocumentPreview({
  signed = false,
  className = '',
}: {
  signed?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`relative aspect-[1/1.3] w-full overflow-hidden rounded-lg bg-paper p-3 shadow-float ${className}`}
      aria-hidden
    >
      <div className="mb-2 flex items-center gap-1">
        <span className="size-2 rounded-[2px] bg-accent" />
        <span className="h-1.5 w-10 rounded-full bg-paper-line" />
      </div>
      <div className="mb-2.5 h-1.5 w-3/5 rounded-full bg-paper-ink/25" />
      <div className="flex flex-col gap-1.5">
        {[100, 92, 96, 74, 100, 88, 60].map((w, i) => (
          <span key={i} style={{ width: `${w}%` }} className="h-1 rounded-full bg-paper-line" />
        ))}
      </div>
      <div className="mt-3 flex items-end gap-3">
        {[0, 1].map((i) => (
          <span key={i} className="flex-1">
            <svg viewBox="0 0 60 16" className="h-4 w-full" fill="none">
              <path
                d="M2 12c6-9 9 3 13-3s6 5 10 1 7 2 11-3 8 4 12 1"
                stroke={signed ? '#0b1220' : 'var(--paper-line)'}
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
            <span className="mt-0.5 block h-[3px] w-full rounded-full bg-paper-line" />
          </span>
        ))}
      </div>
      {signed && (
        <span className="absolute top-2 right-2 rounded-md bg-ok px-1.5 py-0.5 text-[8px] font-bold text-white">
          FIRMADA
        </span>
      )}
    </div>
  );
}

/* ── Lista con marcas ────────────────────────────────────────────────────── */

/** Puntos que la IA extrajo, con su marca. Lo mismo que una lista, pero se ve. */
export function CheckList({ items }: { items: Array<{ text: string; done?: boolean }> }) {
  return (
    <ul className="stagger flex list-none flex-col gap-2">
      {items.map((item) => (
        <li key={item.text} className="flex items-center gap-2.5 text-[13px]">
          <span
            className={`grid size-[18px] shrink-0 place-items-center rounded-full text-[10px] font-bold ${
              item.done ? 'bg-accent text-accent-on' : 'border border-line-strong text-ink-3'
            }`}
          >
            {item.done ? '✓' : ''}
          </span>
          <span className="min-w-0 flex-1 truncate text-ink-2">{item.text}</span>
        </li>
      ))}
    </ul>
  );
}
