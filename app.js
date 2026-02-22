const DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];
const DAY_SHORT = { Montag: 'Mo', Dienstag: 'Di', Mittwoch: 'Mi', Donnerstag: 'Do', Freitag: 'Fr' };
const DAY_JS_MAP = { 1: 'Montag', 2: 'Dienstag', 3: 'Mittwoch', 4: 'Donnerstag', 5: 'Freitag' };

const SVG = {
  link: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3H3v10h10v-3M9 1h6v6M9 7L15 1"/></svg>',
  collapse: '<svg class="restaurant-collapse-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 8h10"/></svg>',
  expand: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>',
  reload: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 1v5h5"/><path d="M2.5 10A6 6 0 1 0 4 4.5L1 6"/></svg>',
};

const TAG_COLORS = {
  Vegan: 'green',
  Vegetarisch: 'yellow',
  Fleisch: 'red',
  Rindfleisch: 'red',
  Schweinefleisch: 'red',
  Fisch: 'blue',
  'Geflügel': 'peach',
  Glutenfrei: 'mauve',
  Laktosefrei: 'lavender',
};

const PALETTE = ['green', 'yellow', 'red', 'blue', 'peach', 'mauve', 'lavender', 'teal', 'flamingo'];
const _fallbackPool = PALETTE.filter(c => !new Set(Object.values(TAG_COLORS)).has(c));
const _tagColorCache = {};

const FRESHNESS_THRESHOLDS = { stale: 24, veryStale: 48 };

let activeFilters = new Set();
let _menuData = null;

function getTagColor(tag) {
  if (TAG_COLORS[tag]) return TAG_COLORS[tag];
  if (_tagColorCache[tag]) return _tagColorCache[tag];
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = ((hash << 5) - hash + tag.charCodeAt(i)) | 0;
  const pool = _fallbackPool.length > 0 ? _fallbackPool : PALETTE;
  return (_tagColorCache[tag] = pool[Math.abs(hash) % pool.length]);
}

function tagStyle(tag) {
  const c = getTagColor(tag);
  return `background:var(--${c}-dim);color:var(--${c})`;
}

function getWeekDates() {
  const now = new Date();
  const dow = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dow + 6) % 7));
  return DAYS.map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function formatShortDate(d) {
  return `${d.getDate()}.${d.getMonth() + 1}.`;
}

function getTodayName() {
  return DAY_JS_MAP[new Date().getDay()] || null;
}

function relativeTime(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  const hrs = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (mins < 1) return 'gerade eben';
  if (mins < 60) return `vor ${mins} Min.`;
  if (hrs < 24) return `vor ${hrs} ${hrs === 1 ? 'Stunde' : 'Stunden'}`;
  if (days < 7) return `vor ${days} ${days === 1 ? 'Tag' : 'Tagen'}`;
  return `vor ${Math.floor(days / 7)} Wochen`;
}

function freshnessLevel(diffHrs) {
  if (diffHrs > FRESHNESS_THRESHOLDS.veryStale) return 'very-stale';
  if (diffHrs > FRESHNESS_THRESHOLDS.stale) return 'stale';
  return '';
}

