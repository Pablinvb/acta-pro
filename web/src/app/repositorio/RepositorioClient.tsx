'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, Label, Pill, WfTag } from '@/components/ui';
import type { ArchivedDocument } from '@/lib/types';

/**
 * Repositorio de actas.
 *
 * Con almacenamiento de objetos esta pantalla no es una comodidad: es el único
 * camino a un acta archivada, porque nadie puede «entrar» a un bucket. Con
 * Drive es un atajo cómodo. En ambos casos hace falta.
 *
 * La búsqueda filtra en el servidor, pero se agrupa por estudiante en pantalla:
 * la pregunta real de una docente casi nunca es «dame el acta ACTA-2026-0114»,
 * sino «qué se ha hablado con la familia de este chico».
 */
export function RepositorioClient({ initial }: { initial: ArchivedDocument[] }) {
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [documents, setDocuments] = useState(initial);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Se espera a que la persona deje de escribir para no consultar por letra.
    const timer = setTimeout(async () => {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (from) params.set('desde', from);
      if (to) params.set('hasta', to);

      setLoading(true);
      try {
        const res = await fetch(`/api/actas?${params}`);
        if (res.ok) setDocuments(await res.json());
      } catch {
        // Sin conexión se mantiene lo último que se pudo mostrar.
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query, from, to]);

  const byStudent = useMemo(() => {
    const groups = new Map<string, ArchivedDocument[]>();
    for (const doc of documents) {
      const list = groups.get(doc.student_name) ?? [];
      list.push(doc);
      groups.set(doc.student_name, list);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [documents]);

  const field =
    'min-h-[44px] rounded-[10px] border border-line-strong bg-surface px-3 text-sm text-ink transition placeholder:text-ink-3 focus:border-accent';

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[240px] flex-1 flex-col gap-1.5">
            <Label>Buscar</Label>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Estudiante, tipo de reunión o código del acta"
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <Label>Desde</Label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={field} />
          </label>
          <label className="flex flex-col gap-1.5">
            <Label>Hasta</Label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={field} />
          </label>
          {(query || from || to) && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setFrom('');
                setTo('');
              }}
              className="min-h-[44px] rounded-[10px] border border-line-strong bg-surface px-4 text-sm font-medium transition hover:bg-surface-2"
            >
              Limpiar
            </button>
          )}
        </div>
      </Card>

      <p className="text-[13px] text-ink-3" aria-live="polite">
        {loading
          ? 'Buscando…'
          : `${documents.length} acta(s) en ${byStudent.length} estudiante(s)`}
      </p>

      {byStudent.length === 0 ? (
        <Card>
          <p className="py-10 text-center text-[13px] text-ink-3">
            No hay actas que coincidan con la búsqueda.
          </p>
        </Card>
      ) : (
        <div className="stagger flex flex-col gap-3.5">
          {byStudent.map(([student, docs]) => (
            <Card key={student} title={student} tag={`${docs.length} ACTA(S)`} bodyClassName="px-4">
              <ul className="flex list-none flex-col">
                {docs.map((doc, i) => (
                  <li
                    key={doc.document_code}
                    className={`flex flex-wrap items-center gap-3 py-3 ${i > 0 ? 'border-t border-line' : ''}`}
                  >
                    <span className="tabular w-[92px] shrink-0 font-data text-[12px] text-ink-2">
                      {doc.date}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{doc.meeting_type}</span>
                      <span className="block font-data text-[10px] tracking-wider text-ink-3 uppercase">
                        {doc.document_code}
                      </span>
                    </span>
                    <Pill tone={doc.signed ? 'ok' : 'warn'}>
                      {doc.signed ? 'Firmada' : 'Sin firmar'}
                    </Pill>
                    <a
                      href={`/api/reuniones/${encodeURIComponent(doc.meeting_id)}/acta.pdf`}
                      target="_blank"
                      rel="noreferrer"
                      role="button"
                      className="inline-flex min-h-[44px] items-center justify-center rounded-[10px] border border-line-strong bg-surface px-4 text-sm font-medium transition hover:bg-surface-2"
                    >
                      Abrir PDF
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      <p className="text-center">
        <WfTag>ÍNDICE Y BÚSQUEDA · ACTAS ARCHIVADAS</WfTag>
      </p>
    </div>
  );
}
