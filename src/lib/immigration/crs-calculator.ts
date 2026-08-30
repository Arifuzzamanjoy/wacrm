/**
 * Official Canada Express Entry Comprehensive Ranking System (CRS) & Points Engine.
 * Covers Core Human Capital (Age, Education, First Language, Experience) and Bonuses.
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

/**
 * Calculates Canada Express Entry CRS score out of 600 (Core Human Capital + Skill Transferability/Bonuses)
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

  // 5. Bonuses (Canadian exp / PNP / Job offer)
  let bonusPoints = 0;
  if (input.canadianExperienceYears === "1_plus") bonusPoints += 40;
  if (input.hasJobOfferOrPnp) bonusPoints += 50;

  const totalScore = agePoints + educationPoints + languagePoints + experiencePoints + bonusPoints;

  // Tier determination
  let tier: CRSCalculationResult["tier"] = "alternative_pathway";
  let tierLabel = "Alternative Pathway Needed";
  let recommendation =
    "Your current estimated score is below the competitive threshold for direct PR. We recommend exploring Provincial Nominee Programs (PNP), IELTS score improvement, or a Canadian study permit.";

  if (totalScore >= 470) {
    tier = "high_priority";
    tierLabel = "Strong Candidate (High Priority)";
    recommendation =
      "Outstanding profile! Your score is within the competitive range for direct Express Entry draws. We recommend proceeding immediately with ECA credential evaluation and IELTS booking.";
  } else if (totalScore >= 400) {
    tier = "moderate";
    tierLabel = "Competitive with Booster";
    recommendation =
      "Good foundation! Achieving CLB 9 (IELTS 8,7,7,7) or targeting an Express Entry-aligned Provincial Nominee Program (PNP) can grant you an extra 50-600 points.";
  }

  const formattedSummary =
    `🍁 *Canada Express Entry CRS Scorecard*\n\n` +
    `📊 *Total Estimated Score: ${totalScore} / 600*\n` +
    `🎯 *Profile Tier:* ${tierLabel}\n\n` +
    `*Points Breakdown:*\n` +
    `• Age Points: ${agePoints}/110\n` +
    `• Education: ${educationPoints}/150\n` +
    `• English (CLB): ${languagePoints}/136\n` +
    `• Work Experience: ${experiencePoints}/50\n` +
    (bonusPoints > 0 ? `• Bonus Points: ${bonusPoints}\n` : "") +
    `\n💡 *Recommendation:*\n${recommendation}`;

  return {
    totalScore,
    maxPossible: 600,
    breakdown: { agePoints, educationPoints, languagePoints, experiencePoints, bonusPoints },
    tier,
    tierLabel,
    recommendation,
    formattedSummary,
  };
}

/**
 * Calculates Australian General Skilled Migration (Subclass 189 / 190 / 491) points.
 */
export function calculateAustraliaPoints(input: AustraliaPointsInput): AustraliaPointsResult {
  const agePts =
    {
      "25_32": 30,
      "18_24": 25,
      "33_39": 25,
      "40_44": 15,
    }[input.ageBracket] ?? 15;

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
    }[input.qualification] ?? 10;

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
    `📊 *Total Points: ${total}* (Pass Mark: ${passMark})\n` +
    `🎯 *Status:* ${isEligible ? "✅ Meets Minimum Requirement" : "⚠️ Below 65-Point Cutoff"}\n\n` +
    `*Points Breakdown:*\n` +
    `• Age: ${agePts} pts\n` +
    `• English: ${engPts} pts\n` +
    `• Qualification: ${qualPts} pts\n` +
    `• Experience: ${expPts} pts\n\n` +
    nextStepAdvice;

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
