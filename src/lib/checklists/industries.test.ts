import { describe, expect, it } from "vitest";
import {
  INDUSTRIES,
  getIndustryMeta,
  getIndustryLabel,
  sortIndustriesForAccount,
} from "./industries";

describe("industry taxonomy", () => {
  it("ships immigration as the flagship vertical first", () => {
    expect(INDUSTRIES[0].id).toBe("immigration");
    expect(INDUSTRIES[0].usesRegion).toBe(true);
  });

  it("marks every non-immigration vertical as region-free", () => {
    for (const industry of INDUSTRIES) {
      if (industry.id !== "immigration") {
        expect(industry.usesRegion).toBe(false);
      }
    }
  });

  it("has unique ids", () => {
    const ids = INDUSTRIES.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolves known industries to their metadata", () => {
    expect(getIndustryLabel("marketing")).toBe("Marketing Agency");
    expect(getIndustryMeta("insurance").caseNoun).toBe("policy");
  });

  it("title-cases unknown, account-coined industries instead of failing", () => {
    const meta = getIndustryMeta("pet_grooming");
    expect(meta.id).toBe("pet_grooming");
    expect(meta.label).toBe("Pet Grooming");
    expect(meta.caseNoun).toBe("engagement");
  });

  it("falls back to General for null/undefined", () => {
    expect(getIndustryLabel(null)).toBe("General");
    expect(getIndustryLabel(undefined)).toBe("General");
  });
});

describe("sortIndustriesForAccount", () => {
  it("floats the account's own vertical to the top", () => {
    const sorted = sortIndustriesForAccount(
      ["immigration", "marketing", "general"],
      "marketing"
    );
    expect(sorted[0]).toBe("marketing");
  });

  it("keeps canonical order when the account has no industry set", () => {
    const sorted = sortIndustriesForAccount(
      ["general", "marketing", "immigration"],
      null
    );
    expect(sorted).toEqual(["immigration", "marketing", "general"]);
  });

  it("sorts unknown industries after known ones, alphabetically", () => {
    const sorted = sortIndustriesForAccount(
      ["zebra_care", "immigration", "alpaca_farming"],
      null
    );
    expect(sorted).toEqual(["immigration", "alpaca_farming", "zebra_care"]);
  });

  it("does not mutate the input array", () => {
    const input = ["general", "immigration"];
    sortIndustriesForAccount(input, null);
    expect(input).toEqual(["general", "immigration"]);
  });
});
