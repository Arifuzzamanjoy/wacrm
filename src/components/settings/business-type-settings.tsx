"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Briefcase, Loader2, Check } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { INDUSTRIES, getIndustryMeta } from "@/lib/checklists/industries";
import {
  useAccountIndustry,
  setAccountIndustry,
} from "@/hooks/use-account-industry";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { SettingsPanelHead } from "./settings-panel-head";

/**
 * Business type — the account's industry vertical.
 *
 * This is the one setting that makes the product read as the agency's
 * own tool rather than a visa CRM someone else's team uses. It drives:
 *
 *  - the contact sidebar's tab labels ("Visa Docs" vs "Assets" vs
 *    "Patient Docs"),
 *  - which scoring calculators appear (Canada CRS and the Australia
 *    points test are immigration-only; BANT is universal),
 *  - which checklist templates lead the picker.
 *
 * Writes go through PATCH /api/account, which enforces admin+ the same
 * way the `accounts_update` RLS policy does — so non-admins get a
 * read-only view.
 */
export function BusinessTypeSettings() {
  const { canEditSettings } = useAuth();
  const { industry, loading } = useAccountIndustry();
  const t = useTranslations("Settings.business");

  const [selected, setSelected] = useState<string | null>(industry);
  const [saving, setSaving] = useState(false);

  // Adopt the stored value once it resolves, and after a save.
  useEffect(() => {
    setSelected(industry);
  }, [industry]);

  const dirty = selected !== industry;

  async function handleSave() {
    if (!dirty) return;
    setSaving(true);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ industry: selected }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t("saveFailed"));

      // Push into the shared cache so open inbox tabs relabel without a
      // reload, rather than waiting for a remount to refetch.
      setAccountIndustry(data?.account?.industry ?? selected);
      toast.success(t("saveSuccess"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  const previewMeta = getIndustryMeta(selected);

  return (
    <section className="max-w-2xl animate-in fade-in-50 duration-200">
      <SettingsPanelHead title={t("title")} description={t("description")} />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Briefcase className="size-4 text-primary" />
            {t("industryLabel")}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {t("industryDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("loading")}
            </div>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                {INDUSTRIES.map((ind) => {
                  const active = selected === ind.id;
                  return (
                    <button
                      key={ind.id}
                      type="button"
                      disabled={!canEditSettings}
                      onClick={() => setSelected(ind.id as string)}
                      className={cn(
                        "flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors",
                        active
                          ? "border-primary bg-primary/5"
                          : "border-border bg-muted/40 hover:bg-muted/70",
                        !canEditSettings && "cursor-not-allowed opacity-60"
                      )}
                    >
                      <span className="text-base leading-none" aria-hidden>
                        {ind.emoji}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-foreground">
                            {ind.label}
                          </span>
                          {active && (
                            <Check className="size-3.5 shrink-0 text-primary" />
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {ind.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Makes the consequence of the choice concrete before
                  saving — the labels below are exactly what the inbox
                  sidebar will show. */}
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("previewLabel")}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-md bg-background px-2 py-1 text-xs text-muted-foreground">
                    {t("detailsTabName")}
                  </span>
                  <span className="rounded-md bg-background px-2 py-1 text-xs font-medium text-foreground">
                    {previewMeta.docsLabel}
                  </span>
                  <span className="rounded-md bg-background px-2 py-1 text-xs font-medium text-foreground">
                    {previewMeta.scoreLabel}
                  </span>
                </div>
              </div>

              {!canEditSettings && (
                <p className="text-xs text-muted-foreground">
                  {t("adminOnlyHint")}
                </p>
              )}

              {canEditSettings && (
                <Button
                  onClick={handleSave}
                  disabled={saving || !dirty}
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
              )}
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
