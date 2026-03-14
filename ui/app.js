const DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];
const DAY_SHORT = { Montag: 'Mo', Dienstag: 'Di', Mittwoch: 'Mi', Donnerstag: 'Do', Freitag: 'Fr' };
const DAY_JS_MAP = { 1: 'Montag', 2: 'Dienstag', 3: 'Mittwoch', 4: 'Donnerstag', 5: 'Freitag' };

const SVG = {
  collapse: '<svg class="restaurant-collapse-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6l4 4 4-4"/></svg>',
  mapPin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>',
};

function haptic(ms = 10) { navigator.vibrate?.(ms); }

const TAG_COLORS = {
  Vegan: 'green',
  Vegetarisch: 'teal',
  'Meeresfrüchte': 'blue',
  Fisch: 'blue',
  'Geflügel': 'peach',
  Huhn: 'peach',
  Pute: 'peach',
  Ente: 'peach',
  Fleisch: 'red',
  Lamm: 'red',
  Schweinefleisch: 'red',
  Rindfleisch: 'red',
  Glutenfrei: 'yellow',
  Laktosefrei: 'lavender',
};

const PALETTE = ['green', 'yellow', 'red', 'blue', 'peach', 'mauve', 'lavender', 'teal', 'flamingo'];
const _fallbackPool = PALETTE.filter(c => !new Set(Object.values(TAG_COLORS)).has(c));
const _tagColorCache = {};

function isAvailableOnDay(restaurant, day) {
  return !restaurant.availableDays || restaurant.availableDays.includes(day);
}

let activeFilters = new Set();
let _menuData = null;

function getAllRestaurants() {
  return [...(_menuData?.fullRestaurants ?? []), ...(_menuData?.linkRestaurants ?? [])];
}

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

