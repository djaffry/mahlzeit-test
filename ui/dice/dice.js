/* Dice roll — pick a random menu item or restaurant card */

var Dice = (() => {
  const SHAKE_THRESHOLD = 25;
  const SHAKE_COOLDOWN = 1500;

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
    const pool = getPool();
    if (pool.length === 0) return null;

    vibrateRoll();

    document.querySelectorAll('.dice-pick').forEach(el => el.classList.remove('dice-pick'));

    const btn = document.getElementById('dice-btn');
    if (btn) {
      btn.classList.add('rolling');
      btn.addEventListener('animationend', () => btn.classList.remove('rolling'), { once: true });
    }

    const idx = pickIndex ?? Math.floor(Math.random() * pool.length);
    const pick = pool[idx];

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

    return pick;
  }

  function getPool() {
    const panel = document.querySelector('.day-panel.active');
    if (!panel) return [];

    const menuItems = [...panel.querySelectorAll('.menu-item:not(.hidden)')]
      .filter(el => !el.closest('.restaurant-card')?.querySelector('.reservation-badge'));

    const linkCards = [...panel.querySelectorAll('.restaurant-card:not(.link-muted):not(.map-card)')]
      .filter(card => !card.querySelector('.menu-item') && !card.querySelector('.reservation-badge'));

    return [...menuItems, ...linkCards];
  }

  function vibrateRoll() {
    if (!navigator.vibrate) return;
    const r = () => 5 + Math.floor(Math.random() * 10);
    // rapid tumbles → settling → landing thud
    navigator.vibrate([r(), 30, r(), 30, r(), 40, r(), 50, r(), 70, 20]);
  }

  function setupShake(btn) {
    if (!window.DeviceMotionEvent) return;

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
      btn.click();
    }

    function startListening() {
      if (listening) return;
      listening = true;
      window.addEventListener('devicemotion', onMotion);
    }

    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      btn.addEventListener('click', () => {
        if (listening) return;
        DeviceMotionEvent.requestPermission().then(state => {
          if (state === 'granted') startListening();
        }).catch(() => {});
      }, { once: true });
    } else {
      startListening();
    }
  }

  return { setup, roll, getPool, SHAKE_THRESHOLD, SHAKE_COOLDOWN };
})();
