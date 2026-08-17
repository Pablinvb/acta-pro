/**
 * Iconos de la navegación.
 *
 * Dibujados a mano en SVG en lugar de traer una librería: son ocho, no cambian,
 * y una dependencia de iconos pesa más que este archivo. Heredan el color con
 * `currentColor`, así que siguen al tema sin tocarlos.
 */

type IconProps = { className?: string };

const base = 'shrink-0';

function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`${base} ${className ?? 'size-[18px]'}`}
    >
      {children}
    </svg>
  );
}

export const IconDashboard = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
  </Svg>
);

export const IconCalendar = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Svg>
);

export const IconStudent = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="3.2" />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
  </Svg>
);

export const IconMic = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="2.5" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6" />
  </Svg>
);

export const IconDocument = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </Svg>
);

export const IconSignature = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 18c3.5 0 4-11 7-11s2.5 9 5 9c1.5 0 2-2 3-2" />
    <path d="M3 21h18" />
  </Svg>
);

export const IconSend = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 3 10.5 13.5" />
    <path d="M21 3l-6.5 18-4-8-8-4z" />
  </Svg>
);

export const IconArchive = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7.5 5 4h14l2 3.5" />
    <path d="M3 7.5V19a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7.5z" />
    <path d="M9.5 12h5" />
  </Svg>
);

export const IconShield = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3l7.5 3v5.5c0 4.5-3 8.2-7.5 9.5-4.5-1.3-7.5-5-7.5-9.5V6z" />
    <path d="M9.5 12l1.8 1.8 3.4-3.6" />
  </Svg>
);
