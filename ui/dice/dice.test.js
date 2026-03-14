import { describe, it } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { JSDOM } from 'jsdom';

const diceScript = new Script(readFileSync(new URL('./dice.js', import.meta.url), 'utf8'));

const noop = () => {};

function initDice(panelHTML = '') {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>
    <div class="toolbar" style="height:48px"></div>
    <button class="dice-btn" id="dice-btn">🎲</button>
    <div class="content" id="content">
      <div class="day-panel" data-panel="Montag">${panelHTML}</div>
    </div>
    <div class="dice-overlay" id="dice-overlay" aria-hidden="true"></div>
  </body></html>`, { url: 'http://localhost', runScripts: 'outside-only' });

  const { window: win } = dom;
  win.HTMLElement.prototype.scrollIntoView = noop;
  win.scrollTo = noop;
  win.matchMedia = () => ({ matches: true });
  win.Carousel = {
    getActivePanel: () => win.document.querySelector('.day-panel'),
  };
  diceScript.runInContext(dom.getInternalVMContext());

  win.Dice.setup({
    smoothScrollTo: noop,
    saveCollapsed() {
      const panel = win.document.querySelector('.day-panel') ?? win.document;
      const ids = [...panel.querySelectorAll('.restaurant-card.collapsed')].map(el => el.dataset.restaurant);
      win.localStorage.setItem('collapsed-restaurants', JSON.stringify(ids));
    },
  });

  return { win, doc: win.document, Dice: win.Dice };
}

describe('Dice.getPool', () => {
  it('returns empty when no panel element exists', () => {
    const { Dice, doc } = initDice();
    doc.querySelector('.day-panel').remove();
    strictEqual(Dice.getPool().length, 0);
  });

  it('returns empty when panel has no items', () => {
    const { Dice } = initDice('');
    strictEqual(Dice.getPool().length, 0);
  });

  it('finds visible menu items', () => {
    const { Dice } = initDice(`
      <div class="restaurant-card" data-restaurant="r1">
        <div class="menu-item">Gulasch</div>
        <div class="menu-item">Schnitzel</div>
      </div>
    `);
    strictEqual(Dice.getPool().length, 2);
  });

  it('excludes hidden menu items', () => {
    const { Dice } = initDice(`
      <div class="restaurant-card" data-restaurant="r1">
        <div class="menu-item">Gulasch</div>
        <div class="menu-item hidden">Hidden</div>
      </div>
    `);
    strictEqual(Dice.getPool().length, 1);
  });

  it('excludes items from restaurants with reservation badge', () => {
    const { Dice } = initDice(`
      <div class="restaurant-card" data-restaurant="r1">
        <span class="reservation-badge">Reservierung</span>
        <div class="menu-item">Gulasch</div>
      </div>
    `);
    strictEqual(Dice.getPool().length, 0);
  });

  it('includes link cards without menu items', () => {
    const { Dice } = initDice(`
      <div class="restaurant-card" data-restaurant="r1">
        <div class="menu-item">Gulasch</div>
      </div>
      <div class="restaurant-card" data-restaurant="r2">
        <span>Link-only</span>
      </div>
    `);
    strictEqual(Dice.getPool().length, 2);
  });

  it('excludes link-muted cards', () => {
    const { Dice } = initDice(`
      <div class="restaurant-card link-muted" data-restaurant="r1">
        <span>Muted</span>
      </div>
    `);
    strictEqual(Dice.getPool().length, 0);
  });

  it('excludes map cards', () => {
    const { Dice } = initDice(`
      <div class="restaurant-card map-card" data-restaurant="map">
        <span>Map</span>
      </div>
    `);
    strictEqual(Dice.getPool().length, 0);
  });

  it('excludes link cards with reservation badge', () => {
    const { Dice } = initDice(`
      <div class="restaurant-card" data-restaurant="r1">
        <span class="reservation-badge">Reservierung</span>
      </div>
    `);
    strictEqual(Dice.getPool().length, 0);
  });
});

describe('Dice.roll', () => {
  it('returns null when pool is empty', () => {
    const { Dice } = initDice('');
    strictEqual(Dice.roll(), null);
  });

  it('picks an item and adds dice-pick class', () => {
    const { Dice } = initDice(`
      <div class="restaurant-card" data-restaurant="r1">
        <div class="menu-item" id="item-a">Gulasch</div>
        <div class="menu-item" id="item-b">Schnitzel</div>
      </div>
    `);
    const pick = Dice.roll(0);
    ok(pick);
    ok(pick.classList.contains('dice-pick'));
    strictEqual(pick.id, 'item-a');
  });

  it('picks specific index', () => {
    const { Dice } = initDice(`
      <div class="restaurant-card" data-restaurant="r1">
        <div class="menu-item" id="item-a">Gulasch</div>
        <div class="menu-item" id="item-b">Schnitzel</div>
      </div>
    `);
    strictEqual(Dice.roll(1).id, 'item-b');
  });

  it('clears previous dice-pick before new pick', () => {
    const { Dice, doc } = initDice(`
      <div class="restaurant-card" data-restaurant="r1">
        <div class="menu-item" id="item-a">Gulasch</div>
        <div class="menu-item" id="item-b">Schnitzel</div>
      </div>
    `);
    Dice.roll(0);
    ok(doc.getElementById('item-a').classList.contains('dice-pick'));

    Dice.roll(1);
    ok(!doc.getElementById('item-a').classList.contains('dice-pick'));
    ok(doc.getElementById('item-b').classList.contains('dice-pick'));
  });

  it('expands collapsed restaurant card', () => {
    const { Dice, doc } = initDice(`
      <div class="restaurant-card collapsed" data-restaurant="r1">
        <div class="menu-item">Gulasch</div>
      </div>
    `);
    Dice.roll(0);
    ok(!doc.querySelector('.restaurant-card').classList.contains('collapsed'));
  });

  it('returns null when already rolling', () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body>
      <button class="dice-btn" id="dice-btn">🎲</button>
      <div class="content" id="content">
        <div class="day-panel" data-panel="Montag">
          <div class="restaurant-card" data-restaurant="r1">
            <div class="menu-item">Gulasch</div>
          </div>
        </div>
      </div>
      <div class="dice-overlay" id="dice-overlay" aria-hidden="true"></div>
    </body></html>`, { url: 'http://localhost', runScripts: 'outside-only' });

    const { window: win } = dom;
    win.HTMLElement.prototype.scrollIntoView = noop;
    win.scrollTo = noop;
    // reduced motion OFF so animation plays and rolling flag is set
    win.matchMedia = () => ({ matches: false });
    win.Carousel = { getActivePanel: () => win.document.querySelector('.day-panel') };
    diceScript.runInContext(dom.getInternalVMContext());
    win.Dice.setup({ smoothScrollTo: noop, saveCollapsed: noop });

    const first = win.Dice.roll(0);
    ok(first);
    // Second call while animating returns null
    strictEqual(win.Dice.roll(0), null);
  });

  it('shows overlay during animation when reduced motion is off', () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body>
      <button class="dice-btn" id="dice-btn">🎲</button>
      <div class="content" id="content">
        <div class="day-panel" data-panel="Montag">
          <div class="restaurant-card" data-restaurant="r1">
            <div class="menu-item">Gulasch</div>
          </div>
        </div>
      </div>
      <div class="dice-overlay" id="dice-overlay" aria-hidden="true"></div>
    </body></html>`, { url: 'http://localhost', runScripts: 'outside-only' });

    const { window: win } = dom;
    win.HTMLElement.prototype.scrollIntoView = noop;
    win.scrollTo = noop;
    win.matchMedia = () => ({ matches: false });
    win.Carousel = { getActivePanel: () => win.document.querySelector('.day-panel') };
    diceScript.runInContext(dom.getInternalVMContext());
    win.Dice.setup({ smoothScrollTo: noop, saveCollapsed: noop });

    win.Dice.roll(0);
    const overlay = win.document.getElementById('dice-overlay');
    ok(overlay.classList.contains('visible'));
    ok(overlay.querySelectorAll('.dice-overlay-emoji').length > 0, 'should spawn dice emojis');
  });

  it('saves collapsed state to localStorage', () => {
    const { Dice, win } = initDice(`
      <div class="restaurant-card collapsed" data-restaurant="r1">
        <div class="menu-item">Gulasch</div>
      </div>
    `);
    Dice.roll(0);
    const stored = JSON.parse(win.localStorage.getItem('collapsed-restaurants'));
    ok(Array.isArray(stored));
  });
});

describe('Dice.setup', () => {
  it('registers click handler on dice button', () => {
    const { doc } = initDice(`
      <div class="restaurant-card" data-restaurant="r1">
        <div class="menu-item">Gulasch</div>
      </div>
    `);
    doc.getElementById('dice-btn').click();
    ok(doc.querySelector('.dice-pick'));
  });

  it('does not crash when dice-btn is missing', () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, { url: 'http://localhost', runScripts: 'outside-only' });
    dom.window.scrollTo = noop;
    diceScript.runInContext(dom.getInternalVMContext());
    dom.window.Dice.setup({ smoothScrollTo: noop, saveCollapsed: noop });
  });
});

describe('Dice constants', () => {
  it('exports shake threshold', () => {
    const { Dice } = initDice();
    strictEqual(Dice.SHAKE_THRESHOLD, 25);
  });

  it('exports shake cooldown', () => {
    const { Dice } = initDice();
    strictEqual(Dice.SHAKE_COOLDOWN, 1500);
  });

  it('exports animation duration', () => {
    const { Dice } = initDice();
    strictEqual(Dice.ANIMATION_DURATION, 1500);
  });
});
