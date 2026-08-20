import Link from 'next/link';
import { Card, Pill } from '@/components/ui';
import type { StudentHistory } from '@/services/history';
import { formatDate } from '@/services/history';

/**
 * Lo que quedó de la reunión anterior.
 *
 * Es la pieza que da continuidad: sin ella, la cuarta reunión con una familia
 * empieza igual que la primera y la docente tiene que acordarse de memoria de
 * lo que se acordó en marzo, o buscar el acta a mano mientras la familia espera.
 *
 * Dice lo que sabe y nada más. **No afirma que algo se haya incumplido**, porque
 * nadie registra el cumplimiento en ninguna parte: sabe qué se acordó, cuándo, y
 * si llegó la fecha de revisión sin que hubiera otra reunión. La diferencia
 * parece sutil y no lo es — este texto acaba delante de una familia.
 */
export function Historial({ history }: { history: StudentHistory }) {
  if (!history.last) {
    return (
      <Card title="Historial con esta familia">
        <p className="text-[13px] leading-relaxed text-ink-3">
          No hay reuniones anteriores registradas con este estudiante. Esta es la primera.
        </p>
      </Card>
    );
  }

  const { last, pending, count } = history;
  const vencido = pending.some((p) => p.overdue);

  return (
    <Card
      title="De la reunión anterior"
      aside={
        vencido ? (
          <Pill tone="warn">Sin revisar desde entonces</Pill>
        ) : (
          <Pill tone="neutral">
            {count === 1 ? '1 reunión previa' : `${count} reuniones previas`}
          </Pill>
        )
      }
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="text-[13px] font-medium">
          {last.meetingType} · {formatDate(last.date)}
        </p>
        {last.documentCode && (
          <span className="font-data text-[10.5px] tracking-wider text-ink-3">
            {last.documentCode}
          </span>
        )}
      </div>

      {pending.length === 0 ? (
        <p className="mt-3 text-[13px] text-ink-3">
          Esa reunión no dejó acuerdos ni compromisos registrados.
        </p>
      ) : (
        <ul className="stagger mt-3.5 flex list-none flex-col gap-2.5">
          {pending.map((item) => (
            <li
              key={`${item.kind}-${item.text}`}
              className="flex gap-2.5 rounded-[10px] border border-line bg-surface-2 px-3 py-2.5"
            >
              <span
                className={`mt-0.5 shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase ${
                  item.kind === 'acuerdo'
                    ? 'border-accent-border bg-accent-soft text-accent-text'
                    : 'border-line-strong bg-surface-3 text-ink-2'
                }`}
              >
                {item.kind}
              </span>
              <span className="min-w-0 flex-1 text-[13px] leading-relaxed text-ink-2">
                {item.text}
              </span>
            </li>
          ))}
        </ul>
      )}

      {last.followUpDate && (
        <p className="mt-3.5 text-[12.5px] text-ink-3">
          {vencido
            ? `El seguimiento estaba previsto para el ${formatDate(last.followUpDate)} y desde entonces no consta otra reunión.`
            : `Seguimiento previsto para el ${formatDate(last.followUpDate)}.`}
        </p>
      )}

      {/*
        El aviso no es una formalidad legal: es la diferencia entre una
        herramienta que ayuda y una que acusa. Va siempre, tenga o no
        seguimiento vencido.
      */}
      <p className="mt-3 border-t border-line pt-3 text-[12px] leading-relaxed text-ink-3">
        ACTA PRO no sabe si esto se cumplió: sólo consta que se acordó. Confírmalo en la reunión
        antes de darlo por hecho.
      </p>

      {last.documentCode && (
        <p className="mt-3">
          <Link
            href={`/repositorio?q=${encodeURIComponent(last.documentCode)}`}
            className="text-[12.5px] font-medium text-accent-text underline underline-offset-2"
          >
            Ver el acta completa
          </Link>
        </p>
      )}
    </Card>
  );
}
