import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import type { ChecklistTemplateItem, DocumentStatus } from "@/types";

const DOCUMENT_STATUSES: DocumentStatus[] = [
  "missing",
  "submitted",
  "verified",
  "rejected",
  "waived",
];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole("viewer");
    const { id: contactId } = await params;

    const { data, error } = await ctx.supabase
      .from("contact_documents")
      .select("*")
      .eq("account_id", ctx.accountId)
      .eq("contact_id", contactId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[GET /api/contacts/[id]/documents] error:", error);
      return NextResponse.json({ error: "Failed to fetch contact documents" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, documents: data ?? [] });
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
    const { id: contactId } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    // Case 1: Apply standard template
    if (typeof body.template_id === "string" && body.template_id.trim()) {
      const templateId = body.template_id.trim();

      const { data: template, error: tmplError } = await ctx.supabase
        .from("checklist_templates")
        .select("*")
        .eq("id", templateId)
        .or(`account_id.is.null,account_id.eq.${ctx.accountId}`)
        .maybeSingle();

      if (tmplError || !template) {
        return NextResponse.json({ error: "Template not found" }, { status: 404 });
      }

      const defaultItems = (template.default_items as ChecklistTemplateItem[]) ?? [];
      const category =
        typeof body.category === "string" && body.category.trim()
          ? body.category.trim()
          : template.category || template.name;

      if (defaultItems.length === 0) {
        return NextResponse.json({ ok: true, documents: [] });
      }

      const rowsToInsert = defaultItems.map((item) => ({
        account_id: ctx.accountId,
        contact_id: contactId,
        category,
        title: item.title,
        description: item.description ?? null,
        is_mandatory: item.is_mandatory ?? true,
        status: "missing" as DocumentStatus,
      }));

      const { data: inserted, error: insertError } = await ctx.supabase
        .from("contact_documents")
        .insert(rowsToInsert)
        .select();

      if (insertError) {
        console.error("[POST /api/contacts/[id]/documents] batch insert error:", insertError);
        return NextResponse.json({ error: "Failed to apply template items" }, { status: 500 });
      }

      return NextResponse.json({ ok: true, documents: inserted ?? [] }, { status: 201 });
    }

    // Case 2: Create single custom document
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const category = typeof body.category === "string" ? body.category.trim() : "";

    if (!title || !category) {
      return NextResponse.json(
        { error: "Missing required fields: title and category" },
        { status: 400 }
      );
    }

    const { data: insertedDoc, error: insertDocError } = await ctx.supabase
      .from("contact_documents")
      .insert({
        account_id: ctx.accountId,
        contact_id: contactId,
        category,
        title,
        description: typeof body.description === "string" ? body.description.trim() || null : null,
        is_mandatory: typeof body.is_mandatory === "boolean" ? body.is_mandatory : true,
        status: (body.status as DocumentStatus) || "missing",
        file_url: typeof body.file_url === "string" ? body.file_url : null,
        message_id: typeof body.message_id === "string" ? body.message_id : null,
        expiry_date: typeof body.expiry_date === "string" ? body.expiry_date : null,
      })
      .select()
      .single();

    if (insertDocError) {
      console.error("[POST /api/contacts/[id]/documents] insert error:", insertDocError);
      return NextResponse.json({ error: "Failed to create contact document" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, document: insertedDoc }, { status: 201 });
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
    const { id: contactId } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const documentId = typeof body.id === "string" ? body.id.trim() : "";
    if (!documentId) {
      return NextResponse.json({ error: "Document id is required" }, { status: 400 });
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if ("title" in body && typeof body.title === "string") {
      updatePayload.title = body.title.trim();
    }
    if ("description" in body) {
      updatePayload.description =
        typeof body.description === "string" ? body.description.trim() || null : null;
    }
    if ("is_mandatory" in body && typeof body.is_mandatory === "boolean") {
      updatePayload.is_mandatory = body.is_mandatory;
    }
    if ("file_url" in body) {
      updatePayload.file_url = typeof body.file_url === "string" ? body.file_url : null;
    }
    if ("message_id" in body) {
      updatePayload.message_id = typeof body.message_id === "string" ? body.message_id : null;
    }
    if ("expiry_date" in body) {
      updatePayload.expiry_date = typeof body.expiry_date === "string" ? body.expiry_date : null;
    }
    if ("rejection_reason" in body) {
      updatePayload.rejection_reason =
        typeof body.rejection_reason === "string" ? body.rejection_reason.trim() || null : null;
    }

    if ("status" in body && typeof body.status === "string") {
      if (!DOCUMENT_STATUSES.includes(body.status as DocumentStatus)) {
        return NextResponse.json(
          { error: `Invalid status. Expected one of: ${DOCUMENT_STATUSES.join(", ")}` },
          { status: 400 }
        );
      }
      const nextStatus = body.status as DocumentStatus;
      updatePayload.status = nextStatus;

      if (nextStatus === "verified") {
        updatePayload.verified_at = new Date().toISOString();
        updatePayload.verified_by = ctx.userId;
        updatePayload.rejection_reason = null;
      } else {
        updatePayload.verified_at = null;
        updatePayload.verified_by = null;
        // A waived requirement no longer applies to this client, so any
        // rejection note from a previous submission is stale.
        if (nextStatus === "waived") {
          updatePayload.rejection_reason = null;
        }
      }
    }

    const { data: updatedDoc, error: updateError } = await ctx.supabase
      .from("contact_documents")
      .update(updatePayload)
      .eq("id", documentId)
      .eq("contact_id", contactId)
      .eq("account_id", ctx.accountId)
      .select()
      .single();

    if (updateError) {
      console.error("[PATCH /api/contacts/[id]/documents] update error:", updateError);
      return NextResponse.json(
        { error: updateError.message || "Failed to update document" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, document: updatedDoc });
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
    const { id: contactId } = await params;

    const url = new URL(request.url);
    let documentId = url.searchParams.get("documentId");

    if (!documentId) {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      if (typeof body.documentId === "string") {
        documentId = body.documentId;
      }
    }

    if (!documentId) {
      return NextResponse.json({ error: "documentId is required" }, { status: 400 });
    }

    const { error: deleteError } = await ctx.supabase
      .from("contact_documents")
      .delete()
      .eq("id", documentId)
      .eq("contact_id", contactId)
      .eq("account_id", ctx.accountId);

    if (deleteError) {
      console.error("[DELETE /api/contacts/[id]/documents] delete error:", deleteError);
      return NextResponse.json({ error: "Failed to delete document" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
