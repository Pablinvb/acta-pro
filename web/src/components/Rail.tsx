'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTransition, type ComponentType } from 'react';
import { logout } from '@/app/login/actions';
import {
  IconArchive,
  IconCalendar,
  IconDocument,
  IconMic,
  IconSend,
  IconShield,
  IconSignature,
  IconStudent,
  IconTrack,
} from './icons';
import { Avatar } from './ui';

/**
 * Navegación principal.
 *
 * Dos niveles, como en la identidad de ACTA PRO: arriba el ciclo de la reunión
 * —numerado porque es una secuencia real, no un menú— y abajo lo que no
 * pertenece a ninguna reunión concreta.
 *
 * Cada paso lleva icono además de número: en un iPad, con la mano, el icono se
 * reconoce antes que el texto.
 */

export interface Step {
  n: string;
  label: string;
  hint: string;
  href: string;
  Icon: ComponentType<{ className?: string }>;
}

export function buildSteps(meetingId: string): Step[] {
  const base = `/reuniones/${encodeURIComponent(meetingId)}`;
  return [
    { n: '01', label: 'Agenda', hint: 'Calendar · Runachay', href: '/agenda', Icon: IconCalendar },
    { n: '02', label: 'Ficha previa', hint: 'Datos del estudiante', href: `${base}/ficha`, Icon: IconStudent },
    { n: '03', label: 'Sala de reunión', hint: 'Grabar y transcribir', href: `${base}/sala`, Icon: IconMic },
    { n: '04', label: 'Revisión del acta', hint: 'IA y revisión', href: `${base}/revision`, Icon: IconDocument },
    { n: '05', label: 'Firmas', hint: 'Firma digital', href: `${base}/firmas`, Icon: IconSignature },
    { n: '06', label: 'Envío y archivo', hint: 'Archivo y correo', href: `${base}/envio`, Icon: IconSend },
  ];
}

function LogoutButton() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => start(() => void logout())}
      disabled={pending}
      className="min-h-0 shrink-0 rounded-md px-2 py-1 text-[11px] text-ink-3 transition hover:bg-surface-2 hover:text-ink disabled:opacity-50"
    >
      {pending ? '…' : 'Salir'}
    </button>
  );
}

/** Un elemento de navegación. El resplandor azul marca lo activo. */
function NavItem({
  href,
  current,
  done,
  label,
  hint,
  Icon,
  minWidth,
}: {
  href: string;
  current: boolean;
  done?: boolean;
  label: string;
  hint: string;
  Icon: ComponentType<{ className?: string }>;
  minWidth?: string;
}) {
  return (
    <li className={minWidth}>
      <Link
        href={href}
        aria-current={current ? 'page' : undefined}
        className={`group flex min-h-[46px] items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-[13.5px] transition-all duration-150 ${
          current
            ? 'bg-accent-soft font-semibold text-ink shadow-glow-soft'
            : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
        }`}
      >
        <span
          className={`grid size-[26px] shrink-0 place-items-center rounded-lg border transition-all duration-200 ${
            current
              ? 'border-accent bg-accent text-accent-on'
              : done
                ? 'border-ok-border bg-ok-soft text-ok'
                : 'border-line-strong bg-surface-2 text-ink-3 group-hover:border-ink-3'
          }`}
        >
          {done ? <span className="text-[13px]">✓</span> : <Icon className="size-[15px]" />}
        </span>
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate">{label}</span>
          <span className="mt-0.5 truncate font-data text-[9.5px] tracking-wide text-ink-3">
            {hint}
          </span>
        </span>
      </Link>
    </li>
  );
}

export function Rail({
  meetingId,
  teacherName,
  teacherId,
}: {
  meetingId: string;
  teacherName: string;
  teacherId: string;
}) {
  const pathname = usePathname();
  const steps = buildSteps(meetingId);
  const activeIndex = steps.findIndex((s) => pathname === s.href);
  const initials = teacherName
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('');

  return (
    <nav
      aria-label="Navegación de ACTA PRO"
      className="flex w-[244px] shrink-0 flex-col border-r border-line bg-surface max-lg:w-full max-lg:border-r-0 max-lg:border-b"
    >
      {/* ── Marca ── */}
      <div className="flex items-center gap-2.5 px-4.5 pt-5 pb-4">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-accent text-accent-on shadow-glow-soft"
        >
          <IconShield className="size-5" />
        </span>
        <span className="text-[17px] leading-none font-bold tracking-wide">
          ACTA <span className="text-accent-text">PRO</span>
        </span>
      </div>

      {/* ── El ciclo de la reunión ── */}
      <p className="px-4.5 py-1.5 text-[10px] font-semibold tracking-[0.11em] text-ink-3 uppercase">
        Ciclo de la reunión
      </p>

      {/*
        Sin reunión seleccionada los pasos no llevan a ninguna parte: los
        enlaces salían como `/reuniones//ficha`. Le pasa a cualquier docente
        recién dada de alta, que es justo la primera vez que alguien ve esto.
      */}
      {meetingId ? (
        <ul className="stagger flex list-none flex-col gap-0.5 px-2.5 max-lg:flex-row max-lg:overflow-x-auto max-lg:pb-2.5">
          {steps.map((step, i) => (
            <NavItem
              key={step.n}
              href={step.href}
              current={i === activeIndex}
              done={activeIndex > -1 && i < activeIndex}
              label={step.label}
              hint={`${step.n} · ${step.hint}`}
              Icon={step.Icon}
              minWidth="max-lg:min-w-[176px]"
            />
          ))}
        </ul>
      ) : (
        <p className="px-4.5 py-2 text-[12px] leading-relaxed text-ink-3 max-lg:hidden">
          Elige una reunión en el panel para recorrer su ciclo.
        </p>
      )}

      {/* ── Lo que no pertenece a ninguna reunión ── */}
      <p className="mt-4 px-4.5 py-1.5 text-[10px] font-semibold tracking-[0.11em] text-ink-3 uppercase max-lg:hidden">
        Institución
      </p>
      <ul className="flex list-none flex-col gap-0.5 px-2.5 max-lg:hidden">
        <NavItem
          href="/seguimiento"
          current={pathname === '/seguimiento'}
          label="Seguimiento"
          hint="Compromisos acordados"
          Icon={IconTrack}
        />
        <NavItem
          href="/repositorio"
          current={pathname === '/repositorio'}
          label="Repositorio"
          hint="Todas las actas"
          Icon={IconArchive}
        />
      </ul>

      {/* ── Quién ha entrado ── */}
      <div className="mt-auto flex items-center gap-2.5 border-t border-line px-4.5 pt-3.5 pb-4.5 max-lg:hidden">
        <Avatar initials={initials} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">{teacherName}</span>
          <span className="block font-data text-[10px] tracking-wider text-ink-3 uppercase">
            Docente · {teacherId}
          </span>
        </span>
        <LogoutButton />
      </div>
    </nav>
  );
}
