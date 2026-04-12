import { JSDOM } from 'jsdom';
import type { FetchableAdapter, WeekMenu, MenuItem, MenuCategory } from '../types.js';
import { allDays } from '../types.js';
import { inferTags, resolveTags } from '../tags.js';

const PAGE_URL = 'https://remopizza.at/';

function parseSpecials(doc: Document): MenuCategory | null {
  // Find the "Aktuelle Specials" heading
  const headings = doc.querySelectorAll('p strong, p mark strong');
  let specialsHeading: Element | null = null;
  for (const el of headings) {
    if (el.textContent?.includes('Aktuelle Specials')) {
      specialsHeading = el.closest('p');
      break;
    }
  }
  if (!specialsHeading) return null;

  // Specials are in wp-block-columns containers following the heading
  const items: MenuItem[] = [];
  let sibling = specialsHeading.nextElementSibling;

  while (sibling) {
    if (!sibling.classList.contains('wp-block-columns')) break;

    // Each column pair contains pizza specials
    for (const group of sibling.querySelectorAll('.wp-block-group.is-vertical')) {
      const h3s = group.querySelectorAll('h3');
      if (h3s.length < 2) continue;

      const title = h3s[0].textContent?.trim() ?? '';
      const description = h3s[1].textContent?.trim() ?? null;
      if (!title) continue;

      const tags = resolveTags([], inferTags({ title: `${title} ${description ?? ''}` }));

      items.push({ title, price: null, tags, allergens: null, description });
    }

    sibling = sibling.nextElementSibling;
  }

  return items.length > 0 ? { name: 'Aktuelle Specials', items } : null;
}

async function fetchMenu(): Promise<WeekMenu> {
  const res = await fetch(PAGE_URL);
  if (!res.ok) throw new Error(`Remo: HTTP ${res.status}`);
  const html = await res.text();
  const doc = new JSDOM(html).window.document;

  const specials = parseSpecials(doc);
  if (!specials) return {};
  return allDays([specials]);
}

const adapter: FetchableAdapter = {
  id: 'remo',
  title: 'Remo',
  icon: 'pizza',
  url: 'https://remopizza.at/#Speisekarte',
  type: 'specials',
  cuisine: ['Neapolitanische Pizza'],
  outdoor: true,
  coordinates: { lat: 48.2254, lon: 16.3948 },
  fetchMenu,
};

export default adapter;