function escapeHtml(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

function highlightMatch(html, query) {
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return html.replace(regex, '<mark>$1</mark>');
}

function loadFilters(availableTags) {
  activeFilters.clear();
  const available = new Set(availableTags);
  try {
    const stored = localStorage.getItem('dietary-filters');
    if (stored) {
      JSON.parse(stored).forEach(f => { if (available.has(f)) activeFilters.add(f); });
    } else {
      availableTags.forEach(f => activeFilters.add(f));
    }
  } catch {
    availableTags.forEach(f => activeFilters.add(f));
  }
}

function saveFilters() {
  localStorage.setItem('dietary-filters', JSON.stringify([...activeFilters]));
}

function loadCollapsed() {
  try {
    const stored = localStorage.getItem('collapsed-restaurants');
    if (stored) { const arr = JSON.parse(stored); if (Array.isArray(arr)) return new Set(arr); }
  } catch { /* ignore */ }
  return new Set();
}

function saveCollapsed() {
  const panel = document.querySelector('.day-panel') ?? document;
  const ids = [...panel.querySelectorAll('.restaurant-card.collapsed')].map(el => el.dataset.restaurant);
  localStorage.setItem('collapsed-restaurants', JSON.stringify(ids));
}

function collectTags(restaurants) {
  const tags = new Set();
  for (const r of restaurants) {
    for (const day of Object.values(r.days)) {
      if (!day?.categories) continue;
      for (const cat of day.categories) {
        for (const item of cat.items) {
          for (const tag of (item.tags || [])) tags.add(tag);
        }
      }
    }
  }
  const presetOrder = Object.keys(TAG_COLORS);
  return [...tags].sort((a, b) => {
    const ai = presetOrder.indexOf(a);
    const bi = presetOrder.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });
}

function buildFilterButtons(allTags) {
  const filtersEl = document.getElementById('filters');
  filtersEl.innerHTML = '<span class="filters-label">Filter</span>';
  for (const tag of allTags) {
    const color = getTagColor(tag);
    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.dataset.filter = tag;
    btn.textContent = tag;
    btn.style.setProperty('--filter-color', `var(--${color})`);
    btn.style.setProperty('--filter-dim', `var(--${color}-dim)`);
    if (activeFilters.has(tag)) btn.classList.add('active');
    filtersEl.appendChild(btn);
  }
}

function renderItem(item) {
  const tagsData = (item.tags || []).map(t => t.toLowerCase()).join(' ');
  const tags = (item.tags || [])
    .map(t => `<span class="tag" style="${tagStyle(t)}">${escapeHtml(t)}</span>`)
    .join('');
  const price = item.price ? ` <span class="item-price">${escapeHtml(item.price)}</span>` : '';
  const desc = item.description ? `<span>${escapeHtml(item.description)}</span>` : '';
  const allergens = item.allergens ? `<span class="allergens">(${escapeHtml(item.allergens)})</span>` : '';
  const meta = [desc, tags, allergens].filter(Boolean).join(' ');

  return `
    <div class="menu-item" data-tags="${escapeHtml(tagsData)}">
      <div class="item-title">${escapeHtml(item.title)}${price}</div>
      ${meta ? `<div class="item-meta">${meta}</div>` : ''}
    </div>`;
}

function renderCategories(categories) {
  return categories.map(cat => `
    <div class="category">
      <div class="category-title">${escapeHtml(cat.name)}</div>
      ${cat.items.map(renderItem).join('')}
    </div>
  `).join('');
}

function renderRestaurant(restaurant, day, collapsedSet) {
  const dayData = restaurant.days[day];
  const hasError = !!restaurant.error;
  const hasData = dayData && dayData.categories && dayData.categories.length > 0;

  let body = '';
  if (hasError) {
    body = `<div class="restaurant-error">${escapeHtml(restaurant.error)}</div>`;
  }
  if (hasData) {
    body += `<div class="restaurant-body">${renderCategories(dayData.categories)}</div>`;
    body += '<div class="filter-empty">Keine passenden Gerichte</div>';
  } else if (!hasError) {
    body += '<div class="no-data">Kein Menü für diesen Tag</div>';
  }

  return `
    <div class="restaurant-card${collapsedSet.has(restaurant.id) ? ' collapsed' : ''}" data-restaurant="${escapeHtml(restaurant.id)}">
      <div class="restaurant-header">
        <div class="restaurant-name">${escapeHtml(restaurant.title)}</div>
        <div style="display:flex;align-items:center;gap:0.4rem">
          ${restaurant.url ? `<a class="restaurant-link" href="${escapeHtml(restaurant.url)}" target="_blank" rel="noopener">${SVG.link}</a>` : ''}
          ${SVG.collapse}
        </div>
      </div>
      <div class="restaurant-content"><div class="restaurant-content-inner">
        ${body}
      </div></div>
    </div>`;
}

function renderLinkCard(restaurant) {
  return `<a class="link-card" href="${escapeHtml(restaurant.url)}" target="_blank" rel="noopener">${escapeHtml(restaurant.title)}${SVG.link}</a>`;
}

function renderDay(fullRestaurants, linkRestaurants, day, collapsedSet) {
  let html = `<div class="restaurant-grid">${fullRestaurants.map(r => renderRestaurant(r, day, collapsedSet)).join('')}</div>`;
  html += '<div class="collapsed-section"></div>';
  if (linkRestaurants.length > 0) {
    html += `<div class="link-section">
      <div class="link-section-title">Weitere Restaurants</div>
      <div class="link-grid">${linkRestaurants.map(renderLinkCard).join('')}</div>
    </div>`;
  }
  return html;
}

function openSearch() {
  const overlay = document.getElementById('search-overlay');
  const input = document.getElementById('search-input');
  overlay.hidden = false;
  input.value = '';
  document.getElementById('search-results').innerHTML = '';
  input.focus();
}

function closeSearch() {
  document.getElementById('search-overlay').hidden = true;
}

function performSearch(query) {
  const resultsEl = document.getElementById('search-results');
  if (!query.trim()) { resultsEl.innerHTML = ''; return; }

  const q = query.toLowerCase().trim();
  const activeTab = document.querySelector('.tab.active');
  const day = activeTab ? activeTab.dataset.day : 'Montag';
  const restaurants = _menuData?.fullRestaurants ?? [];
  const groups = [];

  for (const r of restaurants) {
    const dayData = r.days[day];
    if (!dayData?.categories) continue;
    const matches = [];
    for (const cat of dayData.categories) {
      for (const item of cat.items) {
        const haystack = [item.title, item.description, item.price, ...(item.tags ?? [])].filter(Boolean).join(' ').toLowerCase();
        if (haystack.includes(q)) {
          matches.push({ item });
        }
      }
    }
    const titleMatch = r.title.toLowerCase().includes(q);
    if (matches.length > 0 || titleMatch) {
      groups.push({
        title: r.title,
        items: titleMatch && matches.length === 0
          ? dayData.categories.flatMap(c => c.items.slice(0, 3).map(item => ({ item })))
          : matches
      });
    }
  }

  if (groups.length === 0) {
    resultsEl.innerHTML = '<div class="search-no-results">Keine Ergebnisse</div>';
    return;
  }

  resultsEl.innerHTML = groups.map(g => {
    const items = g.items.slice(0, 5).map(({ item }) => {
      const title = highlightMatch(escapeHtml(item.title), q);
      const price = item.price ? `<span class="item-price">${escapeHtml(item.price)}</span>` : '';
      const desc = item.description ? `<span>${highlightMatch(escapeHtml(item.description), q)}</span>` : '';
      const tags = (item.tags || [])
        .map(t => `<span class="tag" style="${tagStyle(t)}">${escapeHtml(t)}</span>`)
        .join('');
      const meta = [desc, tags, price].filter(Boolean).join(' ');
      return `<div class="search-result-item">
        <div class="search-result-title">${title}</div>
        ${meta ? `<div class="search-result-meta">${meta}</div>` : ''}
      </div>`;
    }).join('');
    return `<div class="search-group-title">${escapeHtml(g.title)}</div>${items}`;
  }).join('');
}

function applyFilters() {
  const contentEl = document.getElementById('content');
  const activePanel = contentEl.querySelector('.day-panel.active');
  if (!activePanel) return;

  const totalFilters = document.querySelectorAll('.filter-btn').length;
  const showAll = activeFilters.size === 0 || activeFilters.size === totalFilters;

  const cards = activePanel.querySelectorAll('.restaurant-card');
  cards.forEach(card => {
    const items = card.querySelectorAll('.menu-item');
    let visibleCount = 0;

    items.forEach(item => {
      if (showAll) {
        item.classList.remove('hidden');
        visibleCount++;
        return;
      }
      const itemTags = item.dataset.tags ?? '';
      const untagged = itemTags === '';
      const matches = untagged || [...activeFilters].some(f => itemTags.includes(f.toLowerCase()));
      item.classList.toggle('hidden', !matches);
      if (matches) visibleCount++;
    });

    card.classList.toggle('all-filtered', items.length > 0 && visibleCount === 0);
  });
}

function updateCollapsedBar() {
  document.querySelectorAll('.day-panel').forEach(panel => {
    const section = panel.querySelector('.collapsed-section');
    if (!section) return;
    const collapsed = panel.querySelectorAll('.restaurant-card.collapsed');
    if (collapsed.length === 0) {
      section.innerHTML = '';
      return;
    }
    const chips = [...collapsed].map(card => {
      const id = card.dataset.restaurant;
      const name = card.querySelector('.restaurant-name')?.textContent ?? id;
      return `<button class="collapsed-chip" data-restaurant="${escapeHtml(id)}">${escapeHtml(name)}${SVG.expand}</button>`;
    }).join('');
    section.innerHTML = `<div class="collapsed-section-title">Eingeklappt</div><div class="collapsed-list">${chips}</div>`;
  });
}

function balanceGrid(panel) {
  if (!panel) panel = document.querySelector('.day-panel.active');
  if (!panel) return;
  const grid = panel.querySelector('.restaurant-grid');
  if (!grid) return;

  const allCards = [...grid.querySelectorAll('.restaurant-card')];
  if (allCards.length === 0) return;

  const visible = allCards.filter(c => !c.classList.contains('collapsed'));
  const collapsed = allCards.filter(c => c.classList.contains('collapsed'));

  const measured = visible.map(c => ({ card: c, height: c.offsetHeight }));

  allCards.forEach(c => c.remove());
  grid.querySelectorAll('.restaurant-column').forEach(c => c.remove());

  const gridWidth = grid.offsetWidth;
  const minColWidth = 340;
  const maxCols = Math.max(1, Math.floor(gridWidth / minColWidth));
  const numCols = Math.min(maxCols, visible.length) || 1;
  const cols = Array.from({ length: numCols }, () => {
    const col = document.createElement('div');
    col.className = 'restaurant-column';
    return col;
  });
  const colHeights = new Array(numCols).fill(0);

  for (const { card, height } of measured) {
    const idx = colHeights.indexOf(Math.min(...colHeights));
    cols[idx].appendChild(card);
    colHeights[idx] += height;
  }

  collapsed.forEach(c => cols[0].appendChild(c));
  cols.forEach(col => grid.appendChild(col));
}

function refreshPanel(panel) {
  applyFilters();
  updateCollapsedBar();
  balanceGrid(panel);
}

async function fetchMenuData() {
  const manifestRes = await fetch('data/index.json');
  if (!manifestRes.ok) throw new Error(`Menüdaten nicht gefunden (HTTP ${manifestRes.status})`);
  const manifest = await manifestRes.json();

  const allRestaurants = await Promise.all(
    manifest.map(async id => {
      const res = await fetch(`data/${id}.json`);
      if (!res.ok) throw new Error(`${id}: HTTP ${res.status}`);
      return res.json();
    })
  );

  return {
    fullRestaurants: allRestaurants.filter(r => r.type !== 'link'),
    linkRestaurants: allRestaurants.filter(r => r.type === 'link'),
  };
}

function renderDayTabs(tabsEl, weekDates, today, isWeekend, activeDay) {
  tabsEl.innerHTML = DAYS.map((d, i) => {
    const cls = ['tab'];
    if (d === today) cls.push('today');
    if (!isWeekend && d === activeDay) cls.push('active');
    const date = formatShortDate(weekDates[i]);
    return `<button class="${cls.join(' ')}" data-day="${d}"><span class="tab-full">${d} <span class="tab-date">${date}</span></span><span class="tab-short">${DAY_SHORT[d]} <span class="tab-date">${date}</span></span></button>`;
  }).join('');
}

function renderDayPanels(contentEl, fullRestaurants, linkRestaurants, activeDay) {
  const collapsedSet = loadCollapsed();
  contentEl.innerHTML = DAYS.map(d =>
    `<div class="day-panel${d === activeDay ? ' active' : ''}" data-panel="${d}">${renderDay(fullRestaurants, linkRestaurants, d, collapsedSet)}</div>`
  ).join('');
}

function renderWeekendState(contentEl, tabsEl) {
  contentEl.querySelectorAll('.day-panel').forEach(p => p.classList.remove('active'));
  contentEl.insertAdjacentHTML('afterbegin', `
    <div class="weekend-state" id="weekend-state">
      <div class="weekend-emoji">\u{1F373}\u{1F372}\u{1F957}</div>
      <div class="weekend-title">Guten Appetit... am Montag!</div>
      <div class="weekend-text">Am Wochenende haben die Kantinen Pause.<br>Die Men\u00fcs f\u00fcr n\u00e4chste Woche werden am Montag fr\u00fch aktualisiert.</div>
      <button class="weekend-browse-btn" id="weekend-browse">Men\u00fcs der letzten Woche ansehen</button>
    </div>`);
  document.getElementById('weekend-browse').addEventListener('click', function() {
    this.closest('.weekend-state').remove();
    const fridayPanel = contentEl.querySelector('.day-panel[data-panel="Freitag"]');
    if (fridayPanel) fridayPanel.classList.add('active');
    tabsEl.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.day === 'Freitag'));
    refreshPanel();
  });
}

