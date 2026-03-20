/* Carousel — horizontal day-panel navigation with snap */

import { DAYS } from "../constants"
import { haptic } from "../utils/haptic"
import { isOverlayOpen } from "../utils/dom"
import "../styles/carousel.css"

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');

let _el: HTMLElement | null = null;
let _days: readonly string[] = [];
let _onDayChange: ((day: string) => void) | null = null;
let _lastActiveIdx = 0;
let _lastIndicatorScroll = -1;
let _tabsEl: HTMLElement | null = null;
let _tabs: HTMLElement[] | null = null;
let _indicator: HTMLElement | null = null;
let _tabRects: { left: number; width: number }[] | null = null;

// Snap animation
let _isSnapping = false;
let _snapRafId: number | null = null;
let _snapFinishedTimer: ReturnType<typeof setTimeout> | null = null;

// Mouse drag
let _isDragging = false;
let _pointerDown = false;
let _dragStartX = 0;
let _dragScrollLeft = 0;

let _globalListenersAttached = false;

/* ── Public API ───────────────────────────────────────── */

export function setup(opts: { days: readonly string[]; onDayChange: (day: string) => void }): void {
  _days = opts.days;
  _onDayChange = opts.onDayChange;
}

export function attach(): void {
  _el = document.getElementById('carousel');
  if (!_el) return;
  const el = _el;

  _tabsEl = document.getElementById('day-tabs');
  _tabs = _tabsEl ? [..._tabsEl.querySelectorAll<HTMLElement>('.tab')] : [];
  _indicator = _tabsEl?.querySelector<HTMLElement>('.tab-indicator') ?? null;
  _lastActiveIdx = _days.indexOf(_tabsEl?.querySelector<HTMLElement>('.tab.active')?.dataset.day ?? _days[0]);
  cacheTabRects();

  // Scroll listener for tab indicator
  let rafId: number | null = null;
  el.addEventListener('scroll', () => {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      updateTabIndicator();
      rafId = null;
    });
  }, { passive: true });

  // Scroll-end: detect day change from touch swipe (CSS snap)
  function onScrollStop(): void {
    if (_isSnapping || _isDragging || _pointerDown || _snapFinishedTimer) return;
    fireDayChangeFromScroll();
  }

  if ('onscrollend' in (el as EventTarget)) {
    el.addEventListener('scrollend', onScrollStop);
  } else {
    let scrollTimer: ReturnType<typeof setTimeout> | null = null;
    el.addEventListener('scroll', () => {
      clearTimeout(scrollTimer!);
      scrollTimer = setTimeout(onScrollStop, 150);
    }, { passive: true });
  }

  // Cancel snap on any new pointer gesture
  el.addEventListener('pointerdown', () => cancelSnap(), { passive: true });

  // Desktop mouse drag
  el.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    if ((e.target as Element).closest('.map-card, .map-overlay')) return;
    _pointerDown = true;
    _isDragging = false;
    _dragStartX = e.clientX;
    _dragScrollLeft = el.scrollLeft;
  });

  if (!_globalListenersAttached) {
    _globalListenersAttached = true;

    document.addEventListener('pointermove', (e: PointerEvent) => {
      if (!_pointerDown) return;
      const dx = e.clientX - _dragStartX;
      if (!_isDragging && Math.abs(dx) < 5) return;
      if (!_isDragging) {
        _isDragging = true;
        _el!.classList.add('dragging');
        _el!.style.cursor = 'grabbing';
        _el!.style.userSelect = 'none';
      }
      _el!.scrollLeft = _dragScrollLeft - dx;
    });

    document.addEventListener('pointerup', () => {
      if (!_pointerDown) return;
      const wasDragging = _isDragging;
      resetDragState();
      if (wasDragging) {
        snapToNearestPanel(() => fireDayChangeFromScroll());
        document.addEventListener('click', (e: MouseEvent) => {
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
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if ((e.target as Element).closest('input, textarea, [contenteditable]')) return;
      if (isOverlayOpen()) return;

      e.preventDefault();
      cancelSnap();
      const nextIdx = e.key === 'ArrowLeft' ? _lastActiveIdx - 1 : _lastActiveIdx + 1;
      if (nextIdx < 0 || nextIdx >= _days.length) return;
      _lastActiveIdx = nextIdx;
      const day = _days[nextIdx];
      setActiveTab(day);
      announce(day);
      goTo(nextIdx);
      if (_onDayChange) _onDayChange(day);
    });

    // Number keys 1-5 switch weekdays
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key < '1' || e.key > '5') return;
      const idx = Number(e.key) - 1;
      if ((e.target as Element).closest('input, textarea, [contenteditable]')) return;
      if (isOverlayOpen()) return;
      if (idx >= _days.length) return;
      cancelSnap();
      _lastActiveIdx = idx;
      const day = _days[idx];
      setActiveTab(day);
      announce(day);
      goTo(idx);
      if (_onDayChange) _onDayChange(day);
    });

    // Recalculate on resize
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer!);
      resizeTimer = setTimeout(() => {
        if (!_el) return;
        cancelSnap();
        _el.scrollLeft = _lastActiveIdx * _el.offsetWidth;
        refreshIndicator();
        syncHeight();
      }, 100);
    });
  }

  updateTabIndicator();
}

