/* Carousel — horizontal day-panel navigation with snap */

var Carousel = (() => {
  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');

  let _el = null;
  let _days = [];
  let _onDayChange = null;
  let _lastActiveIdx = 0;
  let _lastIndicatorScroll = -1;
  let _tabsEl = null;
  let _tabs = null;
  let _indicator = null;
  let _tabRects = null;

  // Snap animation
  let _isSnapping = false;
  let _snapRafId = null;
  let _snapFinishedTimer = null;

  // Mouse drag
  let _isDragging = false;
  let _pointerDown = false;
  let _dragStartX = 0;
  let _dragScrollLeft = 0;

  let _globalListenersAttached = false;

  /* ── Public API ───────────────────────────────────────── */

  function setup({ days, onDayChange }) {
    _days = days;
    _onDayChange = onDayChange;
  }

  function attach() {
    _el = document.getElementById('carousel');
    if (!_el) return;

    _tabsEl = document.getElementById('day-tabs');
    _tabs = _tabsEl ? [..._tabsEl.querySelectorAll('.tab')] : [];
    _indicator = _tabsEl?.querySelector('.tab-indicator') ?? null;
    _lastActiveIdx = _days.indexOf(_tabsEl?.querySelector('.tab.active')?.dataset.day ?? _days[0]);
    cacheTabRects();

    // Scroll listener for tab indicator
    let rafId = null;
    _el.addEventListener('scroll', () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        updateTabIndicator();
        rafId = null;
      });
    }, { passive: true });

    // Scroll-end: detect day change from touch swipe (CSS snap)
    function onScrollStop() {
      if (_isSnapping || _isDragging || _pointerDown || _snapFinishedTimer) return;
      fireDayChangeFromScroll();
    }

    if ('onscrollend' in _el) {
      _el.addEventListener('scrollend', onScrollStop);
    } else {
      let scrollTimer = null;
      _el.addEventListener('scroll', () => {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(onScrollStop, 150);
      }, { passive: true });
    }

    // Cancel snap on any new pointer gesture
    _el.addEventListener('pointerdown', () => cancelSnap(), { passive: true });

    // Desktop mouse drag
    _el.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse') return;
      if (e.target.closest('.map-card, .map-overlay')) return;
      _pointerDown = true;
      _isDragging = false;
      _dragStartX = e.clientX;
      _dragScrollLeft = _el.scrollLeft;
    });

    if (!_globalListenersAttached) {
      _globalListenersAttached = true;

      document.addEventListener('pointermove', e => {
        if (!_pointerDown) return;
        const dx = e.clientX - _dragStartX;
        if (!_isDragging && Math.abs(dx) < 5) return;
        if (!_isDragging) {
          _isDragging = true;
          _el.classList.add('dragging');
          _el.style.cursor = 'grabbing';
          _el.style.userSelect = 'none';
        }
        _el.scrollLeft = _dragScrollLeft - dx;
      });

      document.addEventListener('pointerup', () => {
        if (!_pointerDown) return;
        const wasDragging = _isDragging;
        resetDragState();
        if (wasDragging) {
          snapToNearestPanel(() => fireDayChangeFromScroll());
          document.addEventListener('click', e => {
            e.stopPropagation();
            e.preventDefault();
          }, { capture: true, once: true });
        }
      });

      document.addEventListener('pointercancel', () => {
        if (!_pointerDown) return;
        resetDragState();
        if (_el) _el.classList.remove('dragging');
      });

      // Keyboard arrow navigation
      document.addEventListener('keydown', e => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        if (e.target.closest('input, textarea, [contenteditable]')) return;
        if (!document.getElementById('search-overlay')?.hidden) return;
        if (!document.getElementById('map-overlay')?.hidden) return;

        e.preventDefault();
        cancelSnap();
        const nextIdx = e.key === 'ArrowLeft' ? _lastActiveIdx - 1 : _lastActiveIdx + 1;
        if (nextIdx < 0 || nextIdx >= _days.length) return;
        _lastActiveIdx = nextIdx;
        const day = _days[nextIdx];
        setActiveTab(day);
        announce(day);
        goTo(nextIdx);
        if (_onDayChange) _onDayChange(day, nextIdx);
      });

      // Recalculate on resize
      let resizeTimer = null;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          if (!_el) return;
          cancelSnap();
          _el.scrollLeft = _lastActiveIdx * _el.offsetWidth;
          cacheTabRects();
          _lastIndicatorScroll = -1;
          updateTabIndicator();
          syncHeight();
        }, 100);
      });
    }

    updateTabIndicator();
  }

  function goTo(idx) {
    if (!_el) return;
    const panelWidth = _el.offsetWidth;
    const targetLeft = idx * panelWidth;
    const panelDist = Math.abs(targetLeft - _el.scrollLeft) / panelWidth;
    const duration = Math.min(250 + panelDist * 150, 600);
    animateScrollTo(targetLeft, duration);
  }

  function restorePosition(idx) {
    _lastActiveIdx = idx;
    if (!_el) return;
    _el.classList.add('dragging');
    requestAnimationFrame(() => {
      if (_el) {
        _el.scrollLeft = idx * _el.offsetWidth;
        _el.classList.remove('dragging');
      }
    });
  }

  function cancel() {
    cancelSnap();
    resetDragState();
  }

  function getActivePanel() {
    return document.querySelector(`.day-panel[data-panel="${_days[_lastActiveIdx]}"]`);
  }

  function syncHeight() {
    if (!_el) return;
    const panel = getActivePanel();
    if (!panel) return;
    const h = panel.offsetHeight + 'px';
    if (_el.style.height !== h) _el.style.height = h;
  }

  function switchTo(day) {
    const idx = _days.indexOf(day);
    if (idx === -1) return;
    _lastActiveIdx = idx;
    setActiveTab(day);
  }

  function setActiveTab(day) {
    if (!_tabs) return;
    _tabs.forEach(t => t.classList.toggle('active', t.dataset.day === day));
  }

  /* ── Internal ─────────────────────────────────────────── */

  function announce(day) {
    const el = document.getElementById('day-announcer');
    if (el) el.textContent = day;
  }

  function fireDayChangeFromScroll() {
    const idx = getActiveDayIndex();
    if (idx === _lastActiveIdx) return;
    _lastActiveIdx = idx;
    const day = _days[idx];
    setActiveTab(day);
    announce(day);
    if (_onDayChange) _onDayChange(day, idx);
  }

  function getActiveDayIndex() {
    if (!_el) return 0;
    const w = _el.offsetWidth;
    if (w === 0) return 0;
    return Math.min(Math.max(0, Math.round(_el.scrollLeft / w)), _days.length - 1);
  }

  function resetDragState() {
    _pointerDown = false;
    _isDragging = false;
    if (_el) {
      _el.style.cursor = '';
      _el.style.userSelect = '';
    }
  }

  function setSnapJustFinished() {
    clearTimeout(_snapFinishedTimer);
    _snapFinishedTimer = setTimeout(() => { _snapFinishedTimer = null; }, 80);
  }

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  function animateScrollTo(targetLeft, durationMs, onComplete) {
    if (!_el) return;
    if (_snapRafId) { cancelAnimationFrame(_snapRafId); _snapRafId = null; }
    const startLeft = _el.scrollLeft;
    const distance = targetLeft - startLeft;
    if (Math.abs(distance) < 1) { _isSnapping = false; if (onComplete) onComplete(); return; }
    _el.classList.add('dragging');
    if (REDUCED_MOTION.matches) {
      _el.scrollLeft = targetLeft;
      _el.classList.remove('dragging');
      _isSnapping = false;
      setSnapJustFinished();
      if (onComplete) onComplete();
      return;
    }
    _isSnapping = true;
    const startTime = performance.now();
    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      _el.scrollLeft = startLeft + distance * easeOutCubic(progress);
      if (progress < 1) {
        _snapRafId = requestAnimationFrame(step);
      } else {
        _snapRafId = null;
        _isSnapping = false;
        _el.classList.remove('dragging');
        setSnapJustFinished();
        if (onComplete) onComplete();
      }
    }
    _snapRafId = requestAnimationFrame(step);
  }

  function cancelSnap() {
    if (_snapRafId) { cancelAnimationFrame(_snapRafId); _snapRafId = null; }
    _isSnapping = false;
    clearTimeout(_snapFinishedTimer);
    _snapFinishedTimer = null;
    if (_el) _el.classList.remove('dragging');
  }

  function snapToNearestPanel(onComplete) {
    if (!_el || _isSnapping) return;
    const panelWidth = _el.offsetWidth;
    if (panelWidth === 0) return;
    const targetIdx = Math.round(_el.scrollLeft / panelWidth);
    const targetLeft = targetIdx * panelWidth;
    const panelDist = Math.abs(targetLeft - _el.scrollLeft) / panelWidth;
    const duration = Math.max(200, Math.min(panelDist * 350, 400));
    animateScrollTo(targetLeft, duration, onComplete);
  }

  function cacheTabRects() {
    if (!_tabsEl || !_tabs.length) { _tabRects = null; return; }
    const parentLeft = _tabsEl.getBoundingClientRect().left;
    _tabRects = _tabs.map(t => {
      const r = t.getBoundingClientRect();
      return { left: r.left - parentLeft, width: r.width };
    });
  }

  function updateTabIndicator() {
    if (!_tabsEl || !_el || !_indicator || !_tabRects) return;
    const scrollLeft = _el.scrollLeft;
    if (scrollLeft === _lastIndicatorScroll) return;
    _lastIndicatorScroll = scrollLeft;
    const panelWidth = _el.offsetWidth;
    if (panelWidth === 0) return;

    const fraction = scrollLeft / panelWidth;
    const idx = Math.floor(fraction);
    const progress = fraction - idx;

    const current = _tabRects[idx];
    const next = _tabRects[Math.min(idx + 1, _tabRects.length - 1)];
    if (!current) return;

    const left = current.left + (next.left - current.left) * progress;
    const width = current.width + (next.width - current.width) * progress;

    _indicator.style.transform = `translateX(${left}px)`;
    _indicator.style.width = `${width}px`;
  }

  /* ── Expose ───────────────────────────────────────────── */

  return {
    setup,
    attach,
    goTo,
    restorePosition,
    cancel,
    syncHeight,
    switchTo,
    getActiveIndex: () => _lastActiveIdx,
    getActivePanel,
    isAnimating: () => _isSnapping || _isDragging,
  };
})();
