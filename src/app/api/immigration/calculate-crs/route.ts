import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  calculateCRS,
  calculateAustraliaPoints,
  calculateLeadScore,
} from '@/lib/immigration/crs-calculator';
import type {
  CRSCalculatorInput,
  AustraliaPointsInput,
  LeadScoringInput,
} from '@/types';

export async function POST(request: Request) {
  try {
    // Requires at least viewer role to calculate
    await requireRole('viewer');

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const type = typeof body.type === 'string' ? body.type : 'canada_crs';

    if (type === 'australia_points') {
      const input: AustraliaPointsInput = {
        ageBracket: (body.ageBracket as AustraliaPointsInput['ageBracket']) || '25_32',
        englishLevel: (body.englishLevel as AustraliaPointsInput['englishLevel']) || 'superior',
        qualification: (body.qualification as AustraliaPointsInput['qualification']) || 'bachelor_master',
        experienceYears: (body.experienceYears as AustraliaPointsInput['experienceYears']) || '5_7',
      };
      const result = calculateAustraliaPoints(input);
      return NextResponse.json({ ok: true, type: 'australia_points', result });
    }

    if (type === 'lead_score') {
      const input: LeadScoringInput = {
        budget: (body.budget as LeadScoringInput['budget']) || 'growth',
        authority: (body.authority as LeadScoringInput['authority']) || 'decision_maker',
        need: (body.need as LeadScoringInput['need']) || 'planned',
        timeline: (body.timeline as LeadScoringInput['timeline']) || 'within_1mo',
      };
      const result = calculateLeadScore(input);
      return NextResponse.json({ ok: true, type: 'lead_score', result });
    }

    // Default: Canada Express Entry CRS
    const input: CRSCalculatorInput = {
      ageRange: (body.ageRange as CRSCalculatorInput['ageRange']) || '18_29',
      education: (body.education as CRSCalculatorInput['education']) || 'bachelors',
      languageClb: (body.languageClb as CRSCalculatorInput['languageClb']) || 'clb_9',
      foreignExperienceYears: (body.foreignExperienceYears as CRSCalculatorInput['foreignExperienceYears']) || '3_plus',
      canadianExperienceYears: body.canadianExperienceYears as CRSCalculatorInput['canadianExperienceYears'],
      hasJobOfferOrPnp: Boolean(body.hasJobOfferOrPnp),
    };

    const result = calculateCRS(input);
    return NextResponse.json({ ok: true, type: 'canada_crs', result });
  } catch (err) {
    return toErrorResponse(err);
  }
}
