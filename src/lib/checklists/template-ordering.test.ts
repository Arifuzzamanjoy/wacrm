import { describe, expect, it } from "vitest";
import {
  sortTemplatesForPicker,
  filterHiddenTemplates,
} from "./template-ordering";
import type { ChecklistTemplate } from "@/types";

function tpl(
  name: string,
  overrides: Partial<ChecklistTemplate> = {},
): ChecklistTemplate {
  return {
    id: `id-${name}`,
    account_id: null,
    industry: "immigration",
    region_code: null,
    category: null,
    name,
    default_items: [],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("sortTemplatesForPicker", () => {
  /** The point of the whole module. */
  it("puts country-neutral templates before country-bound ones", () => {
    const sorted = sortTemplatesForPicker([
      tpl("Canada Study Permit", { region_code: "CA" }),
      tpl("Study Visa"),
      tpl("UK Student Visa", { region_code: "UK" }),
      tpl("Work Visa / Permit"),
    ]);
    expect(sorted.map((t) => t.name)).toEqual([
      "Study Visa",
      "Work Visa / Permit",
      "Canada Study Permit",
      "UK Student Visa",
    ]);
  });

  it("puts the account's own templates ahead of built-ins in each band", () => {
    const sorted = sortTemplatesForPicker([
      tpl("Study Visa"),
      tpl("Our Own Intake", { account_id: "acc-1" }),
    ]);
    expect(sorted[0].name).toBe("Our Own Intake");
  });

  it("keeps a custom country template ahead of a built-in country one", () => {
    const sorted = sortTemplatesForPicker([
      tpl("Canada Study Permit", { region_code: "CA" }),
      tpl("Our Canada Flow", { region_code: "CA", account_id: "acc-1" }),
    ]);
    expect(sorted[0].name).toBe("Our Canada Flow");
  });

  it("still ranks a generic built-in above a custom country template", () => {
    // Country-neutrality outranks ownership: the case-type list is the
    // primary path regardless of who authored the corridor template.
    const sorted = sortTemplatesForPicker([
      tpl("Our Canada Flow", { region_code: "CA", account_id: "acc-1" }),
      tpl("Study Visa"),
    ]);
    expect(sorted[0].name).toBe("Study Visa");
  });

  it("groups corridors together and sorts by name inside them", () => {
    const sorted = sortTemplatesForPicker([
      tpl("UK Skilled Worker", { region_code: "UK" }),
      tpl("Canada Work Permit", { region_code: "CA" }),
      tpl("Canada Study Permit", { region_code: "CA" }),
    ]);
    expect(sorted.map((t) => t.region_code)).toEqual(["CA", "CA", "UK"]);
    expect(sorted[0].name).toBe("Canada Study Permit");
  });

  it("sorts generic templates by name", () => {
    const sorted = sortTemplatesForPicker([
      tpl("Work Visa / Permit"),
      tpl("Family Sponsorship"),
      tpl("Study Visa"),
    ]);
    expect(sorted.map((t) => t.name)).toEqual([
      "Family Sponsorship",
      "Study Visa",
      "Work Visa / Permit",
    ]);
  });

  it("does not mutate the input", () => {
    const input = [tpl("B", { region_code: "CA" }), tpl("A")];
    const before = input.map((t) => t.name);
    sortTemplatesForPicker(input);
    expect(input.map((t) => t.name)).toEqual(before);
  });

  it("handles an empty list", () => {
    expect(sortTemplatesForPicker([])).toEqual([]);
  });
});

describe("filterHiddenTemplates", () => {
  const all = [tpl("Study Visa"), tpl("Canada Study Permit", { region_code: "CA" })];

  it("removes hidden templates", () => {
    const out = filterHiddenTemplates(all, ["id-Canada Study Permit"]);
    expect(out.map((t) => t.name)).toEqual(["Study Visa"]);
  });

  it("returns the input untouched when nothing is hidden", () => {
    expect(filterHiddenTemplates(all, [])).toHaveLength(2);
    expect(filterHiddenTemplates(all, null)).toHaveLength(2);
    expect(filterHiddenTemplates(all, undefined)).toHaveLength(2);
  });

  it("ignores hidden ids that no longer exist", () => {
    expect(filterHiddenTemplates(all, ["gone"])).toHaveLength(2);
  });

  it("can hide everything without erroring", () => {
    expect(filterHiddenTemplates(all, all.map((t) => t.id))).toEqual([]);
  });
});
