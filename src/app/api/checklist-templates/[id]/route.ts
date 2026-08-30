import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { validateChecklistTemplate } from "@/lib/checklists/template-validation";

/**
 * Update / delete one account-owned checklist template.
 *
 * Both verbs pin `account_id` in the query on top of the admin role
 * check, so the seeded global templates (account_id IS NULL) can never
 * be edited or deleted through here — they are shared across every
 * account, and an agency wanting a variant of one creates its own.
 */

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole("admin");
    const { id } = await params;

    const body = await request.json().catch(() => null);
    const result = validateChecklistTemplate(body);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const { data, error } = await ctx.supabase
      .from("checklist_templates")
      .update(result.value)
      .eq("id", id)
      .eq("account_id", ctx.accountId)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A template with that name already exists" },
          { status: 409 }
        );
      }
      // No row matched: either it doesn't exist, or it's a global
      // template / another account's. All three are "not yours".
      if (error.code === "PGRST116") {
        return NextResponse.json(
          { error: "Template not found, or not editable by this account" },
          { status: 404 }
        );
      }
      console.error("[PATCH /api/checklist-templates/[id]] error:", error);
      return NextResponse.json(
        { error: "Failed to update checklist template" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, template: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole("admin");
    const { id } = await params;

    // `select()` so we can tell "deleted" from "matched nothing" —
    // a bare delete reports success either way.
    const { data, error } = await ctx.supabase
      .from("checklist_templates")
      .delete()
      .eq("id", id)
      .eq("account_id", ctx.accountId)
      .select("id");

    if (error) {
      console.error("[DELETE /api/checklist-templates/[id]] error:", error);
      return NextResponse.json(
        { error: "Failed to delete checklist template" },
        { status: 500 }
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: "Template not found, or not deletable by this account" },
        { status: 404 }
      );
    }

    // Checklists already applied to contacts are deliberately left
    // alone: contact_documents rows are copies, not references, so
    // removing a template never disturbs work in progress.
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
