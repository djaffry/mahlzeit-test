import { describe, it } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { JSDOM } from 'jsdom';

const shareScript = new Script(readFileSync(new URL('./share.js', import.meta.url), 'utf8'));

/* ── Extraction helpers (mirroring app.js) ───────────────── */

function extractRestaurantMeta(cardElement) {
  const nameElement = cardElement.querySelector('.restaurant-name');
  if (!nameElement) return null;
  const name = nameElement.childNodes[0]?.textContent?.trim() || '';
  const cuisine = cardElement.querySelector('.cuisine-tag')?.textContent?.trim() || '';
  const badges = [];
  if (cardElement.querySelector('.edenred-badge')) badges.push('Edenred');
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

function extractAllCategories(cardElement) {
  return [...cardElement.querySelectorAll('.category')]
    .map(category => ({
      name: category.querySelector('.category-title')?.textContent?.trim() || '',
      items: [...category.querySelectorAll('.menu-item:not(.hidden)')].map(extractMenuItem),
    }))
    .filter(category => category.items.length > 0);
}

function extractCardData(cardElement, selectedItemElements) {
  const meta = extractRestaurantMeta(cardElement);
  if (!meta) return null;
  const categories = selectedItemElements
    ? groupItemsByCategory(selectedItemElements)
    : extractAllCategories(cardElement);
  const panel = cardElement.closest('.day-panel');
  const day = panel?.dataset.panel || '';
  return { ...meta, categories, day, restaurant: cardElement.dataset.restaurant };
}

function getSelectionData(doc) {
  const activePanel = doc.querySelector('.day-panel');
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

/* ── Test setup ──────────────────────────────────────────── */

function initShare(panelHTML = '') {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>
    <div class="content" id="content">
      <div class="day-panel" data-panel="Montag">${panelHTML}</div>
    </div>
  </body></html>`, { url: 'http://localhost', runScripts: 'outside-only' });

  const { window: win } = dom;
  win.Carousel = {
    getActivePanel: () => win.document.querySelector('.day-panel'),
  };
  win.DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];
  win.getMondayOfWeek = (d) => { const m = new Date(d); m.setDate(d.getDate() - ((d.getDay() + 6) % 7)); m.setHours(0,0,0,0); return m; };
  shareScript.runInContext(dom.getInternalVMContext());
  win.Share.setup({
    getSelectionData: () => getSelectionData(win.document),
  });

  return { win, doc: win.document, Share: win.Share };
}

const CARD_WITH_MENU = `
  <div class="restaurant-card" data-restaurant="mano">
    <div class="restaurant-header">
      <div class="restaurant-name">Mano Caf\u00e9
        <span class="cuisine-tag">Caf\u00e9 \u00b7 Bistro</span>
        <span class="edenred-badge">Edenred</span>
      </div>
    </div>
    <div class="restaurant-content"><div class="restaurant-content-inner">
      <div class="restaurant-body">
        <div class="category">
          <div class="category-title">Suppe</div>
          <div class="menu-item" id="item-a">
            <div class="item-title"><span class="item-title-text">Gulaschsuppe</span><span class="item-price">4,50 \u20ac</span></div>
            <div class="item-meta"><span class="tag">Rindfleisch</span></div>
          </div>
          <div class="menu-item" id="item-b">
            <div class="item-title"><span class="item-title-text">Gem\u00fcsesuppe</span><span class="item-price">3,90 \u20ac</span></div>
            <div class="item-description">mit Cr\u00e8me fra\u00eeche</div>
            <div class="item-meta"><span class="tag">Vegetarisch</span></div>
          </div>
        </div>
        <div class="category">
          <div class="category-title">Hauptspeise</div>
          <div class="menu-item" id="item-c">
            <div class="item-title"><span class="item-title-text">Schnitzel</span><span class="item-price">12,90 \u20ac</span></div>
          </div>
        </div>
      </div>
    </div></div>
  </div>`;

const CARD_LINK_ONLY = `
  <div class="restaurant-card" data-restaurant="bep">
    <div class="restaurant-header">
      <div class="restaurant-name">Bep Vietnamese
        <span class="cuisine-tag">Vietnamesisch</span>
        <span class="stamp-card-badge">Stempelkarte</span>
      </div>
    </div>
    <div class="restaurant-content"><div class="restaurant-content-inner">
      <div class="link-body"><a class="link-cta" href="#">Website</a></div>
    </div></div>
  </div>`;

const CARD_NO_DATA = `
  <div class="restaurant-card" data-restaurant="test">
    <div class="restaurant-header">
      <div class="restaurant-name">Test Restaurant</div>
    </div>
    <div class="restaurant-content"><div class="restaurant-content-inner">
      <div class="no-data">(Noch) kein Men\u00fc f\u00fcr diesen Tag</div>
    </div></div>
  </div>`;

describe('extractCardData', () => {
  it('extracts full card data (no selection)', () => {
    const { doc } = initShare(CARD_WITH_MENU);
    const card = doc.querySelector('.restaurant-card');
    const data = extractCardData(card);

    strictEqual(data.name, 'Mano Caf\u00e9');
    strictEqual(data.cuisine, 'Caf\u00e9 \u00b7 Bistro');
    strictEqual(data.restaurant, 'mano');
    strictEqual(data.day, 'Montag');
    strictEqual(JSON.stringify(data.badges), JSON.stringify(['Edenred']));
    strictEqual(data.categories.length, 2);
  });

  it('extracts category items correctly', () => {
    const { doc } = initShare(CARD_WITH_MENU);
    const card = doc.querySelector('.restaurant-card');
    const data = extractCardData(card);

    const soup = data.categories[0];
    strictEqual(soup.name, 'Suppe');
    strictEqual(soup.items.length, 2);
    strictEqual(soup.items[0].title, 'Gulaschsuppe');
    strictEqual(soup.items[0].price, '4,50 \u20ac');
    strictEqual(JSON.stringify(soup.items[0].tags), JSON.stringify(['Rindfleisch']));
    strictEqual(soup.items[1].description, 'mit Cr\u00e8me fra\u00eeche');
  });

  it('extracts only selected items when itemEls provided', () => {
    const { doc } = initShare(CARD_WITH_MENU);
    const card = doc.querySelector('.restaurant-card');
    const itemA = doc.getElementById('item-a');
    const itemC = doc.getElementById('item-c');

    const data = extractCardData(card, [itemA, itemC]);

    strictEqual(data.name, 'Mano Caf\u00e9');
    strictEqual(data.categories.length, 2);
    strictEqual(data.categories[0].name, 'Suppe');
    strictEqual(data.categories[0].items.length, 1);
    strictEqual(data.categories[0].items[0].title, 'Gulaschsuppe');
    strictEqual(data.categories[1].name, 'Hauptspeise');
    strictEqual(data.categories[1].items[0].title, 'Schnitzel');
  });

  it('extracts a single selected item', () => {
    const { doc } = initShare(CARD_WITH_MENU);
    const card = doc.querySelector('.restaurant-card');
    const itemB = doc.getElementById('item-b');

    const data = extractCardData(card, [itemB]);

    strictEqual(data.categories.length, 1);
    strictEqual(data.categories[0].name, 'Suppe');
    strictEqual(data.categories[0].items.length, 1);
    strictEqual(data.categories[0].items[0].title, 'Gem\u00fcsesuppe');
    strictEqual(data.categories[0].items[0].price, '3,90 \u20ac');
    strictEqual(data.categories[0].items[0].description, 'mit Cr\u00e8me fra\u00eeche');
  });

  it('groups selected items by their category', () => {
    const { doc } = initShare(CARD_WITH_MENU);
    const card = doc.querySelector('.restaurant-card');
    const items = [doc.getElementById('item-a'), doc.getElementById('item-b')];

    const data = extractCardData(card, items);

    strictEqual(data.categories.length, 1);
    strictEqual(data.categories[0].name, 'Suppe');
    strictEqual(data.categories[0].items.length, 2);
  });

  it('extracts link-only card with badges', () => {
    const { doc } = initShare(CARD_LINK_ONLY);
    const card = doc.querySelector('.restaurant-card');
    const data = extractCardData(card);

    strictEqual(data.name, 'Bep Vietnamese');
    strictEqual(data.cuisine, 'Vietnamesisch');
    strictEqual(JSON.stringify(data.badges), JSON.stringify(['Stempelkarte']));
    strictEqual(data.categories.length, 0);
  });

  it('extracts no-data card with empty categories', () => {
    const { doc } = initShare(CARD_NO_DATA);
    const card = doc.querySelector('.restaurant-card');
    const data = extractCardData(card);

    strictEqual(data.name, 'Test Restaurant');
    strictEqual(data.categories.length, 0);
  });

  it('returns null when restaurant-name is missing', () => {
    const { doc } = initShare('<div class="restaurant-card" data-restaurant="x"></div>');
    const card = doc.querySelector('.restaurant-card');
    strictEqual(extractCardData(card), null);
  });

  it('excludes hidden menu items', () => {
    const { doc } = initShare(`
      <div class="restaurant-card" data-restaurant="r1">
        <div class="restaurant-header"><div class="restaurant-name">R1</div></div>
        <div class="restaurant-content"><div class="restaurant-content-inner">
          <div class="restaurant-body">
            <div class="category">
              <div class="category-title">Cat</div>
              <div class="menu-item"><div class="item-title"><span class="item-title-text">Visible</span></div></div>
              <div class="menu-item hidden"><div class="item-title"><span class="item-title-text">Hidden</span></div></div>
            </div>
          </div>
        </div></div>
      </div>
    `);
    const card = doc.querySelector('.restaurant-card');
    const data = extractCardData(card);

    strictEqual(data.categories[0].items.length, 1);
    strictEqual(data.categories[0].items[0].title, 'Visible');
  });

  it('filters out empty categories', () => {
    const { doc } = initShare(`
      <div class="restaurant-card" data-restaurant="r1">
        <div class="restaurant-header"><div class="restaurant-name">R1</div></div>
        <div class="restaurant-content"><div class="restaurant-content-inner">
          <div class="restaurant-body">
            <div class="category">
              <div class="category-title">Empty</div>
              <div class="menu-item hidden"><div class="item-title"><span class="item-title-text">Hidden</span></div></div>
            </div>
            <div class="category">
              <div class="category-title">Visible</div>
              <div class="menu-item"><div class="item-title"><span class="item-title-text">Item</span></div></div>
            </div>
          </div>
        </div></div>
      </div>
    `);
    const card = doc.querySelector('.restaurant-card');
    const data = extractCardData(card);

    strictEqual(data.categories.length, 1);
    strictEqual(data.categories[0].name, 'Visible');
  });

  it('handles card with no cuisine or badges', () => {
    const { doc } = initShare(`
      <div class="restaurant-card" data-restaurant="plain">
        <div class="restaurant-header"><div class="restaurant-name">Plain</div></div>
        <div class="restaurant-content"><div class="restaurant-content-inner"></div></div>
      </div>
    `);
    const card = doc.querySelector('.restaurant-card');
    const data = extractCardData(card);

    strictEqual(data.name, 'Plain');
    strictEqual(data.cuisine, '');
    strictEqual(JSON.stringify(data.badges), JSON.stringify([]));
  });

  it('reads day from panel data attribute', () => {
    const { doc } = initShare(CARD_WITH_MENU);
    const card = doc.querySelector('.restaurant-card');
    strictEqual(extractCardData(card).day, 'Montag');
  });

  it('handles card outside a day-panel', () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body>
      <div class="restaurant-card" data-restaurant="orphan">
        <div class="restaurant-header"><div class="restaurant-name">Orphan</div></div>
      </div>
    </body></html>`, { url: 'http://localhost', runScripts: 'outside-only' });

    const card = dom.window.document.querySelector('.restaurant-card');
    strictEqual(extractCardData(card).day, '');
  });
});

