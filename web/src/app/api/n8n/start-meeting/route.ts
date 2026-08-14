import type { NextRequest } from 'next/server';
import { startMeeting, type StartMeetingPayload } from '@/lib/n8n';
import { proxy } from '../_respond';

/** WF 05 · POST /acta-pro/start-meeting */
export async function POST(request: NextRequest) {
  const payload = (await request.json()) as StartMeetingPayload;
  return proxy(() => startMeeting(payload));
}
