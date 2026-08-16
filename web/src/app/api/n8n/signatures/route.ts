import { NextResponse, type NextRequest } from 'next/server';
import { submitSignatures, type SignaturePayload } from '@/lib/n8n';
import { proxy } from '../_respond';

/**
 * WF 12 · POST /acta-pro/signatures
 *
 * Se valida aquí lo mismo que valida el workflow, para poder dar un mensaje
 * entendible en pantalla en vez de un 400 genérico en mitad de una reunión con
 * la representante delante.
 */
export async function POST(request: NextRequest) {
  const payload = (await request.json()) as SignaturePayload;

  const missing = (['meeting_id', 'teacher_signature', 'representative_signature'] as const).filter(
    (k) => !payload?.[k],
  );

  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: 'firmas_incompletas',
        missing,
        message: missing.includes('meeting_id')
          ? 'Falta identificar la reunión.'
          : 'Faltan firmas: el acta necesita la de la docente y la del representante.',
      },
      { status: 400 },
    );
  }

  return proxy(() => submitSignatures(payload));
}
