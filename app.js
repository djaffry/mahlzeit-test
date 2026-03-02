const DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];
const DAY_SHORT = { Montag: 'Mo', Dienstag: 'Di', Mittwoch: 'Mi', Donnerstag: 'Do', Freitag: 'Fr' };
const DAY_JS_MAP = { 1: 'Montag', 2: 'Dienstag', 3: 'Mittwoch', 4: 'Donnerstag', 5: 'Freitag' };

const SVG = {
  collapse: '<svg class="restaurant-collapse-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6l4 4 4-4"/></svg>',
  reload: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 1v5h5"/><path d="M2.5 10A6 6 0 1 0 4 4.5L1 6"/></svg>',
  mapPin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>',
};

const TAG_COLORS = {
  Vegan: 'green',
  Vegetarisch: 'yellow',
  Fleisch: 'red',
  Rindfleisch: 'red',
  Schweinefleisch: 'red',
  Fisch: 'blue',
  'Geflügel': 'peach',
  Lamm: 'peach',
  Wild: 'peach',
  Glutenfrei: 'mauve',
  Laktosefrei: 'lavender',
};

const PALETTE = ['green', 'yellow', 'red', 'blue', 'peach', 'mauve', 'lavender', 'teal', 'flamingo'];
const _fallbackPool = PALETTE.filter(c => !new Set(Object.values(TAG_COLORS)).has(c));
const _tagColorCache = {};

const FRESHNESS_THRESHOLDS = { stale: 24, veryStale: 48 };

function isAvailableOnDay(restaurant, day) {
  return !restaurant.availableDays || restaurant.availableDays.includes(day);
}

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
  try {
    const stored = localStorage.getItem('dietary-filters');
    if (stored) {
      const { active, known } = JSON.parse(stored);
      const knownSet = new Set(known);
      active.forEach(f => { if (availableTags.includes(f)) activeFilters.add(f); });

      for (const tag of availableTags) {
        if (!knownSet.has(tag)) activeFilters.add(tag);
      }
    } else {
      availableTags.forEach(f => activeFilters.add(f));
    }
  } catch {
    availableTags.forEach(f => activeFilters.add(f));
  }
}

function saveFilters() {
  const allTags = [...document.querySelectorAll('.filter-btn')].map(b => b.dataset.filter);
  localStorage.setItem('dietary-filters', JSON.stringify({ active: [...activeFilters], known: allTags }));
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
    body += '<div class="no-data">(Noch) kein Menü für diesen Tag</div>';
  }

  const websiteLink = restaurant.url
    ? `<a class="link-cta" href="${escapeHtml(restaurant.url)}" target="_blank" rel="noopener">mehr Infos auf der Website &rarr;</a>`
    : '';

  return `
    <div class="restaurant-card${collapsedSet.has(restaurant.id) ? ' collapsed' : ''}" data-restaurant="${escapeHtml(restaurant.id)}">
      <div class="restaurant-header">
        <div class="restaurant-name">${escapeHtml(restaurant.title)}${restaurant.cuisine?.length ? `<span class="cuisine-tag">${restaurant.cuisine.map(escapeHtml).join(' · ')}</span>` : ''}${restaurant.stampCard ? '<span class="stamp-card-badge">Stempelkarte</span>' : ''}${restaurant.edenred ? '<span class="edenred-badge">Edenred</span>' : ''}${restaurant.reservation ? '<span class="reservation-badge">Reservierung erforderlich</span>' : ''}</div>
        <div style="display:flex;align-items:center;gap:0.4rem">
          ${restaurant.mapUrl ? `<a class="map-pin-link" href="${escapeHtml(restaurant.mapUrl)}" target="_blank" rel="noopener" title="Auf Karte anzeigen">${SVG.mapPin}</a>` : ''}
          ${SVG.collapse}
        </div>
      </div>
      <div class="restaurant-content"><div class="restaurant-content-inner">
        ${body}
        ${websiteLink ? `<div class="link-body">${websiteLink}</div>` : ''}
      </div></div>
    </div>`;
}

function renderLinkRestaurant(restaurant, day, collapsedSet) {
  const available = isAvailableOnDay(restaurant, day);
  const schedule = !available && restaurant.availableDays
    ? `<span class="link-schedule">nur ${restaurant.availableDays.map(d => DAY_SHORT[d]).join(', ')}</span>`
    : '';
  const websiteLink = restaurant.url
    ? `<a class="link-cta" href="${escapeHtml(restaurant.url)}" target="_blank" rel="noopener">Speisekarte auf der Website &rarr;</a>`
    : '';

  return `
    <div class="restaurant-card${!available ? ' link-muted' : ''}${collapsedSet.has(restaurant.id) ? ' collapsed' : ''}" data-restaurant="${escapeHtml(restaurant.id)}">
      <div class="restaurant-header">
        <div class="restaurant-name">${escapeHtml(restaurant.title)}${restaurant.cuisine?.length ? `<span class="cuisine-tag">${restaurant.cuisine.map(escapeHtml).join(' · ')}</span>` : ''}${restaurant.stampCard ? '<span class="stamp-card-badge">Stempelkarte</span>' : ''}${restaurant.edenred ? '<span class="edenred-badge">Edenred</span>' : ''}${restaurant.reservation ? '<span class="reservation-badge">Reservierung erforderlich</span>' : ''}</div>
        <div style="display:flex;align-items:center;gap:0.4rem">
          ${restaurant.mapUrl ? `<a class="map-pin-link" href="${escapeHtml(restaurant.mapUrl)}" target="_blank" rel="noopener" title="Auf Karte anzeigen">${SVG.mapPin}</a>` : ''}
          ${SVG.collapse}
        </div>
      </div>
      <div class="restaurant-content"><div class="restaurant-content-inner">
        <div class="link-body">${schedule}${websiteLink}</div>
      </div></div>
    </div>`;
}

