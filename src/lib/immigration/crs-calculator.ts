/**
 * Canada Express Entry Comprehensive Ranking System (CRS) & related
 * points engines.
 *
 * Scope, stated plainly because the output goes to prospective clients:
 * this is an *estimate* over the single-applicant core human capital
 * factors (age, education, first official language, foreign work
 * experience) plus Canadian experience and provincial nomination. It
 * does not model spouse factors, second official language, skill
 * transferability combinations, Canadian study, sibling in Canada, or
 * French-language bonuses, so a real profile can score higher.
 *
 * Point values follow IRCC's published grid. Two things worth flagging
 * because the previous version of this file got them wrong:
 *   - A provincial nomination is worth 600 points, not 50.
 *   - Arranged employment earns no CRS points at all: IRCC removed the
 *     50/200-point job-offer bonus on 2025-03-25.
 */

import type {
  CRSCalculatorInput,
  CRSBreakdown,
  CRSCalculationResult,
  AustraliaPointsInput,
  AustraliaPointsResult,
  LeadScoringInput,
  LeadScoringResult,
} from "@/types";

export type {
  CRSCalculatorInput,
  CRSBreakdown,
  CRSCalculationResult,
  AustraliaPointsInput,
  AustraliaPointsResult,
  LeadScoringInput,
  LeadScoringResult,
};

export const CRS_DISCLAIMER =
  "Unofficial estimate for guidance only — not an IRCC assessment. It covers a single applicant and omits spouse, second-language, skill-transferability and study/sibling factors. Draw cut-offs change with every round.";

/**
 * The official CRS ceiling: 600 core + spouse + skill transferability,
 * plus 600 additional factors.
 */
export const CRS_OFFICIAL_MAX = 1200;

/** Sum of the maxima this estimator actually models. */
export const CRS_MODELLED_MAX = 110 + 150 + 136 + 50 + 40 + 600;

/** Points for an enhanced provincial nomination. */
export const CRS_PROVINCIAL_NOMINATION_POINTS = 600;

/**
 * Estimate a single applicant's CRS score over the factors modelled
 * here. See the file header for what is and isn't covered.
 */
export function calculateCRS(input: CRSCalculatorInput): CRSCalculationResult {
  // 1. Age Points (Single applicant scale, max 110)
  const ageMap: Record<CRSCalculatorInput["ageRange"], number> = {
    "18_29": 110,
    "30_34": 95,
    "35_39": 75,
    "40_44": 35,
    "45_plus": 0,
  };
  const agePoints = ageMap[input.ageRange] ?? 0;

  // 2. Education Points (max 150)
  const eduMap: Record<CRSCalculatorInput["education"], number> = {
    phd: 150,
    masters: 135,
    bachelors: 120,
    diploma_2yr: 98,
    secondary: 30,
  };
  const educationPoints = eduMap[input.education] ?? 30;

  // 3. First Language CLB Points (max 136)
  const langMap: Record<CRSCalculatorInput["languageClb"], number> = {
    clb_10: 136,
    clb_9: 124,
    clb_8: 92,
    clb_7: 68,
    clb_less_7: 0,
  };
  const languagePoints = langMap[input.languageClb] ?? 0;

  // 4. Foreign Work Experience Points (max 50)
  const expMap: Record<CRSCalculatorInput["foreignExperienceYears"], number> = {
    "3_plus": 50,
    "1_2": 25,
    less_1: 0,
  };
  const experiencePoints = expMap[input.foreignExperienceYears] ?? 0;

  // 5. Bonuses (Canadian experience / provincial nomination).
  //
  // `hasJobOfferOrPnp` is the legacy field name and is honoured as an
  // alias so existing callers keep working; it means "has a provincial
  // nomination". A bare job offer contributes nothing post-2025-03-25.
  let bonusPoints = 0;
  if (input.canadianExperienceYears === "1_plus") bonusPoints += 40;
  const hasNomination = Boolean(
    input.hasProvincialNomination ?? input.hasJobOfferOrPnp
  );
  if (hasNomination) bonusPoints += CRS_PROVINCIAL_NOMINATION_POINTS;

  const totalScore = agePoints + educationPoints + languagePoints + experiencePoints + bonusPoints;

  // Tier determination
  let tier: CRSCalculationResult["tier"] = "alternative_pathway";
  let tierLabel = "Alternative Pathway Needed";
  let recommendation =
    "Your current estimated score is below the range recent Express Entry draws have been cutting off at. We recommend exploring Provincial Nominee Programs (PNP), improving your language test result, or a Canadian study permit.";

  if (totalScore >= 470) {
    tier = "high_priority";
    tierLabel = "Strong Candidate (High Priority)";
    recommendation =
      "Strong profile — your estimated score is within the range recent Express Entry draws have been cutting off at. We recommend proceeding with ECA credential evaluation and booking a language test.";
  } else if (totalScore >= 400) {
    tier = "moderate";
    tierLabel = "Competitive with Booster";
    recommendation =
      "Good foundation. Reaching CLB 9 (IELTS 8/7/7/7) lifts your language score, and an Express Entry-aligned Provincial Nominee Program adds 600 points on its own.";
  }

  const formattedSummary =
    `🍁 *Canada Express Entry CRS Estimate*\n\n` +
    `📊 *Estimated Score: ${totalScore}* (official CRS scale: 0–${CRS_OFFICIAL_MAX})\n` +
    `🎯 *Profile Tier:* ${tierLabel}\n\n` +
    `*Points Breakdown:*\n` +
    `• Age: ${agePoints}/110\n` +
    `• Education: ${educationPoints}/150\n` +
    `• First official language: ${languagePoints}/136\n` +
    `• Foreign work experience: ${experiencePoints}/50\n` +
    (bonusPoints > 0 ? `• Bonus (Canadian experience / nomination): ${bonusPoints}\n` : "") +
    `\n💡 *Recommendation:*\n${recommendation}\n\n` +
    `_${CRS_DISCLAIMER}_`;

  return {
    totalScore,
    maxPossible: CRS_MODELLED_MAX,
    officialMax: CRS_OFFICIAL_MAX,
    disclaimer: CRS_DISCLAIMER,
    breakdown: { agePoints, educationPoints, languagePoints, experiencePoints, bonusPoints },
    tier,
    tierLabel,
    recommendation,
    formattedSummary,
  };
}

