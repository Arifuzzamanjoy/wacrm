"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileCheck,
  Loader2,
  MessageSquare,
  Pencil,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { useCan } from "@/hooks/use-can";
import { useTranslations } from "next-intl";
import type {
  AccountComplianceSettings,
  ComplianceOverviewStats,
  DocumentStatus,
  MonitoredDocumentItem,
} from "@/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatExpiryReminderMessage } from "@/lib/compliance/reminder-message";

type FilterTab = "all" | "expired" | "critical" | "warning" | "compliant";

export default function CompliancePage() {
  const router = useRouter();
  const { accountRole } = useAuth();
  const canSend = useCan("send-messages");
  const isAdmin = accountRole === "owner" || accountRole === "admin";
  const t = useTranslations("Compliance");

  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [documents, setDocuments] = useState<MonitoredDocumentItem[]>([]);
  const [stats, setStats] = useState<ComplianceOverviewStats>({
    expired_count: 0,
    critical_count: 0,
    warning_count: 0,
    compliant_count: 0,
    total_monitored: 0,
  });

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Settings Modal state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settings, setSettings] = useState<AccountComplianceSettings | null>(null);

  // Edit Expiry Modal state
  const [editDoc, setEditDoc] = useState<MonitoredDocumentItem | null>(null);
  const [newExpiryDate, setNewExpiryDate] = useState("");
  const [newDocStatus, setNewDocStatus] = useState<DocumentStatus>("missing");
  const [savingDoc, setSavingDoc] = useState(false);

  // Send Reminder Modal state
  const [remindDoc, setRemindDoc] = useState<MonitoredDocumentItem | null>(null);
  const [customMessage, setCustomMessage] = useState("");
  const [sendingReminder, setSendingReminder] = useState(false);

  // Load compliance documents & stats
  const loadComplianceData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/compliance/scan");
      if (!res.ok) throw new Error("Failed to load compliance data");
      const data = await res.json();
      if (data.ok) {
        setDocuments(data.documents || []);
        setStats(data.stats || {
          expired_count: 0,
          critical_count: 0,
          warning_count: 0,
          compliant_count: 0,
          total_monitored: 0,
        });
      }
    } catch (err) {
      console.error(err);
      toast.error(t("toastLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadComplianceData();
  }, [loadComplianceData]);

  // Load Settings
  const openSettingsDialog = async () => {
    setSettingsOpen(true);
    try {
      setSettingsLoading(true);
      const res = await fetch("/api/compliance/settings");
      if (!res.ok) throw new Error("Failed to load compliance settings");
      const data = await res.json();
      if (data.ok) {
        setSettings(data.settings);
      }
    } catch (err) {
      console.error(err);
      toast.error(t("toastSettingsLoadFailed"));
    } finally {
      setSettingsLoading(false);
    }
  };

  // Save Settings
  const handleSaveSettings = async () => {
    if (!settings) return;
    try {
      setSavingSettings(true);
      const res = await fetch("/api/compliance/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auto_whatsapp_enabled: settings.auto_whatsapp_enabled,
          alert_thresholds: settings.alert_thresholds,
          whatsapp_template_name: settings.whatsapp_template_name,
          whatsapp_template_language: settings.whatsapp_template_language,
          custom_message_template: settings.custom_message_template,
        }),
      });

      if (!res.ok) throw new Error("Failed to save settings");
      toast.success(t("toastSettingsSaved"));
      setSettingsOpen(false);
    } catch (err) {
      console.error(err);
      toast.error(t("toastSettingsSaveFailed"));
    } finally {
      setSavingSettings(false);
    }
  };

  // Run On-Demand Scan
  const handleRunScan = async () => {
    try {
      setScanning(true);
      const res = await fetch("/api/compliance/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ send_reminders: true }),
      });
      if (!res.ok) throw new Error("Compliance scan failed");
      const data = await res.json();
      if (data.ok) {
        toast.success(
          t("toastScanComplete", { alerts: data.alerts_sent ?? 0 })
        );
        await loadComplianceData();
      }
    } catch (err) {
      console.error(err);
      toast.error(t("toastScanFailed"));
    } finally {
      setScanning(false);
    }
  };

  // Open Edit Expiry Dialog
  const handleOpenEdit = (doc: MonitoredDocumentItem) => {
    setEditDoc(doc);
    setNewExpiryDate(doc.expiry_date || "");
    setNewDocStatus(doc.status || "missing");
  };

  // Save Document Expiry Update
  const handleSaveExpiry = async () => {
    if (!editDoc || !editDoc.contact_id) return;
    if (!newExpiryDate) {
      toast.error(t("toastExpiryRequired"));
      return;
    }

    try {
      setSavingDoc(true);
      const res = await fetch(`/api/contacts/${editDoc.contact_id}/documents`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editDoc.id,
          expiry_date: newExpiryDate,
          status: newDocStatus,
        }),
      });

      if (!res.ok) throw new Error("Failed to update document expiry");
      toast.success(t("toastExpirySaved"));
      setEditDoc(null);
      await loadComplianceData();
    } catch (err) {
      console.error(err);
      toast.error(t("toastSaveFailed"));
    } finally {
      setSavingDoc(false);
    }
  };

  // Open Send Reminder Dialog
  const handleOpenRemind = (doc: MonitoredDocumentItem) => {
    setRemindDoc(doc);
    // Same wording the scheduled scan sends, so the agent edits the
    // real message rather than a near-copy that has drifted from it.
    setCustomMessage(
      formatExpiryReminderMessage(
        null,
        doc.contact?.name || "",
        doc.title,
        doc.expiry_date || "",
        doc.days_remaining
      )
    );
  };

  // Dispatch Manual Reminder
  const handleSendReminder = async () => {
    if (!remindDoc) return;
    try {
      setSendingReminder(true);
      const res = await fetch("/api/compliance/remind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_id: remindDoc.id,
          message: customMessage,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to send reminder");
      }

      toast.success(
        t("toastReminderSent", { name: remindDoc.contact?.name || "" })
      );
      setRemindDoc(null);
      await loadComplianceData();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : t("toastReminderFailed"));
    } finally {
      setSendingReminder(false);
    }
  };

  // Get distinct visa categories for filter dropdown
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const doc of documents) {
      if (doc.category) set.add(doc.category);
    }
    return Array.from(set);
  }, [documents]);

  // Filtered documents list
  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      // Tab filter
      if (activeTab !== "all" && doc.urgency !== activeTab) {
        return false;
      }
      // Category filter
      if (categoryFilter !== "all" && doc.category !== categoryFilter) {
        return false;
      }
      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const contactName = doc.contact?.name?.toLowerCase() || "";
        const contactPhone = doc.contact?.phone?.toLowerCase() || "";
        const title = doc.title?.toLowerCase() || "";
        const category = doc.category?.toLowerCase() || "";

        return (
          contactName.includes(q) ||
          contactPhone.includes(q) ||
          title.includes(q) ||
          category.includes(q)
        );
      }
      return true;
    });
  }, [documents, activeTab, categoryFilter, searchQuery]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-8 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
              <CalendarClock className="h-7 w-7 text-primary" />
              {t("title")}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {t("description")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={openSettingsDialog}
              className="gap-2"
            >
              <Settings className="h-4 w-4 text-muted-foreground" />
              {t("settings")}
            </Button>
          )}

          <Button
            size="sm"
            onClick={handleRunScan}
            disabled={scanning || !canSend}
            className="gap-2 shadow-sm"
          >
            <RefreshCw className={cn("h-4 w-4", scanning && "animate-spin")} />
            {scanning ? t("scanning") : t("scanNow")}
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Expired */}
        <div
          onClick={() => setActiveTab("expired")}
          className={cn(
            "relative overflow-hidden rounded-xl border p-4 shadow-sm transition-all cursor-pointer hover:shadow-md",
            activeTab === "expired"
              ? "border-red-500 bg-red-500/5 ring-2 ring-red-500/20"
              : "border-border bg-card"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("kpiExpired")}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10 text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-red-600 dark:text-red-400">
              {stats.expired_count}
            </span>
            {stats.expired_count > 0 && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                Action Required
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Past due expiration dates
          </p>
        </div>

        {/* Critical (<= 30 Days) */}
        <div
          onClick={() => setActiveTab("critical")}
          className={cn(
            "relative overflow-hidden rounded-xl border p-4 shadow-sm transition-all cursor-pointer hover:shadow-md",
            activeTab === "critical"
              ? "border-amber-500 bg-amber-500/5 ring-2 ring-amber-500/20"
              : "border-border bg-card"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("kpiCritical")}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
              {stats.critical_count}
            </span>
            {stats.critical_count > 0 && (
              <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700 text-[10px] px-1.5 py-0">
                Urgent
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Renewals due within 30 days
          </p>
        </div>

        {/* Warning (31-90 Days) */}
        <div
          onClick={() => setActiveTab("warning")}
          className={cn(
            "relative overflow-hidden rounded-xl border p-4 shadow-sm transition-all cursor-pointer hover:shadow-md",
            activeTab === "warning"
              ? "border-yellow-500 bg-yellow-500/5 ring-2 ring-yellow-500/20"
              : "border-border bg-card"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("kpiWarning")}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-yellow-600 dark:text-yellow-400">
              {stats.warning_count}
            </span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              Upcoming
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Approaching validity window
          </p>
        </div>

        {/* Total Monitored */}
        <div
          onClick={() => setActiveTab("all")}
          className={cn(
            "relative overflow-hidden rounded-xl border p-4 shadow-sm transition-all cursor-pointer hover:shadow-md",
            activeTab === "all"
              ? "border-emerald-500 bg-emerald-500/5 ring-2 ring-emerald-500/20"
              : "border-border bg-card"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("kpiTotal")}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-foreground">
              {stats.total_monitored}
            </span>
            <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 text-[10px] px-1.5 py-0">
              Active Files
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {stats.compliant_count} compliant ({">"}90 days)
          </p>
        </div>
      </div>

      {/* Filters & Search Controls */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        {/* Tab Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant={activeTab === "all" ? "default" : "ghost"}
            onClick={() => setActiveTab("all")}
            className="h-8 text-xs font-medium"
          >
            {t("filterAll")} ({stats.total_monitored})
          </Button>
          <Button
            size="sm"
            variant={activeTab === "expired" ? "default" : "ghost"}
            onClick={() => setActiveTab("expired")}
            className={cn(
              "h-8 text-xs font-medium",
              activeTab !== "expired" && stats.expired_count > 0 && "text-red-600 font-semibold"
            )}
          >
            🔴 {t("filterExpired")} ({stats.expired_count})
          </Button>
          <Button
            size="sm"
            variant={activeTab === "critical" ? "default" : "ghost"}
            onClick={() => setActiveTab("critical")}
            className={cn(
              "h-8 text-xs font-medium",
              activeTab !== "critical" && stats.critical_count > 0 && "text-amber-600 font-semibold"
            )}
          >
            🟠 {t("filterCritical")} ({stats.critical_count})
          </Button>
          <Button
            size="sm"
            variant={activeTab === "warning" ? "default" : "ghost"}
            onClick={() => setActiveTab("warning")}
            className="h-8 text-xs font-medium"
          >
            🟡 {t("filterWarning")} ({stats.warning_count})
          </Button>
          <Button
            size="sm"
            variant={activeTab === "compliant" ? "default" : "ghost"}
            onClick={() => setActiveTab("compliant")}
            className="h-8 text-xs font-medium"
          >
            🟢 {t("filterCompliant")} ({stats.compliant_count})
          </Button>
        </div>

        {/* Search & Category Filter */}
        <div className="flex items-center gap-2">
          {categories.length > 1 && (
            <Select
              value={categoryFilter}
              onValueChange={(val) => setCategoryFilter(val || "all")}
            >
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t("searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 pr-7 text-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Documents Table */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
            <p className="text-sm">Loading compliance documents...</p>
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <ShieldCheck className="h-12 w-12 text-emerald-500/50 mb-3" />
            <h3 className="text-base font-semibold text-foreground">
              No matching documents found
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mt-1">
              {searchQuery || activeTab !== "all" || categoryFilter !== "all"
                ? "Try adjusting your search query or urgency filter tabs."
                : "No expiring documents have been tracked yet."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground">
                <tr>
                  <th className="py-3 px-4">{t("colClient")}</th>
                  <th className="py-3 px-4">{t("colDocument")}</th>
                  <th className="py-3 px-4">{t("colExpiry")}</th>
                  <th className="py-3 px-4">{t("colStatus")}</th>
                  <th className="py-3 px-4">{t("colLastAlert")}</th>
                  <th className="py-3 px-4 text-right">{t("colActions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredDocuments.map((doc) => {
                  const clientName = doc.contact?.name || "Client";
                  const clientPhone = doc.contact?.phone || "";

                  return (
                    <tr
                      key={doc.id}
                      className={cn(
                        "hover:bg-muted/30 transition-colors",
                        doc.urgency === "expired" && "bg-red-500/5",
                        doc.urgency === "critical" && "bg-amber-500/5"
                      )}
                    >
                      {/* Client / Contact */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9 border border-border">
                            {doc.contact?.avatar_url && (
                              <AvatarImage src={doc.contact.avatar_url} />
                            )}
                            <AvatarFallback className="text-xs font-medium">
                              {clientName.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate max-w-[160px]">
                              {clientName}
                            </p>
                            <p className="text-xs text-muted-foreground font-mono truncate">
                              {clientPhone || "No phone"}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Document Title & Category */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium text-foreground">
                            {doc.title}
                          </span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge
                              variant="outline"
                              className="text-[10px] py-0 px-1.5 font-normal text-muted-foreground"
                            >
                              {doc.category}
                            </Badge>
                          </div>
                        </div>
                      </td>

                      {/* Expiry Date & Countdown */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-mono font-medium text-foreground">
                            {doc.expiry_date}
                          </span>
                          <div>
                            {doc.urgency === "expired" ? (
                              <Badge
                                variant="destructive"
                                className="text-[10px] px-1.5 py-0 font-medium"
                              >
                                {doc.days_remaining === 0
                                  ? "Expires today"
                                  : t("daysAgo", {
                                      count: Math.abs(doc.days_remaining),
                                    })}
                              </Badge>
                            ) : doc.urgency === "critical" ? (
                              <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700 text-[10px] px-1.5 py-0 font-medium">
                                ⚠️ {t("daysLeft", { count: doc.days_remaining })}
                              </Badge>
                            ) : doc.urgency === "warning" ? (
                              <Badge className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700 text-[10px] px-1.5 py-0 font-medium">
                                ⏳ {t("daysLeft", { count: doc.days_remaining })}
                              </Badge>
                            ) : (
                              <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 text-[10px] px-1.5 py-0 font-medium">
                                🟢 {t("daysLeft", { count: doc.days_remaining })}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Verification Status */}
                      <td className="py-3.5 px-4">
                        {doc.status === "verified" ? (
                          <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-xs gap-1 font-medium">
                            <CheckCircle2 className="h-3 w-3" />
                            Verified
                          </Badge>
                        ) : doc.status === "submitted" ? (
                          <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 text-xs gap-1 font-medium">
                            <FileCheck className="h-3 w-3" />
                            Submitted
                          </Badge>
                        ) : doc.status === "rejected" ? (
                          <Badge className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 text-xs gap-1 font-medium">
                            <XCircle className="h-3 w-3" />
                            Rejected
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-muted-foreground gap-1">
                            <AlertCircle className="h-3 w-3 text-muted-foreground" />
                            Missing
                          </Badge>
                        )}
                      </td>

                      {/* Last Alert Sent */}
                      <td className="py-3.5 px-4">
                        {doc.last_alert ? (
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] py-0 px-1",
                                  doc.last_alert.status === "failed" && "text-red-500 border-red-300"
                                )}
                              >
                                {doc.last_alert.alert_tier.replace("_", " ")}
                              </Badge>
                            </div>
                            <span className="text-[11px] text-muted-foreground">
                              {format(parseISO(doc.last_alert.sent_at), "MMM d, yyyy")}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">
                            {t("never")}
                          </span>
                        )}
                      </td>

                      {/* Action buttons */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* 1-Click WhatsApp Alert */}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleOpenRemind(doc)}
                            disabled={!clientPhone || !canSend}
                            title={t("sendReminder")}
                            className="h-8 px-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                          >
                            <Send className="h-3.5 w-3.5 mr-1" />
                            <span className="text-xs hidden sm:inline">Alert</span>
                          </Button>

                          {/* Open Chat */}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => router.push(`/inbox`)}
                            title={t("openChat")}
                            className="h-8 px-2 text-muted-foreground hover:text-foreground"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                          </Button>

                          {/* Quick Edit Expiry */}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleOpenEdit(doc)}
                            title={t("editExpiry")}
                            className="h-8 px-2 text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dialog 1: Edit Expiry Date */}
      <Dialog open={!!editDoc} onOpenChange={(open) => !open && setEditDoc(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Update Expiration Date
            </DialogTitle>
            <DialogDescription>
              Modify validity expiration date and status for{" "}
              <span className="font-semibold text-foreground">
                {editDoc?.title}
              </span>{" "}
              ({editDoc?.contact?.name || "Client"}).
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-3">
            <div className="space-y-2">
              <Label htmlFor="expiry_date">Expiration Date</Label>
              <Input
                id="expiry_date"
                type="date"
                value={newExpiryDate}
                onChange={(e) => setNewExpiryDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="doc_status">Document Status</Label>
              <Select
                value={newDocStatus}
                onValueChange={(val) => {
                  if (val) setNewDocStatus(val as DocumentStatus);
                }}
              >
                <SelectTrigger id="doc_status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="missing">Missing</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="verified">Verified</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDoc(null)}
              disabled={savingDoc}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveExpiry} disabled={savingDoc}>
              {savingDoc ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog 2: Send WhatsApp Reminder */}
      <Dialog open={!!remindDoc} onOpenChange={(open) => !open && setRemindDoc(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-emerald-600" />
              Send WhatsApp Expiry Reminder
            </DialogTitle>
            <DialogDescription>
              Direct WhatsApp message dispatch to{" "}
              <span className="font-semibold text-foreground">
                {remindDoc?.contact?.name}
              </span>{" "}
              ({remindDoc?.contact?.phone}).
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-3">
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Document:</span>
                <span className="font-medium">{remindDoc?.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expiry Date:</span>
                <span className="font-mono font-medium">{remindDoc?.expiry_date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Days Remaining:</span>
                <span className={cn(
                  "font-bold",
                  remindDoc && remindDoc.days_remaining <= 0 ? "text-red-600" : "text-amber-600"
                )}>
                  {remindDoc?.days_remaining} days
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="custom_msg">Message Text</Label>
              <Textarea
                id="custom_msg"
                rows={4}
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Type your renewal reminder message..."
                className="text-xs font-sans leading-relaxed"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRemindDoc(null)}
              disabled={sendingReminder}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSendReminder}
              disabled={sendingReminder || !customMessage.trim()}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Send className="h-4 w-4" />
              {sendingReminder ? "Sending Alert..." : "Send WhatsApp Alert"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog 3: Compliance Settings Modal */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              {t("settingsTitle")}
            </DialogTitle>
            <DialogDescription>
              Configure automated daily scan triggers, threshold windows, and message defaults.
            </DialogDescription>
          </DialogHeader>

          {settingsLoading || !settings ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid gap-5 py-3">
              {/* Daily Alert Toggle */}
              <div className="flex items-center justify-between rounded-lg border border-border p-3.5 shadow-sm">
                <div className="space-y-0.5">
                  <Label htmlFor="auto_whatsapp" className="text-sm font-medium">
                    {t("autoAlertsToggle")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically send WhatsApp alerts when a document reaches a threshold window.
                  </p>
                </div>
                <Switch
                  id="auto_whatsapp"
                  checked={settings.auto_whatsapp_enabled}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, auto_whatsapp_enabled: checked })
                  }
                />
              </div>

              {/* Thresholds */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t("thresholds")}</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[90, 60, 30, 7].map((days) => {
                    const isChecked = settings.alert_thresholds.includes(days);
                    return (
                      <button
                        key={days}
                        type="button"
                        onClick={() => {
                          const next = isChecked
                            ? settings.alert_thresholds.filter((d) => d !== days)
                            : [...settings.alert_thresholds, days].sort((a, b) => b - a);
                          setSettings({ ...settings, alert_thresholds: next });
                        }}
                        className={cn(
                          "flex items-center justify-between rounded-md border p-2.5 text-xs font-medium transition-colors",
                          isChecked
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border bg-card text-muted-foreground hover:bg-muted/50"
                        )}
                      >
                        <span>{days} Days</span>
                        {isChecked && <CheckCircle2 className="h-3.5 w-3.5" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* WhatsApp Template Name (Optional) */}
              <div className="space-y-2">
                <Label htmlFor="tpl_name" className="text-sm font-medium">
                  Meta WhatsApp Template Name (Optional)
                </Label>
                <Input
                  id="tpl_name"
                  placeholder="e.g. document_expiry_reminder"
                  value={settings.whatsapp_template_name || ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      whatsapp_template_name: e.target.value || null,
                    })
                  }
                  className="text-xs font-mono"
                />
                <p className="text-[11px] text-muted-foreground">
                  If set, sends using this approved Meta template with parameters `[name, document, expiry_date, days]`.
                </p>
              </div>

              {/* Custom Message Template */}
              <div className="space-y-2">
                <Label htmlFor="custom_tpl" className="text-sm font-medium">
                  Custom Text Template
                </Label>
                <Textarea
                  id="custom_tpl"
                  rows={3}
                  placeholder="⚠️ Expiry Reminder: Hello {{name}}, your {{document}} expires on {{expiry_date}} (in {{days}} days). Please renew and upload your updated document to keep your file active."
                  value={settings.custom_message_template || ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      custom_message_template: e.target.value || null,
                    })
                  }
                  className="text-xs font-sans"
                />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="text-[11px] text-muted-foreground self-center">
                    Variables:
                  </span>
                  {["{{name}}", "{{document}}", "{{expiry_date}}", "{{days}}"].map(
                    (v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => {
                          const current = settings.custom_message_template || "";
                          setSettings({
                            ...settings,
                            custom_message_template: current + " " + v,
                          });
                        }}
                        className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground hover:text-foreground"
                      >
                        {v}
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSettingsOpen(false)}
              disabled={savingSettings}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveSettings}
              disabled={savingSettings || settingsLoading}
            >
              {savingSettings ? "Saving..." : t("saveSettings")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
