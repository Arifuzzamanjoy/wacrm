import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}));

vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  toErrorResponse: vi.fn((err) =>
    Response.json({ error: err instanceof Error ? err.message : 'auth failed' }, { status: 403 })
  ),
}));

import { POST } from './route';

describe('POST /api/immigration/calculate-crs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({
      accountId: 'acc-1',
      userId: 'user-1',
      role: 'viewer',
    });
  });

  it('calculates Canada CRS score successfully', async () => {
    const request = new Request('http://localhost/api/immigration/calculate-crs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'canada_crs',
        ageRange: '18_29',
        education: 'masters',
        languageClb: 'clb_9',
        foreignExperienceYears: '3_plus',
        hasJobOfferOrPnp: true,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.type).toBe('canada_crs');
    // 110 + 135 + 124 + 50 + 50 = 469
    expect(data.result.totalScore).toBe(469);
    expect(data.result.tier).toBe('moderate');
    expect(data.result.breakdown.bonusPoints).toBe(50);
  });

  it('calculates Australia Points test successfully', async () => {
    const request = new Request('http://localhost/api/immigration/calculate-crs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'australia_points',
        ageBracket: '25_32',
        englishLevel: 'superior',
        qualification: 'doctorate',
        experienceYears: '8_plus',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.type).toBe('australia_points');
    // 30 + 20 + 20 + 15 = 85
    expect(data.result.totalPoints).toBe(85);
    expect(data.result.isEligible).toBe(true);
  });

  it('calculates BANT lead score successfully', async () => {
    const request = new Request('http://localhost/api/immigration/calculate-crs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'lead_score',
        budget: 'enterprise',
        authority: 'decision_maker',
        need: 'urgent',
        timeline: 'immediate',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.type).toBe('lead_score');
    expect(data.result.score).toBe(100);
    expect(data.result.tier).toBe('hot');
  });

  it('rejects unauthenticated requests with 403', async () => {
    mocks.requireRole.mockRejectedValue(new Error('Unauthorized'));

    const request = new Request('http://localhost/api/immigration/calculate-crs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
  });
});