export const AUSTRALIA_DISCLAIMER =
  "Unofficial estimate for guidance only — not a Department of Home Affairs assessment. It omits partner skills, study in Australia, community language, professional year and state nomination points. Reaching the pass mark does not guarantee an invitation.";

/**
 * Calculates Australian General Skilled Migration (Subclass 189 / 190 / 491) points.
 */
export function calculateAustraliaPoints(input: AustraliaPointsInput): AustraliaPointsResult {
  // 45+ scores nothing and is outside the GSM age limit. It was missing
  // from the table, so the `?? 15` fallback quietly credited an
  // over-45 applicant with the 40-44 bracket's points.
  const agePts =
    {
      "25_32": 30,
      "18_24": 25,
      "33_39": 25,
      "40_44": 15,
      "45_plus": 0,
    }[input.ageBracket] ?? 0;

  const engPts =
    {
      superior: 20,
      proficient: 10,
      competent: 0,
    }[input.englishLevel] ?? 0;

  const qualPts =
    {
      doctorate: 20,
      bachelor_master: 15,
      diploma_trade: 10,
    }[input.qualification] ?? 0;

  const expPts =
    {
      "8_plus": 15,
      "5_7": 10,
      "3_4": 5,
      less_3: 0,
    }[input.experienceYears] ?? 0;

  const total = agePts + engPts + qualPts + expPts;
  const passMark = 65;
  const isEligible = total >= passMark;

  const nextStepAdvice = isEligible
    ? "💡 *Next Step:*\nYou meet the 65-point cutoff! You are eligible to submit an Expression of Interest (EOI) in SkillSelect."
    : "💡 *Next Step:*\nConsider boosting your English to Superior (+10 pts) or seeking State Nomination (190 gives +5 pts, 491 gives +15 pts).";

  const formattedSummary =
    `🦘 *Australia Skilled Migration (189/190) Scorecard*\n\n` +
    `📊 *Estimated Points: ${total}* (Pass Mark: ${passMark})\n` +
    `🎯 *Status:* ${isEligible ? "✅ Meets Minimum Requirement" : "⚠️ Below 65-Point Cutoff"}\n\n` +
    `*Points Breakdown:*\n` +
    `• Age: ${agePts} pts\n` +
    `• English: ${engPts} pts\n` +
    `• Qualification: ${qualPts} pts\n` +
    `• Experience: ${expPts} pts\n\n` +
    nextStepAdvice +
    `\n\n_${AUSTRALIA_DISCLAIMER}_`;

  return {
    totalPoints: total,
    passMark,
    isEligible,
    breakdown: { agePts, engPts, qualPts, expPts },
    formattedSummary,
  };
}

/**
 * Universal BANT (Budget, Authority, Need, Timeline) Lead Qualification Scorer.
 */
export function calculateLeadScore(input: LeadScoringInput): LeadScoringResult {
  const budgetPts = { enterprise: 30, growth: 20, starter: 10, none: 0 }[input.budget] ?? 0;
  const authPts = { decision_maker: 25, influencer: 15, evaluator: 5 }[input.authority] ?? 5;
  const needPts = { urgent: 25, planned: 15, exploring: 5 }[input.need] ?? 5;
  const timePts = { immediate: 20, within_1mo: 15, within_3mo: 10, future: 0 }[input.timeline] ?? 0;

  const score = budgetPts + authPts + needPts + timePts;

  let tier: LeadScoringResult["tier"] = "cold";
  let tierLabel = "Low Priority Lead";

  if (score >= 75) {
    tier = "hot";
    tierLabel = "🔥 Hot Lead - High Priority";
  } else if (score >= 45) {
    tier = "warm";
    tierLabel = "⚡ Warm Lead - Follow-up Recommended";
  }

  const summary =
    `🎯 *Lead Qualification Assessment*\n\n` +
    `📊 *BANT Score:* ${score} / 100\n` +
    `🏷️ *Classification:* ${tierLabel}\n\n` +
    `• Budget: ${budgetPts}/30\n` +
    `• Authority: ${authPts}/25\n` +
    `• Need: ${needPts}/25\n` +
    `• Timeline: ${timePts}/20`;

  return {
    score,
    tier,
    tierLabel,
    summary,
  };
}
