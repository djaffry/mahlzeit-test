import { JSDOM } from 'jsdom';
import type { FullAdapter, WeekMenu, Weekday, MenuCategory, MenuItem } from '../types.js';

const PAGE_URL = 'https://www.spoonfood.at/';

const TAG_MAP: Record<string, string> = {
  'vg.': 'Vegan',
  'veg.': 'Vegetarisch',
  'gf.': 'Glutenfrei',
  'lf.': 'Laktosefrei',
};

const TAG_PATTERN = /\b(vg\.|veg\.|gf\.|lf\.|If\.)\s*,?\s*/g;

const DAY_MAP: Record<number, Weekday> = {
  1: 'Montag',
  2: 'Dienstag',
  3: 'Mittwoch',
  4: 'Donnerstag',
  5: 'Freitag',
};

function extractTags(text: string): { cleanName: string; tags: string[] } {
  const tags: string[] = [];
  const cleanName = text.replace(TAG_PATTERN, (match) => {
    const tag = match.trim().replace(/,\s*$/, '');
    const normalized = tag === 'If.' ? 'lf.' : tag;
    const mapped = TAG_MAP[normalized];
    if (mapped && !tags.includes(mapped)) tags.push(mapped);
    return '';
  }).replace(/\s+/g, ' ').replace(/\s+&\s*$/, '').trim();
  return { cleanName, tags };
}

function parseDate(dateStr: string): Weekday | null {
  const parts = dateStr.trim().split('/');
  if (parts.length !== 3) return null;
  const [day, month, year] = parts.map(Number);
  const date = new Date(year, month - 1, day);
  return DAY_MAP[date.getDay()] ?? null;
}

async function fetchDocument(): Promise<Document> {
  const res = await fetch(PAGE_URL);
  if (!res.ok) throw new Error(`SpoonFood returned HTTP ${res.status}`);
  const html = await res.text();
  return new JSDOM(html).window.document;
}

function parseComboMenus(section: Element): MenuCategory[] {
  const categories: MenuCategory[] = [];

  for (const menuDiv of section.querySelectorAll('.menue-div')) {
    const heading = menuDiv.querySelector('h3');
    if (!heading) continue;

    const name = heading.textContent?.trim() ?? '';
    const description = menuDiv.querySelector('p.text-size-medium:not(.text-weight-bold)')?.textContent?.trim() ?? null;
    const price = menuDiv.querySelector('p.text-weight-bold')?.textContent?.trim() ?? null;

    categories.push({
      name,
      items: [{ title: name, price, tags: [], allergens: null, description }],
    });
  }

  return categories;
}

function parseDish(dishHolder: Element): MenuItem | null {
  if (dishHolder.classList.contains('w-condition-invisible')) return null;

  const rawName = dishHolder.querySelector('.gericht-name-holder p')?.textContent?.trim() ?? '';
  if (!rawName) return null;

  const { cleanName, tags } = extractTags(rawName);

  const priceEls = dishHolder.querySelectorAll('.preis-holder p.text-weight-bold:not(.w-condition-invisible)');
  const prices = Array.from(priceEls)
    .map(el => el.textContent?.trim())
    .filter((p): p is string => !!p && p !== '/');
  const price = prices.length > 1
    ? `${prices[0]} / ${prices[1]}`
    : prices[0] ?? null;

  return { title: cleanName, price, tags, allergens: null, description: null };
}

function parseCategories(section: Element): MenuCategory[] {
  const categories: MenuCategory[] = [];

  for (const holder of section.querySelectorAll('.kategorie-holder')) {
    const categoryName = holder.querySelector('h3')?.textContent?.trim() ?? 'Sonstiges';

    const items: MenuItem[] = [];
    for (const dishHolder of holder.querySelectorAll('.gericht-holder')) {
      const item = parseDish(dishHolder);
      if (item) items.push(item);
    }

    if (items.length > 0) {
      categories.push({ name: categoryName, items });
    }
  }

  return categories;
}

async function fetchMenu(): Promise<WeekMenu> {
  const doc = await fetchDocument();

  const section = doc.getElementById('tageskarte');
  if (!section) throw new Error('Tageskarte section not found');

  const dateText = section.querySelector('.text-weight-bold.text-size-medium')?.textContent?.trim() ?? '';
  const dayName = parseDate(dateText);
  if (!dayName) throw new Error(`Could not parse date: "${dateText}"`);

  const categories = [
    ...parseComboMenus(section),
    ...parseCategories(section),
  ];

  if (categories.length === 0) {
    throw new Error('No menu items found in Tageskarte section');
  }

  return { [dayName]: { categories } };
}

const adapter: FullAdapter = {
  id: 'spoonfood',
  title: '🥄 SpoonFood',
  url: 'https://www.spoonfood.at/',
  type: 'full',
  cuisine: ['Bowls', 'Eintöpfe'],
  fetchMenu,
};

export default adapter;
