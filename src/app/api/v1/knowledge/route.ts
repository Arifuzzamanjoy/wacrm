// ============================================================
// POST /api/v1/knowledge — upsert a knowledge-base document
// (scope: knowledge:write)
//
// Built for syncing an external source of truth (a Google Doc, a
// Notion page) into the AI assistant's knowledge base from a scheduled
// n8n workflow. Documents are keyed by `title` within the account: an
// existing title has its content replaced and re-indexed (200,
// `created: false`); a new title creates a document (201,
// `created: true`). Re-sending identical content is a cheap no-op.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, badRequest, toApiErrorResponse } from '@/lib/api/v1/respond';
import { loadEmbeddingsKey } from '@/lib/ai/config';
import { ingestDocument } from '@/lib/ai/knowledge';
import { AiError } from '@/lib/ai/types';

/** Generous but bounded — a long product doc, not a data dump. */
const MAX_CONTENT_CHARS = 500_000;
const MAX_TITLE_CHARS = 200;

export async function POST(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'knowledge:write');

    const body = await request.json().catch(() => null);
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const content = typeof body?.content === 'string' ? body.content.trim() : '';
    if (!title || !content) throw badRequest('title and content are required');
    if (title.length > MAX_TITLE_CHARS) {
      throw badRequest(`title must be at most ${MAX_TITLE_CHARS} characters`);
    }
    if (content.length > MAX_CONTENT_CHARS) {
      throw badRequest(`content must be at most ${MAX_CONTENT_CHARS} characters`);
    }

    const db = ctx.supabase;
    const { data: existing, error: findErr } = await db
      .from('ai_knowledge_documents')
      .select('id, content')
      .eq('account_id', ctx.accountId)
      .eq('title', title)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (findErr) {
      console.error('[api/v1/knowledge] lookup error:', findErr);
      return fail('internal', 'Failed to look up the document', 500);
    }

    if (existing && existing.content === content) {
      return ok({ id: existing.id, created: false, reindexed: false });
    }

    let documentId: string;
    if (existing) {
      const { error } = await db
        .from('ai_knowledge_documents')
        .update({ content, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .eq('account_id', ctx.accountId);
      if (error) {
        console.error('[api/v1/knowledge] update error:', error);
        return fail('internal', 'Failed to update the document', 500);
      }
      documentId = existing.id;
    } else {
      const { data: doc, error } = await db
        .from('ai_knowledge_documents')
        .insert({ account_id: ctx.accountId, created_by: ctx.createdBy, title, content })
        .select('id')
        .single();
      if (error || !doc) {
        console.error('[api/v1/knowledge] insert error:', error);
        return fail('internal', 'Failed to save the document', 500);
      }
      documentId = doc.id;
    }

    const { key: embeddingsApiKey } = await loadEmbeddingsKey(db, ctx.accountId);
    let warning: string | null = null;
    try {
      await ingestDocument(db, ctx.accountId, { embeddingsApiKey }, documentId, content);
    } catch (err) {
      // The chunks are still stored for keyword search; only the
      // semantic embeddings failed.
      const message = err instanceof AiError ? err.message : 'indexing failed';
      console.error('[api/v1/knowledge] ingest error:', err);
      warning = `Saved, but semantic indexing failed (${message}). Keyword search still works.`;
    }

    return ok(
      { id: documentId, created: !existing, reindexed: true, warning },
      existing ? 200 : 201
    );
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
