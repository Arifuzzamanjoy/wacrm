import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  fetchMonitoredDocuments,
  runComplianceScanForAccount,
} from '@/lib/compliance/expiry-engine';

export async function GET() {
  try {
    const ctx = await requireRole('viewer');
    const { documents, stats } = await fetchMonitoredDocuments(ctx.accountId);
    return NextResponse.json({ ok: true, documents, stats });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent');
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const sendReminders = typeof body.send_reminders === 'boolean' ? body.send_reminders : true;

    const result = await runComplianceScanForAccount(ctx.accountId, {
      sendWhatsApp: sendReminders,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return toErrorResponse(err);
  }
}
