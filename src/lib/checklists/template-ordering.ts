import type { ChecklistTemplate } from "@/types";

/**
 * Ordering for the checklist template picker, within one industry.
 *
 * The rule that matters: **country-neutral templates come first.**
 *
 * Every immigration template originally shipped bound to a corridor
 * ([CA] Study Permit, [UK] Student Visa), so an agency handling many
 * case types had to scan a country list to find the right kind of
 * checklist. Leading with the case-type templates (Study Visa, Work
 * Visa, Family Sponsorship…) means the common path is "pick the case
 * type", and the corridor-specific ones are there for anyone who wants
 * the full country-specific instrument set.
 *
 * Within each of those two bands: an account's own templates before the
 * built-ins — if an agency wrote its own "Study Visa", that is the one
 * it means — then by region code, then by name.
 */
export function sortTemplatesForPicker(
  templates: ChecklistTemplate[],
): ChecklistTemplate[] {
  return [...templates].sort((a, b) => {
    // 1. Country-neutral first.
    const aGeneric = a.region_code ? 1 : 0;
    const bGeneric = b.region_code ? 1 : 0;
    if (aGeneric !== bGeneric) return aGeneric - bGeneric;

    // 2. The account's own templates ahead of the shared built-ins.
    const aOwn = a.account_id ? 0 : 1;
    const bOwn = b.account_id ? 0 : 1;
    if (aOwn !== bOwn) return aOwn - bOwn;

    // 3. Group corridors together.
    const region = (a.region_code ?? "").localeCompare(b.region_code ?? "");
    if (region !== 0) return region;

    return a.name.localeCompare(b.name);
  });
}

/**
 * Drop templates the account has chosen to hide.
 *
 * Only built-ins are hideable — an account's own templates are managed
 * by deleting them. Passing an empty/undefined list is the common case
 * and returns the input unchanged.
 */
export function filterHiddenTemplates(
  templates: ChecklistTemplate[],
  hiddenIds: string[] | null | undefined,
): ChecklistTemplate[] {
  if (!hiddenIds || hiddenIds.length === 0) return templates;
  const hidden = new Set(hiddenIds);
  return templates.filter((t) => !hidden.has(t.id));
}
