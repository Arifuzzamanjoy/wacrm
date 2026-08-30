"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ClipboardList,
  Loader2,
  Plus,
  Trash2,
  Pencil,
  X,
  Lock,
  Eye,
  EyeOff,
} from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import type { ChecklistTemplate, ChecklistTemplateItem } from "@/types";
import {
  INDUSTRIES,
  getIndustryMeta,
  sortIndustriesForAccount,
} from "@/lib/checklists/industries";
import { TEMPLATE_LIMITS } from "@/lib/checklists/template-validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { SettingsPanelHead } from "./settings-panel-head";

/**
 * Manage the account's own checklist templates.
 *
 * The five immigration templates seeded in 039 are global rows shared
 * by every account — they cover the common streams and nothing else. An
 * agency handling spousal sponsorship, work permits, visitor visas or
 * PR needs its own, which is what this panel creates.
 *
 * Global templates are listed read-only for reference: an agency that
 * wants a variant of one creates its own rather than editing a row
 * every other account sees.
 */

interface DraftItem extends ChecklistTemplateItem {
  /** Local-only key so React can track rows before they have ids. */
  key: string;
}

function emptyItem(): DraftItem {
  return {
    key: Math.random().toString(36).slice(2),
    title: "",
    is_mandatory: true,
  };
}

