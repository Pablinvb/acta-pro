import type { NextRequest } from 'next/server';
import { submitSignature, type SignaturePayload } from '@/lib/n8n';
import { proxy } from '../_respond';

/** WF 12 · POST /acta-pro/signatures */
export async function POST(request: NextRequest) {
  const payload = (await request.json()) as SignaturePayload;
  return proxy(() => submitSignature(payload));
}
