import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { JSDOM } from 'jsdom';

const streakScript = new Script(readFileSync(new URL('./streak.js', import.meta.url), 'utf8'));

function initStreak({ localStorage = {}, now = new Date() } = {}) {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>
    <div class="streak-flame" data-tier="0" aria-label="" role="status">
      <span class="streak-emoji">🔥</span><span class="streak-number"></span>
    </div>
  </body></html>`, { url: 'http://localhost', runScripts: 'outside-only' });

  const { window: win } = dom;

  // Seed localStorage
  for (const [k, v] of Object.entries(localStorage)) {
    win.localStorage.setItem(k, v);
  }

  // Override Date to control "now"
  const OrigDate = win.Date;
  win.Date = function(...args) {
    if (args.length === 0) return new OrigDate(now);
    return new OrigDate(...args);
  };
  win.Date.prototype = OrigDate.prototype;
  win.Date.now = () => now.getTime();

  streakScript.runInContext(dom.getInternalVMContext());
  win.Streak.init();

  return {
    win,
    doc: win.document,
    Streak: win.Streak,
    getStored: () => JSON.parse(win.localStorage.getItem('lunch-streak')),
  };
}

// Helper: create a local date string YYYY-MM-DD
function dateStr(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

describe('Streak.init', () => {
  it('first visit ever — initializes streak to 1', () => {
    // Wednesday 2026-03-11
    const { getStored } = initStreak({ now: new Date(2026, 2, 11) });
    const s = getStored();
    strictEqual(s.current, 1);
    strictEqual(s.lastVisit, dateStr(2026, 3, 11));
  });

  it('same-day revisit — does not increment', () => {
    const { getStored } = initStreak({
      localStorage: { 'lunch-streak': JSON.stringify({ current: 5, lastVisit: dateStr(2026, 3, 11) }) },
      now: new Date(2026, 2, 11),
    });
    strictEqual(getStored().current, 5);
  });

  it('consecutive weekday (Wed→Thu) — increments', () => {
    const { getStored } = initStreak({
      localStorage: { 'lunch-streak': JSON.stringify({ current: 3, lastVisit: dateStr(2026, 3, 11) }) },
      now: new Date(2026, 2, 12), // Thursday
    });
    strictEqual(getStored().current, 4);
    strictEqual(getStored().lastVisit, dateStr(2026, 3, 12));
  });

  it('Friday to Monday — increments (weekend is invisible)', () => {
    const { getStored } = initStreak({
      localStorage: { 'lunch-streak': JSON.stringify({ current: 5, lastVisit: dateStr(2026, 3, 13) }) },
      now: new Date(2026, 2, 16), // Monday
    });
    strictEqual(getStored().current, 6);
    strictEqual(getStored().lastVisit, dateStr(2026, 3, 16));
  });

  it('gap of one work day (Mon→Wed) — resets to 1', () => {
    const { getStored } = initStreak({
      localStorage: { 'lunch-streak': JSON.stringify({ current: 10, lastVisit: dateStr(2026, 3, 9) }) },
      now: new Date(2026, 2, 11), // Wednesday, skipped Tuesday
    });
    strictEqual(getStored().current, 1);
  });

  it('weekend visit (Saturday) — shows flame but does not update localStorage', () => {
    const { getStored, doc } = initStreak({
      localStorage: { 'lunch-streak': JSON.stringify({ current: 5, lastVisit: dateStr(2026, 3, 13) }) },
      now: new Date(2026, 2, 14), // Saturday
    });
    strictEqual(getStored().current, 5);
    strictEqual(getStored().lastVisit, dateStr(2026, 3, 13)); // unchanged
    // DOM still shows the streak
    const flame = doc.querySelector('.streak-flame');
    strictEqual(flame.querySelector('.streak-number').textContent, '5');
    strictEqual(flame.dataset.tier, 'growing');
  });

  it('weekend visit (Sunday) — shows flame but does not update localStorage', () => {
    const { getStored, doc } = initStreak({
      localStorage: { 'lunch-streak': JSON.stringify({ current: 5, lastVisit: dateStr(2026, 3, 13) }) },
      now: new Date(2026, 2, 15), // Sunday
    });
    strictEqual(getStored().current, 5);
    // DOM still shows the streak
    strictEqual(doc.querySelector('.streak-number').textContent, '5');
  });

  it('first visit ever on a weekend — does not initialize streak', () => {
    const { win, doc } = initStreak({
      now: new Date(2026, 2, 14), // Saturday, no existing streak
    });
    strictEqual(win.localStorage.getItem('lunch-streak'), null);
    // DOM stays in default state
    strictEqual(doc.querySelector('.streak-number').textContent, '');
  });

  it('corrupted localStorage — treats as first visit', () => {
    const { getStored } = initStreak({
      localStorage: { 'lunch-streak': 'not-json' },
      now: new Date(2026, 2, 11),
    });
    strictEqual(getStored().current, 1);
  });

  it('malformed data (missing fields) — treats as first visit', () => {
    const { getStored } = initStreak({
      localStorage: { 'lunch-streak': JSON.stringify({ current: 5 }) }, // missing lastVisit
      now: new Date(2026, 2, 11),
    });
    strictEqual(getStored().current, 1);
  });

  it('multi-week gap (Friday two weeks ago → Monday) — resets', () => {
    const { getStored } = initStreak({
      localStorage: { 'lunch-streak': JSON.stringify({ current: 20, lastVisit: dateStr(2026, 2, 27) }) },
      now: new Date(2026, 2, 16), // Monday March 16, lastVisit was Feb 27 Friday
    });
    strictEqual(getStored().current, 1);
  });
});

describe('Streak.getStreakTier', () => {
  it('returns growing for streaks under 30', () => {
    const { Streak } = initStreak({ now: new Date(2026, 2, 11) });
    strictEqual(Streak.getStreakTier(1), 'growing');
    strictEqual(Streak.getStreakTier(15), 'growing');
    strictEqual(Streak.getStreakTier(29), 'growing');
  });

  it('returns party for streaks of 30+', () => {
    const { Streak } = initStreak({ now: new Date(2026, 2, 11) });
    strictEqual(Streak.getStreakTier(30), 'party');
    strictEqual(Streak.getStreakTier(50), 'party');
    strictEqual(Streak.getStreakTier(999), 'party');
  });
});

describe('Streak UI update', () => {
  it('sets growing tier and streak number in DOM', () => {
    const { doc } = initStreak({
      localStorage: { 'lunch-streak': JSON.stringify({ current: 10, lastVisit: dateStr(2026, 3, 10) }) },
      now: new Date(2026, 2, 11), // Wed, consecutive from Tue
    });
    const flame = doc.querySelector('.streak-flame');
    strictEqual(flame.dataset.tier, 'growing');
    strictEqual(flame.querySelector('.streak-number').textContent, '11');
    strictEqual(flame.getAttribute('aria-label'), 'Streak: 11 Tage');
  });

  it('sets party tier at 30+ days', () => {
    const { doc } = initStreak({
      localStorage: { 'lunch-streak': JSON.stringify({ current: 29, lastVisit: dateStr(2026, 3, 10) }) },
      now: new Date(2026, 2, 11),
    });
    const flame = doc.querySelector('.streak-flame');
    strictEqual(flame.dataset.tier, 'party');
    strictEqual(flame.querySelector('.streak-number').textContent, '30');
  });

  it('sets singular "Tag" for streak of 1', () => {
    const { doc } = initStreak({ now: new Date(2026, 2, 11) });
    const flame = doc.querySelector('.streak-flame');
    strictEqual(flame.getAttribute('aria-label'), 'Streak: 1 Tag');
  });
});
