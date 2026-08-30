import type { ChecklistIndustry } from "@/types";

/**
 * The industry taxonomy for checklist templates.
 *
 * Immigration is the product's flagship vertical and stays first in
 * every ordered list, but the checklist hub itself is vertical-neutral:
 * an agency picks its industry once (accounts.industry) and the
 * template picker leads with that vertical while still offering the
 * rest.
 *
 * `industry` is stored as free text in the database (mirroring
 * `cases.case_type`), so an account can use a value that isn't listed
 * here — `getIndustryMeta` degrades to a title-cased label rather than
 * throwing.
 */
export interface IndustryMeta {
  /** Stable database value. */
  id: ChecklistIndustry;
  /** Human label for pickers and section headers. */
  label: string;
  /** One-line description shown under the label in the settings picker. */
  description: string;
  /** Emoji used as a lightweight icon (keeps the bundle free of icon imports). */
  emoji: string;
  /**
   * What this vertical calls the thing a checklist is attached to.
   * Drives copy like "Applying <template> to this application".
   */
  caseNoun: string;
  /** Whether templates in this vertical are region-specific. */
  usesRegion: boolean;
  /**
   * Label for the contact sidebar's document tab. Kept short — three
   * tabs share a narrow strip, so anything past ~14 characters wraps.
   */
  docsLabel: string;
  /** Label for the contact sidebar's scoring tab. Same width budget. */
  scoreLabel: string;
  /**
   * Whether the scoring tab should offer the immigration-only
   * calculators (Canada CRS, Australia points test). Every vertical
   * keeps the BANT lead score, which is not industry-specific.
   */
  immigrationScoring: boolean;
}

export const INDUSTRIES: IndustryMeta[] = [
  {
    id: "immigration",
    label: "Immigration",
    description: "Visa, PR and citizenship casework",
    emoji: "🛂",
    caseNoun: "application",
    usesRegion: true,
    docsLabel: "Visa Docs",
    scoreLabel: "Eligibility & CRS",
    immigrationScoring: true,
  },
  {
    id: "marketing",
    label: "Marketing Agency",
    description: "Client onboarding, brand assets and ad account access",
    emoji: "📣",
    caseNoun: "engagement",
    usesRegion: false,
    docsLabel: "Assets",
    scoreLabel: "Lead Score",
    immigrationScoring: false,
  },
  {
    id: "ecommerce",
    label: "E-commerce",
    description: "Seller, vendor and product compliance verification",
    emoji: "🛒",
    caseNoun: "account",
    usesRegion: false,
    docsLabel: "Verification",
    scoreLabel: "Lead Score",
    immigrationScoring: false,
  },
  {
    id: "real_estate",
    label: "Real Estate",
    description: "Buyer, tenant and property transaction files",
    emoji: "🏠",
    caseNoun: "transaction",
    usesRegion: false,
    docsLabel: "Documents",
    scoreLabel: "Lead Score",
    immigrationScoring: false,
  },
  {
    id: "insurance",
    label: "Insurance",
    description: "Policy applications, renewals and claims",
    emoji: "🛡️",
    caseNoun: "policy",
    usesRegion: false,
    docsLabel: "Policy Docs",
    scoreLabel: "Lead Score",
    immigrationScoring: false,
  },
  {
    id: "finance",
    label: "Finance & Lending",
    description: "Loan, mortgage and accounting document collection",
    emoji: "💰",
    caseNoun: "application",
    usesRegion: false,
    docsLabel: "Documents",
    scoreLabel: "Lead Score",
    immigrationScoring: false,
  },
  {
    id: "legal",
    label: "Legal",
    description: "Client matter intake and KYC",
    emoji: "⚖️",
    caseNoun: "matter",
    usesRegion: false,
    docsLabel: "Case Docs",
    scoreLabel: "Lead Score",
    immigrationScoring: false,
  },
  {
    id: "healthcare",
    label: "Healthcare",
    description: "Patient intake, insurance and consent forms",
    emoji: "🏥",
    caseNoun: "patient file",
    usesRegion: false,
    docsLabel: "Patient Docs",
    scoreLabel: "Lead Score",
    immigrationScoring: false,
  },
  {
    id: "education",
    label: "Education",
    description: "Student admission and enrolment files",
    emoji: "🎓",
    caseNoun: "admission",
    usesRegion: false,
    docsLabel: "Admission Docs",
    scoreLabel: "Lead Score",
    immigrationScoring: false,
  },
  {
    id: "recruitment",
    label: "Recruitment & HR",
    description: "Candidate onboarding and right-to-work checks",
    emoji: "🧑‍💼",
    caseNoun: "onboarding",
    usesRegion: false,
    docsLabel: "Candidate Docs",
    scoreLabel: "Lead Score",
    immigrationScoring: false,
  },
  {
    id: "general",
    label: "General",
    description: "Vertical-neutral client onboarding",
    emoji: "📋",
    caseNoun: "engagement",
    usesRegion: false,
    docsLabel: "Documents",
    scoreLabel: "Lead Score",
    immigrationScoring: false,
  },
];

const INDUSTRY_BY_ID = new Map<string, IndustryMeta>(
  INDUSTRIES.map((i) => [i.id as string, i])
);

/** Fallback used for any account-coined industry value we don't ship. */
export const FALLBACK_INDUSTRY: IndustryMeta = {
  id: "general",
  label: "General",
  description: "Vertical-neutral client onboarding",
  emoji: "📋",
  caseNoun: "engagement",
  usesRegion: false,
  docsLabel: "Documents",
  scoreLabel: "Lead Score",
  immigrationScoring: false,
};

function titleCase(value: string): string {
  return value
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Resolve an industry id to its metadata. Unknown ids (an account that
 * coined its own vertical) get a title-cased label so the UI still
 * renders something sensible instead of "undefined".
 */
export function getIndustryMeta(
  industry: string | null | undefined
): IndustryMeta {
  if (!industry) return FALLBACK_INDUSTRY;
  const known = INDUSTRY_BY_ID.get(industry);
  if (known) return known;
  return { ...FALLBACK_INDUSTRY, id: industry, label: titleCase(industry) };
}

export function getIndustryLabel(industry: string | null | undefined): string {
  return getIndustryMeta(industry).label;
}

/**
 * Order industries for display, floating the account's own vertical to
 * the top. Everything else keeps the canonical order above so the list
 * doesn't reshuffle between renders.
 */
export function sortIndustriesForAccount(
  industries: string[],
  accountIndustry?: string | null
): string[] {
  const canonical = INDUSTRIES.map((i) => i.id as string);
  const rank = (id: string) => {
    if (accountIndustry && id === accountIndustry) return -1;
    const idx = canonical.indexOf(id);
    return idx === -1 ? canonical.length : idx;
  };
  return [...industries].sort((a, b) => {
    const diff = rank(a) - rank(b);
    return diff !== 0 ? diff : a.localeCompare(b);
  });
}