function getMondayOfWeek(refDate) {
  const monday = new Date(refDate);
  monday.setDate(refDate.getDate() - ((refDate.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function getWeekDates(refDate) {
  const monday = getMondayOfWeek(refDate || new Date());
  return DAYS.map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function getLatestFetchTime(fullRestaurants) {
  return fullRestaurants.map(r => r.fetchedAt).filter(Boolean).sort().pop() || null;
}

function getLatestFetchDate(fullRestaurants) {
  const latest = getLatestFetchTime(fullRestaurants);
  return latest ? new Date(latest) : null;
}

function getDataWeekDates(fullRestaurants) {
  const fetchDate = getLatestFetchDate(fullRestaurants);
  return getWeekDates(fetchDate && !isNaN(fetchDate.getTime()) ? fetchDate : new Date());
}

function formatShortDate(d) {
  return `${d.getDate()}.${d.getMonth() + 1}.`;
}

function getTodayName() {
  return DAY_JS_MAP[new Date().getDay()] || null;
}

const _escapeEl = document.createElement('span');
function escapeHtml(str) {
  _escapeEl.textContent = str;
  return _escapeEl.innerHTML;
}

const _toolbarOffset = (document.querySelector('.toolbar')?.offsetHeight ?? 0) + 12;
function smoothScrollTo(el) {
  const top = el.getBoundingClientRect().top + window.scrollY - _toolbarOffset;
  window.scrollTo({ top, behavior: 'smooth' });
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
  const panel = Carousel.getActivePanel() ?? document.querySelector('.day-panel') ?? document;
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
  // Include parent tags from hierarchy as filter categories
  // (even if no item has them directly, they're useful for filtering)
  if (TagUtils.isLoaded()) {
    for (const parent of TagUtils.getParentTags()) tags.add(parent);
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

function updateFiltersLabel() {
  const label = document.querySelector('.filters-label');
  if (!label) return;
  const total = document.querySelectorAll('.filter-btn').length;
  const allActive = activeFilters.size === total;
  label.innerHTML = allActive
    ? 'Filter <span class="filters-clear">\u25cf</span>'
    : 'Filter <span class="filters-clear">\u25cb</span>';
}

let _filterCount = 0;

function buildFilterButtons(allTags) {
  const filtersEl = document.getElementById('filters');
  filtersEl.innerHTML = '<span class="filters-label">Filter</span>';
  _filterCount = allTags.length;

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
  updateFiltersLabel();
}

function renderItem(item) {
  const tagsData = (item.tags || []).map(t => t.toLowerCase()).join(' ');
  const tags = (item.tags || [])
    .map(t => `<span class="tag" style="${tagStyle(t)}">${escapeHtml(t)}</span>`)
    .join('');
  const price = item.price ? ` <span class="item-price">${escapeHtml(item.price)}</span>` : '';
  const desc = item.description ? `<div class="item-description">${escapeHtml(item.description)}</div>` : '';
  const allergens = item.allergens ? `<span class="allergens">(${escapeHtml(item.allergens)})</span>` : '';
  const meta = [tags, allergens].filter(Boolean).join(' ');

  return `
    <div class="menu-item" data-tags="${escapeHtml(tagsData)}">
      <div class="item-title"><span class="item-title-text">${escapeHtml(item.title)}</span>${price}</div>
      ${desc}
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

function renderRestaurantHeader(restaurant, suffix = '') {
  return `
      <div class="restaurant-header">
        <div class="restaurant-name">${escapeHtml(restaurant.title)}${restaurant.cuisine?.length ? `<span class="cuisine-tag">${restaurant.cuisine.map(escapeHtml).join(' · ')}</span>` : ''}${restaurant.stampCard ? '<span class="stamp-card-badge">Stempelkarte</span>' : ''}${restaurant.edenred ? '<span class="edenred-badge">Edenred</span>' : ''}${restaurant.outdoor ? '<span class="outdoor-badge">Draußen</span>' : ''}${restaurant.reservationUrl ? '<span class="reservation-badge">Reservierung erforderlich</span>' : ''}${suffix}</div>
        <div class="restaurant-header-actions">
          ${restaurant.coordinates ? `<button class="map-pin-link" aria-label="Auf Karte anzeigen" title="Auf Karte anzeigen">${SVG.mapPin}</button>` : ''}
          ${SVG.collapse}
        </div>
      </div>`;
}

function renderRestaurantLinks(restaurant) {
  const reservationLink = restaurant.reservationUrl
    ? `<div class="link-body"><a class="link-cta" href="${escapeHtml(restaurant.reservationUrl)}" target="_blank" rel="noopener">Online reservieren &rarr;</a></div>`
    : '';
  return reservationLink;
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
  } else if (!hasError) {
    body += '<div class="no-data">(Noch) kein Menü für diesen Tag</div>';
  }

  const websiteLink = restaurant.url
    ? `<a class="link-cta" href="${escapeHtml(restaurant.url)}" target="_blank" rel="noopener">mehr Infos auf der Website &rarr;</a>`
    : '';

  return `
    <div class="restaurant-card${collapsedSet.has(restaurant.id) ? ' collapsed' : ''}" data-restaurant="${escapeHtml(restaurant.id)}">
      ${renderRestaurantHeader(restaurant)}
      <div class="restaurant-content"><div class="restaurant-content-inner">
        ${body}
        <div class="link-body">${websiteLink}</div>
        ${renderRestaurantLinks(restaurant)}
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
      ${renderRestaurantHeader(restaurant, schedule)}
      <div class="restaurant-content"><div class="restaurant-content-inner">
        <div class="link-body">${websiteLink}</div>
        ${renderRestaurantLinks(restaurant)}
      </div></div>
    </div>`;
}

function renderMapCardInGrid() {
  const pref = localStorage.getItem('map-collapsed');
  const collapsed = pref !== null ? pref === 'true' : window.innerWidth <= 768;
  return `
    <div class="restaurant-card map-card visible settled${collapsed ? ' map-collapsed' : ''}">
      <div class="restaurant-header">
        <div class="restaurant-name">Karte</div>
        <div class="restaurant-header-actions">
          <button class="map-card-btn map-fullscreen-btn" aria-label="Vollbild"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4"/></svg></button>
          <svg class="map-card-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6l4 4 4-4"/></svg>
        </div>
      </div>
      <div class="restaurant-content"><div class="restaurant-content-inner">
        <div class="map-slot"></div>
      </div></div>
    </div>`;
}

function renderDay(fullRestaurants, linkRestaurants, day, collapsedSet) {
  const cards = fullRestaurants.map(r => renderRestaurant(r, day, collapsedSet)).join('')
    + linkRestaurants.map(r => renderLinkRestaurant(r, day, collapsedSet)).join('');
  return `<div class="restaurant-grid">${renderMapCardInGrid()}${cards}</div>`;
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

function isFilterShowAll() {
  return activeFilters.size === _filterCount;
}

function itemMatchesFilters(item) {
  const tags = item.tags ?? [];
  if (tags.length === 0) return true;
  const expanded = TagUtils.isLoaded()
    ? TagUtils.expandFilters(activeFilters)
    : activeFilters;
  return tags.some(t => expanded.has(t));
}

function performSearch(query) {
  const resultsEl = document.getElementById('search-results');
  if (!query.trim()) { resultsEl.innerHTML = ''; return; }

  const q = query.toLowerCase().trim();
  const day = DAYS[Carousel.getActiveIndex()] ?? 'Montag';
  const restaurants = _menuData?.fullRestaurants ?? [];
  const showAll = isFilterShowAll();
  const passes = item => showAll || itemMatchesFilters(item);
  const groups = [];

  for (const r of restaurants) {
    if (!isAvailableOnDay(r, day)) continue;
    const dayData = r.days[day];
    if (!dayData?.categories) continue;
    const matches = [];
    for (const cat of dayData.categories) {
      for (const item of cat.items) {
        if (!passes(item)) continue;
        const haystack = [item.title, item.description, item.price, ...(item.tags ?? [])].filter(Boolean).join(' ').toLowerCase();
        if (haystack.includes(q)) {
          matches.push({ item });
        }
      }
    }
    const titleMatch = r.title.toLowerCase().includes(q);
    if (matches.length > 0 || titleMatch) {
      const filteredItems = titleMatch && matches.length === 0
        ? dayData.categories.flatMap(c => c.items.filter(passes).slice(0, 3).map(item => ({ item })))
        : matches;
      if (filteredItems.length > 0) {
        groups.push({ title: r.title, items: filteredItems });
      }
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
      const desc = item.description ? `<div class="item-description">${highlightMatch(escapeHtml(item.description), q)}</div>` : '';
      const tags = (item.tags || [])
        .map(t => `<span class="tag" style="${tagStyle(t)}">${escapeHtml(t)}</span>`)
        .join('');
      const meta = [tags, price].filter(Boolean).join(' ');
      return `<div class="search-result-item">
        <div class="search-result-title">${title}</div>
        ${desc}
        ${meta ? `<div class="search-result-meta">${meta}</div>` : ''}
      </div>`;
    }).join('');
    return `<div class="search-group-title">${escapeHtml(g.title)}</div>${items}`;
  }).join('');
}

function refreshSearchResults() {
  const overlay = document.getElementById('search-overlay');
  if (overlay.hidden) return;
  const input = document.getElementById('search-input');
  performSearch(input.value);
}

function applyFilters() {
  const activePanel = Carousel.getActivePanel();
  if (!activePanel) return;

  const showAll = isFilterShowAll();
  const expanded = !showAll && TagUtils.isLoaded()
    ? new Set([...TagUtils.expandFilters(activeFilters)].map(f => f.toLowerCase()))
    : new Set([...activeFilters].map(f => f.toLowerCase()));

  const cards = activePanel.querySelectorAll('.restaurant-card');
  cards.forEach(card => {
    const items = card.querySelectorAll('.menu-item');
    let visibleCount = 0;

    items.forEach(el => {
      if (showAll) {
        el.classList.remove('hidden');
        visibleCount++;
        return;
      }
      const tags = el.dataset.tags ?? '';
      const tagList = tags ? tags.split(' ') : [];
      const matches = tags === '' || tagList.some(t => expanded.has(t));
      el.classList.toggle('hidden', !matches);
      if (matches) visibleCount++;
    });

    card.classList.toggle('filter-collapsed', items.length > 0 && visibleCount === 0);
  });

  refreshSearchResults();
}


function revealCards(instant = false) {
  const panel = Carousel.getActivePanel();
  if (!panel) return;
  const cards = panel.querySelectorAll('.restaurant-card:not(.visible)');
  if (cards.length === 0) return;
  if (instant) {
    cards.forEach(card => { card.classList.add('visible', 'settled'); });
    return;
  }
  const settleTime = cards.length * 25 + 200;
  cards.forEach((card, i) => {
    card.style.transitionDelay = `${i * 25}ms`;
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('visible')));
  });
  setTimeout(() => {
    cards.forEach(card => { card.style.transitionDelay = ''; card.classList.add('settled'); });
  }, settleTime);
}

function refreshPanel(instant = false) {
  applyFilters();
  revealCards(instant);
  Carousel.syncHeight();
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

let _lastContentHash = null;

function contentHash(fullRestaurants, linkRestaurants) {
  const strip = restaurants => restaurants.map(({ fetchedAt, ...rest }) => rest);
  return JSON.stringify(strip(fullRestaurants).concat(strip(linkRestaurants)));
}

async function fetchMenuDataQuiet() {
  try {
    const bust = `?_=${Date.now()}`;
    const manifestRes = await fetch(`data/index.json${bust}`);
    if (!manifestRes.ok) return null;
    const manifest = await manifestRes.json();

    const results = await Promise.allSettled(
      manifest.map(async id => {
        const res = await fetch(`data/${id}.json${bust}`);
        if (!res.ok) throw new Error(`${id}: HTTP ${res.status}`);
        return res.json();
      })
    );

    let oldAll;
    const merged = results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      oldAll ??= _menuData.fullRestaurants.concat(_menuData.linkRestaurants);
      return oldAll.find(o => o.id === manifest[i]) || null;
    }).filter(Boolean);

    if (merged.length === 0) return null;

    return {
      fullRestaurants: merged.filter(r => r.type !== 'link'),
      linkRestaurants: merged.filter(r => r.type === 'link'),
    };
  } catch {
    return null;
  }
}

function renderDayTabs(tabsEl, weekDates, today, isWeekend, activeDay) {
  tabsEl.innerHTML = DAYS.map((d, i) => {
    const cls = ['tab'];
    if (d === today) cls.push('today');
    if (!isWeekend && d === activeDay) cls.push('active');
    const date = formatShortDate(weekDates[i]);
    return `<button class="${cls.join(' ')}" data-day="${d}"><span class="tab-full">${d} <span class="tab-date">${date}</span></span><span class="tab-short">${DAY_SHORT[d]} <span class="tab-date">${date}</span></span></button>`;
  }).join('') + '<div class="tab-indicator" aria-hidden="true"></div>';
}

function renderDayPanels(contentEl, fullRestaurants, linkRestaurants, activeDay) {
  const collapsedSet = loadCollapsed();
  contentEl.innerHTML =
    '<div class="carousel" id="carousel"><div class="carousel-track">' +
    DAYS.map(d =>
      `<div class="day-panel" data-panel="${d}">${renderDay(fullRestaurants, linkRestaurants, d, collapsedSet)}</div>`
    ).join('') +
    '</div></div>' +
    '<span class="sr-only" id="day-announcer" aria-live="polite"></span>';

  // Make non-active panels' cards instantly visible (they're seen during swipe)
  contentEl.querySelectorAll(`.day-panel:not([data-panel="${activeDay}"]) .restaurant-card`)
    .forEach(c => c.classList.add('visible', 'settled'));
}

function isDataFromCurrentWeek(fullRestaurants) {
  const fetchDate = getLatestFetchDate(fullRestaurants);
  if (!fetchDate || isNaN(fetchDate.getTime())) return false;
  const monday = getMondayOfWeek(new Date());
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);
  return fetchDate >= monday && fetchDate < nextMonday;
}

function showCarouselForDay(day) {
  const carousel = document.getElementById('carousel');
  if (carousel) carousel.style.display = '';
  Carousel.switchTo(day);
  Carousel.restorePosition(DAYS.indexOf(day));
  moveInlineMap(DAYS[Carousel.getActiveIndex()]);
  refreshPanel();
  if (!document.getElementById('map-card')?.classList.contains('map-collapsed')) {
    if (_inlineMap) { _inlineMap.invalidateSize(); } else { initInlineMap(); }
  }
}

function renderOfflineState(contentEl, { id, emoji, title, text, browseDay }) {
  const carousel = document.getElementById('carousel');
  if (carousel) carousel.style.display = 'none';
  const btnId = `${id}-browse`;
  contentEl.insertAdjacentHTML('afterbegin', `
    <div class="weekend-state" id="${id}">
      <div class="weekend-emoji">${emoji}</div>
      <div class="weekend-title">${title}</div>
      <div class="weekend-text">${text}</div>
      <button class="weekend-browse-btn" id="${btnId}">Men\u00fcs der letzten Woche ansehen</button>
    </div>`);
  document.getElementById(btnId).addEventListener('click', function() {
    this.closest('.weekend-state').remove();
    showCarouselForDay(browseDay);
  });
}

function renderStaleDataState(contentEl, activeDay) {
  renderOfflineState(contentEl, {
    id: 'stale-state',
    emoji: '\u{1F504}',
    title: 'Neue Men\u00fcs noch nicht verf\u00fcgbar',
    text: 'Die Men\u00fcs f\u00fcr diese Woche wurden noch nicht ver\u00f6ffentlicht.<br>Schau sp\u00e4ter nochmal vorbei!',
    browseDay: activeDay,
  });
}

function renderWeekendState(contentEl) {
  renderOfflineState(contentEl, {
    id: 'weekend-state',
    emoji: '\u{1F373}\u{1F372}\u{1F957}',
    title: 'Guten Appetit... am Montag!',
    text: 'Am Wochenende haben die Kantinen Pause.<br>Die Men\u00fcs f\u00fcr n\u00e4chste Woche werden am Montag fr\u00fch aktualisiert.',
    browseDay: DAYS.at(-1),
  });
}

function setupTabSwitching(tabsEl) {
  tabsEl.addEventListener('click', e => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    haptic();
    const day = btn.dataset.day;
    const idx = DAYS.indexOf(day);
    if (idx === -1) return;

    Carousel.cancel();
    Carousel.switchTo(day);
    Share.clearSelection();
    document.getElementById('weekend-state')?.remove();
    document.getElementById('stale-state')?.remove();
    const carousel = document.getElementById('carousel');
    if (carousel?.style.display === 'none') carousel.style.display = '';

    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.querySelectorAll('.dice-pick').forEach(el => el.classList.remove('dice-pick'));

    moveInlineMap(day);
    refreshPanel();
    Carousel.goTo(idx);
  });
}

function setupFilterListeners(filtersEl) {
  filtersEl.addEventListener('click', e => {
    if (!e.target.closest('.filters-label') && !e.target.closest('.filter-btn')) return;
    haptic();
    if (e.target.closest('.filters-label')) {
      const allBtns = filtersEl.querySelectorAll('.filter-btn');
      const allActive = activeFilters.size === allBtns.length;
      if (allActive) {
        activeFilters.clear();
        allBtns.forEach(b => b.classList.remove('active'));
      } else {
        allBtns.forEach(b => { activeFilters.add(b.dataset.filter); b.classList.add('active'); });
      }
      updateFiltersLabel();
      saveFilters();
      applyFilters();
      return;
    }
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
    updateFiltersLabel();
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
    Carousel.syncHeight();
  });

  contentEl.addEventListener('click', e => {
    const pinBtn = e.target.closest('.map-pin-link');
    if (pinBtn) {
      const card = pinBtn.closest('.restaurant-card');
      if (card) {
        e.preventDefault();
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
  let searchTimer;
  document.getElementById('search-input').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => performSearch(e.target.value), 150);
  });
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openSearch(); }
    if (e.key === 'Escape') closeSearch();
  });
}


let _refreshToastTimer = null;

function createRefreshToast() {
  const toast = document.createElement('div');
  toast.className = 'refresh-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  document.body.appendChild(toast);
  return toast;
}

let _refreshToast = null;

function showRefreshToast() {
  _refreshToast ??= createRefreshToast();
  clearTimeout(_refreshToastTimer);
  _refreshToast.textContent = '';
  _refreshToast.classList.remove('visible');
  void _refreshToast.offsetWidth;
  _refreshToast.textContent = 'Menüs aktualisiert';
  _refreshToast.classList.add('visible');
  _refreshToastTimer = setTimeout(() => _refreshToast.classList.remove('visible'), 3000);
}

function renderFooter(latest, footerEl) {
  const pageLoadTime = new Date().toLocaleString('de-AT', { dateStyle: 'medium', timeStyle: 'short' });
  const fetchTime = latest ? new Date(latest).toLocaleString('de-AT', { dateStyle: 'medium', timeStyle: 'short' }) : null;
  footerEl.innerHTML = fetchTime
    ? `Seite geladen: ${escapeHtml(pageLoadTime)}<br>Daten abgerufen: ${fetchTime}`
    : `Seite geladen: ${escapeHtml(pageLoadTime)}`;
}

/* ── Auto-refresh ─────────────────────────────────────── */

let _pendingRefreshData = null;

function flushPendingRefresh() {
  if (_pendingRefreshData) {
    applyRefresh(_pendingRefreshData);
    _pendingRefreshData = null;
  }
}

function applyRefresh(newData) {
  // 0. Cancel any in-progress snap animation (old carousel DOM is about to be removed)
  Carousel.cancel();

  // 1. Snapshot
  const activeTab = document.querySelector('.tab.active')?.dataset.day || 'Montag';
  const scrollY = window.scrollY;

  // 2. Clear transient state
  document.querySelectorAll('.dice-pick').forEach(el => el.classList.remove('dice-pick'));
  document.querySelectorAll('.share-selected').forEach(el => el.classList.remove('share-selected'));
  document.querySelector('.share-bar')?.classList.remove('visible');

  // 3. Update data
  _menuData = newData;
  _lastContentHash = contentHash(newData.fullRestaurants, newData.linkRestaurants);
  const { fullRestaurants, linkRestaurants } = newData;

  // 4. Re-render tabs
  const tabsEl = document.getElementById('day-tabs');
  const contentEl = document.getElementById('content');
  const today = getTodayName();
  const isWeekend = !today;
  const dataWeekDates = getDataWeekDates(fullRestaurants);
  const isCurrentWeek = isDataFromCurrentWeek(fullRestaurants);
  renderDayTabs(tabsEl, dataWeekDates, isCurrentWeek ? today : null, isWeekend, activeTab);

  // 5. Re-render panels
  renderDayPanels(contentEl, fullRestaurants, linkRestaurants, activeTab);

  // Restore carousel scroll position (DOM was rebuilt)
  Carousel.restorePosition(DAYS.indexOf(activeTab));
  moveInlineMap(DAYS[Carousel.getActiveIndex()]);

  // 6. Rebuild filters (reads active state from localStorage)
  const allTags = collectTags(fullRestaurants);
  loadFilters(allTags);
  buildFilterButtons(allTags);

  // 7. Restore active tab + instant reveal
  refreshPanel(true);

  // Re-attach carousel listeners (DOM was rebuilt)
  Carousel.attach();

  // 8. Restore scroll
  window.scrollTo(0, scrollY);

  // 9. Rebuild map if visible
  const mapCard = document.getElementById('map-card');
  if (mapCard && !mapCard.classList.contains('map-collapsed') && _inlineMap) {
    _inlineMap.remove();
    _inlineMap = null;
    _inlineMarkers = {};
    initInlineMap();
  }

  // 10. Re-evaluate stale/weekend overlay
  if (isWeekend) {
    renderWeekendState(contentEl);
  } else if (!isCurrentWeek) {
    renderStaleDataState(contentEl, activeTab);
  }

  // 11. Notify user
  showRefreshToast();
}

async function checkForUpdates() {
  const newData = await fetchMenuDataQuiet();
  if (!newData) return;

  const newHash = contentHash(newData.fullRestaurants, newData.linkRestaurants);
  if (newHash === _lastContentHash) return;

  if (Share.isActive() || Carousel.isAnimating()) {
    _pendingRefreshData = newData;
    return;
  }

  applyRefresh(newData);
}

function setupPartyMode() {
  const btn = document.getElementById('party-toggle');
  if (localStorage.getItem('party') === 'on') document.documentElement.classList.add('party');
  btn.addEventListener('click', () => {
    const on = document.documentElement.classList.toggle('party');
    localStorage.setItem('party', on ? 'on' : '');
  });
}

function setupThemeToggle() {
  const saved = localStorage.getItem('theme');
  if (saved) document.documentElement.dataset.theme = saved;

  const btn = document.getElementById('theme-toggle');
  btn.addEventListener('click', () => {
    const root = document.documentElement;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function applyTheme() {
      const next = root.dataset.theme === 'latte' ? '' : 'latte';
      if (next) {
        root.dataset.theme = next;
        localStorage.setItem('theme', next);
      } else {
        delete root.dataset.theme;
        localStorage.removeItem('theme');
      }
    }

    if (reducedMotion) {
      applyTheme();
    } else if (document.startViewTransition) {
      const rect = btn.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      root.style.setProperty('--toggle-x', x + 'px');
      root.style.setProperty('--toggle-y', y + 'px');
      document.startViewTransition(applyTheme);
    } else {
      root.classList.add('theme-transitioning');
      applyTheme();
      setTimeout(() => root.classList.remove('theme-transitioning'), 350);
    }
  });
}

let _leafletMap = null;
let _inlineMap = null;
let _inlineMarkers = {};

function moveInlineMap(targetDay) {
  const panel = targetDay
    ? document.querySelector(`.day-panel[data-panel="${targetDay}"]`)
    : Carousel.getActivePanel();
  if (!panel) return;
  const newMapCard = panel.querySelector('.map-card');
  if (!newMapCard) return;
  const oldMapCard = document.getElementById('map-card');
  if (oldMapCard) oldMapCard.removeAttribute('id');
  newMapCard.id = 'map-card';
  const newSlot = newMapCard.querySelector('.map-slot');
  if (!newSlot) return;
  let mapDiv = document.getElementById('inline-map');
  if (mapDiv) {
    if (mapDiv.parentElement !== newSlot) {
      newSlot.appendChild(mapDiv);
      if (_inlineMap) setTimeout(() => _inlineMap.invalidateSize(), 50);
    }
  } else {
    mapDiv = document.createElement('div');
    mapDiv.id = 'inline-map';
    newSlot.appendChild(mapDiv);
  }
}


function buildMapPopup(r) {
  let html = `<strong>${escapeHtml(r.title)}</strong>`;
  if (r.cuisine?.length) {
    html += `<br><span style="font-size:var(--text-xs);color:var(--text-secondary)">${r.cuisine.map(c => escapeHtml(c)).join(' \u00b7 ')}</span>`;
  }
  if (r.availableDays) {
    html += `<br><span style="font-size:var(--text-xxs);font-weight:600;color:var(--mauve)">nur ${r.availableDays.map(d => DAY_SHORT[d]).join(', ')}</span>`;
  }
  const badges = [];
  if (r.edenred) badges.push('<span style="color:var(--red)">Edenred</span>');
  if (r.stampCard) badges.push('<span style="color:var(--teal)">Stempelkarte</span>');
  if (badges.length) {
    html += `<br><span style="font-size:var(--text-xxs);font-weight:600">${badges.join(' \u00b7 ')}</span>`;
  }
  return html;
}

function addMapMarkers(map, { onClick, store } = {}) {
  const allRestaurants = getAllRestaurants();
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
    const marker = L.marker([r.coordinates.lat, r.coordinates.lon], { icon }).addTo(map);
    marker.bindPopup(buildMapPopup(r), { closeButton: false, className: 'map-popup' });
    if (onClick) marker.on('click', () => onClick(r.id));
    marker.on('mouseover', function () { this.openPopup(); });
    marker.on('mouseout', function () { this.closePopup(); });
    if (store) store[r.id] = marker;
  }
}

function initInlineMap() {
  if (_inlineMap) { _inlineMap.invalidateSize(); return; }
  const container = document.getElementById('inline-map');
  if (!container) return;

  _inlineMap = L.map('inline-map', { zoomControl: false, attributionControl: false }).setView([48.2225, 16.3945], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(_inlineMap);
  addMapMarkers(_inlineMap, { onClick: scrollToRestaurant, store: _inlineMarkers });
}

function scrollToRestaurant(id) {
  const activePanel = Carousel.getActivePanel();
  if (!activePanel) return;
  const card = activePanel.querySelector(`.restaurant-card[data-restaurant="${id}"]`);
  if (!card) return;

  if (card.classList.contains('collapsed')) {
    card.classList.remove('collapsed');
    saveCollapsed();
  }

  smoothScrollTo(card);
  card.classList.add('map-highlight');
  setTimeout(() => card.classList.remove('map-highlight'), 1500);
}

function focusOnMap(id) {
  const allRestaurants = getAllRestaurants();
  const r = allRestaurants.find(r => r.id === id);
  if (!r?.coordinates) return false;

  const mapCard = document.getElementById('map-card');
  if (!mapCard) return false;

  // Expand map if collapsed
  if (mapCard.classList.contains('map-collapsed')) {
    toggleMapCard();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });

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
  const primary = document.getElementById('map-card');
  if (!primary) return;
  const isCollapsed = primary.classList.toggle('map-collapsed');
  localStorage.setItem('map-collapsed', isCollapsed);
  // Sync all map cards across panels
  document.querySelectorAll('.map-card').forEach(c => {
    if (c !== primary) c.classList.toggle('map-collapsed', isCollapsed);
  });
  if (!isCollapsed) {
    if (!_inlineMap) {
      setTimeout(() => initInlineMap(), 50);
    } else {
      setTimeout(() => _inlineMap.invalidateSize(), 300);
    }
  }
  Carousel.syncHeight();
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

    addMapMarkers(_leafletMap);
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
  // Delegate map card clicks (works across day switches)
  document.getElementById('content').addEventListener('click', e => {
    const mapCard = e.target.closest('.map-card');
    if (!mapCard) return;
    if (e.target.closest('.map-fullscreen-btn')) {
      openMap();
      return;
    }
    if (e.target.closest('.restaurant-header')) {
      toggleMapCard();
    }
  });

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
  Streak.init();
  const tabsEl = document.getElementById('day-tabs');
  const contentEl = document.getElementById('content');
  const footerEl = document.getElementById('footer');
  const filtersEl = document.getElementById('filters');
  const today = getTodayName();
  const isWeekend = !today;
  const activeDay = today || 'Montag';
  const weekDates = getWeekDates();

  renderDayTabs(tabsEl, weekDates, today, isWeekend, activeDay);

  // Show skeleton while loading
  const randLines = () => {
    const count = 8 + Math.floor(Math.random() * 32);
    return Array.from({ length: count }, () => {
      const w = 25 + Math.floor(Math.random() * 65);
      return `<div class="skeleton-line" style="width:${w}%"></div>`;
    }).join('');
  };
  contentEl.innerHTML = '<div class="carousel"><div class="carousel-track"><div class="day-panel"><div class="restaurant-grid">' +
    [1,2,3].map(() => `<div class="skeleton-card">${randLines()}</div>`).join('') + '</div></div></div></div>';

  try {
    const loadStart = Date.now();
    const [, { fullRestaurants, linkRestaurants }] = await Promise.all([
      TagUtils.load('data/tags.json'),
      fetchMenuData(),
    ]);

    _menuData = { fullRestaurants, linkRestaurants };
    _lastContentHash = contentHash(fullRestaurants, linkRestaurants);

    const allTags = collectTags(fullRestaurants);
    loadFilters(allTags);
    buildFilterButtons(allTags);

    const elapsed = Date.now() - loadStart;
    if (elapsed < 200) await new Promise(r => setTimeout(r, 200 - elapsed));

    const dataWeekDates = getDataWeekDates(fullRestaurants);
    const isCurrentWeek = isDataFromCurrentWeek(fullRestaurants);
    renderDayTabs(tabsEl, dataWeekDates, isCurrentWeek ? today : null, isWeekend, activeDay);

    renderDayPanels(contentEl, fullRestaurants, linkRestaurants, activeDay);
    Carousel.switchTo(activeDay);
    const activeIdx = Carousel.getActiveIndex();
    if (activeIdx > 0) {
      const carousel = document.getElementById('carousel');
      if (carousel) carousel.scrollLeft = activeIdx * carousel.offsetWidth;
    }
    moveInlineMap(DAYS[Carousel.getActiveIndex()]);
    refreshPanel();

    const carouselHidden = isWeekend || !isCurrentWeek;
    if (isWeekend) renderWeekendState(contentEl);
    else if (!isCurrentWeek) renderStaleDataState(contentEl, activeDay);

    if (!carouselHidden && !document.getElementById('map-card')?.classList.contains('map-collapsed')) {
      initInlineMap();
    }

    setupTabSwitching(tabsEl);
    setupFilterListeners(filtersEl);
    setupCollapseExpand(contentEl);
    setupSearchListeners();
    setupMapListeners();
    Carousel.attach();
    renderFooter(getLatestFetchTime(fullRestaurants), footerEl);

    // Auto-refresh polling
    _refreshToast = createRefreshToast();
    setInterval(checkForUpdates, 10 * 60 * 1000);
  } catch (err) {
    contentEl.innerHTML = `<div class="error-global">Fehler beim Laden: ${escapeHtml(err.message)}</div>`;
  }
}

/* ── Share data extraction ──────────────────────────────── */

function extractRestaurantMeta(cardElement) {
  const nameElement = cardElement.querySelector('.restaurant-name');
  if (!nameElement) return null;
  const name = nameElement.childNodes[0]?.textContent?.trim() || '';
  const cuisine = cardElement.querySelector('.cuisine-tag')?.textContent?.trim() || '';
  const badges = [];
  if (cardElement.querySelector('.edenred-badge')) badges.push('Edenred');
  if (cardElement.querySelector('.outdoor-badge')) badges.push('Draußen');
  if (cardElement.querySelector('.stamp-card-badge')) badges.push('Stempelkarte');
  return { name, cuisine, badges };
}

function extractMenuItem(element) {
  return {
    title: element.querySelector('.item-title-text')?.textContent?.trim() || '',
    price: element.querySelector('.item-price')?.textContent?.trim() || '',
    description: element.querySelector('.item-description')?.textContent?.trim() || '',
    tags: [...element.querySelectorAll('.tag')].map(tag => tag.textContent.trim()),
  };
}

function groupItemsByCategory(itemElements) {
  const categoryMap = new Map();
  for (const element of itemElements) {
    const categoryElement = element.closest('.category');
    const categoryName = categoryElement?.querySelector('.category-title')?.textContent?.trim() || '';
    if (!categoryMap.has(categoryName)) categoryMap.set(categoryName, []);
    categoryMap.get(categoryName).push(extractMenuItem(element));
  }
  return [...categoryMap.entries()].map(([name, items]) => ({ name, items }));
}

function getShareSelectionData() {
  const activePanel = Carousel.getActivePanel();
  if (!activePanel) return null;

  const restaurants = [];
  for (const card of activePanel.querySelectorAll('.restaurant-card')) {
    const selectedItems = [...card.querySelectorAll('.menu-item.share-selected:not(.hidden)')];
    const isCardSelected = card.classList.contains('share-selected');
    if (selectedItems.length === 0 && !isCardSelected) continue;

    const meta = extractRestaurantMeta(card);
    if (!meta) continue;

    restaurants.push({
      ...meta,
      restaurant: card.dataset.restaurant,
      categories: selectedItems.length > 0 ? groupItemsByCategory(selectedItems) : [],
    });
  }

  if (restaurants.length === 0) return null;
  const day = activePanel.dataset.panel || '';
  return { day, sections: restaurants };
}

setupPartyMode();
Carousel.setup({
  days: DAYS,
  onDayChange(day) {
    Share.clearSelection();
    moveInlineMap(day);
    refreshPanel();
    flushPendingRefresh();
  },
});
Dice.setup({ smoothScrollTo, saveCollapsed });
Share.setup({
  title: document.querySelector('.toolbar-title')?.textContent?.trim(),
  subtitle: document.querySelector('.toolbar-subtitle')?.textContent?.trim(),
  logo: document.querySelector('.toolbar-logo'),
  getSelectionData: getShareSelectionData,
  onClear: flushPendingRefresh,
});
setupThemeToggle();

init();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
