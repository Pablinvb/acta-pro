import type { ReactNode } from 'react';
import { isDemo } from '@/services/config';
import type { Meeting } from '@/lib/types';
import { Rail } from './Rail';
import { ThemeToggle } from './ThemeToggle';
import { ToastProvider } from './Toast';
import { Chip, Pill, type Tone } from './ui';

/** Cómo se anuncia cada estado de la reunión en la barra superior. */
const STATUS: Record<Meeting['status'], { label: string; tone: Tone }> = {
  scheduled: { label: 'Programada', tone: 'neutral' },
  in_progress: { label: 'Reunión en curso', tone: 'crit' },
  awaiting_teacher_review: { label: 'Borrador en revisión', tone: 'accent' },
  teacher_approved: { label: 'Aprobada por la docente', tone: 'ok' },
  rejected: { label: 'Rechazada · vuelve a borrador', tone: 'crit' },
  signed: { label: 'Firmada', tone: 'ok' },
  sent: { label: 'Enviada al representante', tone: 'ok' },
  retry_required: { label: 'Requiere reintento', tone: 'warn' },
};

export function AppShell({
  meeting,
  meetingId,
  title,
  teacherName,
  teacherId,
  children,
}: {
  /** Reunión en curso. Se omite en pantallas que no pertenecen a ninguna. */
  meeting?: Meeting;
  /** Reunión a la que apunta el rail cuando no hay una activa. */
  meetingId?: string;
  /** Contexto que se muestra arriba cuando no hay reunión. */
  title?: string;
  teacherName: string;
  teacherId: string;
  children: ReactNode;
}) {
  const status = meeting ? STATUS[meeting.status] : null;

  return (
    <ToastProvider>
      <div className="flex h-dvh min-h-[680px] max-lg:h-auto max-lg:min-h-0 max-lg:flex-col">
        <Rail
          meetingId={meeting?.meeting_id ?? meetingId ?? ''}
          teacherName={teacherName}
          teacherId={teacherId}
        />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden max-lg:overflow-visible">
          <header className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-5.5 py-3">
            {meeting ? (
              <>
                <Chip mono>{meeting.meeting_id}</Chip>
                <p className="truncate text-[13px] text-ink-3">
                  {meeting.student_name} · {meeting.course} · {meeting.meeting_type}
                </p>
              </>
            ) : (
              <p className="truncate text-[13px] text-ink-3">{title}</p>
            )}
            <div className="ml-auto flex items-center gap-2">
              {isDemo && <Pill tone="warn">Datos de demostración</Pill>}
              {status && <Pill tone={status.tone}>{status.label}</Pill>}
              <ThemeToggle />
            </div>
          </header>

          <main className="flex-1 overflow-y-auto max-lg:overflow-visible">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
