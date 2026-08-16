import type { NextRequest } from 'next/server';
import { handle } from '@/app/api/_handler';
import { lifecycle, signatures } from '@/services';

/**
 * Firmas — antes WF 12, y con él toda la cadena 13 → 14 → 15 → 16.
 *
 * Las dos firmas llegan juntas porque el acta se firma entera o no se firma.
 * Registrarlas es lo que dispara el documento final, el archivo en Drive, el
 * envío al representante y el evento de seguimiento; en n8n ese encadenado
 * estaba repartido entre nodos `Execute Workflow` y aquí se ve de una pieza.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const meetingId = decodeURIComponent(id);
  const body = (await request.json()) as {
    teacher_signature: string;
    representative_signature: string;
    document_version?: number;
  };

  return handle(async () => {
    const saved = await signatures.submit({
      meetingId,
      teacherSignature: body.teacher_signature,
      representativeSignature: body.representative_signature,
      documentVersion: body.document_version,
    });

    const steps = await lifecycle.completeAfterSignatures(meetingId);
    return { signatures: saved, steps };
  });
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handle(() => signatures.listByMeeting(decodeURIComponent(id)));
}
