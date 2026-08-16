import type { NextRequest } from 'next/server';
import { handle } from '@/app/api/_handler';
import { audit } from '@/services';

/** Traza de auditoría de la reunión — antes WF 17. Solo lectura. */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handle(() => audit.history(decodeURIComponent(id)));
}
