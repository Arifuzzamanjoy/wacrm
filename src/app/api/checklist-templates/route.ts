import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { validateChecklistTemplate } from "@/lib/checklists/template-validation";
import {
  sortTemplatesForPicker,
  filterHiddenTemplates,
} from "@/lib/checklists/template-ordering";
import type { ChecklistTemplate } from "@/types";

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

    // The agency's own vertical (so the client can lead with it) and
    // the built-ins it has chosen to hide.
    const { data: account } = await ctx.supabase
      .from("accounts")
      .select("industry, hidden_checklist_template_ids")
      .eq("id", ctx.accountId)
      .maybeSingle();

    const hiddenIds: string[] =
      (account?.hidden_checklist_template_ids as string[] | null) ?? [];

    // `?includeHidden=1` is for the settings panel, which has to list
    // hidden templates in order to offer un-hiding them. Everywhere
    // else — the inbox picker above all — gets the filtered list.
    const includeHidden =
      new URL(request.url).searchParams.get("includeHidden") === "1";

    const all = (data ?? []) as ChecklistTemplate[];
    const visible = includeHidden
      ? all
      : filterHiddenTemplates(all, hiddenIds);

    return NextResponse.json({
      ok: true,
      templates: sortTemplatesForPicker(visible),
      accountIndustry: account?.industry ?? null,
      hiddenTemplateIds: hiddenIds,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * Create an account-owned checklist template.
 *
 * The seeded global templates cover only the most common streams; this
 * is how an agency captures the rest (spousal sponsorship, work
 * permits, visitor visas — or a vertical we don't ship at all).
 *
 * Admin-only, matching the checklist_templates_insert RLS policy. The
 * account_id is taken from the session, never from the body, so a
 * caller cannot author a row into another account or into the global
 * (NULL) catalogue.
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireRole("admin");

    const body = await request.json().catch(() => null);
    const result = validateChecklistTemplate(body);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const { data, error } = await ctx.supabase
      .from("checklist_templates")
      .insert({ ...result.value, account_id: ctx.accountId })
      .select()
      .single();

    if (error) {
      // 23505 = unique_violation on idx_checklist_templates_account_name.
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A template with that name already exists" },
          { status: 409 }
        );
      }
      console.error("[POST /api/checklist-templates] insert error:", error);
      return NextResponse.json(
        { error: "Failed to create checklist template" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, template: data }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