function setupTabSwitching(tabsEl, contentEl) {
  tabsEl.addEventListener('click', e => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    const day = btn.dataset.day;
    const currentPanel = contentEl.querySelector('.day-panel.active');
    const nextPanel = contentEl.querySelector(`.day-panel[data-panel="${day}"]`);
    if (currentPanel === nextPanel) return;

    tabsEl.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.day === day));
    document.getElementById('weekend-state')?.remove();

    if (currentPanel) {
      currentPanel.style.opacity = '0';
      currentPanel.style.transform = 'translateY(4px)';
      setTimeout(() => {
        currentPanel.classList.remove('active');
        currentPanel.style.opacity = '';
        currentPanel.style.transform = '';
        nextPanel.classList.add('active', 'fade-enter');
        nextPanel.offsetHeight; // force reflow
        nextPanel.classList.remove('fade-enter');
        refreshPanel(nextPanel);
      }, 150);
    } else {
      nextPanel.classList.add('active');
      refreshPanel(nextPanel);
    }
  });
}

function setupFilterListeners(filtersEl) {
  filtersEl.addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    const filter = btn.dataset.filter;
    if (activeFilters.has(filter)) {
      activeFilters.delete(filter);
      btn.classList.remove('active');
    } else {
      activeFilters.add(filter);
      btn.classList.add('active');
    }
    saveFilters();
    applyFilters();
  });
}

