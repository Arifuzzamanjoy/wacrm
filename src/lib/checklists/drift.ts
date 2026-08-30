import type { ChecklistTemplate, ContactDocument } from "@/types";

/**
 * Detect when the template a checklist came from has changed since it
 * was applied.
 *
 * Deliberately read-only. Applied checklist rows carry real
 * verification state — who approved a document, when, why one was
 * rejected, the uploaded file — so retroactively rewriting them on a
 * template edit would mutate the record of what was actually asked of
 * and approved for a client. In an immigration or compliance context
 * that is the wrong trade at any convenience.
 *
 * What this gives instead is *notice*: the agent sees that the template
 * gained requirements since this client's checklist was stamped, and
 * decides per contact whether to add them (via the existing "Add Doc"
 * control). The decision stays with the person who knows the file.
 *
 * Only additions are reported. A requirement dropped from the template
 * is not surfaced as an action, because the client may already have
 * submitted it and deleting their verified document is never something
 * to suggest automatically.
 */

export interface ChecklistDrift {
  /** The template these documents were stamped from, if known. */
  templateId: string | null;
  /** Template name, for the notice copy. */
  templateName: string | null;
  /** Template requirement titles absent from this contact's checklist. */
  newRequirements: string[];
  /** True when the template changed after this checklist was applied. */
  hasDrifted: boolean;
}

const NO_DRIFT: ChecklistDrift = {
  templateId: null,
  templateName: null,
  newRequirements: [],
  hasDrifted: false,
};

/** Case- and whitespace-insensitive key, so "Passport " matches "passport". */
function titleKey(title: string): string {
  return title.trim().toLowerCase();
}

export function detectChecklistDrift(
  documents: ContactDocument[],
  templates: ChecklistTemplate[],
): ChecklistDrift {
  if (documents.length === 0) return NO_DRIFT;

  // Provenance is per-checklist, and a contact's documents are applied
  // as one batch, so the first row carrying a template_id identifies
  // the whole set. Documents predating migration 046 have none — that
  // is a supported state meaning "no drift reporting", not an error.
  const stamped = documents.find((d) => d.template_id);
  if (!stamped?.template_id) return NO_DRIFT;

  const template = templates.find((t) => t.id === stamped.template_id);
  if (!template) {
    // Template was deleted (FK is ON DELETE SET NULL, but the local
    // list may also simply not include it). Nothing to compare against.
    return NO_DRIFT;
  }

  // `applied_at` is backfilled from created_at for pre-046 rows, so it
  // is present on every row in practice; fall back defensively.
  const appliedAt = stamped.applied_at ?? stamped.created_at;
  const appliedMs = Date.parse(appliedAt);
  const updatedMs = Date.parse(template.updated_at);

  // Unparseable timestamps must not produce a phantom notice.
  if (Number.isNaN(appliedMs) || Number.isNaN(updatedMs)) return NO_DRIFT;
  if (updatedMs <= appliedMs) {
    return {
      templateId: template.id,
      templateName: template.name,
      newRequirements: [],
      hasDrifted: false,
    };
  }

  const present = new Set(documents.map((d) => titleKey(d.title)));
  const newRequirements = (template.default_items ?? [])
    .filter((item) => !present.has(titleKey(item.title)))
    .map((item) => item.title);

  return {
    templateId: template.id,
    templateName: template.name,
    newRequirements,
    // The template being touched is only worth reporting if it actually
    // means work: an edit that renamed the template or reworded a
    // description leaves nothing for the agent to do.
    hasDrifted: newRequirements.length > 0,
  };
}
