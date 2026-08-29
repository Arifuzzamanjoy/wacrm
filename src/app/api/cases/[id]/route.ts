import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import type { CaseStatus } from "@/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole("viewer");
    const { id: caseId } = await params;

    const { data: caseItem, error } = await ctx.supabase
      .from("cases")
      .select(`
        *,
        primary_contact:contacts!cases_primary_contact_id_fkey(*),
        members:case_members(
          *,
          contact:contacts(*)
        )
      `)
      .eq("id", caseId)
      .eq("account_id", ctx.accountId)
      .maybeSingle();

    if (error) {
      console.error("[GET /api/cases/[id]] error:", error);
      return NextResponse.json({ error: "Failed to fetch case" }, { status: 500 });
    }

    if (!caseItem) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, case: caseItem });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole("agent");
    const { id: caseId } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if ("title" in body && typeof body.title === "string") {
      updatePayload.title = body.title.trim();
    }
    if ("case_type" in body && typeof body.case_type === "string") {
      updatePayload.case_type = body.case_type.trim();
    }
    if ("description" in body) {
      updatePayload.description =
        typeof body.description === "string" ? body.description.trim() || null : null;
    }
    if ("status" in body && typeof body.status === "string") {
      updatePayload.status = body.status as CaseStatus;
    }
    if ("metadata" in body && typeof body.metadata === "object" && body.metadata !== null) {
      updatePayload.metadata = body.metadata;
    }

    const { data: updatedCase, error: updateErr } = await ctx.supabase
      .from("cases")
      .update(updatePayload)
      .eq("id", caseId)
      .eq("account_id", ctx.accountId)
      .select(`
        *,
        primary_contact:contacts!cases_primary_contact_id_fkey(*),
        members:case_members(
          *,
          contact:contacts(*)
        )
      `)
      .single();

    if (updateErr) {
      console.error("[PATCH /api/cases/[id]] update error:", updateErr);
      return NextResponse.json(
        { error: updateErr.message || "Failed to update case" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, case: updatedCase });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole("admin");
    const { id: caseId } = await params;

    const { error: deleteErr } = await ctx.supabase
      .from("cases")
      .delete()
      .eq("id", caseId)
      .eq("account_id", ctx.accountId);

    if (deleteErr) {
      console.error("[DELETE /api/cases/[id]] delete error:", deleteErr);
      return NextResponse.json({ error: "Failed to delete case" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
