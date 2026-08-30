import { describe, expect, it } from "vitest";
import { buildBantBudgetOptions, BANT_BUDGET_THRESHOLDS } from "./bant-tiers";

const names = {
  premium: "Premium",
  standard: "Standard",
  basic: "Basic",
  none: "No Budget",
};

describe("buildBantBudgetOptions", () => {
  it("returns the four tiers in order", () => {
    const opts = buildBantBudgetOptions("USD", names);
    expect(opts.map((o) => o.id)).toEqual([
      "enterprise",
      "growth",
      "starter",
      "none",
    ]);
  });

  it("renders bands in the account's own currency", () => {
    const bdt = buildBantBudgetOptions("BDT", names);
    expect(bdt[0].label).toBe("Premium (৳3.0k+)");
    expect(bdt[1].label).toBe("Standard (৳1.5k–৳3.0k)");
    expect(bdt[2].label).toBe("Basic (<৳1.5k)");
  });

  /**
   * The bug this module exists to prevent: an account on any non-USD
   * currency used to see US dollars in these labels.
   */
  it("never leaks a dollar sign into a non-dollar currency", () => {
    for (const code of ["BDT", "EUR", "GBP", "INR", "JPY", "NGN"]) {
      for (const opt of buildBantBudgetOptions(code, names)) {
        expect(opt.label, `${code} label leaked "$"`).not.toContain("$");
      }
    }
  });

  it("still reads as dollars for a USD account", () => {
    const usd = buildBantBudgetOptions("USD", names);
    expect(usd[0].label).toBe("Premium ($3.0k+)");
    expect(usd[2].label).toBe("Basic (<$1.5k)");
  });

  it("leaves the no-budget tier free of any amount", () => {
    for (const code of ["USD", "BDT"]) {
      const none = buildBantBudgetOptions(code, names).at(-1);
      expect(none?.label).toBe("No Budget");
    }
  });

  it("uses the translated tier names verbatim", () => {
    const opts = buildBantBudgetOptions("USD", {
      premium: "프리미엄",
      standard: "표준",
      basic: "기본",
      none: "예산 없음",
    });
    expect(opts[0].label.startsWith("프리미엄")).toBe(true);
    expect(opts[3].label).toBe("예산 없음");
  });

  it("falls back to a code prefix for an unknown currency", () => {
    const opts = buildBantBudgetOptions("ZZZ", names);
    expect(opts[0].label).toContain("ZZZ");
    expect(opts[0].label).not.toContain("$");
  });

  it("keeps the bands ordered", () => {
    expect(BANT_BUDGET_THRESHOLDS.standardMin).toBeLessThan(
      BANT_BUDGET_THRESHOLDS.premiumMin
    );
  });
});
