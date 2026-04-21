// ISO-8601 week utilities. All dates/strings are local-date representations (YYYY-MM-DD).

import type { Weekday } from './restaurants/types.js';
import { WEEKDAYS } from './restaurants/types.js';
import { appConfig } from './config.js';

export interface IsoWeek {
  year: number;  // ISO week-numbering year (may differ from calendar year at boundaries)
  week: number;  // 1..53
}

const WEEKDAY_OFFSET: Record<Weekday, number> = {
  Montag: 0, Dienstag: 1, Mittwoch: 2, Donnerstag: 3, Freitag: 4,
};

function asUtcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear().toString().padStart(4, '0');
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = d.getUTCDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isoWeekOf(input: Date): IsoWeek {
  // Shift to the Thursday of the same week — ISO weeks are anchored on Thursday.
  const d = asUtcMidnight(input);
  const dayNum = d.getUTCDay() || 7; // Sunday → 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const year = d.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86_400_000 + 1) / 7);
  return { year, week };
}

export function weekBranchName(w: IsoWeek): string {
  return `data-${w.year}-W${w.week.toString().padStart(2, '0')}`;
}

function mondayOfIsoWeek(w: IsoWeek): Date {
  // The Monday of ISO week 1 is the Monday on/before January 4 of that year.
  const jan4 = new Date(Date.UTC(w.year, 0, 4));
  const jan4Dow = jan4.getUTCDay() || 7;
  const mondayOfWeek1 = new Date(jan4);
  mondayOfWeek1.setUTCDate(jan4.getUTCDate() - (jan4Dow - 1));
  const monday = new Date(mondayOfWeek1);
  monday.setUTCDate(mondayOfWeek1.getUTCDate() + (w.week - 1) * 7);
  return monday;
}

export function datesOfIsoWeek(w: IsoWeek): string[] {
  const mon = mondayOfIsoWeek(w);
  return [0, 1, 2, 3, 4].map(i => {
    const d = new Date(mon);
    d.setUTCDate(mon.getUTCDate() + i);
    return d;
  }).map(toIsoDate);
}

export function dateForWeekdayInIsoWeek(w: IsoWeek, day: Weekday): string {
  const dates = datesOfIsoWeek(w);
  return dates[WEEKDAY_OFFSET[day]];
}

/** Returns the German weekday of a YYYY-MM-DD ISO date, or null for Sat/Sun. */
export function weekdayOfIsoDate(iso: string): Weekday | null {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // Sun=0 .. Sat=6
  if (dow < 1 || dow > 5) return null;
  return WEEKDAYS[dow - 1];
}

// en-CA produces YYYY-MM-DD.
const _fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: appConfig.timezone,
  year: 'numeric', month: '2-digit', day: '2-digit',
});

/** Current date (YYYY-MM-DD) in the configured timezone. */
export function todayIso(now: Date = new Date()): string {
  return _fmt.format(now);
}

/** Current ISO week anchored in the configured timezone. */
export function currentWeek(now: Date = new Date()): IsoWeek {
  const parts = _fmt.formatToParts(now);
  const get = (t: string) => Number(parts.find(p => p.type === t)!.value);
  // UTC midnight of the local date — isoWeekOf is tz-agnostic given a UTC-midnight input.
  const d = new Date(Date.UTC(get('year'), get('month') - 1, get('day')));
  return isoWeekOf(d);
}