function setupCollapseExpand(contentEl) {
  contentEl.addEventListener('click', e => {
    const chip = e.target.closest('.collapsed-chip');
    if (chip) {
      const id = chip.dataset.restaurant;
      contentEl.querySelectorAll(`.restaurant-card[data-restaurant="${id}"]`).forEach(c => {
        c.classList.remove('collapsed');
        c.classList.add('expanding');
        c.addEventListener('animationend', () => c.classList.remove('expanding'), { once: true });
      });
      saveCollapsed();
      updateCollapsedBar();
      balanceGrid();
      return;
    }

    const header = e.target.closest('.restaurant-header');
    if (!header) return;
    if (e.target.closest('.restaurant-link')) return;
    const card = header.closest('.restaurant-card');
    if (!card) return;
    const id = card.dataset.restaurant;
    contentEl.querySelectorAll(`.restaurant-card[data-restaurant="${id}"]`).forEach(c =>
      c.classList.add('collapsed')
    );
    saveCollapsed();
    updateCollapsedBar();
    balanceGrid();
  });
}

function setupSearchListeners() {
  document.getElementById('search-trigger').addEventListener('click', openSearch);
  document.getElementById('search-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeSearch();
  });
  document.getElementById('search-input').addEventListener('input', e => performSearch(e.target.value));
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openSearch(); }
    if (e.key === 'Escape') closeSearch();
  });
}

