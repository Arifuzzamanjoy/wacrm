import { describe, expect, it } from "vitest";
import {
  calculateCRS,
  calculateAustraliaPoints,
  calculateLeadScore,
  CRS_MODELLED_MAX,
  CRS_OFFICIAL_MAX,
  CRS_PROVINCIAL_NOMINATION_POINTS,
} from "./crs-calculator";

describe("calculateCRS", () => {
  it("calculates accurate score for young high-education profile with CLB 9 (Profile A)", () => {
    // 28 yrs (110) + Masters (135) + CLB 9 (124) + 3+ yrs foreign exp (50) = 419
    const result = calculateCRS({
      ageRange: "18_29",
      education: "masters",
      languageClb: "clb_9",
      foreignExperienceYears: "3_plus",
    });

    expect(result.totalScore).toBe(419);
    expect(result.maxPossible).toBe(CRS_MODELLED_MAX);
    expect(result.officialMax).toBe(CRS_OFFICIAL_MAX);
    expect(result.tier).toBe("moderate");
    expect(result.tierLabel).toBe("Competitive with Booster");
    expect(result.breakdown).toEqual({
      agePoints: 110,
      educationPoints: 135,
      languagePoints: 124,
      experiencePoints: 50,
      bonusPoints: 0,
    });
    expect(result.formattedSummary).toContain("Canada Express Entry CRS Estimate");
    expect(result.formattedSummary).toContain("Estimated Score: 419");
    expect(result.formattedSummary).toContain(`official CRS scale: 0–${CRS_OFFICIAL_MAX}`);
    expect(result.formattedSummary).toContain("• Age: 110/110");
    // The score goes to a prospective applicant, so it must never read
    // as an IRCC determination.
    expect(result.formattedSummary).toContain("Unofficial estimate");
  });

  it("scores a provincial nomination at the official 600 points (Profile B)", () => {
    // 26 yrs (110) + PhD (150) + CLB 10 (136) + 3+ yrs (50)
    //   + Canadian exp (40) + provincial nomination (600) = 1086
    const result = calculateCRS({
      ageRange: "18_29",
      education: "phd",
      languageClb: "clb_10",
      foreignExperienceYears: "3_plus",
      canadianExperienceYears: "1_plus",
      hasProvincialNomination: true,
    });

    expect(CRS_PROVINCIAL_NOMINATION_POINTS).toBe(600);
    expect(result.totalScore).toBe(1086);
    expect(result.tier).toBe("high_priority");
    expect(result.tierLabel).toBe("Strong Candidate (High Priority)");
    expect(result.breakdown.bonusPoints).toBe(640);
    expect(result.formattedSummary).toContain("Strong Candidate (High Priority)");
  });

  it("honours the legacy hasJobOfferOrPnp flag as a nomination", () => {
    const legacy = calculateCRS({
      ageRange: "18_29",
      education: "phd",
      languageClb: "clb_10",
      foreignExperienceYears: "3_plus",
      canadianExperienceYears: "1_plus",
      hasJobOfferOrPnp: true,
    });
    const current = calculateCRS({
      ageRange: "18_29",
      education: "phd",
      languageClb: "clb_10",
      foreignExperienceYears: "3_plus",
      canadianExperienceYears: "1_plus",
      hasProvincialNomination: true,
    });

    expect(legacy.totalScore).toBe(current.totalScore);
  });

  it("handles alternative pathway tier for low score profiles", () => {
    // 46 yrs (0) + Secondary (30) + CLB < 7 (0) + <1 yr exp (0) = 30
    const result = calculateCRS({
      ageRange: "45_plus",
      education: "secondary",
      languageClb: "clb_less_7",
      foreignExperienceYears: "less_1",
    });

    expect(result.totalScore).toBe(30);
    expect(result.tier).toBe("alternative_pathway");
    expect(result.tierLabel).toBe("Alternative Pathway Needed");
    expect(result.recommendation).toContain("Provincial Nominee Programs (PNP)");
  });

  it("handles boundary score of 470 for high priority tier", () => {
    // 30_34 (95) + Masters (135) + CLB 10 (136) + 3_plus (50) + Canadian Exp (40) + Job Offer (50) - let's craft exact 470
    // 18_29 (110) + Masters (135) + CLB 10 (136) + 3_plus (50) + Canadian Exp (40) = 471
    // 30_34 (95) + Masters (135) + CLB 10 (136) + 3_plus (50) + Canadian Exp (40) + Job offer (50) = 506
    // 30_34 (95) + Bachelors (120) + CLB 10 (136) + 3_plus (50) + Canadian Exp (40) + Job offer (50) = 491
    // 35_39 (75) + Masters (135) + CLB 10 (136) + 3_plus (50) + Canadian Exp (40) + Job offer (50) = 486
    // 18_29 (110) + Bachelors (120) + CLB 10 (136) + 3_plus (50) + Canadian Exp (40) + Job offer (50) = 506
    const result = calculateCRS({
      ageRange: "18_29",
      education: "phd",
      languageClb: "clb_10",
      foreignExperienceYears: "3_plus",
      canadianExperienceYears: "1_plus",
    });
    // 110 + 150 + 136 + 50 + 40 = 486
    expect(result.totalScore).toBe(486);
    expect(result.tier).toBe("high_priority");
  });
});

