"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type {
  Contact,
  ContactDocument,
  ChecklistTemplate,
  CaseMemberRole,
} from "@/types";
import {
  FileCheck2,
  Plus,
  Send,
  CheckCircle2,
  Clock,
  XCircle,
  HelpCircle,
  Trash2,
  Eye,
  Pencil,
  ChevronDown,
  Layers,
  Sparkles,
  Loader2,
  Calendar,
  Users,
  MinusCircle,
  Info,
} from "lucide-react";
import { getRoleIcon } from "@/components/cases/case-member-card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { differenceInDays, parseISO, isPast } from "date-fns";
import { generateWhatsAppDocumentChaser } from "@/lib/checklists/checklist-formatter";
import { getIndustryMeta, sortIndustriesForAccount } from "@/lib/checklists/industries";
import { detectChecklistDrift } from "@/lib/checklists/drift";
import { DocumentVerificationDialog } from "./document-verification-dialog";
import { useTranslations } from "next-intl";

interface DocumentChecklistSidebarProps {
  contact: Contact | null;
  initialContact?: Contact | null;
  onPrefillReminder?: (text: string) => void;
}

export function DocumentChecklistSidebar({
  contact,
  initialContact,
  onPrefillReminder,
}: DocumentChecklistSidebarProps) {
  const t = useTranslations("Inbox.checklist");
  const tCases = useTranslations("Cases");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(initialContact || contact);
  const targetContact = selectedContact || contact;

  const [documents, setDocuments] = useState<ContactDocument[]>([]);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [accountIndustry, setAccountIndustry] = useState<string | null>(null);
  const [caseMembers, setCaseMembers] = useState<
    { contact_id: string; contact?: Contact | null; role: string; label?: string | null }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  // Sync selected contact when initialContact or contact prop changes
  useEffect(() => {
    if (initialContact) {
      setSelectedContact(initialContact);
    } else {
      setSelectedContact(contact);
    }
  }, [initialContact, contact]);

  // Fetch cases to populate member switcher
  useEffect(() => {
    if (!contact) {
      setCaseMembers([]);
      return;
    }
    const currentContactId = contact.id;
    const currentContactObj = contact;
    let cancelled = false;

    async function loadCaseMembers() {
      try {
        const res = await fetch(`/api/cases?contact_id=${currentContactId}`);
        const data = await res.json();
        if (!cancelled && res.ok && Array.isArray(data.cases)) {
          const membersMap = new Map<
            string,
            { contact_id: string; contact?: Contact | null; role: string; label?: string | null }
          >();

          // Always ensure current contact is in the list
          membersMap.set(currentContactId, {
            contact_id: currentContactId,
            contact: currentContactObj,
            role: "primary",
            label: "Current Contact",
          });

          // Add all members from all cases
          for (const c of data.cases) {
            if (c.primary_contact && !membersMap.has(c.primary_contact.id)) {
              membersMap.set(c.primary_contact.id, {
                contact_id: c.primary_contact.id,
                contact: c.primary_contact,
                role: "primary",
              });
            }
            if (Array.isArray(c.members)) {
              for (const m of c.members) {
                if (m.contact && !membersMap.has(m.contact_id)) {
                  membersMap.set(m.contact_id, {
                    contact_id: m.contact_id,
                    contact: m.contact,
                    role: m.role,
                    label: m.label,
                  });
                }
              }
            }
          }
          setCaseMembers(Array.from(membersMap.values()));
        }
      } catch (err) {
        console.error("Failed to load case members for checklist:", err);
      }
    }
    loadCaseMembers();
    return () => {
      cancelled = true;
    };
  }, [contact]);

  // Modals & Active items
  const [verificationDoc, setVerificationDoc] = useState<ContactDocument | null>(null);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [customDocOpen, setCustomDocOpen] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [customDesc, setCustomDesc] = useState("");
  const [customMandatory, setCustomMandatory] = useState(true);
  const [creatingCustom, setCreatingCustom] = useState(false);

  // Edit document label modal
  const [editDoc, setEditDoc] = useState<ContactDocument | null>(null);
  const [editDocOpen, setEditDocOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editMandatory, setEditMandatory] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);

  // Filter state
  const [filter, setFilter] = useState<"all" | "pending" | "verified" | "missing">("all");

  // Load templates on mount
  useEffect(() => {
    let cancelled = false;
    async function loadTemplates() {
      try {
        const res = await fetch("/api/checklist-templates");
        const data = await res.json();
        if (!cancelled && res.ok && data.templates) {
          setTemplates(data.templates);
          setAccountIndustry(data.accountIndustry ?? null);
          if (data.templates.length > 0) {
            setSelectedTemplateId((prev) => prev || data.templates[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to load checklist templates", err);
      }
    }
    loadTemplates();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch documents for target contact
  const fetchDocuments = useCallback(async () => {
    if (!targetContact) {
      setDocuments([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/contacts/${targetContact.id}/documents`);
      const data = await res.json();
      if (res.ok && data.documents) {
        setDocuments(data.documents);
      }
    } catch (err) {
      console.error("Failed to fetch documents", err);
    } finally {
      setLoading(false);
    }
  }, [targetContact]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Listen to global document update events
  useEffect(() => {
    const handleDocumentUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ contactId?: string }>;
      if (!customEvent.detail?.contactId || customEvent.detail.contactId === targetContact?.id) {
        fetchDocuments();
      }
    };
    window.addEventListener("wacrm:documents-updated", handleDocumentUpdate);
    return () => {
      window.removeEventListener("wacrm:documents-updated", handleDocumentUpdate);
    };
  }, [targetContact?.id, fetchDocuments]);

  // Progress metrics
  const totalDocs = documents.length;
  /**
   * Waived requirements don't apply to this client, so counting them in
   * the denominator would cap the bar below 100% no matter what the
   * client sends. They stay visible in the list, just not in the maths.
   */
  const applicableDocs = useMemo(
    () => documents.filter((d) => d.status !== "waived"),
    [documents]
  );
  const verifiedDocs = useMemo(
    () => documents.filter((d) => d.status === "verified"),
    [documents]
  );
  const submittedDocs = useMemo(
    () => documents.filter((d) => d.status === "submitted"),
    [documents]
  );
  const rejectedDocs = useMemo(
    () => documents.filter((d) => d.status === "rejected"),
    [documents]
  );
  const missingDocs = useMemo(
    () => documents.filter((d) => d.status === "missing"),
    [documents]
  );

  const progressPercent =
    applicableDocs.length > 0
      ? Math.round((verifiedDocs.length / applicableDocs.length) * 100)
      : 0;

  /**
   * The checklist these documents belong to. Falls back to the label of
   * whichever template is selected, then to a vertical-neutral default —
   * this used to hardcode "Visa Application".
   */
  const activeCategory =
    documents[0]?.category ||
    templates.find((tpl) => tpl.id === selectedTemplateId)?.category ||
    "Client Onboarding";

  /** Vertical of the selected template, used for reminder wording. */
  const activeIndustry =
    templates.find((tpl) => tpl.id === selectedTemplateId)?.industry ??
    accountIndustry;

  /**
   * Templates grouped by vertical for the picker, with the agency's own
   * industry floated to the top so an immigration consultancy still sees
   * visa templates first while a marketing agency sees its own.
   */
  /**
   * Whether the template this checklist was stamped from has since
   * gained requirements. Read-only notice — the agent decides per
   * contact whether to add them, because these rows carry verification
   * state that must not be rewritten behind their back.
   */
  const drift = useMemo(
    () => detectChecklistDrift(documents, templates),
    [documents, templates]
  );

  const templatesByIndustry = useMemo(() => {
    const groups = new Map<string, ChecklistTemplate[]>();
    for (const tpl of templates) {
      const key = (tpl.industry as string) || "general";
      const bucket = groups.get(key);
      if (bucket) bucket.push(tpl);
      else groups.set(key, [tpl]);
    }
    return sortIndustriesForAccount([...groups.keys()], accountIndustry).map(
      (industry) => ({
        industry,
        meta: getIndustryMeta(industry),
        templates: groups.get(industry) ?? [],
      })
    );
  }, [templates, accountIndustry]);

  // Filtered documents
  const filteredDocuments = useMemo(() => {
    if (filter === "pending") {
      return documents.filter((d) => d.status === "submitted" || d.status === "rejected");
    }
    if (filter === "verified") {
      return documents.filter((d) => d.status === "verified");
    }
    if (filter === "missing") {
      return documents.filter((d) => d.status === "missing");
    }
    return documents;
  }, [documents, filter]);

  // Actions
  const handleApplyTemplate = async (templateIdToApply: string) => {
    if (!targetContact || !templateIdToApply) return;
    setApplyingTemplate(true);
    try {
      const res = await fetch(`/api/contacts/${targetContact.id}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: templateIdToApply }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to apply template");

      toast.success(t("templateAppliedSuccess"));
      fetchDocuments();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error applying template");
    } finally {
      setApplyingTemplate(false);
    }
  };

  const handleCreateCustom = async () => {
    if (!targetContact || !customTitle.trim()) return;
    setCreatingCustom(true);
    try {
      const res = await fetch(`/api/contacts/${targetContact.id}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: customTitle.trim(),
          category: customCategory.trim() || activeCategory,
          description: customDesc.trim() || undefined,
          is_mandatory: customMandatory,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create document");

      toast.success(t("customDocAdded"));
      setCustomDocOpen(false);
      setCustomTitle("");
      setCustomDesc("");
      fetchDocuments();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error creating document");
    } finally {
      setCreatingCustom(false);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!targetContact) return;
    try {
      const res = await fetch(`/api/contacts/${targetContact.id}/documents?documentId=${docId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete document");
      toast.success(t("docDeleted"));
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    } catch {
      toast.error("Could not delete item");
    }
  };

  /**
   * Toggle a requirement between `waived` ("not applicable to this
   * client") and `missing`. Waived items are excluded from the progress
   * denominator and from the WhatsApp chaser, so an agency can retire a
   * requirement that doesn't apply without it nagging forever.
   */
  const handleToggleWaived = async (doc: ContactDocument) => {
    if (!targetContact) return;
    const nextStatus = doc.status === "waived" ? "missing" : "waived";
    try {
      const res = await fetch(`/api/contacts/${targetContact.id}/documents`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: doc.id, status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update document");

      setDocuments((prev) =>
        prev.map((d) => (d.id === doc.id ? { ...d, ...data.document } : d))
      );
      if (nextStatus === "waived") {
        toast.success(t("waivedSuccess", { title: doc.title }));
      } else {
        toast.success(t("docUpdated"));
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not update requirement"
      );
    }
  };

  const handleOpenReview = (doc: ContactDocument) => {
    setVerificationDoc(doc);
    setVerificationOpen(true);
  };

  const handleOpenEdit = (doc: ContactDocument) => {
    setEditDoc(doc);
    setEditTitle(doc.title);
    setEditDesc(doc.description || "");
    setEditMandatory(doc.is_mandatory);
    setEditDocOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!targetContact || !editDoc || !editTitle.trim()) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/contacts/${targetContact.id}/documents`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editDoc.id,
          title: editTitle.trim(),
          description: editDesc.trim() || null,
          is_mandatory: editMandatory,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update document");

      toast.success(t("docUpdated"));
      setDocuments((prev) => prev.map((d) => (d.id === editDoc.id ? data.document : d)));
      setEditDocOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error updating document");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSendReminder = () => {
    if (!targetContact || documents.length === 0) return;

    const chaserText = generateWhatsAppDocumentChaser({
      contactName: targetContact.name || undefined,
      category: activeCategory,
      industry: activeIndustry,
      documents,
    });

    if (onPrefillReminder) {
      onPrefillReminder(chaserText);
    }

    // Also dispatch event for MessageComposer to catch directly
    window.dispatchEvent(
      new CustomEvent("wacrm:prefill-composer", {
        detail: { text: chaserText },
      })
    );

    toast.success(t("reminderPrefilledToast"));
  };

  if (!contact) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
        {t("selectContactFirst")}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card">
      {/* Case Member Switcher Banner */}
      {caseMembers.length > 1 && (
        <div className="border-b border-border bg-muted/40 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Users className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-[11px] font-medium text-muted-foreground truncate">
                {tCases("viewingDocsFor")}:
              </span>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center justify-between h-6 text-[11px] gap-1 max-w-[180px] truncate bg-background border border-border rounded-md px-2 hover:bg-muted cursor-pointer">
                <span className="truncate">
                  {targetContact?.name || targetContact?.phone}
                </span>
                <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-popover border-border">
                {caseMembers.map((cm) => (
                  <DropdownMenuItem
                    key={cm.contact_id}
                    onClick={() => cm.contact && setSelectedContact(cm.contact)}
                    className="flex items-center justify-between text-xs cursor-pointer"
                  >
                    <div className="flex items-center gap-2 truncate">
                      {getRoleIcon(cm.role)}
                      <span className="truncate font-medium">
                        {cm.contact?.name || cm.contact?.phone}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground capitalize ml-2">
                      {cm.label || tCases(`memberRoles.${cm.role}` as `memberRoles.${CaseMemberRole}`) || cm.role}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      {/* Top Header & Metrics */}
      <div className="border-b border-border p-3 space-y-3 bg-muted/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <Layers className="h-4 w-4 text-primary shrink-0" />
            <span className="text-xs font-semibold text-foreground truncate">
              {totalDocs > 0 ? activeCategory : t("visaChecklist")}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[11px] gap-1"
              onClick={() => {
                setCustomCategory(activeCategory);
                setCustomDocOpen(true);
              }}
            >
              <Plus className="h-3 w-3" />
              {t("addDocBtn")}
            </Button>
          </div>
        </div>

        {/* Template-drift notice. Informational only: it names what the
            template gained and leaves the decision to the agent, who
            adds any that apply via "Add Doc" above. Nothing here
            rewrites the client's existing requirements. */}
        {drift.hasDrifted && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2">
            <div className="flex items-start gap-1.5">
              <Info className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                  {t("templateUpdated", {
                    count: drift.newRequirements.length,
                  })}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {drift.newRequirements.join(", ")}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground/80">
                  {t("templateUpdatedHint")}
                </p>
              </div>
            </div>
          </div>
        )}

        {totalDocs > 0 && (
          <div className="space-y-1.5">
            {/* Progress Bar */}
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-medium text-muted-foreground">{t("completionProgress")}</span>
              <span className="font-bold text-foreground font-mono">{progressPercent}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-emerald-500 transition-all duration-300 ease-in-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Status Breakdown Pills */}
            <div className="flex flex-wrap gap-1 pt-1">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${
                  filter === "all"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {t("allCount", { count: totalDocs })}
              </button>
              <button
                type="button"
                onClick={() => setFilter("pending")}
                className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${
                  filter === "pending"
                    ? "bg-amber-500 text-white"
                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20"
                }`}
              >
                {t("reviewCount", { count: submittedDocs.length + rejectedDocs.length })}
              </button>
              <button
                type="button"
                onClick={() => setFilter("verified")}
                className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${
                  filter === "verified"
                    ? "bg-emerald-600 text-white"
                    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
                }`}
              >
                {t("verifiedCount", { count: verifiedDocs.length })}
              </button>
              <button
                type="button"
                onClick={() => setFilter("missing")}
                className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${
                  filter === "missing"
                    ? "bg-slate-600 text-white"
                    : "bg-slate-500/10 text-slate-600 dark:text-slate-400 hover:bg-slate-500/20"
                }`}
              >
                {t("missingCount", { count: missingDocs.length })}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Checklist Body */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-2.5">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : totalDocs === 0 ? (
            /* Empty state: Select and apply template */
            <div className="space-y-4 rounded-xl border border-dashed border-border p-4 text-center bg-muted/10">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <FileCheck2 className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-foreground">
                  {t("noDocumentsAssigned")}
                </h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {t("applyTemplateHint")}
                </p>
              </div>

              <div className="space-y-2">
                {/* Grouped by vertical so an agency sees its own industry's
                    checklists first, with every other vertical still
                    reachable in the same picker. */}
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                >
                  <option value="" disabled>
                    {t("selectPresetStream")}
                  </option>
                  {templatesByIndustry.map(({ industry, meta, templates: group }) => (
                    <optgroup
                      key={industry}
                      label={`${meta.emoji} ${meta.label}`}
                    >
                      {group.map((tmpl) => (
                        <option key={tmpl.id} value={tmpl.id}>
                          {tmpl.region_code ? `[${tmpl.region_code}] ` : ""}
                          {tmpl.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>

                <Button
                  onClick={() => handleApplyTemplate(selectedTemplateId)}
                  disabled={applyingTemplate || !selectedTemplateId}
                  className="w-full h-8 text-xs bg-primary hover:bg-primary/90 font-medium"
                >
                  {applyingTemplate ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  {t("applyTemplateBtn")}
                </Button>
              </div>
            </div>
          ) : (
            /* Document Cards List */
            filteredDocuments.map((doc) => {
              // Expiry check
              let expiryAlert = null;
              if (doc.expiry_date) {
                const exp = parseISO(doc.expiry_date);
                if (isPast(exp)) {
                  expiryAlert = "expired";
                } else if (differenceInDays(exp, new Date()) <= 30) {
                  expiryAlert = "expiring_soon";
                }
              }

              return (
                <div
                  key={doc.id}
                  className="group relative rounded-lg border border-border bg-card p-2.5 shadow-xs transition-all hover:border-border/80 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold text-foreground leading-snug">
                          {doc.title}
                        </span>
                        {doc.is_mandatory ? (
                          <span className="text-red-500 font-bold text-[10px]" title="Mandatory">
                            *
                          </span>
                        ) : (
                          <span className="text-[9px] text-muted-foreground uppercase font-mono">
                            ({t("optionalSmall")})
                          </span>
                        )}
                      </div>

                      {doc.description && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                          {doc.description}
                        </p>
                      )}
                    </div>

                    {/* Quick Menu */}
                    <DropdownMenu>
                      <DropdownMenuTrigger className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity">
                        <ChevronDown className="h-3.5 w-3.5" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="text-xs">
                        <DropdownMenuItem onClick={() => handleOpenReview(doc)}>
                          <Eye className="h-3.5 w-3.5 mr-1.5" />
                          {t("reviewInspect")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleOpenEdit(doc)}>
                          <Pencil className="h-3.5 w-3.5 mr-1.5" />
                          {t("editLabel")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggleWaived(doc)}>
                          <MinusCircle className="h-3.5 w-3.5 mr-1.5" />
                          {doc.status === "waived" ? t("unwaive") : t("markWaived")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDeleteDocument(doc.id)}
                          className="text-rose-600 focus:text-rose-600"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                          {t("deleteItem")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Status Badge & Actions Row */}
                  <div className="mt-2.5 flex items-center justify-between gap-2 pt-1 border-t border-border/50">
                    <div className="flex items-center gap-1">
                      {doc.status === "verified" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />
                          {t("verified")}
                        </span>
                      )}
                      {doc.status === "submitted" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                          <Clock className="h-3 w-3" />
                          {t("underReview")}
                        </span>
                      )}
                      {doc.status === "rejected" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                          <XCircle className="h-3 w-3" />
                          {t("needsReupload")}
                        </span>
                      )}
                      {doc.status === "missing" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          <HelpCircle className="h-3 w-3" />
                          {t("missing")}
                        </span>
                      )}
                      {doc.status === "waived" && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-400"
                          title={t("waivedHint")}
                        >
                          <MinusCircle className="h-3 w-3" />
                          {t("waived")}
                        </span>
                      )}

                      {/* Expiry Pill */}
                      {doc.expiry_date && (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-mono ${
                            expiryAlert === "expired"
                              ? "bg-rose-500/15 text-rose-600 font-bold"
                              : expiryAlert === "expiring_soon"
                              ? "bg-amber-500/15 text-amber-600 font-bold"
                              : "bg-muted text-muted-foreground"
                          }`}
                          title={`Expiry: ${doc.expiry_date}`}
                        >
                          <Calendar className="h-2.5 w-2.5" />
                          {doc.expiry_date}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-6 px-2 text-[10px] font-medium gap-1"
                        onClick={() => handleOpenReview(doc)}
                      >
                        {doc.file_url ? (
                          <>
                            <Eye className="h-3 w-3" />
                            {doc.status === "submitted" ? t("review") : t("view")}
                          </>
                        ) : (
                          t("details")
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Rejection Note Display */}
                  {doc.status === "rejected" && doc.rejection_reason && (
                    <div className="mt-2 rounded bg-rose-500/10 p-1.5 text-[10px] text-rose-600 dark:text-rose-400 border border-rose-500/20">
                      <span className="font-semibold">{t("reason")}:</span> {doc.rejection_reason}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Sticky Footer: 1-Click WhatsApp Chaser Dispatch */}
      {totalDocs > 0 && (
        <div className="border-t border-border p-3 bg-muted/20 space-y-2">
          <Button
            onClick={handleSendReminder}
            className="w-full h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-2 shadow-sm transition-all"
          >
            <Send className="h-3.5 w-3.5" />
            <span>{t("sendWhatsAppReminderBtn")}</span>
            {(missingDocs.length > 0 || rejectedDocs.length > 0) && (
              <span className="ml-auto rounded-full bg-white/20 px-1.5 py-0.2 text-[10px] font-bold">
                {missingDocs.length + rejectedDocs.length}
              </span>
            )}
          </Button>
        </div>
      )}

      {/* Document Verification & Review Dialog */}
      <DocumentVerificationDialog
        open={verificationOpen}
        onOpenChange={setVerificationOpen}
        document={verificationDoc}
        contact={contact}
        onUpdate={(updated) => {
          setDocuments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
        }}
      />

      {/* Add Custom Document Dialog */}
      <Dialog open={customDocOpen} onOpenChange={setCustomDocOpen}>
        <DialogContent className="sm:max-w-md bg-background border-border">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">{t("addCustomDocTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                {t("documentTitleLabel")} *
              </label>
              <Input
                placeholder={t("docTitlePlaceholder")}
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                className="text-xs h-8"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                {t("categoryLabel")}
              </label>
              <Input
                placeholder={t("categoryPlaceholder")}
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                className="text-xs h-8"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                {t("instructionsGuidelineLabel")}
              </label>
              <Textarea
                placeholder={t("guidelinePlaceholder")}
                value={customDesc}
                onChange={(e) => setCustomDesc(e.target.value)}
                rows={2}
                className="text-xs resize-none"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="is-mandatory"
                checked={customMandatory}
                onCheckedChange={(checked) => setCustomMandatory(!!checked)}
              />
              <label htmlFor="is-mandatory" className="text-xs font-medium text-foreground cursor-pointer">
                {t("mandatoryRequirement")}
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-8"
              onClick={() => setCustomDocOpen(false)}
            >
              {t("cancel")}
            </Button>
            <Button
              size="sm"
              className="text-xs h-8 bg-primary hover:bg-primary/90"
              onClick={handleCreateCustom}
              disabled={creatingCustom || !customTitle.trim()}
            >
              {creatingCustom ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              {t("addDocument")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Document Label Dialog */}
      <Dialog open={editDocOpen} onOpenChange={setEditDocOpen}>
        <DialogContent className="sm:max-w-md bg-background border-border">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">{t("editDocument")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                {t("documentTitleLabel")} *
              </label>
              <Input
                placeholder={t("docTitlePlaceholder")}
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="text-xs h-8"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                {t("instructionsGuidelineLabel")}
              </label>
              <Textarea
                placeholder={t("guidelinePlaceholder")}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={2}
                className="text-xs resize-none"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="edit-is-mandatory"
                checked={editMandatory}
                onCheckedChange={(checked) => setEditMandatory(!!checked)}
              />
              <label htmlFor="edit-is-mandatory" className="text-xs font-medium text-foreground cursor-pointer">
                {t("mandatoryRequirement")}
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-8"
              onClick={() => setEditDocOpen(false)}
            >
              {t("cancel")}
            </Button>
            <Button
              size="sm"
              className="text-xs h-8 bg-primary hover:bg-primary/90"
              onClick={handleSaveEdit}
              disabled={savingEdit || !editTitle.trim()}
            >
              {savingEdit ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              {t("saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