function setupSwipeNavigation(contentEl, tabsEl) {
  let touchStartX = 0, touchStartY = 0;
  contentEl.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  contentEl.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) return;
    const currentTab = tabsEl.querySelector('.tab.active');
    if (!currentTab) return;
    const idx = DAYS.indexOf(currentTab.dataset.day);
    const nextIdx = dx > 0 ? idx - 1 : idx + 1;
    if (nextIdx < 0 || nextIdx >= DAYS.length) return;
    tabsEl.querySelector(`.tab[data-day="${DAYS[nextIdx]}"]`)?.click();
  }, { passive: true });
}

function setupResizeHandler() {
  let resizeTimer;
  let lastWidth = window.innerWidth;
  window.addEventListener('resize', () => {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => balanceGrid(), 200);
  });
}

function renderFreshness(fullRestaurants, footerEl) {
  const latest = fullRestaurants.map(r => r.fetchedAt).filter(Boolean).sort().pop();
  const pageLoadTime = new Date().toLocaleString('de-AT', { dateStyle: 'medium', timeStyle: 'short' });

  if (!latest) {
    footerEl.textContent = `Seite geladen: ${pageLoadTime}`;
    return;
  }

  const diffHrs = (Date.now() - new Date(latest).getTime()) / 3600000;
  const level = freshnessLevel(diffHrs);
  const relTime = relativeTime(latest);
  const fetchTime = new Date(latest).toLocaleString('de-AT', { dateStyle: 'medium', timeStyle: 'short' });

  const badge = document.getElementById('freshness-badge');
  badge.innerHTML = `${escapeHtml(diffHrs < 1 ? 'Aktuell' : relTime)}${SVG.reload}`;
  badge.addEventListener('click', () => window.location.reload());
  if (level) badge.classList.add(level);

  const staleLine = level
    ? `<span class="footer-${level}">Daten abgerufen: ${fetchTime} (${relTime})</span>`
    : `Daten abgerufen: ${fetchTime} (${relTime})`;
  footerEl.innerHTML = `Seite geladen: ${escapeHtml(pageLoadTime)}<br>${staleLine}`;
}

