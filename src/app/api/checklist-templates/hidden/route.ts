import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";

/**
 * Which built-in checklist templates this account has hidden.
 *
 * Built-ins are global rows shared by every account, so an agency that
 * never runs (say) the Schengen or Australian corridors cannot delete
 * them — it hides them. Hiding is per account, reversible, and only
 * affects what the picker offers; any checklist already applied from a
 * hidden template is untouched, because applied rows are copies.
 *
 * PUT replaces the whole list, which keeps the client simple: it sends
 * the full set of checked boxes rather than diffing.
 */
export async function PUT(request: Request) {
  try {
    const ctx = await requireRole("admin");

    const body = (await request.json().catch(() => null)) as
      | { hidden_template_ids?: unknown }
      | null;
    const raw = body?.hidden_template_ids;

    if (!Array.isArray(raw)) {
      return NextResponse.json(
        { error: "'hidden_template_ids' must be an array" },
        { status: 400 }
      );
    }

    // Only well-formed uuids reach the uuid[] column — anything else
    // would fail the insert with an opaque Postgres error.
    const UUID_RE =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const ids = [...new Set(raw.filter((v): v is string => typeof v === "string"))];
    if (ids.some((id) => !UUID_RE.test(id))) {
      return NextResponse.json(
        { error: "hidden_template_ids must contain only template ids" },
        { status: 400 }
      );
    }

    // Only global templates are hideable. Silently dropping anything
    // else stops an account from hiding — and so losing track of — its
    // own templates, which are managed by deleting them instead.
    const { data: globals, error: lookupError } = await ctx.supabase
      .from("checklist_templates")
      .select("id")
      .is("account_id", null);

    if (lookupError) {
      console.error("[PUT /api/checklist-templates/hidden] lookup:", lookupError);
      return NextResponse.json(
        { error: "Failed to resolve built-in templates" },
        { status: 500 }
      );
    }

    const globalIds = new Set((globals ?? []).map((g) => g.id as string));
    const hidden = ids.filter((id) => globalIds.has(id));

    const { error } = await ctx.supabase
      .from("accounts")
      .update({ hidden_checklist_template_ids: hidden })
      .eq("id", ctx.accountId);

    if (error) {
      console.error("[PUT /api/checklist-templates/hidden] update:", error);
      return NextResponse.json(
        { error: "Failed to save hidden templates" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, hiddenTemplateIds: hidden });
  } catch (err) {
    return toErrorResponse(err);
  }
}
