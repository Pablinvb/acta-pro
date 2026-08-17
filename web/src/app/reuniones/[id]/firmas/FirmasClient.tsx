'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SignaturePad } from '@/components/SignaturePad';
import { useToast } from '@/components/Toast';
import { Banner, Button, Card, Label, Pill, WfTag } from '@/components/ui';
import type { Meeting } from '@/lib/types';

/**
 * Firmas del acta.
 *
 * Ambas firmas se recogen en el mismo dispositivo y en la misma reunión, que es
 * como ocurre de verdad: la representante firma en el iPad antes de irse. El
 * workflow exige las dos juntas, así que la pantalla no deja enviar una sola.
 *
 * Antes de firmar se muestra lo que se está firmando. Pedir una firma sobre un
 * documento que la persona no puede leer sería inaceptable.
 */
export function FirmasClient({
  meeting,
  agreements,
  commitments,
}: {
  meeting: Meeting;
  agreements: string[];
  commitments: string[];
}) {
  const router = useRouter();
  const toast = useToast();

  const [teacherSig, setTeacherSig] = useState<string | null>(null);
  const [repSig, setRepSig] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [sending, setSending] = useState(false);
  const [signedAt, setSignedAt] = useState<string | null>(null);

  const both = Boolean(teacherSig && repSig);
  const ready = both && confirmed;

  async function submit() {
    setSending(true);
    try {
      const res = await fetch(`/api/reuniones/${encodeURIComponent(meeting.meeting_id)}/firmas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacher_signature: teacherSig,
          representative_signature: repSig,
          document_version: 1,
        }),
      });
      const body = await res.json();

      if (!res.ok) {
        toast({
          tone: 'crit',
          title: 'No se registraron las firmas',
          detail: body.message ?? 'Vuelve a intentarlo; nada se ha perdido.',
        });
        return;
      }

      setSignedAt(new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' }));
      toast({
        tone: 'ok',
        title: 'Acta firmada',
        detail: 'Continúa el documento final, el archivo y el envío.',
      });
      router.refresh();
    } catch {
      toast({
        tone: 'crit',
        title: 'Sin conexión con el servidor',
        detail: 'El acta sigue guardada. Reintenta en unos segundos.',
      });
    } finally {
      setSending(false);
    }
  }

  if (signedAt) {
    return (
      <Card className="animate-fade-up py-11 text-center">
        <span
          aria-hidden
          className="mx-auto mb-4 grid size-14 place-items-center rounded-full border border-ok-border bg-ok-soft text-2xl text-ok"
        >
          ✓
        </span>
        <h2 className="mb-1.5 text-[19px] font-semibold">Acta firmada por ambas partes</h2>
        <p className="mb-5 text-[13px] text-ink-3">
          {meeting.meeting_id} · registrado a las {signedAt}
        </p>
        <div className="mb-6 flex flex-wrap justify-center gap-2">
          <Pill tone="ok">Firma de la docente</Pill>
          <Pill tone="ok">Firma de la representante</Pill>
          <Pill tone="accent">status = signed</Pill>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <a
            href={`/api/reuniones/${encodeURIComponent(meeting.meeting_id)}/acta.pdf?descargar`}
            role="button"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[10px] border border-accent bg-accent px-4 text-sm font-medium text-accent-on transition hover:brightness-110"
          >
            <span aria-hidden>⬇</span> Descargar el acta en PDF
          </a>
          <Button
            onClick={() => router.push(`/reuniones/${encodeURIComponent(meeting.meeting_id)}/envio`)}
          >
            Ver envío y archivo
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex items-start gap-3.5 max-lg:flex-col">
      {/* ── Qué se está firmando ── */}
      <Card
        className="min-w-0 flex-1 max-lg:w-full"
        title="Esto es lo que se firma"
        tag="BORRADOR APROBADO"
      >
        <div className="flex flex-col gap-4">
          <div>
            <Label>Acuerdos</Label>
            <ul className="stagger mt-2 flex list-disc flex-col gap-1.5 pl-5 text-[13px] text-ink-2">
              {agreements.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
          <div>
            <Label>Compromisos</Label>
            <ul className="stagger mt-2 flex list-disc flex-col gap-1.5 pl-5 text-[13px] text-ink-2">
              {commitments.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>

          <Banner tone="accent" title="Lee el acta completa antes de firmar">
            <p className="mt-0.5">
              La representante tiene derecho a revisar el documento íntegro. Vuelve a la revisión si
              quiere leerlo entero.
            </p>
          </Banner>
        </div>
      </Card>

      {/* ── Las firmas ── */}
      <div className="flex w-[400px] shrink-0 flex-col gap-3.5 max-lg:w-full">
        <Card title="Firmas" >
          <div className="flex flex-col gap-4">
            <SignaturePad
              label={`${meeting.teacher_name} — docente`}
              onChange={setTeacherSig}
              disabled={sending}
            />
            <SignaturePad
              label={`${meeting.representative_name} — representante`}
              onChange={setRepSig}
              disabled={sending}
            />

            <div className="flex items-center gap-2 text-xs text-ink-3">
              <span className={`transition-colors ${teacherSig ? 'text-ok' : ''}`}>
                {teacherSig ? '✓' : '○'} Docente
              </span>
              <span className={`transition-colors ${repSig ? 'text-ok' : ''}`}>
                {repSig ? '✓' : '○'} Representante
              </span>
            </div>
          </div>
        </Card>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-[10px] border border-line bg-surface p-3.5 text-[13px] leading-snug text-ink-2 transition hover:bg-surface-2">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            disabled={sending}
            className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
          />
          <span>
            Confirmo que ambas partes leyeron el acta y firmaron de forma voluntaria en este
            dispositivo.
          </span>
        </label>

        {both && !confirmed && (
          <Banner tone="warn" title="Falta confirmar">
            <p className="mt-0.5">Marca la casilla para poder registrar las firmas.</p>
          </Banner>
        )}

        <Button variant="primary" onClick={submit} disabled={!ready || sending}>
          {sending ? (
            <>
              <span
                aria-hidden
                className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
              />
              Registrando…
            </>
          ) : (
            'Registrar ambas firmas'
          )}
        </Button>

        <p className="text-center text-[11px] leading-relaxed text-ink-3">
          El acta se firma entera o no se firma. Al registrar ambas, la reunión pasa a{' '}
          <span className="font-data">status = signed</span> y se encadena el documento final, el
          archivo en Drive y el envío.
        </p>
        <p className="text-center">
          <WfTag>FIRMAS → DOCUMENTO → ARCHIVO → ENVÍO</WfTag>
        </p>
      </div>
    </div>
  );
}
