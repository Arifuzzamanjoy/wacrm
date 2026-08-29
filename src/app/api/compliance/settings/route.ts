import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  getAccountComplianceSettings,
  updateAccountComplianceSettings,
} from '@/lib/compliance/expiry-engine';
import type { AccountComplianceSettings } from '@/types';

export async function GET() {
  try {
    const ctx = await requireRole('viewer');
    const settings = await getAccountComplianceSettings(ctx.accountId);
    return NextResponse.json({ ok: true, settings });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const body = (await request.json().catch(() => ({}))) as Partial<AccountComplianceSettings>;

    const updated = await updateAccountComplianceSettings(ctx.accountId, body);
    return NextResponse.json({ ok: true, settings: updated });
  } catch (err) {
    return toErrorResponse(err);
  }
}
