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

// ============================================================
// Input validation
//
// These enums used to be cast straight out of the body with `||`
// defaults, and every default happened to be the best-scoring option
// ('18_29', 'bachelors', 'clb_9', '3_plus'). A client field the UI
// failed to send — or a typo in an integration — therefore produced a
// flattering score rather than an error, and that score gets read out
// to a prospective applicant as advice. Unknown values are now a 400.
// ============================================================

const ENUMS = {
  ageRange: ['18_29', '30_34', '35_39', '40_44', '45_plus'],
  education: ['phd', 'masters', 'bachelors', 'diploma_2yr', 'secondary'],
  languageClb: ['clb_10', 'clb_9', 'clb_8', 'clb_7', 'clb_less_7'],
  foreignExperienceYears: ['3_plus', '1_2', 'less_1'],
  canadianExperienceYears: ['1_plus', 'none'],
  ageBracket: ['18_24', '25_32', '33_39', '40_44', '45_plus'],
  englishLevel: ['superior', 'proficient', 'competent'],
  qualification: ['doctorate', 'bachelor_master', 'diploma_trade'],
  experienceYears: ['8_plus', '5_7', '3_4', 'less_3'],
  budget: ['enterprise', 'growth', 'starter', 'none'],
  authority: ['decision_maker', 'influencer', 'evaluator'],
  need: ['urgent', 'planned', 'exploring'],
  timeline: ['immediate', 'within_1mo', 'within_3mo', 'future'],
} as const satisfies Record<string, readonly string[]>;

class InvalidField extends Error {}

/**
 * Read one enum field. Required fields reject when absent; optional
 * ones fall through to `undefined`. Either way an unrecognised value
 * throws rather than being silently coerced.
 */
function enumField<K extends keyof typeof ENUMS>(
  body: Record<string, unknown>,
  key: K,
  { required }: { required: boolean },
): (typeof ENUMS)[K][number] | undefined {
  const raw = body[key as string];
  if (raw === undefined || raw === null || raw === '') {
    if (required) {
      throw new InvalidField(`'${String(key)}' is required`);
    }
    return undefined;
  }
  const allowed = ENUMS[key] as readonly string[];
  if (typeof raw !== 'string' || !allowed.includes(raw)) {
    throw new InvalidField(
      `'${String(key)}' must be one of: ${allowed.join(', ')}`,
    );
  }
  return raw as (typeof ENUMS)[K][number];
}

export async function POST(request: Request) {
  try {
    // Requires at least viewer role to calculate
    await requireRole('viewer');

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const type = typeof body.type === 'string' ? body.type : 'canada_crs';

    if (!['canada_crs', 'australia_points', 'lead_score'].includes(type)) {
      return NextResponse.json(
        { error: "'type' must be one of: canada_crs, australia_points, lead_score" },
        { status: 400 },
      );
    }

    try {
      if (type === 'australia_points') {
        const input: AustraliaPointsInput = {
          ageBracket: enumField(body, 'ageBracket', { required: true })!,
          englishLevel: enumField(body, 'englishLevel', { required: true })!,
          qualification: enumField(body, 'qualification', { required: true })!,
          experienceYears: enumField(body, 'experienceYears', { required: true })!,
        };
        return NextResponse.json({
          ok: true,
          type: 'australia_points',
          result: calculateAustraliaPoints(input),
        });
      }

      if (type === 'lead_score') {
        const input: LeadScoringInput = {
          budget: enumField(body, 'budget', { required: true })!,
          authority: enumField(body, 'authority', { required: true })!,
          need: enumField(body, 'need', { required: true })!,
          timeline: enumField(body, 'timeline', { required: true })!,
        };
        return NextResponse.json({
          ok: true,
          type: 'lead_score',
          result: calculateLeadScore(input),
        });
      }

      // Default: Canada Express Entry CRS
      const input: CRSCalculatorInput = {
        ageRange: enumField(body, 'ageRange', { required: true })!,
        education: enumField(body, 'education', { required: true })!,
        languageClb: enumField(body, 'languageClb', { required: true })!,
        foreignExperienceYears: enumField(body, 'foreignExperienceYears', {
          required: true,
        })!,
        canadianExperienceYears: enumField(body, 'canadianExperienceYears', {
          required: false,
        }),
        hasProvincialNomination:
          body.hasProvincialNomination !== undefined
            ? Boolean(body.hasProvincialNomination)
            : Boolean(body.hasJobOfferOrPnp),
      };

      return NextResponse.json({
        ok: true,
        type: 'canada_crs',
        result: calculateCRS(input),
      });
    } catch (err) {
      if (err instanceof InvalidField) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}
