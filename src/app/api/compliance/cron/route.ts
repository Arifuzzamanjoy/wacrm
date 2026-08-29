import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { runComplianceScanForAccount } from '@/lib/compliance/expiry-engine';

function verifyCronSecret(request: Request): boolean {
  const expected =
    process.env.COMPLIANCE_CRON_SECRET ||
    process.env.AUTOMATION_CRON_SECRET ||
    process.env.CRON_SECRET;

  if (!expected) {
    return false;
  }

  const supplied = request.headers.get('x-cron-secret') ?? '';
  const suppliedBuf = Buffer.from(supplied);
  const expectedBuf = Buffer.from(expected);

  if (suppliedBuf.length !== expectedBuf.length) {
    return false;
  }

  return timingSafeEqual(suppliedBuf, expectedBuf);
}

async function handleCron(request: Request) {
  const expected =
    process.env.COMPLIANCE_CRON_SECRET ||
    process.env.AUTOMATION_CRON_SECRET ||
    process.env.CRON_SECRET;

  if (!expected) {
    return NextResponse.json(
      { error: 'Compliance cron secret is not configured' },
      { status: 503 }
    );
  }

  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = supabaseAdmin();

  // Find all accounts that have WhatsApp configured
  const { data: configs, error: configErr } = await db
    .from('whatsapp_config')
    .select('account_id');

  if (configErr) {
    console.error('[compliance/cron] whatsapp_config query error:', configErr);
    return NextResponse.json({ error: configErr.message }, { status: 500 });
  }

  if (!configs || configs.length === 0) {
    return NextResponse.json({
      ok: true,
      scanned_accounts: 0,
      total_scanned_docs: 0,
      total_alerts_sent: 0,
    });
  }

  let totalScannedDocs = 0;
  let totalAlertsSent = 0;
  let scannedAccounts = 0;

  for (const item of configs) {
    const accountId = item.account_id as string;
    try {
      const res = await runComplianceScanForAccount(accountId, { sendWhatsApp: true });
      totalScannedDocs += res.scanned;
      totalAlertsSent += res.alerts_sent;
      scannedAccounts++;
    } catch (err) {
      console.error(`[compliance/cron] failed scan for account ${accountId}:`, err);
    }
  }

  return NextResponse.json({
    ok: true,
    scanned_accounts: scannedAccounts,
    total_scanned_docs: totalScannedDocs,
    total_alerts_sent: totalAlertsSent,
  });
}

export async function GET(request: Request) {
  return handleCron(request);
}

export async function POST(request: Request) {
  return handleCron(request);
}
