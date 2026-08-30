import { formatCurrencyShort } from "@/lib/currency";

/**
 * Budget bands for the BANT lead-qualification panel.
 *
 * The band boundaries were previously baked into the button labels as
 * literal strings ("Premium ($3k+)"), so every account saw US dollars no
 * matter which currency it had configured — a Bangladeshi agency on BDT
 * still read "$3k+". The amounts now render through
 * {@link formatCurrencyShort} with the account's own currency.
 *
 * Note the boundaries themselves are plain numbers in the account's
 * currency, not converted between currencies: there is no FX rate in
 * this app and inventing one would be worse than not having it. They
 * are starter defaults an agency is expected to reinterpret for its own
 * deal sizes — the score only ever depends on which *tier* is picked
 * (see `calculateLeadScore`), never on the amounts shown here.
 */
export const BANT_BUDGET_THRESHOLDS = {
  /** Floor of the middle band. */
  standardMin: 1500,
  /** Floor of the top band. */
  premiumMin: 3000,
} as const;

export type BantBudgetTier = "enterprise" | "growth" | "starter" | "none";

export interface BantBudgetOption {
  id: BantBudgetTier;
  /** Full button label, e.g. "Premium (৳3.0k+)". */
  label: string;
}

/**
 * Build the four budget buttons for `currency`.
 *
 * `names` supplies the already-translated tier names so this stays a
 * pure function — callers pass them straight from `useTranslations`.
 */
export function buildBantBudgetOptions(
  currency: string,
  names: {
    premium: string;
    standard: string;
    basic: string;
    none: string;
  },
): BantBudgetOption[] {
  const { standardMin, premiumMin } = BANT_BUDGET_THRESHOLDS;
  const standardMinStr = formatCurrencyShort(standardMin, currency);
  const premiumMinStr = formatCurrencyShort(premiumMin, currency);

  return [
    { id: "enterprise", label: `${names.premium} (${premiumMinStr}+)` },
    {
      id: "growth",
      label: `${names.standard} (${standardMinStr}–${premiumMinStr})`,
    },
    { id: "starter", label: `${names.basic} (<${standardMinStr})` },
    { id: "none", label: names.none },
  ];
}
