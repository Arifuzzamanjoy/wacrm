"use client";

import { useState, useEffect } from "react";
import type { Contact, Case, CaseMemberRole, CaseStatus } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  Plus,
  Trash2,
  Search,
  FolderPlus,
  Link as LinkIcon,
  Loader2,
  User,
} from "lucide-react";

interface CreateCaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: Contact | null;
  onCaseCreated?: (createdCase: Case) => void;
  onCaseLinked?: () => void;
}

interface StagedMember {
  contact_id: string;
  contact_name: string;
  contact_phone: string;
  role: CaseMemberRole;
  label?: string;
}

const PRESET_CASE_TYPES = [
  "Visa Application",
  "Insurance Policy",
  "Property Deal",
  "Patient Case",
  "Student Enrollment",
  "Legal Case",
  "Campaign",
  "Booking",
  "Job Placement",
  "Other",
];

const CASE_ROLES: CaseMemberRole[] = [
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

export function CreateCaseDialog({
  open,
  onOpenChange,
  contact,
  onCaseCreated,
  onCaseLinked,
}: CreateCaseDialogProps) {
  const t = useTranslations("Cases");
  const { accountId } = useAuth();
  const [tab, setTab] = useState<"new" | "link">("new");

  // New Case form state
  const [title, setTitle] = useState("");
  const [caseTypePreset, setCaseTypePreset] = useState("Visa Application");
  const [customCaseType, setCustomCaseType] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<CaseStatus>("active");
  const [stagedMembers, setStagedMembers] = useState<StagedMember[]>([]);
  const [creating, setCreating] = useState(false);

  // Member search & add state
  const [contactSearchQuery, setContactSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Contact[]>([]);
  const [searchingContacts, setSearchingContacts] = useState(false);
  const [selectedSearchContact, setSelectedSearchContact] = useState<Contact | null>(null);
  const [selectedRole, setSelectedRole] = useState<CaseMemberRole>("spouse");
  const [selectedCustomLabel, setSelectedCustomLabel] = useState("");

  // Link to Existing state
  const [caseSearchQuery, setCaseSearchQuery] = useState("");
  const [caseSearchResults, setCaseSearchResults] = useState<Case[]>([]);
  const [searchingCases, setSearchingCases] = useState(false);
  const [selectedCaseToLink, setSelectedCaseToLink] = useState<Case | null>(null);
  const [linkRole, setLinkRole] = useState<CaseMemberRole>("spouse");
  const [linkCustomLabel, setLinkCustomLabel] = useState("");
  const [linking, setLinking] = useState(false);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setTitle(contact?.name ? `${contact.name} - Case` : "New Case");
      setCaseTypePreset("Visa Application");
      setCustomCaseType("");
      setDescription("");
      setStatus("active");
      setStagedMembers([]);
      setContactSearchQuery("");
      setSearchResults([]);
      setSelectedSearchContact(null);
      setSelectedRole("spouse");
      setSelectedCustomLabel("");
      setCaseSearchQuery("");
      setCaseSearchResults([]);
      setSelectedCaseToLink(null);
      setLinkRole("spouse");
      setLinkCustomLabel("");
    }
  }, [open, contact]);

  // Search contacts for adding members
  useEffect(() => {
    if (!contactSearchQuery.trim() || !accountId) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingContacts(true);
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("contacts")
          .select("id, name, phone, email, avatar_url, company, account_id, created_at, updated_at")
          .eq("account_id", accountId)
          .neq("id", contact?.id || "")
          .or(`name.ilike.%${contactSearchQuery.trim()}%,phone.ilike.%${contactSearchQuery.trim()}%`)
          .limit(5);

        if (!error && data) {
          setSearchResults(data as Contact[]);
        }
      } catch (err) {
        console.error("Error searching contacts:", err);
      } finally {
        setSearchingContacts(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [contactSearchQuery, accountId, contact?.id]);

  // Search existing cases
  useEffect(() => {
    if (!caseSearchQuery.trim() || !accountId) {
      setCaseSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingCases(true);
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("cases")
          .select(`
            *,
            primary_contact:contacts!cases_primary_contact_id_fkey(*),
            members:case_members(
              *,
              contact:contacts(*)
            )
          `)
          .eq("account_id", accountId)
          .or(`case_number.ilike.%${caseSearchQuery.trim()}%,title.ilike.%${caseSearchQuery.trim()}%`)
          .limit(5);

        if (!error && data) {
          setCaseSearchResults(data as Case[]);
        }
      } catch (err) {
        console.error("Error searching cases:", err);
      } finally {
        setSearchingCases(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [caseSearchQuery, accountId]);

  const handleAddStagedMember = () => {
    if (!selectedSearchContact) return;
    if (stagedMembers.some((m) => m.contact_id === selectedSearchContact.id)) {
      toast.info(t("toastMemberAlreadyAdded"));
      return;
    }
    setStagedMembers((prev) => [
      ...prev,
      {
        contact_id: selectedSearchContact.id,
        contact_name: selectedSearchContact.name || selectedSearchContact.phone,
        contact_phone: selectedSearchContact.phone,
        role: selectedRole,
        label: selectedCustomLabel.trim() || undefined,
      },
    ]);
    setSelectedSearchContact(null);
    setContactSearchQuery("");
    setSelectedCustomLabel("");
  };

  const handleRemoveStagedMember = (contactId: string) => {
    setStagedMembers((prev) => prev.filter((m) => m.contact_id !== contactId));
  };

  const handleCreateCase = async () => {
    if (!contact) return;
    const finalCaseType =
      caseTypePreset === "Other" ? customCaseType.trim() : caseTypePreset;

    if (!title.trim()) {
      toast.error(t("toastTitleRequired"));
      return;
    }
    if (!finalCaseType) {
      toast.error(t("toastTypeRequired"));
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          case_type: finalCaseType,
          primary_contact_id: contact.id,
          description: description.trim() || undefined,
          status,
          additional_members: stagedMembers.map((m) => ({
            contact_id: m.contact_id,
            role: m.role,
            label: m.label,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create case");
      }

      toast.success(t("caseCreated"));
      onCaseCreated?.(data.case);
      onOpenChange(false);
    } catch (err) {
      console.error("Create case error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to create case");
    } finally {
      setCreating(false);
    }
  };

  const handleLinkToCase = async () => {
    if (!contact || !selectedCaseToLink) return;

    setLinking(true);
    try {
      const res = await fetch(`/api/cases/${selectedCaseToLink.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: contact.id,
          role: linkRole,
          label: linkCustomLabel.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to link contact to case");
      }

      toast.success(t("memberAdded"));
      onCaseLinked?.();
      onOpenChange(false);
    } catch (err) {
      console.error("Link case error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to link to case");
    } finally {
      setLinking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px] max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden bg-card border-border">
        <DialogHeader className="p-4 pb-3 border-b border-border">
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <FolderPlus className="h-4 w-4 text-primary" />
            {t("title")}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {t("createFirst")}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "new" | "link")}
          className="flex-1 flex flex-col min-h-0"
        >
          <div className="px-4 pt-3">
            <TabsList className="grid w-full grid-cols-2 bg-muted/60">
              <TabsTrigger value="new" className="text-xs flex items-center gap-1.5">
                <FolderPlus className="h-3.5 w-3.5" />
                {t("newCase")}
              </TabsTrigger>
              <TabsTrigger value="link" className="text-xs flex items-center gap-1.5">
                <LinkIcon className="h-3.5 w-3.5" />
                {t("linkToExisting")}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* TAB 1: NEW CASE */}
          <TabsContent value="new" className="flex-1 overflow-y-auto p-4 space-y-3.5 m-0">
            {/* Title */}
            <div className="space-y-1">
              <Label className="text-xs font-medium text-foreground">
                {t("caseTitle")} <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="e.g. Khan Family - Canada PR"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-8 text-xs bg-muted/50 border-border"
              />
            </div>

            {/* Case Type & Status in 2 columns */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium text-foreground">
                  {t("caseType")} <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={caseTypePreset}
                  onValueChange={(v) => {
                    if (v) setCaseTypePreset(v);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs bg-muted/50 border-border">
                    <SelectValue placeholder={t("caseType")} />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border text-popover-foreground">
                    {PRESET_CASE_TYPES.map((type) => (
                      <SelectItem key={type} value={type} className="text-xs">
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {caseTypePreset === "Other" && (
                  <Input
                    placeholder="Custom case type"
                    value={customCaseType}
                    onChange={(e) => setCustomCaseType(e.target.value)}
                    className="h-8 text-xs bg-muted/50 border-border mt-1.5"
                  />
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium text-foreground">
                  {t("status")}
                </Label>
                <Select
                  value={status}
                  onValueChange={(v) => {
                    if (v) setStatus(v as CaseStatus);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs bg-muted/50 border-border">
                    <SelectValue placeholder={t("status")} />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border text-popover-foreground">
                    {CASE_STATUSES.map((st) => (
                      <SelectItem key={st} value={st} className="text-xs">
                        {t(`caseStatuses.${st}` as `caseStatuses.${CaseStatus}`) || st}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Primary Contact */}
            <div className="space-y-1">
              <Label className="text-xs font-medium text-foreground">
                {t("primaryContact")}
              </Label>
              <div className="flex items-center gap-2 rounded-md bg-muted/40 border border-border px-2.5 py-1.5 text-xs text-foreground">
                <User className="h-3.5 w-3.5 text-primary" />
                <span className="font-medium">{contact?.name || contact?.phone}</span>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {t("memberRoles.primary")}
                </span>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1">
              <Label className="text-xs font-medium text-foreground">
                {t("description")}
              </Label>
              <Textarea
                placeholder="Optional case notes or goals..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="text-xs bg-muted/50 border-border resize-none"
              />
            </div>

            {/* Staged Members Section */}
            <div className="space-y-2 pt-2 border-t border-border/60">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-foreground">
                  {t("members")} ({stagedMembers.length + 1})
                </Label>
              </div>

              {/* Add member sub-card */}
              <div className="rounded-lg border border-border/80 bg-muted/20 p-2.5 space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search contact by name or phone..."
                    value={contactSearchQuery}
                    onChange={(e) => setContactSearchQuery(e.target.value)}
                    className="h-7 pl-8 text-xs bg-background border-border"
                  />
                  {searchingContacts && (
                    <Loader2 className="absolute right-2.5 top-2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  )}
                </div>

                {/* Search dropdown results */}
                {searchResults.length > 0 && !selectedSearchContact && (
                  <div className="rounded-md border border-border bg-popover shadow-md overflow-hidden max-h-36 overflow-y-auto">
                    {searchResults.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSelectedSearchContact(c);
                          setContactSearchQuery(c.name || c.phone);
                        }}
                        className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-muted/80 flex items-center justify-between transition-colors border-b border-border/40 last:border-0"
                      >
                        <span className="font-medium text-foreground truncate">
                          {c.name || "Unnamed"}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {c.phone}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {selectedSearchContact && (
                  <div className="flex items-center justify-between bg-primary/10 rounded px-2 py-1 text-xs text-primary border border-primary/20">
                    <span>Selected: {selectedSearchContact.name || selectedSearchContact.phone}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 px-1 text-[10px] text-destructive hover:bg-transparent"
                      onClick={() => {
                        setSelectedSearchContact(null);
                        setContactSearchQuery("");
                      }}
                    >
                      Clear
                    </Button>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <Select
                    value={selectedRole}
                    onValueChange={(v) => {
                      if (v) setSelectedRole(v as CaseMemberRole);
                    }}
                  >
                    <SelectTrigger className="h-7 text-xs bg-background border-border">
                      <SelectValue placeholder={t("role")} />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border text-popover-foreground">
                      {CASE_ROLES.map((r) => (
                        <SelectItem key={r} value={r} className="text-xs">
                          {t(`memberRoles.${r}` as `memberRoles.${CaseMemberRole}`) || r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Input
                    placeholder={t("customLabel") + " (e.g. Spouse)"}
                    value={selectedCustomLabel}
                    onChange={(e) => setSelectedCustomLabel(e.target.value)}
                    className="h-7 text-xs bg-background border-border"
                  />
                </div>

                <Button
                  size="sm"
                  type="button"
                  variant="secondary"
                  className="w-full h-7 text-xs flex items-center justify-center gap-1.5"
                  disabled={!selectedSearchContact}
                  onClick={handleAddStagedMember}
                >
                  <Plus className="h-3 w-3" />
                  {t("addMember")}
                </Button>
              </div>

              {/* List of staged members */}
              {stagedMembers.length > 0 && (
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {stagedMembers.map((m) => (
                    <div
                      key={m.contact_id}
                      className="flex items-center justify-between gap-2 rounded bg-muted/40 border border-border/60 px-2.5 py-1 text-xs"
                    >
                      <div className="min-w-0 flex-1 truncate">
                        <span className="font-medium text-foreground">{m.contact_name}</span>
                        <span className="text-muted-foreground text-[10px] ml-1.5">
                          ({t(`memberRoles.${m.role}` as `memberRoles.${CaseMemberRole}`) || m.role}
                          {m.label ? ` - ${m.label}` : ""})
                        </span>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemoveStagedMember(m.contact_id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* TAB 2: LINK TO EXISTING CASE */}
          <TabsContent value="link" className="flex-1 overflow-y-auto p-4 space-y-3.5 m-0">
            <div className="space-y-1">
              <Label className="text-xs font-medium text-foreground">
                Search Case (by Case # or Title)
              </Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="e.g. CASE-2026-0001 or Khan Family..."
                  value={caseSearchQuery}
                  onChange={(e) => setCaseSearchQuery(e.target.value)}
                  className="h-8 pl-8 text-xs bg-muted/50 border-border"
                />
                {searchingCases && (
                  <Loader2 className="absolute right-2.5 top-2.5 h-3.5 w-3.5 animate-spin text-muted-foreground" />
                )}
              </div>
            </div>

            {/* Case search results list */}
            {caseSearchResults.length > 0 && !selectedCaseToLink && (
              <div className="rounded-lg border border-border bg-card divide-y divide-border/60 max-h-48 overflow-y-auto">
                {caseSearchResults.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelectedCaseToLink(c);
                      setCaseSearchQuery("");
                    }}
                    className="w-full text-left p-2.5 hover:bg-muted/60 transition-colors flex flex-col gap-0.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-foreground">{c.title}</span>
                      <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {c.case_number}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>Type: {c.case_type}</span>
                      <span>•</span>
                      <span>Primary: {c.primary_contact?.name || "Unknown"}</span>
                      <span>•</span>
                      <span>{c.members?.length || 1} members</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Selected case preview card */}
            {selectedCaseToLink && (
              <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <span className="font-semibold text-xs text-foreground block truncate">
                      {selectedCaseToLink.title}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {selectedCaseToLink.case_number} • {selectedCaseToLink.case_type}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5 text-[10px] text-destructive hover:bg-transparent"
                    onClick={() => setSelectedCaseToLink(null)}
                  >
                    Change
                  </Button>
                </div>

                <div className="text-[11px] text-muted-foreground">
                  Primary Contact: <strong className="text-foreground">{selectedCaseToLink.primary_contact?.name || "Unknown"}</strong>
                </div>

                <div className="border-t border-border/60 pt-2 grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-medium text-foreground">
                      {t("role")} for {contact?.name || "Contact"}
                    </Label>
                    <Select
                      value={linkRole}
                      onValueChange={(v) => {
                        if (v) setLinkRole(v as CaseMemberRole);
                      }}
                    >
                      <SelectTrigger className="h-7 text-xs bg-background border-border">
                        <SelectValue placeholder={t("role")} />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border text-popover-foreground">
                        {CASE_ROLES.map((r) => (
                          <SelectItem key={r} value={r} className="text-xs">
                            {t(`memberRoles.${r}` as `memberRoles.${CaseMemberRole}`) || r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] font-medium text-foreground">
                      {t("customLabel")}
                    </Label>
                    <Input
                      placeholder="e.g. Spouse / Child"
                      value={linkCustomLabel}
                      onChange={(e) => setLinkCustomLabel(e.target.value)}
                      className="h-7 text-xs bg-background border-border"
                    />
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          <DialogFooter className="p-3 border-t border-border bg-muted/20">
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-8"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>

            {tab === "new" ? (
              <Button
                size="sm"
                className="text-xs h-8 bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={creating || !title.trim()}
                onClick={handleCreateCase}
              >
                {creating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <Plus className="h-3.5 w-3.5 mr-1" />
                )}
                {t("newCase")}
              </Button>
            ) : (
              <Button
                size="sm"
                className="text-xs h-8 bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={linking || !selectedCaseToLink}
                onClick={handleLinkToCase}
              >
                {linking ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <LinkIcon className="h-3.5 w-3.5 mr-1" />
                )}
                {t("linkToExisting")}
              </Button>
            )}
          </DialogFooter>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
