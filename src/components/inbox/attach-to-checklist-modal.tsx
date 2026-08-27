"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Contact, ContactDocument, Message } from "@/types";
import {
  FileCheck2,
  FileText,
  Video,
  Loader2,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useTranslations } from "next-intl";

interface AttachToChecklistModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: Message | null;
  contact: Contact | null;
  onAttached?: (updated: ContactDocument) => void;
}

export function AttachToChecklistModal({
  open,
  onOpenChange,
  message,
  contact,
  onAttached,
}: AttachToChecklistModalProps) {
  const t = useTranslations("Inbox.checklist");
  const [documents, setDocuments] = useState<ContactDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [attachingDocId, setAttachingDocId] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    if (!contact || !open) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/contacts/${contact.id}/documents`);
      const data = await res.json();
      if (res.ok && data.documents) {
        setDocuments(data.documents);
      }
    } catch (err) {
      console.error("Failed to load documents", err);
    } finally {
      setLoading(false);
    }
  }, [contact, open]);

  useEffect(() => {
    if (open) {
      fetchDocuments();
    }
  }, [open, fetchDocuments]);

  const handleAttach = async (doc: ContactDocument) => {
    if (!contact || !message?.media_url) return;
    setAttachingDocId(doc.id);
    try {
      const res = await fetch(`/api/contacts/${contact.id}/documents`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: doc.id,
          file_url: message.media_url,
          message_id: message.id,
          status: "submitted",
          rejection_reason: null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to attach file");

      toast.success(t("attachedSuccess", { title: doc.title }));

      // Dispatch global update event
      window.dispatchEvent(
        new CustomEvent("wacrm:documents-updated", {
          detail: { contactId: contact.id },
        })
      );

      if (onAttached) onAttached(data.document);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error attaching document");
    } finally {
      setAttachingDocId(null);
    }
  };

  if (!message || !contact) return null;

  // Separate pending (missing/rejected) from others to speed up counselors
  const pendingDocs = documents.filter(
    (d) => d.status === "missing" || d.status === "rejected"
  );
  const otherDocs = documents.filter(
    (d) => d.status === "submitted" || d.status === "verified"
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-background border-border p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="p-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
              <FileCheck2 className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-sm font-semibold text-foreground">
                {t("attachToRequirement")}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {contact.name || contact.phone} • {documents.length} {t("checklistItemsCount")}
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* Selected Media Preview Bar */}
        <div className="p-3 bg-muted/40 border-b border-border flex items-center gap-3">
          <div className="h-12 w-12 rounded-md bg-muted border border-border flex items-center justify-center overflow-hidden shrink-0">
            {message.content_type === "image" && message.media_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={message.media_url}
                alt="Media thumbnail"
                className="h-full w-full object-cover"
              />
            ) : message.content_type === "video" ? (
              <Video className="h-5 w-5 text-muted-foreground" />
            ) : (
              <FileText className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-foreground truncate">
              {message.content_text || `${message.content_type.toUpperCase()} file`}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {format(new Date(message.created_at), "MMM d, HH:mm")}
            </p>
          </div>
        </div>

        {/* Requirements Selection List */}
        <ScrollArea className="max-h-[50vh]">
          <div className="p-3 space-y-3">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : documents.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                {t("noChecklistFoundForContact")}
              </div>
            ) : (
              <>
                {/* Pending Requirements */}
                {pendingDocs.length > 0 && (
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5 px-1">
                      {t("pendingMissingItems")} ({pendingDocs.length})
                    </span>
                    <div className="space-y-1.5">
                      {pendingDocs.map((doc) => (
                        <button
                          key={doc.id}
                          type="button"
                          onClick={() => handleAttach(doc)}
                          disabled={attachingDocId !== null}
                          className="w-full flex items-center justify-between p-2.5 rounded-lg border border-border bg-card hover:border-primary/50 hover:bg-muted/50 transition-all text-left group"
                        >
                          <div className="min-w-0 flex-1 pr-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                                {doc.title}
                              </span>
                              {doc.is_mandatory ? (
                                <span className="text-red-500 font-bold text-[10px]">*</span>
                              ) : (
                                <span className="text-[9px] text-muted-foreground">({t("optionalSmall")})</span>
                              )}
                            </div>
                            {doc.rejection_reason ? (
                              <p className="text-[10px] text-rose-600 dark:text-rose-400 mt-0.5 truncate">
                                {t("reason")}: {doc.rejection_reason}
                              </p>
                            ) : doc.description ? (
                              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                                {doc.description}
                              </p>
                            ) : null}
                          </div>

                          <div className="shrink-0 flex items-center gap-1.5">
                            {doc.status === "rejected" ? (
                              <Badge variant="destructive" className="text-[9px] px-1.5 py-0">
                                {t("needsFix")}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-muted-foreground">
                                {t("missing")}
                              </Badge>
                            )}

                            {attachingDocId === doc.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary ml-1" />
                            ) : (
                              <span className="text-[11px] font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                                {t("attachAction")} →
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Already Submitted / Verified Requirements */}
                {otherDocs.length > 0 && (
                  <div className="pt-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5 px-1">
                      {t("alreadyAttachedOrVerified")} ({otherDocs.length})
                    </span>
                    <div className="space-y-1.5">
                      {otherDocs.map((doc) => (
                        <button
                          key={doc.id}
                          type="button"
                          onClick={() => handleAttach(doc)}
                          disabled={attachingDocId !== null}
                          className="w-full flex items-center justify-between p-2 rounded-lg border border-border/60 bg-muted/20 hover:border-primary/40 hover:bg-muted/40 transition-all text-left group opacity-80 hover:opacity-100"
                        >
                          <div className="min-w-0 flex-1 pr-2">
                            <span className="text-xs font-medium text-foreground">
                              {doc.title}
                            </span>
                          </div>
                          <div className="shrink-0 flex items-center gap-1">
                            {doc.status === "verified" ? (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                                <CheckCircle2 className="h-3 w-3" />
                                {t("verified")}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                                <Clock className="h-3 w-3" />
                                {t("underReview")}
                              </span>
                            )}
                            {attachingDocId === doc.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary ml-1" />
                            ) : (
                              <span className="text-[10px] text-muted-foreground ml-1">
                                ({t("replace")})
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
