import { describe, it, expect } from 'vitest';
import { isoWeekOf, weekBranchName, datesOfIsoWeek, dateForWeekdayInIsoWeek, currentWeek, todayIso } from './week.js';

describe('isoWeekOf', () => {
  it('mid-year Monday → correct week', () => {
    expect(isoWeekOf(new Date('2026-04-20T00:00:00Z'))).toEqual({ year: 2026, week: 17 });
  });

  it('Sunday → belongs to the preceding week', () => {
    expect(isoWeekOf(new Date('2026-04-19T00:00:00Z'))).toEqual({ year: 2026, week: 16 });
  });

  it('late December → last week of the current year', () => {
    expect(isoWeekOf(new Date('2026-12-30T00:00:00Z'))).toEqual({ year: 2026, week: 53 });
  });

  it('early January → can belong to previous ISO year', () => {
    expect(isoWeekOf(new Date('2027-01-01T00:00:00Z'))).toEqual({ year: 2026, week: 53 });
  });
});

describe('weekBranchName', () => {
  it('zero-pads the week number', () => {
    expect(weekBranchName({ year: 2026, week: 1 })).toBe('data-2026-W01');
    expect(weekBranchName({ year: 2026, week: 17 })).toBe('data-2026-W17');
  });
});

describe('datesOfIsoWeek', () => {
  it('returns Mon–Fri dates for a mid-year week', () => {
    expect(datesOfIsoWeek({ year: 2026, week: 17 })).toEqual([
      '2026-04-20', '2026-04-21', '2026-04-22', '2026-04-23', '2026-04-24',
    ]);
  });

  it('handles week 1 spanning a year boundary', () => {
    expect(datesOfIsoWeek({ year: 2026, week: 1 })).toEqual([
      '2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02',
    ]);
  });
});

describe('dateForWeekdayInIsoWeek', () => {
  it('maps German weekday names to ISO dates', () => {
    const w = { year: 2026, week: 17 };
    expect(dateForWeekdayInIsoWeek(w, 'Montag')).toBe('2026-04-20');
    expect(dateForWeekdayInIsoWeek(w, 'Dienstag')).toBe('2026-04-21');
    expect(dateForWeekdayInIsoWeek(w, 'Mittwoch')).toBe('2026-04-22');
    expect(dateForWeekdayInIsoWeek(w, 'Donnerstag')).toBe('2026-04-23');
    expect(dateForWeekdayInIsoWeek(w, 'Freitag')).toBe('2026-04-24');
  });
});

describe('currentWeek', () => {
  it('uses configured timezone (Europe/Vienna), not UTC', () => {
    // 21:30 UTC = 23:30 Vienna (still Monday W17)
    expect(currentWeek(new Date('2026-04-20T21:30:00Z'))).toEqual({ year: 2026, week: 17 });
  });

  it('rolls over at Vienna midnight, not UTC midnight', () => {
    // 22:30 UTC = 00:30 Vienna next day (Tuesday, still W17)
    expect(currentWeek(new Date('2026-04-20T22:30:00Z'))).toEqual({ year: 2026, week: 17 });
    // Sunday 22:30 UTC = Monday 00:30 Vienna → W18
    expect(currentWeek(new Date('2026-04-26T22:30:00Z'))).toEqual({ year: 2026, week: 18 });
  });
});

describe('todayIso', () => {
  it('returns YYYY-MM-DD in configured timezone', () => {
    // 22:30 UTC = 2026-04-21 00:30 Vienna
    expect(todayIso(new Date('2026-04-20T22:30:00Z'))).toBe('2026-04-21');
  });
});

// Parity vectors — must match ui/archive/archive.test.ts (getArchiveWeekDates).
// If you change mondayOfIsoWeek on either side, update both test files.
describe('datesOfIsoWeek – cross-boundary parity with ui/archive/archive.ts', () => {
  it('W15 → Mon Apr 6, Fri Apr 10', () => {
    const dates = datesOfIsoWeek({ year: 2026, week: 15 });
    expect(dates[0]).toBe('2026-04-06');
    expect(dates[4]).toBe('2026-04-10');
  });

  it('W53 → Mon Dec 28, Fri Jan 1 2027', () => {
    const dates = datesOfIsoWeek({ year: 2026, week: 53 });
    expect(dates[0]).toBe('2026-12-28');
    expect(dates[4]).toBe('2027-01-01');
  });
});

