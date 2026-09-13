import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import type { CaseMemberRole } from "@/types";

/** Mirrors the `case_members_role_check` CHECK in migration 040. */
const CASE_MEMBER_ROLES: CaseMemberRole[] = [
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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole("viewer");
    const { id: caseId } = await params;

    // Verify case belongs to account
    const { data: caseExists } = await ctx.supabase
      .from("cases")
      .select("id")
      .eq("id", caseId)
      .eq("account_id", ctx.accountId)
      .maybeSingle();

    if (!caseExists) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    const { data: members, error } = await ctx.supabase
      .from("case_members")
      .select(`
        *,
        contact:contacts(*)
      `)
      .eq("case_id", caseId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[GET /api/cases/[id]/members] error:", error);
      return NextResponse.json({ error: "Failed to fetch members" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, members: members ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole("agent");
    const { id: caseId } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const contactId = typeof body.contact_id === "string" ? body.contact_id.trim() : "";
    const role = (typeof body.role === "string" ? body.role.trim() : "other") as CaseMemberRole;
    const label = typeof body.label === "string" ? body.label.trim() || null : null;
    const notes = typeof body.notes === "string" ? body.notes.trim() || null : null;

    if (!contactId) {
      return NextResponse.json({ error: "contact_id is required" }, { status: 400 });
    }

    if (!CASE_MEMBER_ROLES.includes(role)) {
      return NextResponse.json(
        { error: `role must be one of: ${CASE_MEMBER_ROLES.join(", ")}` },
        { status: 400 }
      );
    }

    // Verify case exists in this account
    const { data: caseItem, error: caseErr } = await ctx.supabase
      .from("cases")
      .select("id")
      .eq("id", caseId)
      .eq("account_id", ctx.accountId)
      .maybeSingle();

    if (caseErr || !caseItem) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    // Verify contact belongs to this account
    const { data: contact, error: contactErr } = await ctx.supabase
      .from("contacts")
      .select("id")
      .eq("id", contactId)
      .eq("account_id", ctx.accountId)
      .maybeSingle();

    if (contactErr || !contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    // Check if member already exists
    const { data: existingMember } = await ctx.supabase
      .from("case_members")
      .select("id")
      .eq("case_id", caseId)
      .eq("contact_id", contactId)
      .maybeSingle();

    if (existingMember) {
      return NextResponse.json(
        { error: "Contact is already a member of this case" },
        { status: 409 }
      );
    }

    const { data: insertedMember, error: insertErr } = await ctx.supabase
      .from("case_members")
      .insert({
        case_id: caseId,
        contact_id: contactId,
        role,
        label,
        notes,
      })
      .select(`
        *,
        contact:contacts(*)
      `)
      .single();

    if (insertErr) {
      console.error("[POST /api/cases/[id]/members] insert error:", insertErr);
      return NextResponse.json(
        { error: insertErr.message || "Failed to add member to case" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, member: insertedMember }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole("agent");
    const { id: caseId } = await params;

    const url = new URL(request.url);
    let memberId = url.searchParams.get("member_id");

    if (!memberId) {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      if (typeof body.member_id === "string") {
        memberId = body.member_id;
      }
    }

    if (!memberId) {
      return NextResponse.json({ error: "member_id is required" }, { status: 400 });
    }

    // Verify case exists in this account
    const { data: caseItem, error: caseErr } = await ctx.supabase
      .from("cases")
      .select("id, primary_contact_id")
      .eq("id", caseId)
      .eq("account_id", ctx.accountId)
      .maybeSingle();

    if (caseErr || !caseItem) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    // Find the member record
    const { data: member, error: memberErr } = await ctx.supabase
      .from("case_members")
      .select("id, role, contact_id")
      .eq("id", memberId)
      .eq("case_id", caseId)
      .maybeSingle();

    if (memberErr || !member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // Check if trying to remove primary
    if (member.role === "primary" || member.contact_id === caseItem.primary_contact_id) {
      return NextResponse.json(
        { error: "Cannot remove the primary contact from a case." },
        { status: 400 }
      );
    }

    const { error: deleteErr } = await ctx.supabase
      .from("case_members")
      .delete()
      .eq("id", memberId)
      .eq("case_id", caseId);

    if (deleteErr) {
      console.error("[DELETE /api/cases/[id]/members] delete error:", deleteErr);
      return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
