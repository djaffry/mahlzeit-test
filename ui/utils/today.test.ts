import { describe, it, expect } from 'vitest';
import { todayIso } from './today';
import { appConfig } from '../app-config';

describe('todayIso', () => {
  // Assertions below are written for the committed Europe/Vienna config.
  // If you change data/config.json, this sentinel will tell you the rest
  // of the file needs updating too.
  it('runs against the expected timezone', () => {
    expect(appConfig.timezone).toBe('Europe/Vienna');
  });


  it('returns YYYY-MM-DD in the configured timezone', () => {
    // 2026-04-20T21:30Z is 2026-04-20 23:30 Vienna (CEST).
    expect(todayIso(new Date('2026-04-20T21:30:00Z'))).toBe('2026-04-20');
  });

  it('uses configured-timezone midnight for rollover, not UTC midnight', () => {
    // 2026-04-20T22:30Z = 2026-04-21 00:30 Vienna — it's already Tuesday locally.
    expect(todayIso(new Date('2026-04-20T22:30:00Z'))).toBe('2026-04-21');
  });

  it('handles winter time (CET, UTC+1) correctly', () => {
    // 2026-01-15T23:30Z = 2026-01-16 00:30 Vienna (CET).
    expect(todayIso(new Date('2026-01-15T23:30:00Z'))).toBe('2026-01-16');
  });
});