describe('Share item selection', () => {
  it('toggles share-selected on menu item click', () => {
    const { doc } = initShare(CARD_WITH_MENU);
    const item = doc.getElementById('item-a');

    item.click();
    ok(item.classList.contains('share-selected'));

    item.click();
    ok(!item.classList.contains('share-selected'));
  });

  it('does not toggle when clicking a link inside item', () => {
    const { doc } = initShare(`
      <div class="restaurant-card" data-restaurant="r1">
        <div class="restaurant-header"><div class="restaurant-name">R1</div></div>
        <div class="restaurant-content"><div class="restaurant-content-inner">
          <div class="restaurant-body">
            <div class="category">
              <div class="category-title">Cat</div>
              <div class="menu-item" id="item-link">
                <div class="item-title"><span class="item-title-text">Test</span></div>
                <a href="#" id="inner-link">Link</a>
              </div>
            </div>
          </div>
        </div></div>
      </div>
    `);
    doc.getElementById('inner-link').click();
    ok(!doc.getElementById('item-link').classList.contains('share-selected'));
  });

  it('shows floating bar when items selected', () => {
    const { doc } = initShare(CARD_WITH_MENU);
    const bar = doc.querySelector('.share-bar');
    ok(bar);
    ok(!bar.classList.contains('visible'));

    doc.getElementById('item-a').click();
    ok(bar.classList.contains('visible'));
    strictEqual(bar.querySelector('.share-bar-count').textContent, '1 ausgewählt');

    doc.getElementById('item-c').click();
    strictEqual(bar.querySelector('.share-bar-count').textContent, '2 ausgewählt');

    doc.getElementById('item-a').click();
    doc.getElementById('item-c').click();
    ok(!bar.classList.contains('visible'));
  });
});

