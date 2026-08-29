"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MessageTemplate, PipelineStage, StageWhatsAppNotification } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MessageSquare,
  Sparkles,
  Zap,
  CheckCircle2,
  AlertCircle,
  FileText,
  Send,
  Loader2,
} from "lucide-react";
import { useTranslations } from "next-intl";

interface StageNotificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stage: PipelineStage;
  onSave: (config: StageWhatsAppNotification | null) => void;
}

const AVAILABLE_VARIABLES = [
  { key: "{{contact.name}}", label: "Contact Name", sample: "Sarah Connor" },
  { key: "{{deal.title}}", label: "Deal Title", sample: "Enterprise Visa Application" },
  { key: "{{deal.value}}", label: "Deal Value", sample: "$12,500" },
  { key: "{{stage.name}}", label: "Stage Name", sample: "Visa Submitted" },
  { key: "{{deal.expected_close_date}}", label: "Expected Date", sample: "2026-09-15" },
  { key: "{{case.case_number}}", label: "Case #", sample: "CAS-2026-0042" },
  { key: "{{user.name}}", label: "Agent Name", sample: "Alex Murphy" },
];

export function StageNotificationDialog({
  open,
  onOpenChange,
  stage,
  onSave,
}: StageNotificationDialogProps) {
  const t = useTranslations("Pipelines.notifications");
  const supabase = createClient();

  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<"template" | "custom_text">("template");
  const [templateName, setTemplateName] = useState("");
  const [templateLanguage, setTemplateLanguage] = useState("en");
  const [templateParams, setTemplateParams] = useState<string[]>([]);
  const [customText, setCustomText] = useState("");

  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  const customTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync state when dialog opens or stage prop changes
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    const cfg = stage.whatsapp_notification;
    if (cfg) {
      setEnabled(cfg.enabled ?? true);
      setMode(cfg.mode || "template");
      setTemplateName(cfg.template_name || "");
      setTemplateLanguage(cfg.template_language || "en");
      setTemplateParams(cfg.template_params || []);
      setCustomText(cfg.custom_text || "");
    } else {
      setEnabled(false);
      setMode("template");
      setTemplateName("");
      setTemplateLanguage("en");
      setTemplateParams([]);
      setCustomText(
        `Hi {{contact.name}}, great news! Your deal "{{deal.title}}" has moved to the "${stage.name}" stage.`
      );
    }
  }, [open, stage]);

  // Fetch approved Meta templates
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function loadTemplates() {
      setLoadingTemplates(true);
      const { data, error } = await supabase
        .from("message_templates")
        .select("*")
        .in("status", ["APPROVED", "Approved"])
        .order("created_at", { ascending: false });

      if (cancelled) return;
      setLoadingTemplates(false);

      if (error) {
        console.error("Failed to load approved templates:", error);
        return;
      }

      const list = (data ?? []) as MessageTemplate[];
      setTemplates(list);

      // Auto-select first template if none selected
      if (!templateName && list.length > 0) {
        setTemplateName(list[0].name);
        setTemplateLanguage(list[0].language || "en");
      }
    }

    loadTemplates();

    return () => {
      cancelled = true;
    };
  }, [open, supabase, templateName]);

  const selectedTemplate = useMemo(() => {
    return templates.find((tpl) => tpl.name === templateName) ?? null;
  }, [templates, templateName]);

  // Extract positional placeholders {{1}}, {{2}} from template body
  const placeholders = useMemo(() => {
    if (!selectedTemplate?.body_text) return [];
    const matches = selectedTemplate.body_text.match(/\{\{(\d+)\}\}/g);
    if (!matches) return [];
    return [...new Set(matches)].sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ""), 10);
      const numB = parseInt(b.replace(/\D/g, ""), 10);
      return numA - numB;
    });
  }, [selectedTemplate]);

  // Ensure templateParams array length matches placeholders
  useEffect(() => {
    if (mode !== "template" || placeholders.length === 0) return;
    setTemplateParams((prev) => {
      const next = [...prev];
      while (next.length < placeholders.length) {
        const idx = next.length;
        const defaultVar = AVAILABLE_VARIABLES[idx]?.key || "{{contact.name}}";
        next.push(defaultVar);
      }
      return next.slice(0, placeholders.length);
    });
  }, [mode, placeholders]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleInsertCustomVariable(varKey: string) {
    const textarea = customTextareaRef.current;
    if (!textarea) {
      setCustomText((prev) => `${prev} ${varKey}`);
      return;
    }
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    const text = customText;
    const newText = text.substring(0, start) + varKey + text.substring(end);
    setCustomText(newText);
    setTimeout(() => {
      textarea.focus();
      const nextCursor = start + varKey.length;
      textarea.setSelectionRange(nextCursor, nextCursor);
    }, 0);
  }

  // Generate live preview text with sample data
  const previewMessage = useMemo(() => {
    const sampleMap: Record<string, string> = {
      "contact.name": "Sarah Connor",
      "contact.phone": "+1 (555) 019-2834",
      "deal.title": "Enterprise Visa Application",
      "deal.value": "$12,500",
      "stage.name": stage.name,
      "deal.expected_close_date": "2026-09-15",
      "case.case_number": "CAS-2026-0042",
      "user.name": "Alex Murphy",
    };

    function replaceWithSamples(str: string) {
      return str.replace(/\{\{([^}]+)\}\}/g, (match, rawKey) => {
        const k = rawKey.trim();
        return sampleMap[k] !== undefined ? sampleMap[k] : match;
      });
    }

    if (mode === "template") {
      if (!selectedTemplate) return "No template selected.";
      let text = selectedTemplate.body_text;
      placeholders.forEach((ph, i) => {
        const mappedVar = templateParams[i] || `{{${i + 1}}}`;
        const substituted = replaceWithSamples(mappedVar);
        text = text.replace(ph, substituted);
      });
      return text;
    }

    return replaceWithSamples(customText || "No message configured.");
  }, [mode, selectedTemplate, placeholders, templateParams, customText, stage.name]);

  function handleSave() {
    if (!enabled) {
      onSave(null);
      onOpenChange(false);
      return;
    }

    const config: StageWhatsAppNotification = {
      enabled: true,
      mode,
      template_name: mode === "template" ? templateName : undefined,
      template_language:
        mode === "template" ? selectedTemplate?.language || templateLanguage : undefined,
      template_params: mode === "template" ? templateParams : undefined,
      custom_text: mode === "custom_text" ? customText.trim() : undefined,
    };

    onSave(config);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl bg-popover border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div
              className="h-3.5 w-3.5 rounded-full"
              style={{ backgroundColor: stage.color }}
            />
            <DialogTitle className="text-popover-foreground text-lg font-semibold flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-emerald-400" />
              {t("title")}: {stage.name}
            </DialogTitle>
          </div>
          <DialogDescription className="text-muted-foreground text-xs pt-1">
            {t("description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Main Enable Toggle */}
          <div className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="space-y-0.5 pr-4">
              <Label className="text-sm font-medium text-foreground flex items-center gap-2">
                <Zap className="h-4 w-4 text-emerald-400" />
                {t("enable")}
              </Label>
              <p className="text-xs text-muted-foreground">
                Trigger an automatic WhatsApp update to the primary contact whenever any deal is moved into this stage.
              </p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              aria-label="Toggle WhatsApp notification"
            />
          </div>

          {enabled && (
            <div className="space-y-5 animate-in fade-in duration-200">
              {/* Mode Selection Tabs */}
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/60 p-1 border border-border">
                <button
                  type="button"
                  onClick={() => setMode("template")}
                  className={`flex items-center justify-center gap-2 rounded-md py-2 text-xs font-medium transition-colors ${
                    mode === "template"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  {t("modeTemplate")}
                </button>
                <button
                  type="button"
                  onClick={() => setMode("custom_text")}
                  className={`flex items-center justify-center gap-2 rounded-md py-2 text-xs font-medium transition-colors ${
                    mode === "custom_text"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <FileText className="h-3.5 w-3.5 text-primary" />
                  {t("modeCustomText")}
                </button>
              </div>

              {/* Template Mode */}
              {mode === "template" && (
                <div className="space-y-4 rounded-xl border border-border bg-card/40 p-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground">
                      {t("selectTemplate")}
                    </Label>
                    {loadingTemplates ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading approved Meta templates...
                      </div>
                    ) : templates.length === 0 ? (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        No approved WhatsApp templates found. Please create or sync approved templates in WhatsApp Settings.
                      </div>
                    ) : (
                      <Select
                        value={templateName}
                        onValueChange={(val) => {
                          const v = val || "";
                          setTemplateName(v);
                          const chosen = templates.find((t) => t.name === v);
                          if (chosen?.language) setTemplateLanguage(chosen.language);
                        }}
                      >
                        <SelectTrigger className="w-full border-border bg-muted/60 text-sm">
                          <SelectValue placeholder="Choose a template..." />
                        </SelectTrigger>
                        <SelectContent className="bg-popover border-border max-h-60">
                          {templates.map((tpl) => (
                            <SelectItem key={tpl.id} value={tpl.name} className="text-sm">
                              {tpl.name} ({tpl.language || "en"})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {selectedTemplate && (
                    <div className="space-y-3 pt-2">
                      <div className="rounded-lg border border-border/80 bg-muted/40 p-3">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                          Template Body
                        </span>
                        <p className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed">
                          {selectedTemplate.body_text}
                        </p>
                      </div>

                      {/* Variable Mappings */}
                      {placeholders.length > 0 && (
                        <div className="space-y-3 pt-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-medium text-muted-foreground">
                              {t("templateVariables")}
                            </Label>
                            <span className="text-[11px] text-muted-foreground">
                              Map Meta positional placeholders
                            </span>
                          </div>

                          <div className="space-y-2.5">
                            {placeholders.map((placeholder, idx) => (
                              <div
                                key={placeholder}
                                className="rounded-lg border border-border/70 bg-muted/30 p-2.5 space-y-2"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="inline-flex h-6 min-w-8 items-center justify-center rounded bg-primary/20 px-1.5 text-xs font-mono font-semibold text-primary">
                                    {placeholder}
                                  </span>
                                  <Input
                                    value={templateParams[idx] || ""}
                                    onChange={(e) => {
                                      const next = [...templateParams];
                                      next[idx] = e.target.value;
                                      setTemplateParams(next);
                                    }}
                                    placeholder={t.raw("varPlaceholder")}
                                    className="h-8 flex-1 border-border bg-background text-xs font-mono"
                                  />
                                </div>

                                {/* Variable Quick Insert Pills */}
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                  {AVAILABLE_VARIABLES.map((v) => (
                                    <button
                                      key={v.key}
                                      type="button"
                                      onClick={() => {
                                        const next = [...templateParams];
                                        next[idx] = v.key;
                                        setTemplateParams(next);
                                      }}
                                      className="rounded border border-border bg-muted/80 px-2 py-0.5 text-[11px] text-muted-foreground transition hover:border-primary/50 hover:bg-primary/10 hover:text-primary active:scale-95"
                                    >
                                      + {v.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Custom Text Mode */}
              {mode === "custom_text" && (
                <div className="space-y-3 rounded-xl border border-border bg-card/40 p-4">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Custom Message Text
                  </Label>
                  <Textarea
                    ref={customTextareaRef}
                    rows={4}
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    placeholder={t.raw("customTextPlaceholder")}
                    className="border-border bg-muted/60 text-sm font-sans resize-y"
                  />

                  {/* Available Variables Pills for Custom Text */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {t("availableVariables")}:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {AVAILABLE_VARIABLES.map((v) => (
                        <button
                          key={v.key}
                          type="button"
                          onClick={() => handleInsertCustomVariable(v.key)}
                          className="rounded border border-border bg-muted px-2 py-1 text-xs text-muted-foreground transition hover:border-primary/50 hover:bg-primary/10 hover:text-primary active:scale-95 flex items-center gap-1"
                        >
                          <span className="font-mono text-primary font-semibold">{v.key}</span>
                          <span className="text-[10px] text-muted-foreground">({v.label})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Live WhatsApp Simulation Preview */}
              <div className="space-y-2 rounded-xl border border-emerald-500/20 bg-muted/30 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Send className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-xs font-semibold text-foreground">
                      {t("preview")}
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    Sample Data Render
                  </span>
                </div>

                <div className="mt-2 rounded-lg bg-emerald-950/20 border border-emerald-500/20 p-3.5 shadow-inner">
                  <div className="flex items-start gap-2.5">
                    <div className="h-7 w-7 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                      <MessageSquare className="h-3.5 w-3.5 text-emerald-400" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-emerald-300">
                          WhatsApp Notification
                        </span>
                        <span className="text-[10px] text-muted-foreground">12:00 PM</span>
                      </div>
                      <p className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed pt-1 font-sans">
                        {previewMessage}
                      </p>
                      <div className="flex justify-end pt-1">
                        <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-border bg-popover/50 gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-border bg-transparent text-muted-foreground hover:bg-muted"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
