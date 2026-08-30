import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";

/**
 * Checklist templates available to the caller: every global system
 * template plus the account's own. Optional `?industry=` narrows to a
 * single vertical; omitted, all verticals come back and the client
 * groups them (leading with the account's own industry).
 *
 * Generalized from /api/visa-templates in migration 044 — immigration
 * is now one vertical among several rather than the only one.
 */
export async function GET(request: Request) {
  try {
    const ctx = await requireRole("viewer");
    const industry = new URL(request.url).searchParams.get("industry");

    let query = ctx.supabase
      .from("checklist_templates")
      .select("*")
      .or(`account_id.is.null,account_id.eq.${ctx.accountId}`);

    if (industry && industry !== "all") {
      query = query.eq("industry", industry);
    }

    const { data, error } = await query
      .order("industry", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      console.error("[GET /api/checklist-templates] query error:", error);
      return NextResponse.json(
        { error: "Failed to fetch checklist templates" },
        { status: 500 }
      );
    }

    // The agency's own vertical, so the client can lead with it.
    const { data: account } = await ctx.supabase
      .from("accounts")
      .select("industry")
      .eq("id", ctx.accountId)
      .maybeSingle();

    return NextResponse.json({
      ok: true,
      templates: data ?? [],
      accountIndustry: account?.industry ?? null,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
