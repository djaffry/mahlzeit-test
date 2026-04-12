import { extractText } from 'unpdf';
import type { FullAdapter, WeekMenu, MenuCategory } from '../types.js';
import { allDays } from '../types.js';
import { inferTags } from '../tags.js';

const SITE_URL = 'https://www.taeko.at';
const TOKENS_URL = `${SITE_URL}/_api/v1/access-tokens`;
const PDF_WIDGET_URL = 'https://wixlabs-pdf-dev.appspot.com/index';
// Wix PDF Viewer app and component IDs from taeko.at's mittagsmenü page
const PDF_APP_ID = '13ee10a3-ecb9-7eff-4298-d2f9f34acf0d';
const COMP_ID = 'comp-key40pk2';

const PDF_URL_RE = /https:\/\/docs\.wixstatic\.com\/ugd\/[a-f0-9_]+\.pdf/;
const PRICE_RE = /€\s*(\d{1,2}[.,]\d{2})\s*$/;
const HEADER_RE = /^(LUNCH\s+MENU|Montag\s+bis|außer\s+Feiertag)/i;
const STOP_RE = /^(Alle\s+Men[üu]s|Getr[äa]nke\s+zum|=\s*(vegetarian|spicy))/i;

function formatPrice(raw: string): string {
  const m = raw.match(/(\d+)[.,](\d{2})/);
  return m ? `${m[1]},${m[2]} €` : raw;
}

function extractAllergens(text: string): { clean: string; allergens: string | null } {
  const m = text.match(/\s+([A-Z](?:,[A-Z])*),?\s*$/);
  if (!m) return { clean: text, allergens: null };
  const allergens = m[1].replace(/,+$/, '');
  return { clean: text.slice(0, m.index).trim(), allergens };
}

function extractPrice(text: string): { clean: string; price: string | null } {
  const m = text.match(PRICE_RE);
  if (!m) return { clean: text, price: null };
  return { clean: text.replace(PRICE_RE, '').trim(), price: formatPrice(m[1]) };
}

interface RawItem {
  title: string;
  description: string | null;
  allergens: string | null;
  price: string | null;
}

function parseMenuText(text: string): MenuCategory[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const items: RawItem[] = [];
  let active = false;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (HEADER_RE.test(line)) { active = true; i++; continue; }
    if (STOP_RE.test(line)) { active = false; i++; continue; }
    if (!active) { i++; continue; }

    const { clean: noPrice, price } = extractPrice(line);
    if (price) {
      const { clean: title, allergens } = extractAllergens(noPrice);
      let desc: string | null = null;
      if (i + 1 < lines.length && !PRICE_RE.test(lines[i + 1]) && !STOP_RE.test(lines[i + 1])) {
        desc = lines[++i];
      }
      items.push({ title, description: desc, allergens, price });
    }
    i++;
  }

  if (items.length === 0) return [];

  return [{
    name: 'Mittagsmenü',
    items: items.map(item => ({
      title: item.title,
      price: item.price,
      tags: inferTags({ title: item.title, description: item.description ?? undefined }),
      allergens: item.allergens,
      description: item.description,
    })),
  }];
}

async function getPdfUrl(): Promise<string> {
  const tokenRes = await fetch(TOKENS_URL);
  if (!tokenRes.ok) throw new Error(`Taeko access-tokens: HTTP ${tokenRes.status}`);

  const tokens = await tokenRes.json();
  const instance = tokens.apps?.[PDF_APP_ID]?.instance;
  if (!instance) throw new Error('Taeko: PDF viewer app instance not found');

  const widgetRes = await fetch(
    `${PDF_WIDGET_URL}?instance=${instance}&compId=${COMP_ID}&viewMode=site`,
  );
  if (!widgetRes.ok) throw new Error(`Taeko PDF widget: HTTP ${widgetRes.status}`);

  const html = await widgetRes.text();
  const match = html.match(PDF_URL_RE);
  if (!match) throw new Error('Taeko: PDF URL not found in widget response');

  return match[0];
}

async function fetchMenu(): Promise<WeekMenu> {
  const pdfUrl = await getPdfUrl();

  const res = await fetch(pdfUrl);
  if (!res.ok) throw new Error(`Taeko PDF: HTTP ${res.status}`);

  const buffer = await res.arrayBuffer();
  const { text } = await extractText(new Uint8Array(buffer));
  const fullText = Array.isArray(text) ? text.join('\n') : text;

  const categories = parseMenuText(fullText);
  if (categories.length === 0) return {};

  return allDays(categories);
}

const adapter: FullAdapter = {
  id: 'taeko',
  title: 'Taeko Ramen Bar',
  icon: 'soup',
  url: 'https://www.taeko.at/mittagsmen%C3%BC',
  type: 'specials',
  cuisine: ['Ramen', 'Japanisch', 'Chinesisch'],
  coordinates: { lat: 48.2169, lon: 16.3881 },
  edenred: true,
  outdoor: true,
  fetchMenu,
};

export default adapter;
