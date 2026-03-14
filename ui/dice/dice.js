/* Dice roll — pick a random menu item or restaurant card */

var Dice = (() => {
  const SHAKE_THRESHOLD = 25;
  const SHAKE_COOLDOWN = 1500;
  const ANIMATION_DURATION = 1500;
  const DICE_COUNT = 6;
  let _rolling = false;

  let _smoothScrollTo, _saveCollapsed;

  function setup({ smoothScrollTo, saveCollapsed }) {
    _smoothScrollTo = smoothScrollTo;
    _saveCollapsed = saveCollapsed;

    const btn = document.getElementById('dice-btn');
    if (!btn) return;

    btn.addEventListener('click', () => roll());

    setupShake(btn);
  }

  function roll(pickIndex) {
    if (_rolling) return null;

    const pool = getPool();
    if (pool.length === 0) return null;

    const idx = pickIndex ?? Math.floor(Math.random() * pool.length);
    const pick = pool[idx];

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    vibrateRoll();
    document.querySelectorAll('.dice-pick').forEach(el => el.classList.remove('dice-pick'));

    if (reducedMotion) {
      revealPick(pick);
    } else {
      _rolling = true;
      showOverlay();
      setTimeout(() => {
        hideOverlay();
        revealPick(pick);
        _rolling = false;
      }, ANIMATION_DURATION);
    }

    return pick;
  }

  function revealPick(pick) {
    // Stale pick guard: element may have been removed during animation
    if (!pick.isConnected) return;

    const card = pick.closest('.restaurant-card') || pick;
    if (card.classList.contains('collapsed')) {
      card.classList.remove('collapsed');
      _saveCollapsed();
    }

    pick.classList.add('dice-pick');
    const isCard = pick.classList.contains('restaurant-card');
    setTimeout(() => {
      if (isCard) _smoothScrollTo(pick);
      else pick.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }

  function randomWanderPath() {
    // Generate a cubic bezier curve from (0,0) to a random endpoint via random control points
    const rng = (min, max) => Math.round(min + Math.random() * (max - min));
    const ex = rng(-500, 500), ey = rng(-500, 500);
    const c1x = rng(-350, 350), c1y = rng(-350, 350);
    const c2x = rng(-350, 350), c2y = rng(-350, 350);
    return `"M 0 0 C ${c1x} ${c1y}, ${c2x} ${c2y}, ${ex} ${ey}"`;
  }

  function showOverlay() {
    const overlay = document.getElementById('dice-overlay');
    if (!overlay) return;
    overlay.innerHTML = '';
    for (let i = 0; i < DICE_COUNT; i++) {
      const span = document.createElement('span');
      span.className = 'dice-overlay-emoji';
      span.role = 'img';
      span.ariaLabel = 'Rolling dice';
      span.textContent = '🎲';
      span.style.setProperty('--dice-x', (45 + Math.random() * 10) + '%');
      span.style.setProperty('--dice-y', (45 + Math.random() * 10) + '%');
      span.style.setProperty('--dice-size', (1.8 + Math.random() * 2.2) + 'rem');
      span.style.setProperty('--tumble-dur', (1.2 + Math.random() * 0.4) + 's');
      span.style.setProperty('--tumble-delay', (Math.random() * 0.15) + 's');
      span.style.setProperty('--wander-path', randomWanderPath());
      overlay.appendChild(span);
    }
    overlay.classList.add('visible');
  }

  function hideOverlay() {
    const overlay = document.getElementById('dice-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    overlay.innerHTML = '';
  }

  const SKIP_CATEGORIES = /suppe|dessert|kuchen|torten|obst|nachspeise/i;

  function getPool() {
    const panel = document.querySelector('.day-panel.active');
    if (!panel) return [];

    const menuItems = [...panel.querySelectorAll('.menu-item:not(.hidden)')]
      .filter(el => {
        if (el.closest('.restaurant-card')?.querySelector('.reservation-badge')) return false;
        const cat = el.closest('.category')?.querySelector('.category-title')?.textContent;
        if (cat && SKIP_CATEGORIES.test(cat)) return false;
        return true;
      });

    const linkCards = [...panel.querySelectorAll('.restaurant-card:not(.link-muted):not(.map-card)')]
      .filter(card => !card.querySelector('.menu-item') && !card.querySelector('.reservation-badge'));

    return [...menuItems, ...linkCards];
  }

  function vibrateRoll() {
    if (!navigator.vibrate) return;
    const r = (min, max) => min + Math.floor(Math.random() * (max - min));
    // Matches visual: burst out fast, decelerate, settle
    // Phase 1 (~600ms): strong initial throw — long buzzes, short gaps
    // Phase 2 (~400ms): rolling — shorter buzzes, growing gaps
    // Phase 3 (~300ms): settling — faint taps, long gaps
    // Phase 4 (~100ms): final landing thud
    // Total midpoint: ~1400ms
    navigator.vibrate([
      // Phase 1: the throw — intense, rapid
      r(20,30), r(15,25), r(20,30), r(15,25), r(18,28), r(15,25),
      r(18,28), r(20,30), r(16,24), r(20,30), r(16,24), r(20,30),
      // Phase 2: rolling — losing energy
      r(12,18), r(35,50), r(12,18), r(40,55), r(10,16), r(45,60),
      r(10,16), r(50,65),
      // Phase 3: settling — faint ticks
      r(6,10), r(70,90), r(5,8), r(80,100), r(4,6), r(90,110),
      // Phase 4: landing
      r(40,60)
    ]);
  }

  function setupShake(btn) {
    if (!window.DeviceMotionEvent) return;
    // Skip on desktop — avoids Firefox "motion sensor deprecated" warning
    if (!('ontouchstart' in window) && navigator.maxTouchPoints <= 0) return;

    let lastShake = 0;
    let listening = false;

    function onMotion(e) {
      const acc = e.accelerationIncludingGravity;
      if (!acc) return;
      const force = Math.abs(acc.x) + Math.abs(acc.y) + Math.abs(acc.z) - 9.81;
      if (force < SHAKE_THRESHOLD) return;
      const now = Date.now();
      if (now - lastShake < SHAKE_COOLDOWN) return;
      lastShake = now;
      // vibrate directly — devicemotion may lack user activation on some browsers
      if (navigator.vibrate && navigator.userActivation?.isActive !== false) {
        navigator.vibrate(50);
      }
      roll();
    }

    function startListening() {
      if (listening) return;
      listening = true;
      window.addEventListener('devicemotion', onMotion);
    }

    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      // iOS Safari: retry on each click until granted
      btn.addEventListener('click', () => {
        if (listening) return;
        DeviceMotionEvent.requestPermission().then(state => {
          if (state === 'granted') startListening();
        }).catch(() => {});
      });
    } else {
      startListening();
    }
  }

  return { setup, roll, getPool, SHAKE_THRESHOLD, SHAKE_COOLDOWN, ANIMATION_DURATION };
})();
