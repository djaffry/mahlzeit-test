const DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];
const DAY_SHORT = { Montag: 'Mo', Dienstag: 'Di', Mittwoch: 'Mi', Donnerstag: 'Do', Freitag: 'Fr' };
const DAY_JS_MAP = { 1: 'Montag', 2: 'Dienstag', 3: 'Mittwoch', 4: 'Donnerstag', 5: 'Freitag' };

const SVG = {
  collapse: '<svg class="restaurant-collapse-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6l4 4 4-4"/></svg>',
  reload: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 1v5h5"/><path d="M2.5 10A6 6 0 1 0 4 4.5L1 6"/></svg>',
  mapPin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>',
};

function haptic(ms = 10) { navigator.vibrate?.(ms); }

const TAG_COLORS = {
  Vegan: 'green',
  Vegetarisch: 'teal',
  Fisch: 'blue',
  'Geflügel': 'peach',
  Huhn: 'peach',
  Hühnerfleisch: 'peach',
  Pute: 'peach',
  Fleisch: 'red',
  Wild: 'red',
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

function escapeHtml(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

function smoothScrollTo(el) {
  const toolbar = document.querySelector('.toolbar');
  const offset = toolbar ? toolbar.offsetHeight + 12 : 0;
  const top = el.getBoundingClientRect().top + window.scrollY - offset;
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

function updateFiltersLabel() {
  const label = document.querySelector('.filters-label');
  if (!label) return;
  const total = document.querySelectorAll('.filter-btn').length;
  const allActive = activeFilters.size === total;
  label.innerHTML = allActive
    ? 'Filter <span class="filters-clear">\u25cf</span>'
    : 'Filter <span class="filters-clear">\u25cb</span>';
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
      <div class="restaurant-header">
        <div class="restaurant-name">${escapeHtml(restaurant.title)}${restaurant.cuisine?.length ? `<span class="cuisine-tag">${restaurant.cuisine.map(escapeHtml).join(' · ')}</span>` : ''}${restaurant.stampCard ? '<span class="stamp-card-badge">Stempelkarte</span>' : ''}${restaurant.edenred ? '<span class="edenred-badge">Edenred</span>' : ''}${restaurant.reservationUrl ? '<span class="reservation-badge">Reservierung erforderlich</span>' : ''}</div>
        <div style="display:flex;align-items:center;gap:0.4rem">
          ${restaurant.mapUrl ? `<a class="map-pin-link" href="${escapeHtml(restaurant.mapUrl)}" target="_blank" rel="noopener" title="Auf Karte anzeigen">${SVG.mapPin}</a>` : ''}
          ${SVG.collapse}
        </div>
      </div>
      <div class="restaurant-content"><div class="restaurant-content-inner">
        ${body}
        <div class="link-body">${websiteLink}</div>
        ${restaurant.reservationUrl ? `<div class="link-body"><a class="link-cta" href="${escapeHtml(restaurant.reservationUrl)}" target="_blank" rel="noopener">Online reservieren &rarr;</a></div>` : ''}
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
        <div class="restaurant-name">${escapeHtml(restaurant.title)}${restaurant.cuisine?.length ? `<span class="cuisine-tag">${restaurant.cuisine.map(escapeHtml).join(' · ')}</span>` : ''}${restaurant.stampCard ? '<span class="stamp-card-badge">Stempelkarte</span>' : ''}${restaurant.edenred ? '<span class="edenred-badge">Edenred</span>' : ''}${restaurant.reservationUrl ? '<span class="reservation-badge">Reservierung erforderlich</span>' : ''}${schedule}</div>
        <div style="display:flex;align-items:center;gap:0.4rem">
          ${restaurant.mapUrl ? `<a class="map-pin-link" href="${escapeHtml(restaurant.mapUrl)}" target="_blank" rel="noopener" title="Auf Karte anzeigen">${SVG.mapPin}</a>` : ''}
          ${SVG.collapse}
        </div>
      </div>
      <div class="restaurant-content"><div class="restaurant-content-inner">
        <div class="link-body">${websiteLink}</div>
        ${restaurant.reservationUrl ? `<div class="link-body"><a class="link-cta" href="${escapeHtml(restaurant.reservationUrl)}" target="_blank" rel="noopener">Online reservieren &rarr;</a></div>` : ''}
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

function isFilterShowAll() {
  return activeFilters.size === document.querySelectorAll('.filter-btn').length;
}

function itemMatchesFilters(item) {
  const tags = (item.tags ?? []).map(t => t.toLowerCase()).join(' ');
  if (tags === '') return true;
  return [...activeFilters].some(f => tags.includes(f.toLowerCase()));
}

function performSearch(query) {
  const resultsEl = document.getElementById('search-results');
  if (!query.trim()) { resultsEl.innerHTML = ''; return; }

  const q = query.toLowerCase().trim();
  const activeTab = document.querySelector('.tab.active');
  const day = activeTab ? activeTab.dataset.day : 'Montag';
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
  const contentEl = document.getElementById('content');
  const activePanel = contentEl.querySelector('.day-panel.active');
  if (!activePanel) return;

  const showAll = isFilterShowAll();

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
      const matches = tags === '' || [...activeFilters].some(f => tags.includes(f.toLowerCase()));
      el.classList.toggle('hidden', !matches);
      if (matches) visibleCount++;
    });

    card.classList.toggle('filter-collapsed', items.length > 0 && visibleCount === 0);
  });

  refreshSearchResults();
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

function revealCards() {
  const panel = document.querySelector('.day-panel.active');
  if (!panel) return;
  const cards = panel.querySelectorAll('.restaurant-card:not(.visible)');
  const settleTime = cards.length * 25 + 200;
  cards.forEach((card, i) => {
    card.style.transitionDelay = `${i * 25}ms`;
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('visible')));
  });
  setTimeout(() => {
    cards.forEach(card => { card.style.transitionDelay = ''; card.classList.add('settled'); });
  }, settleTime);
}

