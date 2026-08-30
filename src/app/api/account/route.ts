// ============================================================
// /api/account
//
//   GET   — current caller's account + role. Any member.
//   PATCH — update the account (name and/or industry). Admin+.
//
// Why both verbs share a route file
//   They speak about the same singular resource (the caller's
//   account) and reuse the same `requireRole` plumbing. Splitting
//   them across files would duplicate the `account_id` lookup
//   without buying anything.
// ============================================================

import { NextResponse } from "next/server";

import {
  requireRole,
  getCurrentAccount,
  toErrorResponse,
} from "@/lib/auth/account";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";

export async function GET() {
  try {
    const ctx = await getCurrentAccount();

    // `industry` is read separately rather than being folded into
    // getCurrentAccount's select. That select is on the critical path for
    // every authenticated request, and this column only exists once
    // migration 044 has been applied — which this project does by hand.
    // Selecting it there would turn a not-yet-migrated database into a
    // hard failure of the whole account context (the #294 failure mode).
    // Here a missing column just means "industry not set yet".
    let industry: string | null = null;
    const { data, error } = await ctx.supabase
      .from("accounts")
      .select("industry")
      .eq("id", ctx.accountId)
      .maybeSingle();
    if (error) {
      console.warn(
        "[GET /api/account] industry unavailable (migration 044 not applied?):",
        error.message,
      );
    } else {
      industry = (data?.industry as string | null) ?? null;
    }

    return NextResponse.json({
      account: { ...ctx.account, industry },
      role: ctx.role,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

const MAX_NAME_LEN = 80;
const MAX_INDUSTRY_LEN = 64;

export async function PATCH(request: Request) {
  try {
    const ctx = await requireRole("admin");

    // Per-user limit on admin-class mutations. Bounds accidental
    // abuse (script run in a loop) and a compromised admin session
    // spamming updates. Each admin endpoint keys its own bucket so
    // one route doesn't starve another.
    const limit = checkRateLimit(
      `admin:account-update:${ctx.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as
      | { name?: unknown; industry?: unknown }
      | null;

    // Both fields are optional so a caller can change either
    // independently, but sending neither is a no-op worth rejecting.
    const patch: { name?: string; industry?: string | null } = {};

    if (body && "name" in body) {
      const rawName = body.name;
      if (typeof rawName !== "string") {
        return NextResponse.json(
          { error: "'name' must be a string" },
          { status: 400 },
        );
      }
      const name = rawName.trim();
      if (name.length === 0) {
        return NextResponse.json(
          { error: "Account name cannot be empty" },
          { status: 400 },
        );
      }
      if (name.length > MAX_NAME_LEN) {
        return NextResponse.json(
          { error: `Account name must be ${MAX_NAME_LEN} characters or fewer` },
          { status: 400 },
        );
      }
      patch.name = name;
    }

    if (body && "industry" in body) {
      const rawIndustry = body.industry;
      // null clears the selection back to "not chosen". Otherwise it is
      // free text — matching the column, which is deliberately not an
      // enum so an account can coin a vertical we don't ship (the same
      // choice `cases.case_type` makes).
      if (rawIndustry === null) {
        patch.industry = null;
      } else if (typeof rawIndustry === "string") {
        const industry = rawIndustry.trim();
        if (industry.length === 0) {
          patch.industry = null;
        } else if (industry.length > MAX_INDUSTRY_LEN) {
          return NextResponse.json(
            {
              error: `Industry must be ${MAX_INDUSTRY_LEN} characters or fewer`,
            },
            { status: 400 },
          );
        } else {
          patch.industry = industry;
        }
      } else {
        return NextResponse.json(
          { error: "'industry' must be a string or null" },
          { status: 400 },
        );
      }
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: "Nothing to update: provide 'name' and/or 'industry'" },
        { status: 400 },
      );
    }

    // RLS allows this UPDATE because accounts_update requires
    // `is_account_member(id, 'admin')`, and requireRole already
    // guaranteed the caller is admin+.
    const { data, error } = await ctx.supabase
      .from("accounts")
      .update(patch)
      .eq("id", ctx.accountId)
      .select("id, name, industry")
      .single();

    if (error) {
      console.error("[PATCH /api/account] update error:", error);
      return NextResponse.json(
        { error: "Failed to update account" },
        { status: 500 },
      );
    }

    return NextResponse.json({ account: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}
