'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTransition } from 'react';
import { logout } from '@/app/login/actions';
import { Avatar } from './ui';

/**
 * Navegación principal.
 *
 * Los seis pasos no son un menú: son el ciclo real de la reunión, en orden, y
 * cada uno declara los workflows de n8n que lo alimentan. Por eso van numerados
 * y por eso los pasos ya recorridos se marcan como completados.
 */

export interface Step {
  n: string;
  label: string;
  workflows: string;
  href: string;
}

export function buildSteps(meetingId: string): Step[] {
  const base = `/reuniones/${encodeURIComponent(meetingId)}`;
  return [
    { n: '01', label: 'Agenda de reuniones', workflows: 'WF 01 · 03 · 04', href: '/agenda' },
    { n: '02', label: 'Ficha previa', workflows: 'WF 02 · 03', href: `${base}/ficha` },
    { n: '03', label: 'Sala de reunión', workflows: 'WF 05 · 06 · 07', href: `${base}/sala` },
    { n: '04', label: 'Revisión del acta', workflows: 'WF 08 · 09 · 10 · 11', href: `${base}/revision` },
    { n: '05', label: 'Firmas', workflows: 'WF 12 · 13', href: `${base}/firmas` },
    { n: '06', label: 'Envío y archivo', workflows: 'WF 14 · 15 · 16', href: `${base}/envio` },
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
      aria-label="Ciclo de la reunión"
      className="flex w-[236px] shrink-0 flex-col border-r border-line bg-surface max-lg:w-full max-lg:border-r-0 max-lg:border-b"
    >
      <div className="flex items-center gap-2.5 px-4.5 pt-4.5 pb-3.5">
        <span
          aria-hidden
          className="grid size-[30px] shrink-0 place-items-center rounded-lg bg-accent text-[13px] font-bold text-accent-on"
        >
          AP
        </span>
        <span>
          <span className="block text-[15px] font-semibold tracking-wide">ACTA PRO</span>
          <span className="block font-data text-[10px] tracking-wider text-ink-3 uppercase">
            Fase 1 · MVP
          </span>
        </span>
      </div>

      <p className="px-4.5 py-1 text-[10.5px] font-semibold tracking-[0.09em] text-ink-3 uppercase">
        Ciclo de la reunión
      </p>

      <ul className="stagger flex list-none flex-col gap-0.5 px-2.5 max-lg:flex-row max-lg:overflow-x-auto max-lg:pb-2.5">
        {steps.map((step, i) => {
          const current = i === activeIndex;
          const done = activeIndex > -1 && i < activeIndex;
          return (
            <li key={step.n} className="max-lg:min-w-[168px]">
              <Link
                href={step.href}
                aria-current={current ? 'page' : undefined}
                className={`group flex min-h-[46px] items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-[13.5px] transition-colors duration-150 ${
                  current
                    ? 'bg-accent-soft font-semibold text-ink'
                    : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                }`}
              >
                <span
                  className={`tabular grid size-[22px] shrink-0 place-items-center rounded-md border font-data text-[10.5px] transition-all duration-200 ${
                    current
                      ? 'scale-105 border-accent bg-accent text-accent-on'
                      : done
                        ? 'border-ok-border bg-ok-soft text-ok'
                        : 'border-line-strong bg-surface text-ink-3 group-hover:border-ink-3'
                  }`}
                >
                  {done ? '✓' : step.n}
                </span>
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate">{step.label}</span>
                  <span className="mt-0.5 font-data text-[9.5px] tracking-wide text-ink-3">
                    {step.workflows}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

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
