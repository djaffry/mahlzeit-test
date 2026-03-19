import { JSDOM } from 'jsdom';
import type { FetchableAdapter, WeekMenu, MenuItem, MenuCategory } from '../types.js';
import { allDays } from '../types.js';
import { inferTags, resolveTags } from '../tags.js';

const PAGE_URL = 'https://deananddavid.com/speisen-und-getraenke/';

function parseSeasonals(doc: Document): MenuCategory | null {
  // The #seasonals element is a vc_row that only contains the heading.
  // The actual menu items are in the sibling vc_row(s) that follow,
  // up until the next section (e.g. #salads).
  const heading = doc.getElementById('seasonals');
  if (!heading) return null;

  const items: MenuItem[] = [];
  let sibling = heading.nextElementSibling;

  while (sibling) {
    // Stop at the next named section or full-width clearfix before one
    if (sibling.id && sibling.id !== 'seasonals') break;

    // Collect item paragraphs from text columns in this row
    for (const p of sibling.querySelectorAll('.wpb_text_column .wpb_wrapper p')) {
      const spans = p.querySelectorAll('span');
      if (spans.length === 0) continue;

      let title = '';
      const descParts: string[] = [];

      for (const span of spans) {
        const style = span.getAttribute('style') ?? '';
        const text = span.textContent?.trim();
        if (!text) continue;

        // Skip nested spans to avoid double-counting
        if (span.parentElement?.tagName === 'SPAN') continue;

        if (style.includes('font-weight: bold') || style.includes('font-weight:bold')) {
          title = text;
        } else if (style.includes('font-weight: normal') || style.includes('font-weight:normal')) {
          descParts.push(text);
        }
      }

      if (!title) continue;

      const description = descParts.join(' ').trim() || null;
      const tags = resolveTags([], inferTags({ title, description: description ?? undefined }));
      items.push({ title, price: null, tags, allergens: null, description });
    }

    sibling = sibling.nextElementSibling;
  }

  return items.length > 0 ? { name: 'Seasonals', items } : null;
}

async function fetchMenu(): Promise<WeekMenu> {
  const res = await fetch(PAGE_URL);
  if (!res.ok) throw new Error(`Dean & David: HTTP ${res.status}`);
  const html = await res.text();
  const doc = new JSDOM(html).window.document;

  const seasonals = parseSeasonals(doc);
  if (!seasonals) return {};
  return allDays([seasonals]);
}

const adapter: FetchableAdapter = {
  id: 'deananddavid',
  title: '🥗 Dean & David',
  url: 'https://deananddavid.com/austria-campus-wien/',
  type: 'specials',
  cuisine: ['Salate', 'Bowls'],
  edenred: true,
  outdoor: true,
  coordinates: { lat: 48.2223, lon: 16.3944 },
  fetchMenu,
};

export default adapter;
