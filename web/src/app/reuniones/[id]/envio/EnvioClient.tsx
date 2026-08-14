'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Banner, Button, Card, Pill, WfTag } from '@/components/ui';
import type { FollowUp, Meeting, Signature } from '@/lib/types';

function Check({ done, children, note }: { done: boolean; children: string; note?: string }) {
  return (
    <li className="flex items-center gap-2.5 border-t border-line py-2.5 text-[13px] first:border-t-0">
      <span
        aria-hidden
        className={`grid size-5 shrink-0 place-items-center rounded-full border text-[11px] font-bold ${
          done ? 'border-ok-border bg-ok-soft text-ok' : 'border-line-strong bg-surface-2 text-ink-3'
        }`}
      >
        {done ? '✓' : '○'}
      </span>
      <span className="flex-1">{children}</span>
      {note && <span className="font-data text-[10px] text-ink-3">{note}</span>}
    </li>
  );
}

export function EnvioClient({
  meeting,
  signatures,
  drivePath,
  transcriptVaultPath,
  followUp,
  canSend,
}: {
  meeting: Meeting;
  signatures: Signature[];
  drivePath: string;
  transcriptVaultPath: string;
  followUp: FollowUp;
  canSend: boolean;
}) {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const teacherSig = signatures.find((s) => s.signer_role === 'teacher');
  const repSig = signatures.find((s) => s.signer_role === 'representative');

  async function send() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/n8n/signatures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meeting_id: meeting.meeting_id,
          signer_role: 'teacher',
          signer_name: meeting.teacher_name,
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.message ?? 'No se pudo completar el envío.');
        return;
      }
      setSent(true);
    } catch {
      setError('No se pudo contactar con el servidor. El acta sigue guardada; reintenta.');
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <Card className="py-11 text-center">
        <span
          aria-hidden
          className="mx-auto mb-4 grid size-14 place-items-center rounded-full border border-ok-border bg-ok-soft text-2xl text-ok"
        >
          ✓
        </span>
        <h2 className="mb-1.5 text-[19px] font-semibold">Acta enviada y archivada</h2>
        <p className="mb-5 text-[13px] text-ink-3">
          {meeting.meeting_id} · enviada a {meeting.representative_email} · archivada en Google Drive
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Pill tone="ok">Correo entregado</Pill>
          <Pill tone="ok">Archivada en Drive</Pill>
          <Pill tone="ok">Seguimiento creado {followUp.date}</Pill>
          <Pill tone="warn">Firma del representante pendiente</Pill>
        </div>
        <Link
          href="/agenda"
          role="button"
          className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-[10px] border border-line-strong bg-surface px-4 text-sm font-medium transition hover:bg-surface-2"
        >
          Volver a la agenda
        </Link>
      </Card>
    );
  }

  return (
    <div className="flex items-start gap-3.5 max-lg:flex-col">
      {/* ── El correo ── */}
      <div className="flex min-w-0 flex-1 flex-col gap-3.5 max-lg:w-full">
        <Card title="Correo al representante" tag="WF 15">
          <div className="overflow-hidden rounded-[10px] border border-line">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-b border-line bg-surface-2 px-3.5 py-3 text-xs">
              <dt className="text-ink-3">Para</dt>
              <dd className="m-0 break-all">
                {meeting.representative_name} &lt;{meeting.representative_email || '— sin correo —'}&gt;
              </dd>
              <dt className="text-ink-3">Asunto</dt>
              <dd className="m-0">
                Acta de reunión — {meeting.student_name} — {meeting.date}
              </dd>
            </dl>
            <div className="space-y-2.5 px-3.5 py-3.5 text-[13px] leading-relaxed text-ink-2">
              <p>Estimada señora {meeting.representative_name}:</p>
              <p>
                Adjunto el acta de la reunión mantenida el {meeting.date} sobre el rendimiento
                académico de {meeting.student_name.split(' ')[0]} en Matemáticas. En ella constan los
                acuerdos y compromisos establecidos por ambas partes.
              </p>
              <p>La próxima reunión de seguimiento está prevista para el {followUp.date}.</p>
              <p>
                Atentamente,
                <br />
                {meeting.teacher_name} — Docente de Matemáticas
              </p>
            </div>
            <div className="mx-3.5 mb-3.5 flex items-center gap-2.5 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs">
              <span aria-hidden>📄</span>
              <span className="flex-1 font-data">{meeting.meeting_id}.pdf</span>
              <span className="tabular font-data text-ink-3">184 KB</span>
            </div>
          </div>
        </Card>

        <Card title="Antes de enviar" bodyClassName="px-4 py-1">
          <ul className="flex list-none flex-col">
            <Check done note="14 ago 10:52">Acta aprobada por la docente</Check>
            <Check done={!!teacherSig?.signed_at} note="14 ago 10:53">
              Firma digital de la docente
            </Check>
            <Check done={!!repSig?.signed_at}>Firma de la representante</Check>
            <Check done={canSend} note="RUNACHAY">
              Correo del representante verificado
            </Check>
          </ul>
        </Card>
      </div>

      {/* ── Destino y seguimiento ── */}
      <div className="flex w-[340px] shrink-0 flex-col gap-3.5 max-lg:w-full">
        <Card title="Ubicación en Google Drive" tag="WF 14">
          <ol className="list-none font-data text-[11px] leading-7 text-ink-2">
            {drivePath.split('/').map((part, i, arr) => (
              <li key={part} style={{ paddingLeft: `${i * 1.2}em` }} className={i === arr.length - 1 ? 'font-semibold text-ink' : ''}>
                {i === arr.length - 1 ? '📄' : '📁'} {part}
              </li>
            ))}
          </ol>
        </Card>

        <Banner tone="crit" title="🔒 La transcripción no se adjunta ni se archiva junto al acta">
          <p className="mt-0.5">
            Se guarda en <span className="font-data text-[11px]">{transcriptVaultPath}</span> y no se
            envía al representante.
          </p>
        </Banner>

        <Card title="Seguimiento automático" tag="WF 16">
          <p className="text-[13px]">Se creará un evento en Google Calendar:</p>
          <p className="mt-1.5 text-[13px] text-ink-2">
            <b>{followUp.date}, 10:00</b> — {followUp.description}
          </p>
        </Card>

        {!canSend && (
          <Banner tone="crit" title="Falta el correo del representante">
            <p className="mt-0.5">
              El workflow 15 no puede enviar el acta sin un correo verificado. Complétalo en la ficha
              previa.
            </p>
          </Banner>
        )}

        {error && (
          <Banner tone="crit" title="No se pudo enviar">
            <p className="mt-0.5">{error}</p>
          </Banner>
        )}

        <Button variant="primary" onClick={send} disabled={!canSend || sending}>
          {sending ? 'Enviando…' : 'Enviar acta al representante'}
        </Button>
        <p className="text-center text-[10px] tracking-wider text-ink-3 uppercase">
          Esta acción envía un correo real y archiva el documento
        </p>
        <p className="text-center">
          <WfTag>WF 12 SIGNATURES · WF 14 DRIVE · WF 15 GMAIL</WfTag>
        </p>
      </div>
    </div>
  );
}