function setupThemeToggle() {
  const saved = localStorage.getItem('theme');
  if (saved) document.documentElement.dataset.theme = saved;

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'latte' ? '' : 'latte';
    if (next) {
      document.documentElement.dataset.theme = next;
      localStorage.setItem('theme', next);
    } else {
      delete document.documentElement.dataset.theme;
      localStorage.removeItem('theme');
    }
  });
}

async function init() {
  const tabsEl = document.getElementById('day-tabs');
  const contentEl = document.getElementById('content');
  const footerEl = document.getElementById('footer');
  const filtersEl = document.getElementById('filters');
  const today = getTodayName();
  const isWeekend = !today;
  const activeDay = today || 'Montag';
  const weekDates = getWeekDates();

  renderDayTabs(tabsEl, weekDates, today, isWeekend, activeDay);

  try {
    const { fullRestaurants, linkRestaurants } = await fetchMenuData();
    _menuData = { fullRestaurants, linkRestaurants };

    const allTags = collectTags(fullRestaurants);
    loadFilters(allTags);
    buildFilterButtons(allTags);

    renderDayPanels(contentEl, fullRestaurants, linkRestaurants, activeDay);
    refreshPanel();

    if (isWeekend) renderWeekendState(contentEl, tabsEl);

    setupTabSwitching(tabsEl, contentEl);
    setupFilterListeners(filtersEl);
    setupCollapseExpand(contentEl);
    setupSearchListeners();
    setupSwipeNavigation(contentEl, tabsEl);
    setupResizeHandler();
    renderFreshness(fullRestaurants, footerEl);
  } catch (err) {
    contentEl.innerHTML = `<div class="error-global">Fehler beim Laden: ${escapeHtml(err.message)}</div>`;
  }
}

setupThemeToggle();
init();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
