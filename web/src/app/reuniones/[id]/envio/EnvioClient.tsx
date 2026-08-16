'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/Toast';
import { Banner, Button, Card, Pill, WfTag } from '@/components/ui';
import type { FollowUp, Meeting } from '@/lib/types';

/**
 * Envío y archivo.
 *
 * Esta pantalla NO dispara el envío: los workflows 13, 14 y 15 no exponen
 * webhook. Se encadenan en n8n cuando el workflow 12 recibe las dos firmas y
 * pone la reunión en `status = signed`. Así que aquí se muestra qué va a pasar
 * (y dónde), y si falta firmar se manda al paso 05 en lugar de ofrecer un botón
 * que no llamaría a nada.
 */

const PIPELINE = [
  { wf: 'WF 12', label: 'Firmas registradas', detail: 'Docente y representante' },
  { wf: 'WF 13', label: 'Documento final generado', detail: 'HTML → PDF' },
  { wf: 'WF 14', label: 'Archivado en Google Drive', detail: 'Carpeta del estudiante' },
  { wf: 'WF 15', label: 'Enviado por Gmail', detail: 'Al correo del representante' },
  { wf: 'WF 16', label: 'Seguimiento creado', detail: 'Evento en Calendar' },
];

export function EnvioClient({
  meeting,
  drivePath,
  transcriptVaultPath,
  followUp,
  canSend,
  signed,
}: {
  meeting: Meeting;
  drivePath: string;
  transcriptVaultPath: string;
  followUp: FollowUp;
  canSend: boolean;
  signed: boolean;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  async function copyPath() {
    try {
      await navigator.clipboard.writeText(drivePath);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ tone: 'ok', title: 'Ruta copiada', detail: 'Pégala donde la necesites.' });
    } catch {
      toast({ tone: 'crit', title: 'No se pudo copiar', detail: 'Selecciona la ruta a mano.' });
    }
  }

  return (
    <div className="flex items-start gap-3.5 max-lg:flex-col">
      {/* ── El correo que saldrá ── */}
      <div className="flex min-w-0 flex-1 flex-col gap-3.5 max-lg:w-full">
        <Card title="Correo al representante" tag="WF 15">
          <div className="overflow-hidden rounded-[10px] border border-line">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-b border-line bg-surface-2 px-3.5 py-3 text-xs">
              <dt className="text-ink-3">Para</dt>
              <dd className="m-0 break-all">
                {meeting.representative_name} &lt;
                {meeting.representative_email || '— sin correo verificado —'}&gt;
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

        <Card title="Qué hace n8n al completar las firmas" tag="WF 12 → 16">
          <ol className="stagger flex list-none flex-col">
            {PIPELINE.map((step, i) => (
              <li
                key={step.wf}
                className={`flex items-center gap-3 py-2.5 text-[13px] ${i > 0 ? 'border-t border-line' : ''}`}
              >
                <span
                  aria-hidden
                  className={`grid size-5 shrink-0 place-items-center rounded-full border text-[11px] font-bold transition-colors ${
                    signed
                      ? 'border-ok-border bg-ok-soft text-ok'
                      : 'border-line-strong bg-surface-2 text-ink-3'
                  }`}
                >
                  {signed ? '✓' : i + 1}
                </span>
                <span className="flex-1">
                  <span className="block font-medium">{step.label}</span>
                  <span className="block text-xs text-ink-3">{step.detail}</span>
                </span>
                <WfTag>{step.wf}</WfTag>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      {/* ── Destino y estado ── */}
      <div className="flex w-[340px] shrink-0 flex-col gap-3.5 max-lg:w-full">
        <Card
          title="Ubicación en Google Drive"
          tag="WF 14"
          aside={
            <button
              type="button"
              onClick={copyPath}
              className="min-h-0 rounded-md px-2 py-1 text-[11px] text-ink-3 transition hover:bg-surface-2 hover:text-ink"
            >
              {copied ? '✓ Copiada' : 'Copiar ruta'}
            </button>
          }
        >
          <ol className="list-none font-data text-[11px] leading-7 text-ink-2">
            {drivePath.split('/').map((part, i, arr) => (
              <li
                key={part}
                style={{ paddingLeft: `${i * 1.2}em` }}
                className={i === arr.length - 1 ? 'font-semibold text-ink' : ''}
              >
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

        {signed ? (
          <>
            <Banner tone="ok" title="Acta firmada y en curso">
              <p className="mt-0.5">
                n8n ya tiene todo lo que necesita. No hace falta ninguna acción más aquí.
              </p>
            </Banner>
            <Link
              href="/agenda"
              role="button"
              className="inline-flex min-h-[44px] items-center justify-center rounded-[10px] border border-line-strong bg-surface px-4 text-sm font-medium transition hover:bg-surface-2"
            >
              Volver a la agenda
            </Link>
          </>
        ) : (
          <>
            <Banner tone="warn" title="Falta firmar el acta">
              <p className="mt-0.5">
                El envío no se dispara desde aquí: lo encadena n8n cuando el workflow 12 recibe las
                dos firmas.
              </p>
            </Banner>
            <Link
              href={`/reuniones/${encodeURIComponent(meeting.meeting_id)}/firmas`}
              role="button"
              className="inline-flex min-h-[44px] items-center justify-center rounded-[10px] border border-accent bg-accent px-4 text-sm font-medium text-accent-on transition hover:brightness-110"
            >
              Ir a firmar
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
