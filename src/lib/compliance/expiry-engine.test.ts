import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateDaysRemaining,
  calculateUrgency,
  matchApplicableAlertTier,
  formatExpiryReminderMessage,
  DEFAULT_ALERT_THRESHOLDS,
} from './expiry-engine';

describe('Compliance & Expiry Engine Helpers', () => {
  describe('calculateDaysRemaining', () => {
    it('returns 0 for today', () => {
      const today = new Date().toISOString().split('T')[0];
      expect(calculateDaysRemaining(today)).toBe(0);
    });

    it('returns negative number for past date', () => {
      const past = new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0];
      const days = calculateDaysRemaining(past);
      expect(days).toBeLessThanOrEqual(-4);
    });

    it('returns positive number for future date', () => {
      const future = new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0];
      const days = calculateDaysRemaining(future);
      expect(days).toBeGreaterThanOrEqual(14);
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
