import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import type { CaseStatus } from "@/types";

/** Mirrors the `cases_status_check` CHECK constraint in migration 040. */
const CASE_STATUSES: CaseStatus[] = [
  "active",
  "in_progress",
  "submitted",
  "approved",
  "completed",
  "closed",
  "on_hold",
  "cancelled",
];

/** Mirrors the `case_members_role_check` CHECK in migration 040. */
const CASE_MEMBER_ROLES = [
  "primary",
  "spouse",
  "child",
  "parent",
  "co_applicant",
  "dependent",
  "nominee",
  "guarantor",
  "representative",
  "stakeholder",
  "reference",
  "other",
];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  try {
    const ctx = await requireRole("viewer");
    const { searchParams } = new URL(request.url);
    const contactId = searchParams.get("contact_id");
    const status = searchParams.get("status");
    const caseType = searchParams.get("case_type");

    let query = ctx.supabase
      .from("cases")
      .select(`
        *,
        primary_contact:contacts!cases_primary_contact_id_fkey(*),
        members:case_members(
          *,
          contact:contacts(*)
        )
      `)
      .eq("account_id", ctx.accountId)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }
    if (caseType) {
      query = query.eq("case_type", caseType);
    }

    if (contactId) {
      // PostgREST `.or()` takes a filter *expression*, not bound
      // parameters, so an id containing a comma or paren would be parsed
      // as extra filter syntax rather than as a value. Reject anything
      // that isn't a uuid before it gets interpolated below.
      if (!UUID_RE.test(contactId)) {
        return NextResponse.json(
          { error: "contact_id must be a uuid" },
          { status: 400 }
        );
      }

      // Find all cases where this contact is either the primary contact or a member
      const { data: memberRows, error: memberErr } = await ctx.supabase
        .from("case_members")
        .select("case_id")
        .eq("contact_id", contactId);

      if (memberErr) {
        console.error("[GET /api/cases] member lookup error:", memberErr);
        return NextResponse.json({ error: "Failed to query member cases" }, { status: 500 });
      }

      const caseIds = (memberRows ?? []).map((r) => r.case_id);

      // If contact is not in any case members, check if they are primary contact or return empty
      if (caseIds.length > 0) {
        query = query.or(`id.in.(${caseIds.join(",")}),primary_contact_id.eq.${contactId}`);
      } else {
        query = query.eq("primary_contact_id", contactId);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error("[GET /api/cases] error:", error);
      return NextResponse.json({ error: "Failed to fetch cases" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, cases: data ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole("agent");
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const caseType = typeof body.case_type === "string" ? body.case_type.trim() : "";
    const primaryContactId =
      typeof body.primary_contact_id === "string" ? body.primary_contact_id.trim() : "";
    const description =
      typeof body.description === "string" ? body.description.trim() || null : null;
    const status = (typeof body.status === "string" ? body.status.trim() : "active") as CaseStatus;

    if (!CASE_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${CASE_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    const metadata =
      body.metadata && typeof body.metadata === "object" ? body.metadata : {};

    if (!title || !caseType || !primaryContactId) {
      return NextResponse.json(
        { error: "title, case_type, and primary_contact_id are required" },
        { status: 400 }
      );
    }

    // Verify contact belongs to this account
    const { data: contact, error: contactErr } = await ctx.supabase
      .from("contacts")
      .select("id")
      .eq("id", primaryContactId)
      .eq("account_id", ctx.accountId)
      .maybeSingle();

    if (contactErr || !contact) {
      return NextResponse.json({ error: "Primary contact not found" }, { status: 404 });
    }

    // Insert into cases table.
    // Trigger trg_cases_auto_number will generate case_number.
    // Trigger trg_cases_auto_primary_member will add primary_contact_id to case_members.
    const { data: createdCase, error: insertErr } = await ctx.supabase
      .from("cases")
      .insert({
        account_id: ctx.accountId,
        title,
        case_type: caseType,
        primary_contact_id: primaryContactId,
        description,
        status,
        metadata,
      })
      .select()
      .single();

    if (insertErr || !createdCase) {
      console.error("[POST /api/cases] insert error:", insertErr);
      return NextResponse.json(
        { error: insertErr?.message || "Failed to create case" },
        { status: 500 }
      );
    }

    // If additional members were passed in payload, add them
    if (Array.isArray(body.additional_members) && body.additional_members.length > 0) {
      const candidates = body.additional_members
        .filter(
          (m: unknown): m is { contact_id: string; role?: string; label?: string; notes?: string } =>
            typeof m === "object" &&
            m !== null &&
            typeof (m as { contact_id?: unknown }).contact_id === "string" &&
            (m as { contact_id: string }).contact_id !== primaryContactId
        )
        .map((m) => ({
          contact_id: m.contact_id,
          role: CASE_MEMBER_ROLES.includes(m.role ?? "") ? m.role! : "other",
          label: m.label || null,
          notes: m.notes || null,
        }));

      // Only contacts belonging to this account may be linked. The
      // case_members RLS policy checks the *case's* account, not the
      // contact's, so without this a caller could name another tenant's
      // contact id and pull it into their case.
      const memberContactIds = [...new Set(candidates.map((m) => m.contact_id))];
      const { data: ownedContacts } = memberContactIds.length
        ? await ctx.supabase
            .from("contacts")
            .select("id")
            .eq("account_id", ctx.accountId)
            .in("id", memberContactIds)
        : { data: [] as { id: string }[] };

      const ownedIds = new Set((ownedContacts ?? []).map((c) => c.id as string));
      const additionalRows = candidates
        .filter((m) => ownedIds.has(m.contact_id))
        .map((m) => ({ case_id: createdCase.id, ...m }));

      if (additionalRows.length > 0) {
        const { error: membersErr } = await ctx.supabase
          .from("case_members")
          .insert(additionalRows);

        if (membersErr) {
          console.error("[POST /api/cases] additional members error:", membersErr);
        }
      }
    }

    // Return the hydrated case
    const { data: hydratedCase, error: fetchErr } = await ctx.supabase
      .from("cases")
      .select(`
        *,
        primary_contact:contacts!cases_primary_contact_id_fkey(*),
        members:case_members(
          *,
          contact:contacts(*)
        )
      `)
      .eq("id", createdCase.id)
      .single();

    if (fetchErr) {
      return NextResponse.json({ ok: true, case: createdCase }, { status: 201 });
    }

    return NextResponse.json({ ok: true, case: hydratedCase }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
