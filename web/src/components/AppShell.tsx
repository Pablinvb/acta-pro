import type { ReactNode } from 'react';
import { dataSource } from '@/lib/env';
import type { Meeting } from '@/lib/types';
import { Rail } from './Rail';
import { ThemeToggle } from './ThemeToggle';
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
  teacherName,
  teacherId,
  children,
}: {
  meeting: Meeting;
  teacherName: string;
  teacherId: string;
  children: ReactNode;
}) {
  const status = STATUS[meeting.status];

  return (
    <div className="flex h-dvh min-h-[680px] max-lg:h-auto max-lg:min-h-0 max-lg:flex-col">
      <Rail meetingId={meeting.meeting_id} teacherName={teacherName} teacherId={teacherId} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden max-lg:overflow-visible">
        <header className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-5.5 py-3">
          <Chip mono>{meeting.meeting_id}</Chip>
          <p className="truncate text-[13px] text-ink-3">
            {meeting.student_name} · {meeting.course} · {meeting.meeting_type}
          </p>
          <div className="ml-auto flex items-center gap-2">
            {dataSource === 'mock' && <Pill tone="warn">Datos de demostración</Pill>}
            <Pill tone={status.tone}>{status.label}</Pill>
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto max-lg:overflow-visible">{children}</main>
      </div>
    </div>
  );
}
