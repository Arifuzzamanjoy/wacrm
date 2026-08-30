"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import type { Contact, Deal, ContactNote, Tag } from "@/types";
import {
  Phone,
  Mail,
  Copy,
  Check,
  Tag as TagIcon,
  DollarSign,
  StickyNote,
  Plus,
  FileCheck,
  UserCircle2,
  Calculator,
  FolderKanban,
  PanelRightClose,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { format } from "date-fns";
import { useTranslations } from "next-intl";
import { DocumentChecklistSidebar } from "./document-checklist-sidebar";
import { CRSCalculatorSidebar } from "./crs-calculator-sidebar";
import { CaseGroupWidget } from "@/components/cases/case-group-widget";

interface ContactSidebarProps {
  contact: Contact | null;
  onPrefillReminder?: (text: string) => void;
  onCollapse?: () => void;
}

const SIDEBAR_SECTIONS_STORAGE_KEY = "wacrm:inbox:sidebar-sections";

interface SidebarSectionsState {
  contactInfo: boolean;
  tags: boolean;
  cases: boolean;
  deals: boolean;
  notes: boolean;
}

const DEFAULT_SECTIONS_STATE: SidebarSectionsState = {
  contactInfo: true,
  tags: true,
  cases: true,
  deals: true,
  notes: true,
};

export function ContactSidebar({ contact, onPrefillReminder, onCollapse }: ContactSidebarProps) {
  const tSidebar = useTranslations("Inbox.sidebar");
  const tThread = useTranslations("Inbox.messageThread");

  const { accountId } = useAuth();
  const [activeTab, setActiveTab] = useState<"details" | "documents" | "calculator">("details");
  const [selectedDocsContact, setSelectedDocsContact] = useState<Contact | null>(null);
  const [copied, setCopied] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [tags, setTags] = useState<(Tag & { contact_tag_id: string })[]>([]);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  const [sections, setSections] = useState<SidebarSectionsState>(DEFAULT_SECTIONS_STATE);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_SECTIONS_STORAGE_KEY);
      if (stored) {
        setSections((prev) => ({ ...prev, ...JSON.parse(stored) }));
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const handleSectionToggle = useCallback((key: keyof SidebarSectionsState, open: boolean) => {
    setSections((prev) => {
      const next = { ...prev, [key]: open };
      try {
        localStorage.setItem(SIDEBAR_SECTIONS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore localStorage errors
      }
      return next;
    });
  }, []);

  // Sync selectedDocsContact when contact prop changes
  useEffect(() => {
    setSelectedDocsContact(contact);
  }, [contact]);

  const fetchContactData = useCallback(async () => {
    if (!contact) return;

    const supabase = createClient();

    // Fetch deals, notes, and tags in parallel
    const [dealsRes, notesRes, tagsRes] = await Promise.all([
      supabase
        .from("deals")
        .select("*, stage:pipeline_stages(*)")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_notes")
        .select("*")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_tags")
        .select("id, tag_id, tags(*)")
        .eq("contact_id", contact.id),
    ]);

    if (dealsRes.data) setDeals(dealsRes.data);
    if (notesRes.data) setNotes(notesRes.data);
    if (tagsRes.data) {
      const mapped = tagsRes.data
        .filter((ct: Record<string, unknown>) => ct.tags)
        .map((ct: Record<string, unknown>) => ({
          ...(ct.tags as Tag),
          contact_tag_id: ct.id as string,
        }));
      setTags(mapped);
    }
  }, [contact]);

  useEffect(() => {
    fetchContactData();
  }, [fetchContactData]);

  const handleCopyPhone = useCallback(async () => {
    if (!contact?.phone) return;
    await navigator.clipboard.writeText(contact.phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [contact]);

  const handleAddNote = useCallback(async () => {
    if (!contact || !newNote.trim()) return;
    if (!accountId) return;
    setAddingNote(true);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;

    const { data, error } = await supabase
      .from("contact_notes")
      .insert({
        contact_id: contact.id,
        account_id: accountId,
        user_id: user?.id,
        note_text: newNote.trim(),
      })
      .select()
      .single();

    if (!error && data) {
      setNotes((prev) => [data, ...prev]);
      setNewNote("");
    }
    setAddingNote(false);
  }, [contact, newNote, accountId]);

  if (!contact) {
    return (
      <div className="flex h-full w-full items-center justify-center border-l border-border bg-card">
        <p className="text-sm text-muted-foreground">{tThread("selectConversation")}</p>
      </div>
    );
  }

  const displayName = contact.name || contact.phone;
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <div className="flex h-full w-full flex-col overflow-hidden border-l border-border bg-card">
      {/* Top Tab Bar */}
      <div className="flex items-center border-b border-border bg-muted/30 p-1 shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab("details")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-all",
            activeTab === "details"
              ? "bg-background text-foreground shadow-xs font-semibold"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
        >
          <UserCircle2 className="h-3.5 w-3.5" />
          <span>{tSidebar("detailsTab")}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("documents")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-all",
            activeTab === "documents"
              ? "bg-background text-foreground shadow-xs font-semibold"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
        >
          <FileCheck className="h-3.5 w-3.5 text-primary" />
          <span>{tSidebar("visaDocsTab")}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("calculator")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-all",
            activeTab === "calculator"
              ? "bg-background text-foreground shadow-xs font-semibold"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
        >
          <Calculator className="h-3.5 w-3.5 text-amber-500" />
          <span>{tSidebar("calculatorTab")}</span>
        </button>

        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            title={tSidebar("collapsePanel")}
            className="ml-0.5 flex shrink-0 items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            <PanelRightClose className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Tab 1: Details / Overview */}
      {activeTab === "details" ? (
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-3 space-y-3">
            {/* 1. Contact Profile Info */}
            <CollapsibleSection
              title={tSidebar("contactInfo")}
              icon={<UserCircle2 className="h-3.5 w-3.5" />}
              open={sections.contactInfo}
              onOpenChange={(open) => handleSectionToggle("contactInfo", open)}
            >
              <div className="flex flex-col items-center text-center pt-1 pb-2">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-base font-semibold text-foreground">
                  {contact.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={contact.avatar_url}
                      alt={displayName}
                      className="h-14 w-14 rounded-full object-cover"
                    />
                  ) : (
                    initials
                  )}
                </div>
                <h3 className="mt-2 text-sm font-semibold text-foreground">
                  {displayName}
                </h3>
                {contact.company && (
                  <p className="text-xs text-muted-foreground">{contact.company}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <button
                  onClick={handleCopyPhone}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
                >
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="flex-1 text-left">{contact.phone}</span>
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>

                {contact.email && (
                  <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate">{contact.email}</span>
                  </div>
                )}
              </div>
            </CollapsibleSection>

            {/* 2. Tags */}
            <CollapsibleSection
              title={tSidebar("tags")}
              icon={<TagIcon className="h-3.5 w-3.5" />}
              badge={tags.length > 0 ? tags.length : undefined}
              open={sections.tags}
              onOpenChange={(open) => handleSectionToggle("tags", open)}
            >
              <div className="flex flex-wrap gap-1 pt-1">
                {tags.length === 0 ? (
                  <p className="px-1 text-xs text-muted-foreground">{tSidebar("noTags")}</p>
                ) : (
                  tags.map((tag) => (
                    <span
                      key={tag.contact_tag_id}
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{
                        backgroundColor: `${tag.color}20`,
                        color: tag.color,
                      }}
                    >
                      {tag.name}
                    </span>
                  ))
                )}
              </div>
            </CollapsibleSection>

            {/* 3. Cases & Group Linking */}
            <CollapsibleSection
              title="Cases & Groups"
              icon={<FolderKanban className="h-3.5 w-3.5" />}
              open={sections.cases}
              onOpenChange={(open) => handleSectionToggle("cases", open)}
            >
              <div className="pt-1">
                <CaseGroupWidget
                  contact={contact}
                  onViewDocs={(targetContact) => {
                    setSelectedDocsContact(targetContact);
                    setActiveTab("documents");
                  }}
                />
              </div>
            </CollapsibleSection>

            {/* 4. Active Deals */}
            <CollapsibleSection
              title={tSidebar("deals")}
              icon={<DollarSign className="h-3.5 w-3.5" />}
              badge={deals.length > 0 ? deals.length : undefined}
              open={sections.deals}
              onOpenChange={(open) => handleSectionToggle("deals", open)}
            >
              <div className="space-y-2 pt-1">
                {deals.length === 0 ? (
                  <p className="px-1 text-xs text-muted-foreground">{tSidebar("noDeals")}</p>
                ) : (
                  deals.map((deal) => (
                    <div
                      key={deal.id}
                      className="rounded-lg bg-muted/60 px-3 py-2 border border-border/40"
                    >
                      <p className="text-xs font-medium text-foreground">
                        {deal.title}
                      </p>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>
                          {deal.currency ?? "$"}
                          {deal.value.toLocaleString()}
                        </span>
                        {deal.stage && (
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[10px]"
                            style={{
                              backgroundColor: `${deal.stage.color}20`,
                              color: deal.stage.color,
                            }}
                          >
                            {deal.stage.name}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CollapsibleSection>

            {/* 5. Notes */}
            <CollapsibleSection
              title={tSidebar("notes")}
              icon={<StickyNote className="h-3.5 w-3.5" />}
              badge={notes.length > 0 ? notes.length : undefined}
              open={sections.notes}
              onOpenChange={(open) => handleSectionToggle("notes", open)}
            >
              <div className="pt-1 space-y-2">
                <div className="flex gap-2">
                  <textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder={tSidebar("addNotePlaceholder")}
                    rows={2}
                    className="flex-1 resize-none rounded-lg border border-border bg-muted/80 px-2.5 py-1.5 text-xs text-foreground placeholder-muted-foreground outline-none focus:border-primary/50"
                  />
                  <Button
                    size="sm"
                    className="h-auto bg-primary px-2.5 hover:bg-primary/90"
                    onClick={handleAddNote}
                    disabled={!newNote.trim() || addingNote}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="space-y-1.5">
                  {notes.map((note) => (
                    <div
                      key={note.id}
                      className="rounded-lg bg-muted/50 border border-border/40 px-2.5 py-2"
                    >
                      <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                        {note.note_text}
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground/70">
                        {format(new Date(note.created_at), "MMM d, yyyy HH:mm")}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </CollapsibleSection>
          </div>
        </ScrollArea>
      ) : activeTab === "documents" ? (
        /* Tab 2: Document Checklist Hub */
        <div className="flex-1 min-h-0">
          <DocumentChecklistSidebar
            contact={contact}
            initialContact={selectedDocsContact}
            onPrefillReminder={onPrefillReminder}
          />
        </div>
      ) : (
        /* Tab 3: CRS & Eligibility Calculator */
        <div className="flex-1 min-h-0">
          <CRSCalculatorSidebar
            contact={contact}
            onPrefillReminder={onPrefillReminder}
          />
        </div>
      )}
    </div>
  );
}

