import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { sendManualDocumentExpiryReminder } from '@/lib/compliance/expiry-engine';

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent');
    const body = (await request.json().catch(() => ({}))) as {
      document_id?: string;
      message?: string;
    };

    const documentId = typeof body.document_id === 'string' ? body.document_id.trim() : '';
    if (!documentId) {
      return NextResponse.json({ error: 'document_id is required' }, { status: 400 });
    }

    const result = await sendManualDocumentExpiryReminder(
      ctx.accountId,
      documentId,
      typeof body.message === 'string' ? body.message : undefined
    );

    return NextResponse.json(result);
  } catch (err) {
    return toErrorResponse(err);
  }
}