function renderDay(fullRestaurants, linkRestaurants, day, collapsedSet) {
  const cards = fullRestaurants.map(r => renderRestaurant(r, day, collapsedSet)).join('')
    + linkRestaurants.map(r => renderLinkRestaurant(r, day, collapsedSet)).join('');
  return `<div class="restaurant-grid">${cards}</div>`;
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
    if (!isAvailableOnDay(r, day)) continue;
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

function moveMapCard() {
  const mapCard = document.getElementById('map-card');
  if (!mapCard) return;
  const activeGrid = document.querySelector('.day-panel.active .restaurant-grid');
  if (!activeGrid) return;
  if (mapCard.parentElement !== activeGrid) {
    activeGrid.insertBefore(mapCard, activeGrid.firstChild);
  }
  if (_inlineMap) setTimeout(() => _inlineMap.invalidateSize(), 50);
}

function refreshPanel() {
  applyFilters();
  moveMapCard();
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
  contentEl.innerHTML = renderMapCard() + DAYS.map(d =>
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
    if (!e.target.closest('.restaurant-collapse-icon')) return;
    const card = e.target.closest('.restaurant-card');
    if (!card || card.classList.contains('map-card')) return;
    const id = card.dataset.restaurant;
    const shouldCollapse = !card.classList.contains('collapsed');
    contentEl.querySelectorAll(`.restaurant-card[data-restaurant="${id}"]`).forEach(c =>
      c.classList.toggle('collapsed', shouldCollapse)
    );
    saveCollapsed();
  });

  contentEl.addEventListener('click', e => {
    const nameEl = e.target.closest('.restaurant-name');
    if (nameEl) {
      const card = nameEl.closest('.restaurant-card');
      if (card && !card.classList.contains('map-card')) {
        focusOnMap(card.dataset.restaurant);
        return;
      }
    }
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
  let touchStartX = 0, touchStartY = 0, touchIgnored = false;
  contentEl.addEventListener('touchstart', e => {
    touchIgnored = e.touches.length > 1 || !!e.target.closest('.map-card, .map-overlay');
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  contentEl.addEventListener('touchend', e => {
    if (touchIgnored) return;
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

let _leafletMap = null;
let _inlineMap = null;
let _inlineMarkers = {};

function renderMapCard() {
  const collapsed = localStorage.getItem('map-collapsed') === 'true';
  return `
    <div class="restaurant-card map-card${collapsed ? ' map-collapsed' : ''}" id="map-card">
      <div class="restaurant-header">
        <div class="restaurant-name">Karte</div>
        <div style="display:flex;align-items:center;gap:0.3rem">
          <button class="map-card-btn" id="map-fullscreen" aria-label="Vollbild"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4"/></svg></button>
          <svg class="map-card-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6l4 4 4-4"/></svg>
        </div>
      </div>
      <div class="restaurant-content"><div class="restaurant-content-inner">
        <div id="inline-map"></div>
      </div></div>
    </div>`;
}

function buildMapPopup(r, showLink) {
  let html = `<strong>${escapeHtml(r.title)}</strong>`;
  if (r.cuisine?.length) {
    html += `<br><span style="font-size:0.75rem;opacity:0.8">${r.cuisine.map(c => escapeHtml(c)).join(' \u00b7 ')}</span>`;
  }
  if (r.availableDays) {
    html += `<br><span style="font-size:0.7rem;font-weight:600;color:var(--mauve)">nur ${r.availableDays.map(d => DAY_SHORT[d]).join(', ')}</span>`;
  }
  const badges = [];
  if (r.edenred) badges.push('<span style="color:var(--red)">Edenred</span>');
  if (r.stampCard) badges.push('<span style="color:var(--teal)">Stempelkarte</span>');
  if (badges.length) {
    html += `<br><span style="font-size:0.68rem;font-weight:600">${badges.join(' \u00b7 ')}</span>`;
  }
  if (showLink && r.mapUrl) {
    html += `<br><a href="${escapeHtml(r.mapUrl)}" target="_blank" rel="noopener" style="font-size:0.75rem">Google Maps</a>`;
  }
  return html;
}

function initInlineMap() {
  if (_inlineMap) { _inlineMap.invalidateSize(); return; }
  const container = document.getElementById('inline-map');
  if (!container) return;

  _inlineMap = L.map('inline-map', { zoomControl: false, attributionControl: false }).setView([48.2225, 16.3945], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(_inlineMap);

  const allRestaurants = [...(_menuData?.fullRestaurants ?? []), ...(_menuData?.linkRestaurants ?? [])];
  for (const r of allRestaurants) {
    if (!r.coordinates) continue;
    const emoji = r.title.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)/u)?.[0] ?? '\u{1F4CD}';
    const icon = L.divIcon({
      className: 'map-marker',
      html: `<span class="map-marker-emoji">${emoji}</span>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      popupAnchor: [0, -20],
    });
    const marker = L.marker([r.coordinates.lat, r.coordinates.lon], { icon }).addTo(_inlineMap);
    marker.bindPopup(buildMapPopup(r, false), { closeButton: false, className: 'map-popup' });
    marker.on('click', () => scrollToRestaurant(r.id));
    _inlineMarkers[r.id] = marker;
  }
}

function scrollToRestaurant(id) {
  const activePanel = document.querySelector('.day-panel.active');
  if (!activePanel) return;
  const card = activePanel.querySelector(`.restaurant-card[data-restaurant="${id}"]`);
  if (!card) return;

  if (card.classList.contains('collapsed')) {
    card.classList.remove('collapsed');
    saveCollapsed();
  }

  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.add('map-highlight');
  setTimeout(() => card.classList.remove('map-highlight'), 1500);
}

function focusOnMap(id) {
  const allRestaurants = [...(_menuData?.fullRestaurants ?? []), ...(_menuData?.linkRestaurants ?? [])];
  const r = allRestaurants.find(r => r.id === id);
  if (!r?.coordinates) return false;

  const mapCard = document.getElementById('map-card');
  if (!mapCard) return false;

  // Expand map if collapsed
  if (mapCard.classList.contains('map-collapsed')) {
    toggleMapCard();
  }

  mapCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  const fly = () => {
    if (!_inlineMap) return;
    _inlineMap.flyTo([r.coordinates.lat, r.coordinates.lon], 17, { duration: 0.8 });
    if (_inlineMarkers[id]) _inlineMarkers[id].openPopup();
  };

  // Delay to let scroll + possible map init finish
  setTimeout(fly, _inlineMap ? 300 : 500);
  return true;
}

function toggleMapCard() {
  const card = document.getElementById('map-card');
  if (!card) return;
  const isCollapsed = card.classList.toggle('map-collapsed');
  localStorage.setItem('map-collapsed', isCollapsed);
  if (!isCollapsed) {
    if (!_inlineMap) {
      setTimeout(() => initInlineMap(), 50);
    } else {
      setTimeout(() => _inlineMap.invalidateSize(), 300);
    }
  }
}

function openMap() {
  const overlay = document.getElementById('map-overlay');
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
  const mapCard = document.getElementById('map-card');
  if (mapCard) mapCard.style.visibility = 'hidden';

  if (!_leafletMap) {
    _leafletMap = L.map('map-container', {
      zoomControl: false,
    }).setView([48.2225, 16.3945], 16);

    L.control.zoom({ position: 'bottomright' }).addTo(_leafletMap);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(_leafletMap);

    const allRestaurants = [
      ...(_menuData?.fullRestaurants ?? []),
      ...(_menuData?.linkRestaurants ?? []),
    ];

    for (const r of allRestaurants) {
      if (!r.coordinates) continue;
      const emoji = r.title.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)/u)?.[0] ?? '📍';
      const icon = L.divIcon({
        className: 'map-marker',
        html: `<span class="map-marker-emoji">${emoji}</span>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -20],
      });
      const marker = L.marker([r.coordinates.lat, r.coordinates.lon], { icon }).addTo(_leafletMap);
      marker.bindPopup(buildMapPopup(r, true), {
        closeButton: false,
        className: 'map-popup',
      });
    }
  }

  setTimeout(() => {
    _leafletMap.invalidateSize();
  }, 100);
}

function closeMap() {
  document.getElementById('map-overlay').hidden = true;
  document.body.style.overflow = '';
  const mapCard = document.getElementById('map-card');
  if (mapCard) mapCard.style.visibility = '';
}

function setupMapListeners() {
  // Inline map card header toggles collapse (except fullscreen button)
  const mapCard = document.getElementById('map-card');
  if (mapCard) {
    mapCard.querySelector('.restaurant-header').addEventListener('click', e => {
      if (e.target.closest('#map-fullscreen')) return;
      toggleMapCard();
    });
    document.getElementById('map-fullscreen').addEventListener('click', openMap);
  }

  // Fullscreen overlay close
  document.getElementById('map-close').addEventListener('click', closeMap);
  document.getElementById('map-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeMap();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !document.getElementById('map-overlay').hidden) {
      closeMap();
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

    if (localStorage.getItem('map-collapsed') !== 'true') {
      initInlineMap();
    }

    setupTabSwitching(tabsEl, contentEl);
    setupFilterListeners(filtersEl);
    setupCollapseExpand(contentEl);
    setupSearchListeners();
    setupMapListeners();
    setupSwipeNavigation(contentEl, tabsEl);
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