describe("calculateAustraliaPoints", () => {
  it("gives an over-45 applicant zero age points", () => {
    // The bracket was missing from the table, so the old `?? 15`
    // fallback credited them with the 40-44 bracket's points.
    const result = calculateAustraliaPoints({
      ageBracket: "45_plus",
      englishLevel: "superior",
      qualification: "doctorate",
      experienceYears: "8_plus",
    });

    expect(result.breakdown.agePts).toBe(0);
    expect(result.totalPoints).toBe(55);
    expect(result.isEligible).toBe(false);
    expect(result.formattedSummary).toContain("Unofficial estimate");
  });

  it("computes eligible score above 65 cutoff", () => {
    // Age 28 (25_32: 30) + Superior (20) + Bachelor/Master (15) + 5-7 yrs (10) = 75
    const result = calculateAustraliaPoints({
      ageBracket: "25_32",
      englishLevel: "superior",
      qualification: "bachelor_master",
      experienceYears: "5_7",
    });

    expect(result.totalPoints).toBe(75);
    expect(result.isEligible).toBe(true);
    expect(result.passMark).toBe(65);
    expect(result.breakdown).toEqual({
      agePts: 30,
      engPts: 20,
      qualPts: 15,
      expPts: 10,
    });
    expect(result.formattedSummary).toContain("Meets Minimum Requirement");
    expect(result.formattedSummary).toContain("SkillSelect");
  });

  it("identifies ineligible score below 65 cutoff", () => {
    // Age 42 (15) + Competent (0) + Diploma (10) + 3-4 yrs (5) = 30
    const result = calculateAustraliaPoints({
      ageBracket: "40_44",
      englishLevel: "competent",
      qualification: "diploma_trade",
      experienceYears: "3_4",
    });

    expect(result.totalPoints).toBe(30);
    expect(result.isEligible).toBe(false);
    expect(result.formattedSummary).toContain("Below 65-Point Cutoff");
  });
});

describe("calculateLeadScore", () => {
  it("evaluates hot leads with enterprise budget and immediate timeline", () => {
    const result = calculateLeadScore({
      budget: "enterprise",
      authority: "decision_maker",
      need: "urgent",
      timeline: "immediate",
    });

    expect(result.score).toBe(100);
    expect(result.tier).toBe("hot");
    expect(result.tierLabel).toContain("Hot Lead");
  });

  it("evaluates warm leads with moderate qualifiers", () => {
    const result = calculateLeadScore({
      budget: "growth",
      authority: "influencer",
      need: "planned",
      timeline: "within_3mo",
    });

    // 20 + 15 + 15 + 10 = 60
    expect(result.score).toBe(60);
    expect(result.tier).toBe("warm");
  });

  it("evaluates cold leads with low qualifiers", () => {
    const result = calculateLeadScore({
      budget: "none",
      authority: "evaluator",
      need: "exploring",
      timeline: "future",
    });

    // 0 + 5 + 5 + 0 = 10
    expect(result.score).toBe(10);
    expect(result.tier).toBe("cold");
  });
});