function refreshPanel() {
  applyFilters();
  moveMapCard();
  revealCards();
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
    haptic();
    const day = btn.dataset.day;
    const currentPanel = contentEl.querySelector('.day-panel.active');
    const nextPanel = contentEl.querySelector(`.day-panel[data-panel="${day}"]`);
    if (currentPanel === nextPanel) return;

    tabsEl.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.day === day));
    document.getElementById('weekend-state')?.remove();

    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.querySelectorAll('.dice-pick').forEach(el => el.classList.remove('dice-pick'));

    if (currentPanel) {
      currentPanel.style.opacity = '0';
      currentPanel.style.transform = 'translateY(4px)';
      setTimeout(() => {
        currentPanel.classList.remove('active');
        currentPanel.style.opacity = '';
        currentPanel.style.transform = '';
        currentPanel.querySelectorAll('.restaurant-card.visible').forEach(c => {
          c.classList.remove('visible', 'settled');
          c.style.transitionDelay = '';
        });
        nextPanel.classList.add('active', 'fade-enter');
        nextPanel.offsetHeight; // force reflow
        nextPanel.classList.remove('fade-enter');
        refreshPanel();
      }, 150);
    } else {
      nextPanel.classList.add('active');
      refreshPanel();
    }
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
  const fetchTime = latest ? new Date(latest).toLocaleString('de-AT', { dateStyle: 'medium', timeStyle: 'short' }) : null;

  footerEl.innerHTML = fetchTime
    ? `Seite geladen: ${escapeHtml(pageLoadTime)}<br>Daten abgerufen: ${fetchTime}`
    : `Seite geladen: ${escapeHtml(pageLoadTime)}`;

  setTimeout(() => {
    const badge = document.getElementById('freshness-badge');
    badge.innerHTML = `<span class="freshness-label">Neu laden</span>${SVG.reload}`;
    badge.classList.add('page-stale');
    badge.addEventListener('click', () => window.location.reload());
  }, 5 * 60 * 1000);
}

function setupPartyMode() {
  const btn = document.getElementById('party-toggle');
  if (localStorage.getItem('party') === 'on') document.documentElement.classList.add('party');
  btn.addEventListener('click', () => {
    const on = document.documentElement.classList.toggle('party');
    localStorage.setItem('party', on ? 'on' : '');
  });
}

function setupDiceRoll() {
  const btn = document.getElementById('dice-btn');
  btn.addEventListener('click', () => {
    haptic(15);
    const panel = document.querySelector('.day-panel.active');
    if (!panel) return;

    const menuItems = [...panel.querySelectorAll('.menu-item:not(.hidden)')]
      .filter(el => !el.closest('.restaurant-card')?.querySelector('.reservation-badge'));

    const linkCards = [...panel.querySelectorAll('.restaurant-card:not(.link-muted):not(.map-card)')]
      .filter(card => !card.querySelector('.menu-item') && !card.querySelector('.reservation-badge'));

    const pool = [...menuItems, ...linkCards];
    if (pool.length === 0) return;

    document.querySelectorAll('.dice-pick').forEach(el => el.classList.remove('dice-pick'));

    btn.classList.add('rolling');
    btn.addEventListener('animationend', () => btn.classList.remove('rolling'), { once: true });

    const pick = pool[Math.floor(Math.random() * pool.length)];

    const card = pick.closest('.restaurant-card') || pick;
    if (card.classList.contains('collapsed')) {
      card.classList.remove('collapsed');
      saveCollapsed();
    }

    pick.classList.add('dice-pick');
    const isCard = pick.classList.contains('restaurant-card');
    setTimeout(() => {
      if (isCard) { smoothScrollTo(pick); }
      else { pick.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    }, 100);
  });
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

  smoothScrollTo(card);
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

  // Show skeleton while loading
  const randLines = () => {
    const count = 8 + Math.floor(Math.random() * 32);
    return Array.from({ length: count }, () => {
      const w = 25 + Math.floor(Math.random() * 65);
      return `<div class="skeleton-line" style="width:${w}%"></div>`;
    }).join('');
  };
  contentEl.innerHTML = '<div class="restaurant-grid">' +
    [1,2,3].map(() => `<div class="skeleton-card">${randLines()}</div>`).join('') + '</div>';

  try {
    const loadStart = Date.now();
    const { fullRestaurants, linkRestaurants } = await fetchMenuData();
    _menuData = { fullRestaurants, linkRestaurants };

    const allTags = collectTags(fullRestaurants);
    loadFilters(allTags);
    buildFilterButtons(allTags);

    const elapsed = Date.now() - loadStart;
    if (elapsed < 200) await new Promise(r => setTimeout(r, 200 - elapsed));

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

setupPartyMode();
setupDiceRoll();
setupThemeToggle();

init();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
