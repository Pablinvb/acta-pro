import type { ReactNode } from 'react';

/**
 * Primitivas visuales. Equivalen una a una a los componentes del archivo de
 * Figma, para que un cambio de diseño tenga un único sitio donde aterrizar.
 */

/* ── Estado semántico ─────────────────────────────────────────────────────── */

/**
 * `ok` / `warn` / `crit` corresponden a GREEN / YELLOW / RED del workflow 09.
 * El color de acento nunca se usa para estado, y el estado nunca usa el acento:
 * si compitieran, el semáforo del acta dejaría de leerse de un vistazo.
 */
export type Tone = 'neutral' | 'ok' | 'warn' | 'crit' | 'accent';

const TONE: Record<Tone, string> = {
  neutral: 'bg-surface-2 border-line text-ink-2',
  ok: 'bg-ok-soft border-ok-border text-ok',
  warn: 'bg-warn-soft border-warn-border text-warn',
  crit: 'bg-crit-soft border-crit-border text-crit',
  accent: 'bg-accent-soft border-accent-border text-accent',
};

export function Pill({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${TONE[tone]}`}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

/* ── Botón ────────────────────────────────────────────────────────────────── */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger';
};

const BUTTON: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-accent border-accent text-accent-on hover:brightness-110',
  secondary: 'bg-surface border-line-strong text-ink hover:bg-surface-2',
  danger: 'bg-crit-soft border-crit-border text-crit hover:brightness-[0.97]',
};

export function Button({ variant = 'secondary', className = '', ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-[10px] border px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-45 ${BUTTON[variant]} ${className}`}
    />
  );
}

/* ── Tarjeta ──────────────────────────────────────────────────────────────── */

export function Card({
  title,
  tag,
  aside,
  bodyClassName = 'p-4',
  className = '',
  children,
}: {
  title?: string;
  tag?: string;
  aside?: ReactNode;
  bodyClassName?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`overflow-hidden rounded-[14px] border border-line bg-surface shadow-card ${className}`}
    >
      {(title || tag || aside) && (
        <header className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          <div className="ml-auto flex items-center gap-2">
            {aside}
            {tag && <WfTag>{tag}</WfTag>}
          </div>
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/* ── Etiquetas y avisos ───────────────────────────────────────────────────── */

/**
 * Marca qué workflow de n8n alimenta cada zona de la pantalla. No es adorno:
 * al depurar, dice exactamente dónde mirar en n8n.
 */
export function WfTag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md border border-dashed border-line-strong px-2 py-1 font-data text-[10px] tracking-wider text-ink-3">
      {children}
    </span>
  );
}

export function Chip({ children, mono = false }: { children: ReactNode; mono?: boolean }) {
  return (
    <span
      className={`shrink-0 rounded-md border border-line bg-surface-2 px-2 py-1 text-ink-2 ${mono ? 'font-data text-[11px]' : 'text-xs'}`}
    >
      {children}
    </span>
  );
}

export function Banner({
  tone,
  title,
  children,
}: {
  tone: Exclude<Tone, 'neutral'>;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className={`rounded-[10px] border px-3.5 py-3 text-[13px] leading-relaxed ${TONE[tone]}`}>
      <strong className="block font-semibold">{title}</strong>
      {children}
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <span className="text-[10px] font-semibold tracking-[0.09em] text-ink-3 uppercase">
      {children}
    </span>
  );
}

export function Avatar({ initials, size = 32 }: { initials: string; size?: number }) {
  return (
    <span
      style={{ width: size, height: size, fontSize: size > 44 ? 17 : 11 }}
      className="grid shrink-0 place-items-center rounded-full bg-surface-3 font-semibold text-ink-2"
    >
      {initials}
    </span>
  );
}

/* ── Encabezado de pantalla ───────────────────────────────────────────────── */

export function PageHead({
  title,
  subtitle,
  tag,
}: {
  title: string;
  subtitle: string;
  tag: string;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3.5">
      <div>
        <h1 className="text-[23px] leading-tight font-semibold tracking-tight text-balance">
          {title}
        </h1>
        <p className="mt-1 text-[13px] text-ink-3">{subtitle}</p>
      </div>
      <div className="ml-auto">
        <WfTag>{tag}</WfTag>
      </div>
    </div>
  );
}
