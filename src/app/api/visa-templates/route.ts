import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";

/**
 * @deprecated Superseded by GET /api/checklist-templates in migration
 * 044, which serves every vertical rather than immigration only.
 *
 * Kept as a thin alias so an existing external integration doesn't
 * hard-fail on deploy: it returns immigration templates in the legacy
 * `country_code` / `visa_category` column shape. New callers should use
 * /api/checklist-templates. Remove once no integration hits this.
 */
export async function GET() {
  try {
    const ctx = await requireRole("viewer");

    const { data, error } = await ctx.supabase
      .from("checklist_templates")
      .select("*")
      .eq("industry", "immigration")
      .or(`account_id.is.null,account_id.eq.${ctx.accountId}`)
      .order("region_code", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      console.error("[GET /api/visa-templates] query error:", error);
      return NextResponse.json(
        { error: "Failed to fetch visa templates" },
        { status: 500 }
      );
    }

    const legacyShaped = (data ?? []).map((t) => ({
      id: t.id,
      account_id: t.account_id,
      country_code: t.region_code,
      visa_category: t.category,
      name: t.name,
      default_items: t.default_items,
      created_at: t.created_at,
      updated_at: t.updated_at,
    }));

    return NextResponse.json({ ok: true, templates: legacyShaped });
  } catch (err) {
    return toErrorResponse(err);
  }
}
