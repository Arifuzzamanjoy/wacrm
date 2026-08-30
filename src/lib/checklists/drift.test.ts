import { describe, expect, it } from "vitest";
import { detectChecklistDrift } from "./drift";
import type { ChecklistTemplate, ContactDocument } from "@/types";

const APPLIED = "2026-08-01T10:00:00.000Z";
const BEFORE = "2026-07-01T10:00:00.000Z";
const AFTER = "2026-08-20T10:00:00.000Z";

function doc(
  title: string,
  overrides: Partial<ContactDocument> = {},
): ContactDocument {
  return {
    id: `doc-${title}`,
    account_id: "acc-1",
    contact_id: "contact-1",
    category: "Canada Spousal Sponsorship",
    title,
    is_mandatory: true,
    status: "missing",
    template_id: "tpl-1",
    applied_at: APPLIED,
    created_at: APPLIED,
    updated_at: APPLIED,
    ...overrides,
  };
}

function template(
  titles: string[],
  overrides: Partial<ChecklistTemplate> = {},
): ChecklistTemplate {
  return {
    id: "tpl-1",
    account_id: "acc-1",
    industry: "immigration",
    region_code: "CA",
    category: "Spousal Sponsorship",
    name: "Canada Spousal / Common-Law Sponsorship",
    default_items: titles.map((title) => ({ title, is_mandatory: true })),
    created_at: BEFORE,
    updated_at: BEFORE,
    ...overrides,
  };
}

describe("detectChecklistDrift", () => {
  it("reports requirements added to the template since it was applied", () => {
    const result = detectChecklistDrift(
      [doc("Passport"), doc("Marriage Certificate")],
      [template(["Passport", "Marriage Certificate", "Police Clearance"], {
        updated_at: AFTER,
      })],
    );
    expect(result.hasDrifted).toBe(true);
    expect(result.newRequirements).toEqual(["Police Clearance"]);
    expect(result.templateName).toContain("Spousal");
  });

  it("stays quiet when the template has not changed", () => {
    const result = detectChecklistDrift(
      [doc("Passport")],
      [template(["Passport", "Police Clearance"], { updated_at: BEFORE })],
    );
    expect(result.hasDrifted).toBe(false);
    expect(result.newRequirements).toEqual([]);
  });

  it("stays quiet when the template changed but added nothing", () => {
    // e.g. an admin reworded a description or renamed the template.
    const result = detectChecklistDrift(
      [doc("Passport")],
      [template(["Passport"], { updated_at: AFTER })],
    );
    expect(result.hasDrifted).toBe(false);
  });

  /**
   * The whole point of the design: an applied checklist is a record of
   * what was asked at the time. A requirement dropped from the template
   * must never be surfaced as something to remove — the client may
   * already have submitted and had it verified.
   */
  it("never reports removals, only additions", () => {
    const result = detectChecklistDrift(
      [doc("Passport"), doc("Police Clearance", { status: "verified" })],
      [template(["Passport"], { updated_at: AFTER })],
    );
    expect(result.hasDrifted).toBe(false);
    expect(result.newRequirements).toEqual([]);
  });

  it("matches titles case- and whitespace-insensitively", () => {
    const result = detectChecklistDrift(
      [doc("  passport  ")],
      [template(["Passport"], { updated_at: AFTER })],
    );
    expect(result.newRequirements).toEqual([]);
  });

  // --- states that must degrade quietly ---

  it("reports nothing for a checklist with no documents", () => {
    expect(detectChecklistDrift([], [template(["Passport"])]).hasDrifted).toBe(
      false,
    );
  });

  it("reports nothing for pre-046 rows with no provenance", () => {
    const legacy = doc("Passport", { template_id: undefined, applied_at: undefined });
    const result = detectChecklistDrift(
      [legacy],
      [template(["Passport", "New Doc"], { updated_at: AFTER })],
    );
    expect(result.hasDrifted).toBe(false);
    expect(result.templateId).toBeNull();
  });

  it("reports nothing when the template has been deleted", () => {
    const result = detectChecklistDrift([doc("Passport")], []);
    expect(result.hasDrifted).toBe(false);
  });

  it("falls back to created_at when applied_at is absent", () => {
    const partial = doc("Passport", {
      applied_at: undefined,
      created_at: APPLIED,
    });
    const result = detectChecklistDrift(
      [partial],
      [template(["Passport", "Police Clearance"], { updated_at: AFTER })],
    );
    expect(result.hasDrifted).toBe(true);
  });

  it("does not invent drift from unparseable timestamps", () => {
    const result = detectChecklistDrift(
      [doc("Passport", { applied_at: "not-a-date" })],
      [template(["Passport", "New Doc"], { updated_at: AFTER })],
    );
    expect(result.hasDrifted).toBe(false);
  });

  it("finds provenance even when the first row predates it", () => {
    // A manually added doc (no template_id) sorted ahead of the batch.
    const manual = doc("Ad-hoc Letter", {
      id: "manual",
      template_id: undefined,
      applied_at: undefined,
    });
    const result = detectChecklistDrift(
      [manual, doc("Passport")],
      [template(["Passport", "Police Clearance"], { updated_at: AFTER })],
    );
    expect(result.hasDrifted).toBe(true);
    expect(result.newRequirements).toEqual(["Police Clearance"]);
  });

  it("ignores templates other than the one applied", () => {
    const other = template(["Passport", "Unrelated"], {
      id: "tpl-other",
      updated_at: AFTER,
    });
    const result = detectChecklistDrift([doc("Passport")], [other]);
    expect(result.hasDrifted).toBe(false);
  });
});
