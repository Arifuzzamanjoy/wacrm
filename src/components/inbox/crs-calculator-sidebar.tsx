"use client";

import { useState, useMemo } from "react";
import { useAccountIndustry } from "@/hooks/use-account-industry";
import { useAuth } from "@/hooks/use-auth";
import { buildBantBudgetOptions } from "@/lib/leads/bant-tiers";
import type {
  Contact,
  CRSAgeRange,
  CRSEducation,
  CRSLanguageCLB,
  CRSForeignExp,
  CRSCanadianExp,
  AustraliaAgeBracket,
  AustraliaEnglishLevel,
  AustraliaQualification,
  AustraliaExperience,
} from "@/types";
import {
  calculateCRS,
  calculateAustraliaPoints,
  calculateLeadScore,
} from "@/lib/immigration/crs-calculator";
import {
  Calculator,
  Send,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  TrendingUp,
  Award,
  Compass,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

interface CRSCalculatorSidebarProps {
  contact: Contact | null;
  onPrefillReminder?: (text: string) => void;
}

type CalculatorMode = "canada_crs" | "australia_points" | "lead_score";

export function CRSCalculatorSidebar({
  contact,
  onPrefillReminder,
}: CRSCalculatorSidebarProps) {
  const t = useTranslations("Calculator");

  /**
   * Canada CRS and the Australia points test are immigration
   * instruments — they are meaningless to a marketing agency or an
   * e-commerce seller. BANT lead scoring applies to every vertical, so
   * non-immigration accounts get that alone and the mode switcher
   * disappears rather than offering two irrelevant tabs.
   */
  const { meta: industryMeta } = useAccountIndustry();
  const showImmigrationModes = industryMeta.immigrationScoring;
  const { defaultCurrency } = useAuth();

  const [mode, setMode] = useState<CalculatorMode>("canada_crs");

  /**
   * The mode actually rendered. Derived rather than corrected in an
   * effect: a non-immigration account must never see a CRS form, not
   * even for the one frame before an effect could reset it. Also means
   * an account switching vertical in settings takes effect instantly,
   * and the raw `mode` is preserved so switching back restores it.
   */
  const effectiveMode: CalculatorMode = showImmigrationModes
    ? mode
    : "lead_score";

  // --- Canada CRS State ---
  const [crsAge, setCrsAge] = useState<CRSAgeRange>("18_29");
  const [crsEdu, setCrsEdu] = useState<CRSEducation>("bachelors");
  const [crsLang, setCrsLang] = useState<CRSLanguageCLB>("clb_9");
  const [crsExp, setCrsExp] = useState<CRSForeignExp>("3_plus");
  const [canadianExp, setCanadianExp] = useState<CRSCanadianExp>("none");
  const [hasJobOfferOrPnp, setHasJobOfferOrPnp] = useState<boolean>(false);

  // --- Australia Points State ---
  const [ausAge, setAusAge] = useState<AustraliaAgeBracket>("25_32");
  const [ausEnglish, setAusEnglish] = useState<AustraliaEnglishLevel>("proficient");
  const [ausQual, setAusQual] = useState<AustraliaQualification>("bachelor_master");
  const [ausExp, setAusExp] = useState<AustraliaExperience>("5_7");

  // --- Lead Score State ---
  const [bantBudget, setBantBudget] = useState<"enterprise" | "growth" | "starter" | "none">("growth");
  const [bantAuthority, setBantAuthority] = useState<"decision_maker" | "influencer" | "evaluator">("decision_maker");
  const [bantNeed, setBantNeed] = useState<"urgent" | "planned" | "exploring">("planned");
  const [bantTimeline, setBantTimeline] = useState<"immediate" | "within_1mo" | "within_3mo" | "future">("within_1mo");

  // Computed CRS Result
  const crsResult = useMemo(() => {
    return calculateCRS({
      ageRange: crsAge,
      education: crsEdu,
      languageClb: crsLang,
      foreignExperienceYears: crsExp,
      canadianExperienceYears: canadianExp,
      hasJobOfferOrPnp,
    });
  }, [crsAge, crsEdu, crsLang, crsExp, canadianExp, hasJobOfferOrPnp]);

  // Computed Australia Result
  const ausResult = useMemo(() => {
    return calculateAustraliaPoints({
      ageBracket: ausAge,
      englishLevel: ausEnglish,
      qualification: ausQual,
      experienceYears: ausExp,
    });
  }, [ausAge, ausEnglish, ausQual, ausExp]);

  /**
   * Budget bands rendered in the account's own currency. These used to
   * be literal "$3k+" strings, so a BDT account still read dollars.
   */
  const budgetOptions = useMemo(
    () =>
      buildBantBudgetOptions(defaultCurrency, {
        premium: t("budgetPremium"),
        standard: t("budgetStandard"),
        basic: t("budgetBasic"),
        none: t("budgetNone"),
      }),
    [defaultCurrency, t]
  );

  // Computed Lead Score Result
  const bantResult = useMemo(() => {
    return calculateLeadScore({
      budget: bantBudget,
      authority: bantAuthority,
      need: bantNeed,
      timeline: bantTimeline,
    });
  }, [bantBudget, bantAuthority, bantNeed, bantTimeline]);

  // Handler for sending formatted scorecard to message thread
  const handleSendScorecard = () => {
    let summaryText = "";
    if (effectiveMode === "canada_crs") {
      summaryText = crsResult.formattedSummary;
    } else if (effectiveMode === "australia_points") {
      summaryText = ausResult.formattedSummary;
    } else {
      summaryText = bantResult.summary;
    }

    if (onPrefillReminder) {
      onPrefillReminder(summaryText);
      toast.success(t("toastSent"));
    } else {
      navigator.clipboard.writeText(summaryText);
      toast.success("Scorecard copied to clipboard");
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card">
      {/* Mode Switcher — only meaningful when more than one calculator
          applies to this vertical. */}
      {showImmigrationModes && (
      <div className="border-b border-border p-2 bg-muted/20">
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted/60 p-0.5">
          <button
            type="button"
            onClick={() => setMode("canada_crs")}
            className={cn(
              "flex items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-medium transition-all",
              effectiveMode === "canada_crs"
                ? "bg-background text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            )}
          >
            <span>🍁 Canada</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("australia_points")}
            className={cn(
              "flex items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-medium transition-all",
              effectiveMode === "australia_points"
                ? "bg-background text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            )}
          >
            <Compass className="h-3 w-3 text-blue-500" />
            <span>Australia</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("lead_score")}
            className={cn(
              "flex items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-medium transition-all",
              effectiveMode === "lead_score"
                ? "bg-background text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            )}
          >
            <Award className="h-3 w-3 text-amber-500" />
            <span>BANT</span>
          </button>
        </div>
      </div>
      )}

      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-4 p-4">
          {/* Header Info */}
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                {effectiveMode === "canada_crs"
                  ? t("countryCanada")
                  : effectiveMode === "australia_points"
                    ? t("countryAustralia")
                    : t("countryLeadScore")}
              </h3>
              <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                {contact?.name || "Live Calculator"}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
              {t("subtitle")}
            </p>
          </div>

          {/* ============================================================ */}
          {/* 1. CANADA EXPRESS ENTRY CRS CALCULATOR */}
          {/* ============================================================ */}
          {effectiveMode === "canada_crs" && (
            <div className="space-y-4">
              {/* Score Meter Banner */}
              <div
                className={cn(
                  "relative overflow-hidden rounded-xl border p-4 transition-all",
                  crsResult.tier === "high_priority"
                    ? "border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent"
                    : crsResult.tier === "moderate"
                      ? "border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent"
                      : "border-rose-500/30 bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-transparent"
                )}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {t("totalScore")}
                    </span>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="text-3xl font-extrabold tracking-tight text-foreground">
                        {crsResult.totalScore}
                      </span>
                      <span className="text-xs font-medium text-muted-foreground">
                        / {crsResult.maxPossible}
                      </span>
                    </div>
                  </div>

                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] font-semibold",
                      crsResult.tier === "high_priority"
                        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
                        : crsResult.tier === "moderate"
                          ? "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-300"
                          : "border-rose-500/40 bg-rose-500/15 text-rose-600 dark:text-rose-300"
                    )}
                  >
                    {crsResult.tier === "high_priority" ? (
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                    ) : crsResult.tier === "moderate" ? (
                      <TrendingUp className="mr-1 h-3 w-3" />
                    ) : (
                      <AlertCircle className="mr-1 h-3 w-3" />
                    )}
                    {crsResult.tierLabel}
                  </Badge>
                </div>

                {/* Score Progress Bar */}
                <div className="mt-3">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full transition-all duration-300",
                        crsResult.tier === "high_priority"
                          ? "bg-emerald-500"
                          : crsResult.tier === "moderate"
                            ? "bg-amber-500"
                            : "bg-rose-500"
                      )}
                      style={{
                        width: `${Math.min(100, Math.round((crsResult.totalScore / 600) * 100))}%`,
                      }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                    <span>0</span>
                    <span className="font-semibold text-amber-500">400 (Booster)</span>
                    <span className="font-semibold text-emerald-500">470 (ITA Target)</span>
                    <span>600</span>
                  </div>
                </div>

                {/* Point Breakdown Pills */}
                <div className="mt-3 grid grid-cols-2 gap-1.5 pt-2 border-t border-border/50 text-[11px]">
                  <div className="flex justify-between rounded-md bg-background/60 px-2 py-1">
                    <span className="text-muted-foreground">Age:</span>
                    <span className="font-semibold text-foreground">{crsResult.breakdown.agePoints}/110</span>
                  </div>
                  <div className="flex justify-between rounded-md bg-background/60 px-2 py-1">
                    <span className="text-muted-foreground">Edu:</span>
                    <span className="font-semibold text-foreground">{crsResult.breakdown.educationPoints}/150</span>
                  </div>
                  <div className="flex justify-between rounded-md bg-background/60 px-2 py-1">
                    <span className="text-muted-foreground">Language:</span>
                    <span className="font-semibold text-foreground">{crsResult.breakdown.languagePoints}/136</span>
                  </div>
                  <div className="flex justify-between rounded-md bg-background/60 px-2 py-1">
                    <span className="text-muted-foreground">Exp:</span>
                    <span className="font-semibold text-foreground">{crsResult.breakdown.experiencePoints}/50</span>
                  </div>
                  {crsResult.breakdown.bonusPoints > 0 && (
                    <div className="col-span-2 flex justify-between rounded-md bg-emerald-500/10 px-2 py-1 text-emerald-600 dark:text-emerald-300 font-semibold">
                      <span>Bonuses (Job / PNP / Can Exp):</span>
                      <span>+{crsResult.breakdown.bonusPoints} pts</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Recommendation Card */}
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                <div className="flex items-center gap-1.5 font-semibold text-foreground mb-1">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span>Strategic Recommendation</span>
                </div>
                <p>{crsResult.recommendation}</p>
              </div>

              {/* Form Controls */}
              <div className="space-y-3.5">
                {/* 1. Age Range */}
                <div>
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between mb-1.5">
                    <span>1. {t("ageLabel")}</span>
                    <span className="text-[11px] font-normal text-muted-foreground">
                      {crsResult.breakdown.agePoints} pts
                    </span>
                  </label>
                  <div className="grid grid-cols-2 gap-1">
                    {[
                      { id: "18_29" as const, label: "18 – 29 yrs (110)" },
                      { id: "30_34" as const, label: "30 – 34 yrs (95)" },
                      { id: "35_39" as const, label: "35 – 39 yrs (75)" },
                      { id: "40_44" as const, label: "40 – 44 yrs (35)" },
                      { id: "45_plus" as const, label: "45+ yrs (0)", span: 2 },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setCrsAge(opt.id)}
                        className={cn(
                          "rounded-md border px-2 py-1.5 text-left text-xs transition-all",
                          opt.span === 2 && "col-span-2",
                          crsAge === opt.id
                            ? "border-primary bg-primary/10 font-semibold text-primary"
                            : "border-border bg-card text-muted-foreground hover:border-border hover:bg-muted/50"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Education */}
                <div>
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between mb-1.5">
                    <span>2. {t("educationLabel")}</span>
                    <span className="text-[11px] font-normal text-muted-foreground">
                      {crsResult.breakdown.educationPoints} pts
                    </span>
                  </label>
                  <div className="space-y-1">
                    {[
                      { id: "phd" as const, label: "PhD / Doctorate (150 pts)" },
                      { id: "masters" as const, label: "Master's / Professional Degree (135 pts)" },
                      { id: "bachelors" as const, label: "Bachelor's Degree / 3+ Yr (120 pts)" },
                      { id: "diploma_2yr" as const, label: "2-Year Post-Secondary Diploma (98 pts)" },
                      { id: "secondary" as const, label: "Secondary / High School (30 pts)" },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setCrsEdu(opt.id)}
                        className={cn(
                          "flex w-full items-center justify-between rounded-md border px-2.5 py-1.5 text-xs text-left transition-all",
                          crsEdu === opt.id
                            ? "border-primary bg-primary/10 font-semibold text-primary"
                            : "border-border bg-card text-muted-foreground hover:border-border hover:bg-muted/50"
                        )}
                      >
                        <span>{opt.label}</span>
                        {crsEdu === opt.id && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Language CLB Level */}
                <div>
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between mb-1.5">
                    <span>3. {t("languageLabel")}</span>
                    <span className="text-[11px] font-normal text-muted-foreground">
                      {crsResult.breakdown.languagePoints} pts
                    </span>
                  </label>
                  <div className="grid grid-cols-2 gap-1">
                    {[
                      { id: "clb_10" as const, label: "CLB 10+ (136 pts)" },
                      { id: "clb_9" as const, label: "CLB 9 (8777) (124)" },
                      { id: "clb_8" as const, label: "CLB 8 (92 pts)" },
                      { id: "clb_7" as const, label: "CLB 7 (68 pts)" },
                      { id: "clb_less_7" as const, label: "Below CLB 7 (0 pts)", span: 2 },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setCrsLang(opt.id)}
                        className={cn(
                          "rounded-md border px-2 py-1.5 text-left text-xs transition-all",
                          opt.span === 2 && "col-span-2",
                          crsLang === opt.id
                            ? "border-primary bg-primary/10 font-semibold text-primary"
                            : "border-border bg-card text-muted-foreground hover:border-border hover:bg-muted/50"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 4. Foreign Skilled Work Experience */}
                <div>
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between mb-1.5">
                    <span>4. {t("experienceLabel")}</span>
                    <span className="text-[11px] font-normal text-muted-foreground">
                      {crsResult.breakdown.experiencePoints} pts
                    </span>
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { id: "3_plus" as const, label: "3+ Yrs (50)" },
                      { id: "1_2" as const, label: "1–2 Yrs (25)" },
                      { id: "less_1" as const, label: "<1 Yr (0)" },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setCrsExp(opt.id)}
                        className={cn(
                          "rounded-md border px-2 py-1.5 text-center text-xs transition-all",
                          crsExp === opt.id
                            ? "border-primary bg-primary/10 font-semibold text-primary"
                            : "border-border bg-card text-muted-foreground hover:border-border hover:bg-muted/50"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 5. Additional Boosters & Bonuses */}
                <div>
                  <label className="text-xs font-semibold text-foreground mb-1.5 block">
                    5. {t("bonusesLabel")}
                  </label>
                  <div className="space-y-1.5">
                    <button
                      type="button"
                      onClick={() => setCanadianExp(canadianExp === "1_plus" ? "none" : "1_plus")}
                      className={cn(
                        "flex w-full items-center justify-between rounded-md border px-3 py-2 text-xs transition-all",
                        canadianExp === "1_plus"
                          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 font-medium"
                          : "border-border bg-card text-muted-foreground hover:bg-muted/50"
                      )}
                    >
                      <span>{t("canadianExpLabel")}</span>
                      {canadianExp === "1_plus" && <Check className="h-3.5 w-3.5" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => setHasJobOfferOrPnp(!hasJobOfferOrPnp)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-md border px-3 py-2 text-xs transition-all",
                        hasJobOfferOrPnp
                          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 font-medium"
                          : "border-border bg-card text-muted-foreground hover:bg-muted/50"
                      )}
                    >
                      <span>{t("jobOfferPnpLabel")}</span>
                      {hasJobOfferOrPnp && <Check className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* 2. AUSTRALIA POINTS TEST */}
          {/* ============================================================ */}
          {effectiveMode === "australia_points" && (
            <div className="space-y-4">
              {/* Australia Score Banner */}
              <div
                className={cn(
                  "relative overflow-hidden rounded-xl border p-4 transition-all",
                  ausResult.isEligible
                    ? "border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent"
                    : "border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent"
                )}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Australia Migration Points
                    </span>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="text-3xl font-extrabold tracking-tight text-foreground">
                        {ausResult.totalPoints}
                      </span>
                      <span className="text-xs font-medium text-muted-foreground">
                        (Pass Mark: {ausResult.passMark})
                      </span>
                    </div>
                  </div>

                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] font-semibold",
                      ausResult.isEligible
                        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
                        : "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-300"
                    )}
                  >
                    {ausResult.isEligible ? (
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                    ) : (
                      <AlertCircle className="mr-1 h-3 w-3" />
                    )}
                    {ausResult.isEligible ? t("eligibleStatus") : t("ineligibleStatus")}
                  </Badge>
                </div>

                {/* Point Breakdown Pills */}
                <div className="mt-3 grid grid-cols-2 gap-1.5 pt-2 border-t border-border/50 text-[11px]">
                  <div className="flex justify-between rounded-md bg-background/60 px-2 py-1">
                    <span className="text-muted-foreground">Age:</span>
                    <span className="font-semibold text-foreground">{ausResult.breakdown.agePts} pts</span>
                  </div>
                  <div className="flex justify-between rounded-md bg-background/60 px-2 py-1">
                    <span className="text-muted-foreground">English:</span>
                    <span className="font-semibold text-foreground">{ausResult.breakdown.engPts} pts</span>
                  </div>
                  <div className="flex justify-between rounded-md bg-background/60 px-2 py-1">
                    <span className="text-muted-foreground">Qualification:</span>
                    <span className="font-semibold text-foreground">{ausResult.breakdown.qualPts} pts</span>
                  </div>
                  <div className="flex justify-between rounded-md bg-background/60 px-2 py-1">
                    <span className="text-muted-foreground">Experience:</span>
                    <span className="font-semibold text-foreground">{ausResult.breakdown.expPts} pts</span>
                  </div>
                </div>
              </div>

              {/* Australia Controls */}
              <div className="space-y-3.5">
                {/* Age */}
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1.5">
                    1. {t("ageBracket")}
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { id: "25_32" as const, label: "25–32 (30)" },
                      { id: "18_24" as const, label: "18–24 (25)" },
                      { id: "33_39" as const, label: "33–39 (25)" },
                      { id: "40_44" as const, label: "40–44 (15)", span: 3 },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setAusAge(opt.id as AustraliaAgeBracket)}
                        className={cn(
                          "rounded-md border px-2 py-1.5 text-center text-xs transition-all",
                          opt.span === 3 && "col-span-3",
                          ausAge === opt.id
                            ? "border-primary bg-primary/10 font-semibold text-primary"
                            : "border-border bg-card text-muted-foreground hover:bg-muted/50"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* English */}
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1.5">
                    2. {t("englishLevel")}
                  </label>
                  <div className="space-y-1">
                    {[
                      { id: "superior" as const, label: "Superior (PTE 79+ / IELTS 8+) — 20 pts" },
                      { id: "proficient" as const, label: "Proficient (PTE 65+ / IELTS 7+) — 10 pts" },
                      { id: "competent" as const, label: "Competent (PTE 50+ / IELTS 6+) — 0 pts" },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setAusEnglish(opt.id)}
                        className={cn(
                          "flex w-full items-center justify-between rounded-md border px-2.5 py-1.5 text-xs text-left transition-all",
                          ausEnglish === opt.id
                            ? "border-primary bg-primary/10 font-semibold text-primary"
                            : "border-border bg-card text-muted-foreground hover:bg-muted/50"
                        )}
                      >
                        <span>{opt.label}</span>
                        {ausEnglish === opt.id && <Check className="h-3.5 w-3.5 text-primary" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Qualification */}
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1.5">
                    3. {t("qualification")}
                  </label>
                  <div className="space-y-1">
                    {[
                      { id: "doctorate" as const, label: "Doctorate (PhD) — 20 pts" },
                      { id: "bachelor_master" as const, label: "Bachelor's or Master's Degree — 15 pts" },
                      { id: "diploma_trade" as const, label: "Diploma or Trade Qualification — 10 pts" },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setAusQual(opt.id)}
                        className={cn(
                          "flex w-full items-center justify-between rounded-md border px-2.5 py-1.5 text-xs text-left transition-all",
                          ausQual === opt.id
                            ? "border-primary bg-primary/10 font-semibold text-primary"
                            : "border-border bg-card text-muted-foreground hover:bg-muted/50"
                        )}
                      >
                        <span>{opt.label}</span>
                        {ausQual === opt.id && <Check className="h-3.5 w-3.5 text-primary" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Experience */}
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1.5">
                    4. {t("experienceLabel")}
                  </label>
                  <div className="grid grid-cols-2 gap-1">
                    {[
                      { id: "8_plus" as const, label: "8+ Yrs (15 pts)" },
                      { id: "5_7" as const, label: "5 – 7 Yrs (10 pts)" },
                      { id: "3_4" as const, label: "3 – 4 Yrs (5 pts)" },
                      { id: "less_3" as const, label: "<3 Yrs (0 pts)" },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setAusExp(opt.id)}
                        className={cn(
                          "rounded-md border px-2 py-1.5 text-center text-xs transition-all",
                          ausExp === opt.id
                            ? "border-primary bg-primary/10 font-semibold text-primary"
                            : "border-border bg-card text-muted-foreground hover:bg-muted/50"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* 3. UNIVERSAL BANT LEAD SCORE */}
          {/* ============================================================ */}
          {effectiveMode === "lead_score" && (
            <div className="space-y-4">
              <div
                className={cn(
                  "relative overflow-hidden rounded-xl border p-4 transition-all",
                  bantResult.tier === "hot"
                    ? "border-emerald-500/30 bg-emerald-500/10"
                    : bantResult.tier === "warm"
                      ? "border-amber-500/30 bg-amber-500/10"
                      : "border-muted bg-muted/30"
                )}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      BANT Qualification Score
                    </span>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="text-3xl font-extrabold tracking-tight text-foreground">
                        {bantResult.score}
                      </span>
                      <span className="text-xs font-medium text-muted-foreground">/ 100</span>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] font-semibold",
                      bantResult.tier === "hot"
                        ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-600 dark:text-emerald-300"
                        : bantResult.tier === "warm"
                          ? "border-amber-500/40 bg-amber-500/20 text-amber-600 dark:text-amber-300"
                          : "border-border text-muted-foreground"
                    )}
                  >
                    {bantResult.tierLabel}
                  </Badge>
                </div>
              </div>

              {/* BANT Inputs */}
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    1. {t("leadBudget")}
                  </label>
                  <div className="grid grid-cols-2 gap-1">
                    {budgetOptions.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setBantBudget(opt.id)}
                        className={cn(
                          "rounded-md border px-2 py-1.5 text-xs text-left transition-all",
                          bantBudget === opt.id
                            ? "border-primary bg-primary/10 font-semibold text-primary"
                            : "border-border bg-card text-muted-foreground hover:bg-muted/50"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    2. {t("leadAuthority")}
                  </label>
                  <div className="space-y-1">
                    {[
                      { id: "decision_maker" as const, label: "Primary Decision Maker (25 pts)" },
                      { id: "influencer" as const, label: "Family / Stakeholder (15 pts)" },
                      { id: "evaluator" as const, label: "Browsing / Researcher (5 pts)" },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setBantAuthority(opt.id)}
                        className={cn(
                          "flex w-full items-center justify-between rounded-md border px-2.5 py-1.5 text-xs text-left transition-all",
                          bantAuthority === opt.id
                            ? "border-primary bg-primary/10 font-semibold text-primary"
                            : "border-border bg-card text-muted-foreground hover:bg-muted/50"
                        )}
                      >
                        <span>{opt.label}</span>
                        {bantAuthority === opt.id && <Check className="h-3.5 w-3.5 text-primary" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    3. {t("leadNeed")}
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { id: "urgent" as const, label: "Urgent (25)" },
                      { id: "planned" as const, label: "Planned (15)" },
                      { id: "exploring" as const, label: "Exploring (5)" },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setBantNeed(opt.id)}
                        className={cn(
                          "rounded-md border px-2 py-1.5 text-center text-xs transition-all",
                          bantNeed === opt.id
                            ? "border-primary bg-primary/10 font-semibold text-primary"
                            : "border-border bg-card text-muted-foreground hover:bg-muted/50"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    4. {t("leadTimeline")}
                  </label>
                  <div className="grid grid-cols-2 gap-1">
                    {[
                      { id: "immediate" as const, label: "Immediate (20 pts)" },
                      { id: "within_1mo" as const, label: "< 1 Month (15 pts)" },
                      { id: "within_3mo" as const, label: "1–3 Months (10 pts)" },
                      { id: "future" as const, label: "Future / Unknown (0)" },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setBantTimeline(opt.id)}
                        className={cn(
                          "rounded-md border px-2 py-1.5 text-xs text-left transition-all",
                          bantTimeline === opt.id
                            ? "border-primary bg-primary/10 font-semibold text-primary"
                            : "border-border bg-card text-muted-foreground hover:bg-muted/50"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Sticky Bottom Action Bar */}
      <div className="border-t border-border bg-card p-3 shadow-lg">
        <Button
          type="button"
          onClick={handleSendScorecard}
          className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-xs"
        >
          <Send className="h-3.5 w-3.5" />
          <span>{t("sendToChat")}</span>
        </Button>
      </div>
    </div>
  );
}