export function goTo(idx: number): void {
  if (!_el) return;
  const panelWidth = _el.offsetWidth;
  const targetLeft = idx * panelWidth;
  const panelDist = Math.abs(targetLeft - _el.scrollLeft) / panelWidth;
  const duration = Math.min(250 + panelDist * 150, 600);
  animateScrollTo(targetLeft, duration);
}

export function restorePosition(idx: number): void {
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

export function cancel(): void {
  cancelSnap();
  resetDragState();
}

export function getActivePanel(): HTMLElement | null {
  return document.querySelector(`.day-panel[data-panel="${_days[_lastActiveIdx]}"]`);
}

export function syncHeight(): void {
  if (!_el) return;
  const panel = getActivePanel();
  if (!panel) return;
  const h = panel.offsetHeight + 'px';
  if (_el.style.height !== h) _el.style.height = h;
}

export function switchTo(day: string): void {
  const idx = _days.indexOf(day);
  if (idx === -1) return;
  _lastActiveIdx = idx;
  setActiveTab(day);
}

export function getActiveIndex(): number {
  return _lastActiveIdx;
}

export function isAnimating(): boolean {
  return _isSnapping || _isDragging;
}

export function refreshIndicator(): void {
  cacheTabRects();
  _lastIndicatorScroll = -1;
  updateTabIndicator();
}

/* ── Internal ─────────────────────────────────────────── */

function setActiveTab(day: string): void {
  if (!_tabs) return;
  _tabs.forEach(t => t.classList.toggle('active', t.dataset.day === day));
}

function announce(day: string): void {
  const el = document.getElementById('day-announcer');
  if (el) el.textContent = day;
}

function fireDayChangeFromScroll(): void {
  const idx = getActiveDayIndex();
  if (idx === _lastActiveIdx) return;
  _lastActiveIdx = idx;
  const day = _days[idx];
  setActiveTab(day);
  announce(day);
  if (_onDayChange) _onDayChange(day);
}

function getActiveDayIndex(): number {
  if (!_el) return 0;
  const w = _el.offsetWidth;
  if (w === 0) return 0;
  return Math.min(Math.max(0, Math.round(_el.scrollLeft / w)), _days.length - 1);
}

function resetDragState(): void {
  _pointerDown = false;
  _isDragging = false;
  if (_el) {
    _el.style.cursor = '';
    _el.style.userSelect = '';
  }
}

function setSnapJustFinished(): void {
  clearTimeout(_snapFinishedTimer!);
  _snapFinishedTimer = setTimeout(() => { _snapFinishedTimer = null; }, 80);
}

function easeOutCubic(t: number): number { return 1 - Math.pow(1 - t, 3); }

function animateScrollTo(targetLeft: number, durationMs: number, onComplete?: () => void): void {
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
  function step(now: number): void {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / durationMs, 1);
    _el!.scrollLeft = startLeft + distance * easeOutCubic(progress);
    if (progress < 1) {
      _snapRafId = requestAnimationFrame(step);
    } else {
      _snapRafId = null;
      _isSnapping = false;
      _el!.classList.remove('dragging');
      setSnapJustFinished();
      if (onComplete) onComplete();
    }
  }
  _snapRafId = requestAnimationFrame(step);
}

function cancelSnap(): void {
  if (_snapRafId) { cancelAnimationFrame(_snapRafId); _snapRafId = null; }
  _isSnapping = false;
  clearTimeout(_snapFinishedTimer!);
  _snapFinishedTimer = null;
  if (_el) _el.classList.remove('dragging');
}

function snapToNearestPanel(onComplete?: () => void): void {
  if (!_el || _isSnapping) return;
  const panelWidth = _el.offsetWidth;
  if (panelWidth === 0) return;
  const targetIdx = Math.round(_el.scrollLeft / panelWidth);
  const targetLeft = targetIdx * panelWidth;
  const panelDist = Math.abs(targetLeft - _el.scrollLeft) / panelWidth;
  const duration = Math.max(200, Math.min(panelDist * 350, 400));
  animateScrollTo(targetLeft, duration, onComplete);
}

function cacheTabRects(): void {
  if (!_tabsEl || !_tabs || !_tabs.length) { _tabRects = null; return; }
  const parentLeft = _tabsEl.getBoundingClientRect().left;
  _tabRects = _tabs.map(t => {
    const r = t.getBoundingClientRect();
    return { left: r.left - parentLeft, width: r.width };
  });
}

function updateTabIndicator(): void {
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

  // Update tab text color to match indicator position during drag
  const visualIdx = progress > 0.5 ? Math.min(idx + 1, _days.length - 1) : idx;
  setActiveTab(_days[visualIdx]);
}