describe('getSelectionData', () => {
  it('returns null when nothing selected', () => {
    const { doc } = initShare(CARD_WITH_MENU);
    strictEqual(getSelectionData(doc), null);
  });

  it('extracts selected items grouped by restaurant', () => {
    const { doc } = initShare(CARD_WITH_MENU);
    doc.getElementById('item-a').classList.add('share-selected');
    doc.getElementById('item-c').classList.add('share-selected');

    const data = getSelectionData(doc);
    ok(data);
    strictEqual(data.day, 'Montag');
    strictEqual(data.sections.length, 1);
    strictEqual(data.sections[0].name, 'Mano Caf\u00e9');
    strictEqual(data.sections[0].categories.length, 2);
    strictEqual(data.sections[0].categories[0].items[0].title, 'Gulaschsuppe');
    strictEqual(data.sections[0].categories[1].items[0].title, 'Schnitzel');
  });

  it('groups items across multiple restaurants', () => {
    const { doc } = initShare(`
      <div class="restaurant-card" data-restaurant="r1">
        <div class="restaurant-header"><div class="restaurant-name">R1</div></div>
        <div class="restaurant-content"><div class="restaurant-content-inner">
          <div class="restaurant-body">
            <div class="category"><div class="category-title">Cat</div>
              <div class="menu-item share-selected"><div class="item-title"><span class="item-title-text">A</span></div></div>
            </div>
          </div>
        </div></div>
      </div>
      <div class="restaurant-card" data-restaurant="r2">
        <div class="restaurant-header"><div class="restaurant-name">R2</div></div>
        <div class="restaurant-content"><div class="restaurant-content-inner">
          <div class="restaurant-body">
            <div class="category"><div class="category-title">Cat</div>
              <div class="menu-item share-selected"><div class="item-title"><span class="item-title-text">B</span></div></div>
            </div>
          </div>
        </div></div>
      </div>
    `);

    const data = getSelectionData(doc);
    ok(data);
    strictEqual(data.sections.length, 2);
    strictEqual(data.sections[0].name, 'R1');
    strictEqual(data.sections[1].name, 'R2');
  });
});

