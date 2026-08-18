/**
 * Las personas, con cara y color.
 *
 * Una lista de nombres en texto plano se lee como un informe. Un avatar con
 * color se reconoce de un vistazo, y en una aplicación que van a ver docentes y
 * padres eso importa más que en un panel de administración.
 *
 * El color sale del nombre, así que la misma persona es siempre del mismo color
 * en toda la aplicación sin necesidad de guardarlo en ninguna parte.
 *
 * La paleta evita a propósito el verde, el ámbar y el rojo: esos tres colores
 * significan estado en ACTA PRO —adecuado, revisar, no recomendado— y si además
 * identificaran personas, el semáforo del acta dejaría de leerse.
 */

const PEOPLE_COLORS = [
  { bg: '#1e40af', ring: '#3b82f6', name: 'azul' },
  { bg: '#5b21b6', ring: '#8b5cf6', name: 'violeta' },
  { bg: '#0e7490', ring: '#06b6d4', name: 'cian' },
  { bg: '#3730a3', ring: '#6366f1', name: 'índigo' },
  { bg: '#9d174d', ring: '#ec4899', name: 'rosa' },
  { bg: '#155e75', ring: '#0891b2', name: 'petróleo' },
] as const;

export function colorFor(name: string): (typeof PEOPLE_COLORS)[number] {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PEOPLE_COLORS[hash % PEOPLE_COLORS.length];
}

export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function PersonAvatar({
  name,
  size = 36,
  ring = false,
  className = '',
}: {
  name: string;
  size?: number;
  /** Aro luminoso, para señalar quién está hablando o quién ya firmó. */
  ring?: boolean;
  className?: string;
}) {
  const color = colorFor(name);
  return (
    <span
      title={name}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.36)),
        background: `linear-gradient(145deg, ${color.ring}, ${color.bg})`,
        boxShadow: ring ? `0 0 0 2px var(--surface), 0 0 0 4px ${color.ring}` : undefined,
      }}
      className={`grid shrink-0 place-items-center rounded-full font-semibold text-white select-none ${className}`}
    >
      {initialsOf(name)}
    </span>
  );
}

/** Varias personas superpuestas, como en una lista de asistentes. */
export function AvatarStack({ names, size = 28 }: { names: string[]; size?: number }) {
  return (
    <span className="flex items-center">
      {names.slice(0, 4).map((name, i) => (
        <span key={name} style={{ marginLeft: i === 0 ? 0 : -size * 0.3, zIndex: names.length - i }}>
          <PersonAvatar name={name} size={size} className="ring-2 ring-[var(--surface)]" />
        </span>
      ))}
      {names.length > 4 && (
        <span
          style={{ width: size, height: size, marginLeft: -size * 0.3 }}
          className="grid shrink-0 place-items-center rounded-full bg-surface-3 text-[10px] font-semibold text-ink-2 ring-2 ring-[var(--surface)]"
        >
          +{names.length - 4}
        </span>
      )}
    </span>
  );
}
