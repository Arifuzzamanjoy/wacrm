import type { ChecklistTemplateItem } from "@/types";

/**
 * Validation for account-authored checklist templates.
 *
 * The five seeded immigration templates are global rows
 * (`account_id IS NULL`) and cover only the most common streams. An
 * agency running spousal sponsorship, work permits, visitor visas or
 * PR needs its own — this is the shape check those go through.
 *
 * Kept as a pure function rather than inline in the route so the rules
 * are testable without standing up a request, matching how
 * `validateInteractivePayload` is factored.
 */

export const TEMPLATE_LIMITS = {
  nameMax: 120,
  industryMax: 64,
  regionMax: 8,
  categoryMax: 120,
  itemTitleMax: 200,
  itemDescriptionMax: 500,
  maxItems: 100,
} as const;

export interface ValidatedChecklistTemplate {
  name: string;
  industry: string;
  region_code: string | null;
  category: string | null;
  default_items: ChecklistTemplateItem[];
}

export type ValidationResult =
  | { ok: true; value: ValidatedChecklistTemplate }
  | { ok: false; error: string };

function fail(error: string): ValidationResult {
  return { ok: false, error };
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Validate one checklist item. Returns the normalized item or an error
 * string naming the offending row (1-based, so it matches what the UI
 * shows the user).
 */
function validateItem(
  raw: unknown,
  index: number
): { ok: true; value: ChecklistTemplateItem } | { ok: false; error: string } {
  const position = index + 1;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: `Item ${position} must be an object` };
  }
  const item = raw as Record<string, unknown>;

  const title = cleanString(item.title);
  if (!title) {
    return { ok: false, error: `Item ${position} needs a title` };
  }
  if (title.length > TEMPLATE_LIMITS.itemTitleMax) {
    return {
      ok: false,
      error: `Item ${position} title must be ${TEMPLATE_LIMITS.itemTitleMax} characters or fewer`,
    };
  }

  const description = cleanString(item.description);
  if (description.length > TEMPLATE_LIMITS.itemDescriptionMax) {
    return {
      ok: false,
      error: `Item ${position} description must be ${TEMPLATE_LIMITS.itemDescriptionMax} characters or fewer`,
    };
  }

  const value: ChecklistTemplateItem = {
    title,
    // Mandatory unless explicitly turned off — the same default the
    // apply-template path uses when writing contact_documents rows.
    is_mandatory: item.is_mandatory === false ? false : true,
  };
  if (description) value.description = description;
  if (item.expiry_required === true) value.expiry_required = true;

  if (Array.isArray(item.accepted_formats)) {
    const formats = item.accepted_formats
      .map((f) => cleanString(f).toLowerCase())
      .filter(Boolean);
    if (formats.length > 0) value.accepted_formats = formats;
  }

  return { ok: true, value };
}

/**
 * Validate a create/update payload for a checklist template.
 *
 * `industry`, `region_code` and `category` stay free text, matching the
 * columns — the taxonomy in `industries.ts` is a UI convenience, not a
 * constraint, so an agency can coin a vertical or a region we do not
 * ship. Only length and shape are enforced here.
 */
export function validateChecklistTemplate(body: unknown): ValidationResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return fail("Request body must be an object");
  }
  const input = body as Record<string, unknown>;

  const name = cleanString(input.name);
  if (!name) return fail("Template name is required");
  if (name.length > TEMPLATE_LIMITS.nameMax) {
    return fail(
      `Template name must be ${TEMPLATE_LIMITS.nameMax} characters or fewer`
    );
  }

  const industry = cleanString(input.industry) || "general";
  if (industry.length > TEMPLATE_LIMITS.industryMax) {
    return fail(
      `Industry must be ${TEMPLATE_LIMITS.industryMax} characters or fewer`
    );
  }

  // Region is immigration-flavoured ("CA", "UK", "EU") and optional
  // everywhere else. Uppercased so grouping and the [XX] prefix in the
  // picker stay consistent regardless of how it was typed.
  const regionRaw = cleanString(input.region_code).toUpperCase();
  if (regionRaw.length > TEMPLATE_LIMITS.regionMax) {
    return fail(
      `Region code must be ${TEMPLATE_LIMITS.regionMax} characters or fewer`
    );
  }
  const region_code = regionRaw || null;

  const categoryRaw = cleanString(input.category);
  if (categoryRaw.length > TEMPLATE_LIMITS.categoryMax) {
    return fail(
      `Category must be ${TEMPLATE_LIMITS.categoryMax} characters or fewer`
    );
  }
  const category = categoryRaw || null;

  if (!Array.isArray(input.default_items)) {
    return fail("default_items must be an array");
  }
  if (input.default_items.length === 0) {
    return fail("Add at least one document requirement");
  }
  if (input.default_items.length > TEMPLATE_LIMITS.maxItems) {
    return fail(
      `A template can hold at most ${TEMPLATE_LIMITS.maxItems} requirements`
    );
  }

  const default_items: ChecklistTemplateItem[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < input.default_items.length; i++) {
    const result = validateItem(input.default_items[i], i);
    if (!result.ok) return fail(result.error);
    // Duplicate titles would produce two indistinguishable rows on the
    // contact's checklist, which the agent then can't tell apart.
    const key = result.value.title.toLowerCase();
    if (seen.has(key)) {
      return fail(`Duplicate requirement: "${result.value.title}"`);
    }
    seen.add(key);
    default_items.push(result.value);
  }

  return {
    ok: true,
    value: { name, industry, region_code, category, default_items },
  };
}
