"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Contact, ContactDocument } from "@/types";
import {
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Calendar,
  FileQuestion,
  Loader2,
  ZoomIn,
  ZoomOut,
  RotateCw,
} from "lucide-react";
import { toast } from "sonner";
import { addMonths, addYears, format } from "date-fns";
import { useTranslations } from "next-intl";
import { isProxiedMediaUrl, loadMediaBlob } from "@/lib/media/blob-cache";

interface DocumentVerificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: ContactDocument | null;
  contact: Contact | null;
  onUpdate: (updated: ContactDocument) => void;
}

const REJECTION_REASONS = [
  "📷 Blurry / Illegible image",
  "✂️ Cut-off edges / Incomplete pages",
  "📅 Expired certificate",
  "🏛️ Missing official bank stamp / seal",
  "👤 Name does not match passport",
];

export function DocumentVerificationDialog({
  open,
  onOpenChange,
  document,
  contact,
  onUpdate,
}: DocumentVerificationDialogProps) {
  const t = useTranslations("Inbox.checklist");
  const [expiryDate, setExpiryDate] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  // Resolved media state
  const [resolvedBlobUrl, setResolvedBlobUrl] = useState<string | null>(null);
  const [mediaMimeType, setMediaMimeType] = useState<string | null>(null);
  const [mediaLoading, setMediaLoading] = useState(false);

  useEffect(() => {
    if (document) {
      setExpiryDate(document.expiry_date || "");
      setRejectionReason(document.rejection_reason || "");
      setZoom(1);
      setRotation(0);
    }
  }, [document]);

  // Resolve proxied media blob or direct URL
  useEffect(() => {
    if (!document?.file_url) {
      setResolvedBlobUrl(null);
      setMediaMimeType(null);
      setMediaLoading(false);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    setMediaLoading(true);

    if (isProxiedMediaUrl(document.file_url)) {
      loadMediaBlob(document.file_url)
        .then((blob) => {
          if (cancelled) return;
          objectUrl = URL.createObjectURL(blob);
          setResolvedBlobUrl(objectUrl);
          setMediaMimeType(blob.type);
          setMediaLoading(false);
        })
        .catch((err) => {
          if (cancelled) return;
          console.error("Failed to load proxied media blob", err);
          setMediaLoading(false);
        });
    } else {
      const url = document.file_url;
      const isPdfUrl = url.toLowerCase().includes(".pdf");
      setResolvedBlobUrl(url);
      setMediaMimeType(isPdfUrl ? "application/pdf" : "image/jpeg");
      setMediaLoading(false);
    }

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [document?.file_url]);

  if (!document || !contact) return null;

  const isPdf =
    mediaMimeType?.includes("pdf") ||
    document.file_url?.toLowerCase().includes(".pdf") ||
    document.title.toLowerCase().includes("pdf");
  const isImage = mediaMimeType?.startsWith("image/") || (!isPdf && !!document.file_url);

  const handleApplyExpiryPreset = (years: number, months = 0) => {
    let d = new Date();
    if (years > 0) d = addYears(d, years);
    if (months > 0) d = addMonths(d, months);
    setExpiryDate(format(d, "yyyy-MM-dd"));
  };

  const handleAddRejectionChip = (reason: string) => {
    const cleanReason = reason.replace(/^[^\s]+ /, ""); // strip emoji for cleaner note
    setRejectionReason((prev) => {
      if (!prev.trim()) return cleanReason;
      if (prev.includes(cleanReason)) return prev;
      return `${prev.trim()}, ${cleanReason}`;
    });
  };

  const handleApprove = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/contacts/${contact.id}/documents`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: document.id,
          status: "verified",
          expiry_date: expiryDate.trim() || null,
          rejection_reason: null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to verify document");

      toast.success(t("approvedSuccess", { title: document.title }));
      onUpdate(data.document);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error verifying document");
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      toast.error(t("rejectionReasonRequired"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/contacts/${contact.id}/documents`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: document.id,
          status: "rejected",
          rejection_reason: rejectionReason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reject document");

      toast.warning(t("rejectedSuccess", { title: document.title }));
      onUpdate(data.document);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error rejecting document");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-background border-border">
        {/* Modal Header */}
        <DialogHeader className="p-4 border-b border-border bg-muted/30 flex flex-row items-center justify-between space-y-0">
          <div>
            <div className="flex items-center gap-2">
              <DialogTitle className="text-base font-semibold text-foreground">
                {document.title}
              </DialogTitle>
              {document.is_mandatory ? (
                <Badge variant="destructive" className="text-[10px] uppercase font-mono px-1.5 py-0">
                  {t("mandatory")}
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px] uppercase font-mono px-1.5 py-0">
                  {t("optional")}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {document.category} • {contact.name || contact.phone}
            </p>
          </div>

          <div className="flex items-center gap-2 pr-6">
            {document.file_url && (
              <a
                href={document.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "h-7 text-xs gap-1.5"
                )}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t("openOriginal")}
              </a>
            )}
          </div>
        </DialogHeader>

        {/* Content Body: Split Layout */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 min-h-0 overflow-hidden">
          {/* Left: Preview Area (7 cols) */}
          <div className="md:col-span-7 bg-muted/40 border-r border-border flex flex-col items-center justify-center p-4 relative overflow-hidden min-h-[320px]">
            {mediaLoading ? (
              <div className="flex flex-col items-center justify-center p-8 text-muted-foreground gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="text-xs">Loading document preview...</span>
              </div>
            ) : document.file_url ? (
              <>
                {isPdf ? (
                  <iframe
                    src={`${resolvedBlobUrl || document.file_url}#toolbar=0`}
                    title={document.title}
                    className="w-full h-full min-h-[420px] rounded-md border border-border bg-white"
                  />
                ) : (
                  <div className="relative w-full h-full flex items-center justify-center overflow-auto p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={resolvedBlobUrl || document.file_url}
                      alt={document.title}
                      style={{
                        transform: `scale(${zoom}) rotate(${rotation}deg)`,
                        transition: "transform 0.2s ease-out",
                      }}
                      className="max-h-[50vh] max-w-full object-contain rounded-md shadow-sm"
                    />
                  </div>
                )}

                {/* Media preview toolbar */}
                {isImage && !isPdf && (
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-background/90 backdrop-blur-md px-2 py-1 rounded-full border border-border shadow-md">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 rounded-full"
                      onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                    >
                      <ZoomOut className="h-3 w-3" />
                    </Button>
                    <span className="text-[10px] font-mono px-1">
                      {Math.round(zoom * 100)}%
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 rounded-full"
                      onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
                    >
                      <ZoomIn className="h-3 w-3" />
                    </Button>
                    <div className="h-3 w-px bg-border mx-1" />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 rounded-full"
                      onClick={() => setRotation((r) => (r + 90) % 360)}
                    >
                      <RotateCw className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center text-center p-6 max-w-xs text-muted-foreground">
                <FileQuestion className="h-12 w-12 stroke-1 mb-2 opacity-50" />
                <p className="text-sm font-medium text-foreground">{t("noFileAttached")}</p>
                <p className="text-xs mt-1">
                  {t("noFileAttachedHint")}
                </p>
              </div>
            )}
          </div>

          {/* Right: Verification Action Controls (5 cols) */}
          <div className="md:col-span-5 p-4 flex flex-col gap-4 overflow-y-auto bg-background">
            {document.description && (
              <div className="rounded-lg bg-muted/40 p-3 border border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("requirementGuideline")}
                </p>
                <p className="text-xs text-foreground mt-1 leading-relaxed">
                  {document.description}
                </p>
              </div>
            )}

            {/* Verification Section */}
            <div className="space-y-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 dark:bg-emerald-950/10">
              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold text-xs uppercase tracking-wider">
                <CheckCircle2 className="h-4 w-4" />
                <span>{t("approveDocument")}</span>
              </div>

              <div>
                <label className="text-xs font-medium text-foreground flex items-center gap-1 mb-1.5">
                  <Calendar className="h-3 w-3 text-muted-foreground" />
                  {t("expiryDateOptional")}
                </label>
                <Input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="text-xs h-8 bg-background"
                />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  <span className="text-[10px] text-muted-foreground self-center mr-1">
                    {t("quickPreset")}:
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-5 px-1.5 text-[10px]"
                    onClick={() => handleApplyExpiryPreset(0, 6)}
                  >
                    +6M
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-5 px-1.5 text-[10px]"
                    onClick={() => handleApplyExpiryPreset(1)}
                  >
                    +1Y
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-5 px-1.5 text-[10px]"
                    onClick={() => handleApplyExpiryPreset(2)}
                  >
                    +2Y
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-5 px-1.5 text-[10px]"
                    onClick={() => handleApplyExpiryPreset(5)}
                  >
                    +5Y
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-5 px-1.5 text-[10px]"
                    onClick={() => handleApplyExpiryPreset(10)}
                  >
                    +10Y
                  </Button>
                </div>
              </div>

              <Button
                onClick={handleApprove}
                disabled={loading}
                className="w-full h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium gap-1.5 shadow-sm"
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                {t("approveAndMarkVerified")}
              </Button>
            </div>

            {/* Rejection Section */}
            <div className="space-y-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 dark:bg-amber-950/10">
              <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-semibold text-xs uppercase tracking-wider">
                <AlertTriangle className="h-4 w-4" />
                <span>{t("rejectAndRequestCorrection")}</span>
              </div>

              <div>
                <label className="text-xs font-medium text-foreground block mb-1.5">
                  {t("quickReasonPresets")}
                </label>
                <div className="flex flex-wrap gap-1 mb-2">
                  {REJECTION_REASONS.map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => handleAddRejectionChip(reason)}
                      className="text-[10px] px-2 py-0.5 rounded-full border border-border bg-background/80 hover:bg-muted text-foreground transition-colors"
                    >
                      {reason}
                    </button>
                  ))}
                </div>

                <Textarea
                  placeholder={t("rejectionReasonPlaceholder")}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={2}
                  className="text-xs bg-background resize-none"
                />
              </div>

              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={loading || !rejectionReason.trim()}
                className="w-full h-8 text-xs font-medium gap-1.5 bg-rose-600 hover:bg-rose-700 text-white shadow-sm"
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5" />
                )}
                {t("rejectDocument")}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
