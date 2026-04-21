import { describe, it, expect } from 'vitest';
import {
  getMondayOfWeek,
  getWeekDates,
  formatDayHeader,
  isAvailableOnDay,
  weekdayOfIsoDate,
  todayIndexInWeek,
} from './date';

describe('getMondayOfWeek', () => {
  it('returns the Monday of the week containing the given date', () => {
    const wed = new Date(2026, 3, 22); // April 22, 2026 (Wednesday)
    expect(getMondayOfWeek(wed).toISOString().slice(0, 10)).toBe('2026-04-20');
  });
});

describe('getWeekDates', () => {
  it('returns 5 consecutive dates Mon–Fri', () => {
    const dates = getWeekDates(new Date(2026, 3, 22));
    expect(dates.map(d => d.toISOString().slice(0, 10))).toEqual([
      '2026-04-20', '2026-04-21', '2026-04-22', '2026-04-23', '2026-04-24',
    ]);
  });
});

describe('weekdayOfIsoDate', () => {
  it('returns the German weekday name for an ISO date', () => {
    expect(weekdayOfIsoDate('2026-04-20')).toBe('Montag');
    expect(weekdayOfIsoDate('2026-04-24')).toBe('Freitag');
  });
});

describe('isAvailableOnDay', () => {
  it('returns true when no availableDays set', () => {
    expect(isAvailableOnDay({}, '2026-04-20')).toBe(true);
  });

  it('returns true when the ISO date falls on a weekday listed in availableDays', () => {
    expect(isAvailableOnDay({ availableDays: ['Montag', 'Dienstag'] }, '2026-04-20')).toBe(true);
  });

  it('returns false when the ISO date falls on a weekday not listed', () => {
    expect(isAvailableOnDay({ availableDays: ['Montag', 'Dienstag'] }, '2026-04-24')).toBe(false);
  });
});

describe('todayIndexInWeek', () => {
  it('returns 0..4 for Mon–Fri given a week-date array and a today iso', () => {
    const dates = getWeekDates(new Date(2026, 3, 22));
    expect(todayIndexInWeek(dates, '2026-04-20')).toBe(0);
    expect(todayIndexInWeek(dates, '2026-04-22')).toBe(2);
  });

  it('returns -1 for dates not in the week', () => {
    const dates = getWeekDates(new Date(2026, 3, 22));
    expect(todayIndexInWeek(dates, '2026-04-19')).toBe(-1);
    expect(todayIndexInWeek(dates, '2026-04-25')).toBe(-1);
  });
});

describe('formatDayHeader', () => {
  it('includes weekday and month-day', () => {
    const s = formatDayHeader(new Date(2026, 3, 20));
    expect(s).toMatch(/Montag/);
    expect(s).toMatch(/20/);
  });
});