describe('Share.setup', () => {
  it('does not crash when called', () => {
    initShare('');
  });

  it('extraction works from setup context', () => {
    const { doc } = initShare(CARD_WITH_MENU);
    const card = doc.querySelector('.restaurant-card');
    const data = extractCardData(card);
    ok(data);
    strictEqual(data.name, 'Mano Caf\u00e9');
  });
});

describe('onClear callback', () => {
  it('calls onClear when selection is cleared via clear button', () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body>
      <div class="content" id="content">
        <div class="day-panel" data-panel="Montag">${CARD_WITH_MENU}</div>
      </div>
    </body></html>`, { url: 'http://localhost', runScripts: 'outside-only' });

    const { window: win } = dom;
    win.Carousel = { getActivePanel: () => win.document.querySelector('.day-panel') };
    win.DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];
    win.getMondayOfWeek = (d) => { const m = new Date(d); m.setDate(d.getDate() - ((d.getDay() + 6) % 7)); m.setHours(0,0,0,0); return m; };
    shareScript.runInContext(dom.getInternalVMContext());

    let cleared = false;
    win.Share.setup({
      getSelectionData: () => getSelectionData(win.document),
      onClear: () => { cleared = true; },
    });

    // Select an item, then click clear
    const item = win.document.getElementById('item-a');
    item.click();
    ok(item.classList.contains('share-selected'));

    const clearBtn = win.document.querySelector('.share-bar-clear');
    clearBtn.click();
    strictEqual(cleared, true, 'onClear callback should have been called');
  });

  it('does not error when onClear is not provided', () => {
    const { doc } = initShare(CARD_WITH_MENU);
    doc.getElementById('item-a').click();
    const clearBtn = doc.querySelector('.share-bar-clear');
    clearBtn.click();
    // No error thrown — pass
  });
});
