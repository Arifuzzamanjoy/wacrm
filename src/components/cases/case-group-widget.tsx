"use client";

import { useState, useEffect, useCallback } from "react";
import type { Contact, Case, CaseStatus } from "@/types";
import {
  FolderKanban,
  Plus,
  ChevronDown,
  ChevronUp,
  Loader2,
  FolderOpen,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CaseMemberCard } from "./case-member-card";
import { CreateCaseDialog } from "./create-case-dialog";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

interface CaseGroupWidgetProps {
  contact: Contact | null;
  onViewDocs?: (contact: Contact) => void;
}

export const CASE_STATUS_COLORS: Record<CaseStatus, string> = {
  active: "#22c55e",
  in_progress: "#3b82f6",
  submitted: "#f59e0b",
  approved: "#22c55e",
  completed: "#6366f1",
  closed: "#64748b",
  on_hold: "#f97316",
  cancelled: "#ef4444",
};

export function CaseGroupWidget({
  contact,
  onViewDocs,
}: CaseGroupWidgetProps) {
  const t = useTranslations("Cases");
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [expandedCaseIds, setExpandedCaseIds] = useState<Set<string>>(new Set());

  const fetchCases = useCallback(async () => {
    if (!contact) {
      setCases([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/cases?contact_id=${contact.id}`);
      const data = await res.json();
      if (res.ok && data.cases) {
        setCases(data.cases);
        // Expand the first case by default
        if (data.cases.length > 0) {
          setExpandedCaseIds(new Set([data.cases[0].id]));
        }
      }
    } catch (err) {
      console.error("Failed to load contact cases:", err);
    } finally {
      setLoading(false);
    }
  }, [contact]);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  const toggleCaseExpand = (caseId: string) => {
    setExpandedCaseIds((prev) => {
      const next = new Set(prev);
      if (next.has(caseId)) {
        next.delete(caseId);
      } else {
        next.add(caseId);
      }
      return next;
    });
  };

  const handleRemoveMember = async (caseId: string, memberId: string) => {
    try {
      const res = await fetch(`/api/cases/${caseId}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_id: memberId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to remove member");
      }

      toast.success(t("memberRemoved"));
      fetchCases();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove member");
    }
  };

  return (
    <div>
      {/* Widget Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <FolderKanban className="h-3 w-3" />
          <span>
            {t("title")} {cases.length > 0 && `(${cases.length})`}
          </span>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          title={t("newCase")}
          onClick={() => setCreateDialogOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Content */}
      <div className="mt-2 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : cases.length === 0 ? (
          <div className="rounded-lg bg-muted/40 border border-border/60 p-3 text-center">
            <FolderOpen className="h-6 w-6 text-muted-foreground/60 mx-auto mb-1.5" />
            <p className="text-xs font-medium text-foreground">{t("noCases")}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5 mb-2.5">
              {t("createFirst")}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs w-full bg-background"
              onClick={() => setCreateDialogOpen(true)}
            >
              <Plus className="h-3 w-3 mr-1" />
              {t("newCase")}
            </Button>
          </div>
        ) : (
          cases.map((caseItem) => {
            const isExpanded = expandedCaseIds.has(caseItem.id);
            const statusColor =
              CASE_STATUS_COLORS[caseItem.status] || "#64748b";
            const memberCount = caseItem.members?.length || 0;

            return (
              <div
                key={caseItem.id}
                className="rounded-lg bg-muted/50 border border-border/80 overflow-hidden transition-all"
              >
                {/* Case Card Header */}
                <button
                  type="button"
                  onClick={() => toggleCaseExpand(caseItem.id)}
                  className="w-full text-left p-2.5 flex items-start justify-between gap-2 hover:bg-muted/80 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-muted-foreground bg-background px-1.5 py-0.2 rounded border border-border/60">
                        {caseItem.case_number}
                      </span>
                      <span
                        className="rounded-full px-1.5 py-0.2 text-[9px] font-medium"
                        style={{
                          backgroundColor: `${statusColor}20`,
                          color: statusColor,
                        }}
                      >
                        {t(`caseStatuses.${caseItem.status}` as `caseStatuses.${CaseStatus}`) || caseItem.status}
                      </span>
                    </div>

                    <p className="text-xs font-semibold text-foreground truncate mt-1">
                      {caseItem.title}
                    </p>

                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                      <span>{caseItem.case_type}</span>
                      <span>•</span>
                      <span>
                        {memberCount} {memberCount === 1 ? "member" : "members"}
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 text-muted-foreground pt-1">
                    {isExpanded ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </div>
                </button>

                {/* Expanded Member List */}
                {isExpanded && (
                  <div className="p-2.5 pt-0 border-t border-border/50 space-y-1.5 mt-1">
                    <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 px-0.5 pt-1">
                      {t("members")}
                    </div>

                    {caseItem.members?.map((member) => (
                      <CaseMemberCard
                        key={member.id}
                        member={member}
                        currentContactId={contact?.id}
                        onViewDocs={onViewDocs}
                        canRemove={member.role !== "primary"}
                        onRemove={(memberId) =>
                          handleRemoveMember(caseItem.id, memberId)
                        }
                      />
                    ))}

                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full h-6 text-[11px] text-muted-foreground hover:text-foreground mt-1"
                      onClick={() => setCreateDialogOpen(true)}
                    >
                      <UserPlus className="h-3 w-3 mr-1" />
                      {t("addMember")} / {t("newCase")}
                    </Button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <CreateCaseDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        contact={contact}
        onCaseCreated={() => fetchCases()}
        onCaseLinked={() => fetchCases()}
      />
    </div>
  );
}