export function ChecklistTemplatesSettings() {
  const { canEditSettings } = useAuth();
  const t = useTranslations("Settings.checklistTemplates");

  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [accountIndustry, setAccountIndustry] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingHidden, setSavingHidden] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Editor state — `editing` null means the dialog is closed.
  const [editing, setEditing] = useState<ChecklistTemplate | "new" | null>(null);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("immigration");
  const [regionCode, setRegionCode] = useState("");
  const [category, setCategory] = useState("");
  const [items, setItems] = useState<DraftItem[]>([emptyItem()]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // includeHidden: this panel is where hidden templates get
      // un-hidden, so it must see them.
      const res = await fetch("/api/checklist-templates?includeHidden=1", {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("loadFailed"));
      setTemplates(data.templates ?? []);
      setAccountIndustry(data.accountIndustry ?? null);
      setHiddenIds(data.hiddenTemplateIds ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const { mine, global } = useMemo(() => {
    const mineList = templates.filter((tpl) => tpl.account_id);
    const globalList = templates.filter((tpl) => !tpl.account_id);
    const order = sortIndustriesForAccount(
      [...new Set(mineList.map((tpl) => tpl.industry as string))],
      accountIndustry
    );
    mineList.sort((a, b) => {
      const d =
        order.indexOf(a.industry as string) -
        order.indexOf(b.industry as string);
      return d !== 0 ? d : a.name.localeCompare(b.name);
    });
    return { mine: mineList, global: globalList };
  }, [templates, accountIndustry]);

  function openNew() {
    setEditing("new");
    setName("");
    setIndustry(accountIndustry || "immigration");
    setRegionCode("");
    setCategory("");
    setItems([emptyItem()]);
  }

  function openEdit(tpl: ChecklistTemplate) {
    setEditing(tpl);
    setName(tpl.name);
    setIndustry((tpl.industry as string) || "general");
    setRegionCode(tpl.region_code ?? "");
    setCategory(tpl.category ?? "");
    setItems(
      (tpl.default_items ?? []).map((it) => ({
        ...it,
        key: Math.random().toString(36).slice(2),
      }))
    );
  }

  async function handleSave() {
    if (!editing) return;
    setSaving(true);
    try {
      const payload = {
        name,
        industry,
        region_code: regionCode,
        category,
        default_items: items.map(({ key, ...rest }) => {
          void key;
          return rest;
        }),
      };
      const isNew = editing === "new";
      const res = await fetch(
        isNew
          ? "/api/checklist-templates"
          : `/api/checklist-templates/${editing.id}`,
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      // The server re-runs the same validation, so its message is the
      // authoritative one — surface it rather than a generic failure.
      if (!res.ok) throw new Error(data.error || t("saveFailed"));

      toast.success(isNew ? t("created") : t("updated"));
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  /**
   * Hide or show one built-in for this account. Optimistic, with the
   * previous list restored on failure — a toast alone would leave the
   * row showing the wrong state until the next reload.
   */
  async function toggleHidden(templateId: string) {
    const previous = hiddenIds;
    const next = previous.includes(templateId)
      ? previous.filter((id) => id !== templateId)
      : [...previous, templateId];

    setHiddenIds(next);
    setSavingHidden(true);
    try {
      const res = await fetch("/api/checklist-templates/hidden", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden_template_ids: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t("hideFailed"));
      // Trust the server's list — it drops anything non-hideable.
      setHiddenIds(data.hiddenTemplateIds ?? next);
    } catch (err) {
      setHiddenIds(previous);
      toast.error(err instanceof Error ? err.message : t("hideFailed"));
    } finally {
      setSavingHidden(false);
    }
  }

  async function handleDelete(tpl: ChecklistTemplate) {
    setDeletingId(tpl.id);
    try {
      const res = await fetch(`/api/checklist-templates/${tpl.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t("deleteFailed"));
      toast.success(t("deleted"));
      setTemplates((prev) => prev.filter((x) => x.id !== tpl.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("deleteFailed"));
    } finally {
      setDeletingId(null);
    }
  }

  const canSave =
    name.trim().length > 0 && items.some((i) => i.title.trim().length > 0);

  return (
    <section className="max-w-3xl animate-in fade-in-50 duration-200">
      <SettingsPanelHead title={t("title")} description={t("description")} />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <ClipboardList className="size-4 text-primary" />
              {t("yourTemplates")}
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              {t("yourTemplatesDesc")}
            </CardDescription>
          </div>
          {canEditSettings && (
            <Button
              onClick={openNew}
              className="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="size-4" />
              {t("newTemplate")}
            </Button>
          )}
        </CardHeader>

        <CardContent className="space-y-5">
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("loading")}
            </div>
          ) : (
            <>
              {mine.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-6 text-center">
                  <p className="text-sm font-medium text-foreground">
                    {t("emptyTitle")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("emptyDesc")}
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {mine.map((tpl) => {
                    const meta = getIndustryMeta(tpl.industry as string);
                    return (
                      <li
                        key={tpl.id}
                        className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/40 p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span aria-hidden>{meta.emoji}</span>
                            <span className="truncate text-sm font-medium text-foreground">
                              {tpl.region_code ? `[${tpl.region_code}] ` : ""}
                              {tpl.name}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {meta.label}
                            {tpl.category ? ` · ${tpl.category}` : ""} ·{" "}
                            {t("itemCount", {
                              count: tpl.default_items?.length ?? 0,
                            })}
                          </p>
                        </div>
                        {canEditSettings && (
                          <div className="flex shrink-0 items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8"
                              title={t("edit")}
                              onClick={() => openEdit(tpl)}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8 text-muted-foreground hover:text-destructive"
                              title={t("delete")}
                              disabled={deletingId === tpl.id}
                              onClick={() => handleDelete(tpl)}
                            >
                              {deletingId === tpl.id ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="size-3.5" />
                              )}
                            </Button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {!canEditSettings && (
                <p className="text-xs text-muted-foreground">
                  {t("adminOnlyHint")}
                </p>
              )}

              {/* Built-ins. Their content is read-only — they are shared
                  by every account — but each can be hidden from this
                  account's picker, which is how an agency that works
                  only some corridors keeps the list short. */}
              <div>
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Lock className="size-3" />
                  {t("builtInTitle")}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground/80">
                  {t("builtInDesc")}
                </p>
                <ul className="mt-2 space-y-1">
                  {global.map((tpl) => {
                    const isHidden = hiddenIds.includes(tpl.id);
                    return (
                      <li
                        key={tpl.id}
                        className={cn(
                          "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs",
                          isHidden
                            ? "bg-muted/30 text-muted-foreground/60"
                            : "bg-muted/60 text-muted-foreground"
                        )}
                      >
                        <span className={cn("truncate", isHidden && "line-through")}>
                          {getIndustryMeta(tpl.industry as string).emoji}{" "}
                          {tpl.region_code ? `[${tpl.region_code}] ` : ""}
                          {tpl.name}
                        </span>
                        {canEditSettings && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 shrink-0 px-1.5 text-[11px]"
                            disabled={savingHidden}
                            onClick={() => toggleHidden(tpl.id)}
                          >
                            {isHidden ? (
                              <>
                                <Eye className="size-3" />
                                {t("show")}
                              </>
                            ) : (
                              <>
                                <EyeOff className="size-3" />
                                {t("hide")}
                              </>
                            )}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Editor */}
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing === "new" ? t("newTemplate") : t("editTemplate")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>{t("nameLabel")}</Label>
              <Input
                value={name}
                maxLength={TEMPLATE_LIMITS.nameMax}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("namePlaceholder")}
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>{t("industryLabel")}</Label>
                <select
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary"
                >
                  {INDUSTRIES.map((ind) => (
                    <option key={ind.id as string} value={ind.id as string}>
                      {ind.emoji} {ind.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label>{t("regionLabel")}</Label>
                <Input
                  value={regionCode}
                  maxLength={TEMPLATE_LIMITS.regionMax}
                  onChange={(e) => setRegionCode(e.target.value.toUpperCase())}
                  placeholder={t("regionPlaceholder")}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>{t("categoryLabel")}</Label>
              <Input
                value={category}
                maxLength={TEMPLATE_LIMITS.categoryMax}
                onChange={(e) => setCategory(e.target.value)}
                placeholder={t("categoryPlaceholder")}
              />
            </div>

            <div className="grid gap-2">
              <Label>{t("itemsLabel")}</Label>
              <div className="space-y-2">
                {items.map((item, idx) => (
                  <div
                    key={item.key}
                    className="space-y-2 rounded-lg border border-border bg-muted/30 p-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <Input
                        value={item.title}
                        maxLength={TEMPLATE_LIMITS.itemTitleMax}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((x, i) =>
                              i === idx ? { ...x, title: e.target.value } : x
                            )
                          )
                        }
                        placeholder={t("itemTitlePlaceholder")}
                        className="flex-1"
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                        title={t("removeItem")}
                        disabled={items.length === 1}
                        onClick={() =>
                          setItems((prev) => prev.filter((_, i) => i !== idx))
                        }
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                    <Input
                      value={item.description ?? ""}
                      maxLength={TEMPLATE_LIMITS.itemDescriptionMax}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((x, i) =>
                            i === idx
                              ? { ...x, description: e.target.value }
                              : x
                          )
                        )
                      }
                      placeholder={t("itemDescPlaceholder")}
                      className="text-xs"
                    />
                    <div className="flex flex-wrap items-center gap-4">
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Checkbox
                          checked={item.is_mandatory}
                          onCheckedChange={(v) =>
                            setItems((prev) =>
                              prev.map((x, i) =>
                                i === idx ? { ...x, is_mandatory: v === true } : x
                              )
                            )
                          }
                        />
                        {t("mandatory")}
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Checkbox
                          checked={item.expiry_required === true}
                          onCheckedChange={(v) =>
                            setItems((prev) =>
                              prev.map((x, i) =>
                                i === idx
                                  ? { ...x, expiry_required: v === true }
                                  : x
                              )
                            )
                          }
                        />
                        {t("tracksExpiry")}
                      </label>
                    </div>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                className={cn("w-full", items.length >= TEMPLATE_LIMITS.maxItems && "hidden")}
                onClick={() => setItems((prev) => [...prev, emptyItem()])}
              >
                <Plus className="size-3.5" />
                {t("addItem")}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              {t("cancel")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !canSave}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t("saving")}
                </>
              ) : (
                t("save")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
