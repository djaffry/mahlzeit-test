/* Lunch streak — consecutive work-day visit tracker */

var Streak = (() => {
  const STORAGE_KEY = 'lunch-streak';

  function formatDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function parseDate(s) {
    const [y, m, d] = s.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }

  function getPreviousWorkDay(today) {
    const d = new Date(today);
    const dow = d.getDay(); // 0=Sun,1=Mon,...
    // Only called for Mon-Fri (weekend exits early), but handle defensively
    if (dow === 0) d.setDate(d.getDate() - 2); // Sun → Fri
    else if (dow === 6) d.setDate(d.getDate() - 1); // Sat → Fri
    else if (dow === 1) d.setDate(d.getDate() - 3); // Mon → Fri
    else d.setDate(d.getDate() - 1); // Tue-Fri → yesterday
    return formatDate(d);
  }

  const PARTY_THRESHOLD = 30;

  function getStreakTier(streak) {
    if (streak >= PARTY_THRESHOLD) return 'party';
    return 'growing';
  }

  function readStreak() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (typeof data.current !== 'number' || typeof data.lastVisit !== 'string') return null;
      if (!parseDate(data.lastVisit)) return null;
      return data;
    } catch {
      return null;
    }
  }

  function writeStreak(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function updateDOM(streak) {
    const el = document.querySelector('.streak-flame');
    if (!el) return;
    const tier = getStreakTier(streak);
    el.dataset.tier = tier;

    if (tier !== 'party') {
      const t = Math.min((streak - 1) / (PARTY_THRESHOLD - 1), 1);
      el.querySelector('.streak-emoji').style.setProperty('--streak-progress', t.toFixed(2));
    }

    el.querySelector('.streak-number').textContent = String(streak);
    el.setAttribute('aria-label', `Streak: ${streak} ${streak === 1 ? 'Tag' : 'Tage'}`);
    el.classList.add('active');
  }

  function init() {
    const now = new Date();
    const dow = now.getDay();

    // Weekend — do nothing
    if (dow === 0 || dow === 6) {
      const existing = readStreak();
      if (existing) updateDOM(existing.current);
      return;
    }

    const today = formatDate(now);
    const stored = readStreak();

    // First visit ever or corrupted data
    if (!stored) {
      writeStreak({ current: 1, lastVisit: today });
      updateDOM(1);
      return;
    }

    // Same day — already counted
    if (stored.lastVisit === today) {
      updateDOM(stored.current);
      return;
    }

    // Check if lastVisit was the previous work day
    const prevWorkDay = getPreviousWorkDay(now);
    if (stored.lastVisit === prevWorkDay) {
      const next = stored.current + 1;
      writeStreak({ current: next, lastVisit: today });
      updateDOM(next);
      return;
    }

    // Gap — reset
    writeStreak({ current: 1, lastVisit: today });
    updateDOM(1);
  }

  return { init, getStreakTier };
})();
