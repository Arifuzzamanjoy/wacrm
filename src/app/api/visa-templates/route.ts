import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";

export async function GET() {
  try {
    const ctx = await requireRole("viewer");

    const { data, error } = await ctx.supabase
      .from("visa_checklist_templates")
      .select("*")
      .or(`account_id.is.null,account_id.eq.${ctx.accountId}`)
      .order("country_code", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      console.error("[GET /api/visa-templates] query error:", error);
      return NextResponse.json({ error: "Failed to fetch visa templates" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, templates: data ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}
