import { describe, it, expect } from 'vitest';
import { isoWeekOf, weekBranchName, datesOfIsoWeek, dateForWeekdayInIsoWeek, currentWeek, todayIso } from './week.js';

describe('isoWeekOf', () => {
  it('returns the ISO week and week-year for a mid-year Monday', () => {
    // 2026-04-20 is a Monday in week 17
    expect(isoWeekOf(new Date('2026-04-20T00:00:00Z'))).toEqual({ year: 2026, week: 17 });
  });

  it('returns the ISO week for a mid-year Sunday (last day of the ISO week)', () => {
    // 2026-04-19 is a Sunday — still week 16 by ISO rules
    expect(isoWeekOf(new Date('2026-04-19T00:00:00Z'))).toEqual({ year: 2026, week: 16 });
  });

  it('handles year boundaries where late-December dates belong to the last week of the current year', () => {
    // 2026-12-30 (Wed): 2026 starts on a Thursday so it has 53 ISO weeks;
    // the Thursday of this week is 2026-12-31 (still 2026), so this date is 2026-W53.
    expect(isoWeekOf(new Date('2026-12-30T00:00:00Z'))).toEqual({ year: 2026, week: 53 });
  });

  it('handles year boundaries where early-January dates belong to previous year', () => {
    // 2027-01-01 (Fri) is in 2026-W53 (2026 has 53 ISO weeks)
    expect(isoWeekOf(new Date('2027-01-01T00:00:00Z'))).toEqual({ year: 2026, week: 53 });
  });
});

describe('weekBranchName', () => {
  it('zero-pads the week number to two digits', () => {
    expect(weekBranchName({ year: 2026, week: 1 })).toBe('data-2026-W01');
    expect(weekBranchName({ year: 2026, week: 17 })).toBe('data-2026-W17');
  });
});

describe('datesOfIsoWeek', () => {
  it('returns the five weekday dates (Mon–Fri) of an ISO week', () => {
    expect(datesOfIsoWeek({ year: 2026, week: 17 })).toEqual([
      '2026-04-20', '2026-04-21', '2026-04-22', '2026-04-23', '2026-04-24',
    ]);
  });

  it('handles the first week of a year', () => {
    // ISO week 1 of 2026 starts Monday 2025-12-29
    expect(datesOfIsoWeek({ year: 2026, week: 1 })).toEqual([
      '2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02',
    ]);
  });
});

describe('dateForWeekdayInIsoWeek', () => {
  it('maps German weekday names to the date in the given ISO week', () => {
    const w = { year: 2026, week: 17 };
    expect(dateForWeekdayInIsoWeek(w, 'Montag')).toBe('2026-04-20');
    expect(dateForWeekdayInIsoWeek(w, 'Dienstag')).toBe('2026-04-21');
    expect(dateForWeekdayInIsoWeek(w, 'Mittwoch')).toBe('2026-04-22');
    expect(dateForWeekdayInIsoWeek(w, 'Donnerstag')).toBe('2026-04-23');
    expect(dateForWeekdayInIsoWeek(w, 'Freitag')).toBe('2026-04-24');
  });
});

describe('currentWeek (configured timezone)', () => {
  it('returns an ISO week matching the given reference instant evaluated in the configured timezone', () => {
    // With default timezone Europe/Vienna, 2026-04-20T21:30Z = 2026-04-20 23:30 Vienna (CEST) → Monday → week 17
    expect(currentWeek(new Date('2026-04-20T21:30:00Z'))).toEqual({ year: 2026, week: 17 });
  });

  it('rolls over at configured-timezone midnight, not UTC midnight', () => {
    // 2026-04-20T22:30Z = 2026-04-21 00:30 Vienna → Tuesday → still week 17
    expect(currentWeek(new Date('2026-04-20T22:30:00Z'))).toEqual({ year: 2026, week: 17 });
    // 2026-04-26T22:30Z = 2026-04-27 00:30 Vienna → Monday of week 18
    expect(currentWeek(new Date('2026-04-26T22:30:00Z'))).toEqual({ year: 2026, week: 18 });
  });
});

describe('todayIso', () => {
  it('returns YYYY-MM-DD in the configured timezone', () => {
    // 2026-04-20T22:30Z = 2026-04-21 00:30 Vienna
    expect(todayIso(new Date('2026-04-20T22:30:00Z'))).toBe('2026-04-21');
  });
});
