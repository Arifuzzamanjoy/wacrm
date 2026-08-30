import { describe, expect, it } from "vitest";
import {
  validateChecklistTemplate,
  TEMPLATE_LIMITS,
} from "./template-validation";

const valid = {
  name: "Canada Spousal Sponsorship",
  industry: "immigration",
  region_code: "CA",
  category: "Spousal Sponsorship",
  default_items: [
    { title: "Marriage Certificate", is_mandatory: true },
    { title: "Sponsor Proof of Income", description: "Last 3 NOAs" },
  ],
};

function expectOk(body: unknown) {
  const result = validateChecklistTemplate(body);
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
  return result.value;
}

function expectFail(body: unknown): string {
  const result = validateChecklistTemplate(body);
  if (result.ok) throw new Error("expected failure, got ok");
  return result.error;
}

describe("validateChecklistTemplate", () => {
  it("accepts a well-formed custom immigration template", () => {
    const value = expectOk(valid);
    expect(value.name).toBe("Canada Spousal Sponsorship");
    expect(value.industry).toBe("immigration");
    expect(value.region_code).toBe("CA");
    expect(value.default_items).toHaveLength(2);
  });

  it("defaults requirements to mandatory", () => {
    const value = expectOk({
      ...valid,
      default_items: [{ title: "Passport" }],
    });
    expect(value.default_items[0].is_mandatory).toBe(true);
  });

  it("honours an explicit optional flag", () => {
    const value = expectOk({
      ...valid,
      default_items: [{ title: "Police Certificate", is_mandatory: false }],
    });
    expect(value.default_items[0].is_mandatory).toBe(false);
  });

  it("uppercases the region code so grouping stays consistent", () => {
    expect(expectOk({ ...valid, region_code: "ca" }).region_code).toBe("CA");
  });

  it("treats blank region and category as absent", () => {
    const value = expectOk({ ...valid, region_code: "  ", category: "" });
    expect(value.region_code).toBeNull();
    expect(value.category).toBeNull();
  });

  it("defaults a missing industry to general", () => {
    const { industry, ...rest } = valid;
    void industry;
    expect(expectOk(rest).industry).toBe("general");
  });

  it("keeps an account-coined industry as given", () => {
    expect(expectOk({ ...valid, industry: "pet_grooming" }).industry).toBe(
      "pet_grooming"
    );
  });

  it("trims whitespace from names and titles", () => {
    const value = expectOk({
      ...valid,
      name: "  Work Permit  ",
      default_items: [{ title: "  LMIA  " }],
    });
    expect(value.name).toBe("Work Permit");
    expect(value.default_items[0].title).toBe("LMIA");
  });

  it("normalises accepted formats to lowercase and drops blanks", () => {
    const value = expectOk({
      ...valid,
      default_items: [{ title: "Passport", accepted_formats: ["PDF", " ", "JPG"] }],
    });
    expect(value.default_items[0].accepted_formats).toEqual(["pdf", "jpg"]);
  });

  // --- rejections ---

  it("requires a name", () => {
    expect(expectFail({ ...valid, name: "   " })).toMatch(/name is required/i);
  });

  it("requires at least one requirement", () => {
    expect(expectFail({ ...valid, default_items: [] })).toMatch(
      /at least one/i
    );
  });

  it("rejects a non-array items field", () => {
    expect(expectFail({ ...valid, default_items: "passport" })).toMatch(
      /must be an array/i
    );
  });

  it("rejects an item with no title, naming its position", () => {
    const error = expectFail({
      ...valid,
      default_items: [{ title: "Passport" }, { description: "orphan" }],
    });
    expect(error).toMatch(/item 2/i);
  });

  it("rejects duplicate requirement titles case-insensitively", () => {
    const error = expectFail({
      ...valid,
      default_items: [{ title: "Passport" }, { title: "passport" }],
    });
    expect(error).toMatch(/duplicate/i);
  });

  it("enforces the item cap", () => {
    const many = Array.from(
      { length: TEMPLATE_LIMITS.maxItems + 1 },
      (_, i) => ({ title: `Doc ${i}` })
    );
    expect(expectFail({ ...valid, default_items: many })).toMatch(/at most/i);
  });

  it("enforces the name length cap", () => {
    const long = "x".repeat(TEMPLATE_LIMITS.nameMax + 1);
    expect(expectFail({ ...valid, name: long })).toMatch(/characters or fewer/i);
  });

  it("enforces the item title length cap", () => {
    const long = "x".repeat(TEMPLATE_LIMITS.itemTitleMax + 1);
    expect(
      expectFail({ ...valid, default_items: [{ title: long }] })
    ).toMatch(/characters or fewer/i);
  });

  it("rejects a non-object body", () => {
    for (const bad of [null, "template", 42, ["a"]]) {
      expect(validateChecklistTemplate(bad).ok).toBe(false);
    }
  });

  it("never returns unvalidated extra keys", () => {
    const value = expectOk({ ...valid, account_id: "someone-elses-account" });
    expect(Object.keys(value).sort()).toEqual([
      "category",
      "default_items",
      "industry",
      "name",
      "region_code",
    ]);
  });
});
