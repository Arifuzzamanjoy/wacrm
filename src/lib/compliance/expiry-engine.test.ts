import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateDaysRemaining,
  calculateUrgency,
  matchApplicableAlertTier,
  formatExpiryReminderMessage,
  DEFAULT_ALERT_THRESHOLDS,
} from './expiry-engine';

/**
 * `YYYY-MM-DD` for a date, in the *local* zone.
 *
 * These tests used `toISOString().split('T')[0]`, which is UTC. In any
 * zone ahead of UTC that returns yesterday's date for several hours
 * after local midnight (UTC+6 → every night from 00:00 to 06:00), so
 * "today" was fed a past date and the suite went red on a wall clock
 * rather than on a code change.
 *
 * `calculateDaysRemaining` is local-time by design — it compares local
 * midnight against a DATE column that names a calendar day, with no
 * instant attached — so the tests have to speak local dates too.
 */
function localDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

describe('Compliance & Expiry Engine Helpers', () => {
  describe('calculateDaysRemaining', () => {
    it('returns 0 for today', () => {
      expect(calculateDaysRemaining(localDateStr(new Date()))).toBe(0);
    });

    it('returns negative number for past date', () => {
      const past = localDateStr(new Date(Date.now() - 5 * 86400000));
      expect(calculateDaysRemaining(past)).toBe(-5);
    });

    it('returns positive number for future date', () => {
      const future = localDateStr(new Date(Date.now() + 15 * 86400000));
      expect(calculateDaysRemaining(future)).toBe(15);
    });

    it('is stable across the UTC date boundary', () => {
      // Pin the clock to a local time whose UTC date differs from the
      // local one wherever the runner sits east of UTC. "Today" must
      // still be 0 — this is the case that was failing.
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date(2026, 7, 31, 0, 30, 0)); // local 00:30
        expect(calculateDaysRemaining(localDateStr(new Date()))).toBe(0);
        vi.setSystemTime(new Date(2026, 7, 31, 23, 30, 0)); // local 23:30
        expect(calculateDaysRemaining(localDateStr(new Date()))).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('calculateUrgency', () => {
    it('categorizes <= 0 as expired', () => {
      expect(calculateUrgency(0)).toBe('expired');
      expect(calculateUrgency(-10)).toBe('expired');
    });

    it('categorizes 1..30 as critical', () => {
      expect(calculateUrgency(1)).toBe('critical');
      expect(calculateUrgency(15)).toBe('critical');
      expect(calculateUrgency(30)).toBe('critical');
    });

    it('categorizes 31..90 as warning', () => {
      expect(calculateUrgency(31)).toBe('warning');
      expect(calculateUrgency(60)).toBe('warning');
      expect(calculateUrgency(90)).toBe('warning');
    });

    it('categorizes > 90 as compliant', () => {
      expect(calculateUrgency(91)).toBe('compliant');
      expect(calculateUrgency(180)).toBe('compliant');
      expect(calculateUrgency(365)).toBe('compliant');
    });
  });

  describe('matchApplicableAlertTier', () => {
    it('matches expired tier when days <= 0', () => {
      expect(matchApplicableAlertTier(0, DEFAULT_ALERT_THRESHOLDS)).toBe('expired');
      expect(matchApplicableAlertTier(-5, DEFAULT_ALERT_THRESHOLDS)).toBe('expired');
    });

    it('matches 7_days when days <= 7', () => {
      expect(matchApplicableAlertTier(7, DEFAULT_ALERT_THRESHOLDS)).toBe('7_days');
      expect(matchApplicableAlertTier(3, DEFAULT_ALERT_THRESHOLDS)).toBe('7_days');
    });

    it('matches 30_days when days <= 30', () => {
      expect(matchApplicableAlertTier(30, DEFAULT_ALERT_THRESHOLDS)).toBe('30_days');
      expect(matchApplicableAlertTier(15, DEFAULT_ALERT_THRESHOLDS)).toBe('30_days');
    });

    it('matches 60_days when days <= 60', () => {
      expect(matchApplicableAlertTier(60, DEFAULT_ALERT_THRESHOLDS)).toBe('60_days');
      expect(matchApplicableAlertTier(45, DEFAULT_ALERT_THRESHOLDS)).toBe('60_days');
    });

    it('matches 90_days when days <= 90', () => {
      expect(matchApplicableAlertTier(90, DEFAULT_ALERT_THRESHOLDS)).toBe('90_days');
      expect(matchApplicableAlertTier(75, DEFAULT_ALERT_THRESHOLDS)).toBe('90_days');
    });

    it('returns null for compliant documents (> 90 days)', () => {
      expect(matchApplicableAlertTier(91, DEFAULT_ALERT_THRESHOLDS)).toBeNull();
      expect(matchApplicableAlertTier(180, DEFAULT_ALERT_THRESHOLDS)).toBeNull();
    });

    it('respects custom disabled thresholds', () => {
      // 7 days disabled
      const custom = [90, 30];
      expect(matchApplicableAlertTier(5, custom)).toBe('30_days');
      expect(matchApplicableAlertTier(50, custom)).toBe('90_days');
      expect(matchApplicableAlertTier(100, custom)).toBeNull();
    });
  });

  describe('formatExpiryReminderMessage', () => {
    it('formats approaching reminder with default template', () => {
      const msg = formatExpiryReminderMessage(
        null,
        'John Doe',
        'Passport Bio-Page',
        '2026-10-15',
        47
      );
      expect(msg).toContain('John Doe');
      expect(msg).toContain('Passport Bio-Page');
      expect(msg).toContain('2026-10-15');
      expect(msg).toContain('47 days');
    });

    it('formats expired alert with default template', () => {
      const msg = formatExpiryReminderMessage(
        null,
        'Alice',
        'IELTS Score Card',
        '2026-01-10',
        -20
      );
      expect(msg).toContain('Alice');
      expect(msg).toContain('IELTS Score Card');
      expect(msg).toContain('expired on 2026-01-10');
    });

    it('substitutes custom placeholders correctly', () => {
      const custom = 'Dear {{name}}, action needed for {{document}} before {{expiry_date}} ({{days}}d).';
      const msg = formatExpiryReminderMessage(
        custom,
        'Bob Smith',
        'Police Clearance',
        '2026-12-01',
        90
      );
      expect(msg).toBe('Dear Bob Smith, action needed for Police Clearance before 2026-12-01 (90d).');
    });

    it('handles numeric placeholders ({{1}}, {{2}}, {{3}}, {{4}})', () => {
      const custom = 'Hello {{1}}! Your {{2}} valid until {{3}} ({{4}} days left).';
      const msg = formatExpiryReminderMessage(
        custom,
        'Carol',
        'Medical Exam',
        '2026-11-30',
        30
      );
      expect(msg).toBe('Hello Carol! Your Medical Exam valid until 2026-11-30 (30 days left).');
    });
  });
});
