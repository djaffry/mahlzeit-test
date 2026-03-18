import { createWorker } from 'tesseract.js';
import type { FullAdapter, WeekMenu, Weekday, MenuItem, MenuCategory } from '../types.js';
import { inferTags } from '../tags.js';

const BASE_URL = 'https://www.pans.at/wp-content/uploads';

// OCR produces mixed case, digits, and dots instead of commas: (A.c,0,6)
const ALLERGEN_RE = /\(([A-Za-z0-9](?:[.,][A-Za-z0-9])*)\)\s*/;
const PRICE_RE = /(\d{1,2}[.,]\d{2})\s*$/;
const DUAL_PRICE_RE = /kl\/?Gr:\s*(\d{1,2}[.,]\d{2})\s*\/\s*(\d{1,2}[.,]\d{2})/i;
const DRINK_KEYWORDS = /\b(limo|tee|eistee|honig)\b/i;
const DISCLAIMER_RE = /keine\s+[ÄAa]nderung|Preise\s+gelten/i;

const DAY_MAP: Record<number, Weekday> = {
  1: 'Montag', 2: 'Dienstag', 3: 'Mittwoch', 4: 'Donnerstag', 5: 'Freitag',
};

function buildImageUrl(now: Date): string {
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  // URL convention: DDMM.png (e.g. 1803.png for March 18)
  return `${BASE_URL}/${now.getFullYear()}/${mm}/${dd}${mm}.png`;
}

function formatPrice(raw: string): string {
  const m = raw.match(/(\d+)[.,](\d{2})/);
  return m ? `${m[1]},${m[2]} €` : raw;
}

function extractAllergens(text: string): { clean: string; allergens: string | null } {
  const m = text.match(ALLERGEN_RE);
  if (!m) return { clean: text, allergens: null };
  // Normalize OCR artifacts: dots→commas, uppercase
  const allergens = m[1].replace(/\./g, ',').toUpperCase();
  return { clean: text.replace(ALLERGEN_RE, '').trim(), allergens };
}

function extractPrice(text: string): { clean: string; price: string | null } {
  const dual = text.match(DUAL_PRICE_RE);
  if (dual) {
    const clean = text.replace(DUAL_PRICE_RE, '').trim();
    return { clean, price: `${formatPrice(dual[1])} / ${formatPrice(dual[2])}` };
  }
  const m = text.match(PRICE_RE);
  if (!m) return { clean: text, price: null };
  return { clean: text.replace(PRICE_RE, '').trim(), price: formatPrice(m[1]) };
}

function parseItemLine(line: string): MenuItem | null {
  // Strip common OCR artifacts from line ends
  const trimmed = line.replace(/[|`]+$/, '').trim();
  if (!trimmed || trimmed.length < 3) return null;
  if (DISCLAIMER_RE.test(trimmed)) return null;

  const { clean: noAllergens, allergens } = extractAllergens(trimmed);
  const { clean: title, price } = extractPrice(noAllergens);

  if (!title) return null;

  const tags = inferTags({ title });

  return { title, price, tags, allergens, description: null };
}

type Section = 'menu' | 'tagesempfehlungen' | 'dessert' | 'drinks' | 'skip';

function detectSection(line: string): Section | null {
  const upper = line.toUpperCase();
  if (upper.includes('TAGESEMPFEHLUNG')) return 'tagesempfehlungen';
  if (upper.startsWith('DESSERT')) return 'dessert';
  return null;
}

function isDrinkLine(line: string): boolean {
  return DRINK_KEYWORDS.test(line);
}

function isDateLine(line: string): boolean {
  return /^\d{2}\.\d{2}\.\d{4}$/.test(line);
}

const MENU_PREFIX_RE = /^(Vorspeise|M[12]):\s*/i;

function parseMenuText(text: string): MenuCategory[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const menuItems: MenuItem[] = [];
  const tagesItems: MenuItem[] = [];
  const dessertItems: MenuItem[] = [];

  let section: Section = 'skip';

  for (const line of lines) {
    if (isDateLine(line)) continue;

    const newSection = detectSection(line);
    if (newSection) {
      section = newSection;
      continue;
    }

    const prefixMatch = line.match(MENU_PREFIX_RE);
    if (prefixMatch) {
      section = 'menu';
      const content = line.slice(prefixMatch[0].length);
      const item = parseItemLine(content);
      if (item) {
        if (prefixMatch[1].toLowerCase() === 'vorspeise') item.price = null;
        menuItems.push(item);
      }
      continue;
    }

    if (isDrinkLine(line)) {
      section = 'drinks';
      continue;
    }
    if (section === 'drinks' || section === 'skip') continue;

    const item = parseItemLine(line);
    if (!item) continue;

    switch (section) {
      case 'menu': menuItems.push(item); break;
      case 'tagesempfehlungen': tagesItems.push(item); break;
      case 'dessert': dessertItems.push(item); break;
    }
  }

  const categories: MenuCategory[] = [];
  if (menuItems.length > 0) categories.push({ name: 'Menü', items: menuItems });
  if (tagesItems.length > 0) categories.push({ name: 'Tagesempfehlungen', items: tagesItems });
  if (dessertItems.length > 0) categories.push({ name: 'Dessert', items: dessertItems });
  return categories;
}

async function fetchMenu(): Promise<WeekMenu> {
  const now = new Date();
  const weekday = DAY_MAP[now.getDay()] ?? null;
  if (!weekday) return {};

  const url = buildImageUrl(now);
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) return {};
    throw new Error(`Pan's image: HTTP ${res.status}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());

  const worker = await createWorker('deu');
  try {
    const { data: { text } } = await worker.recognize(buffer);

    if (!text || text.trim().length < 20) {
      throw new Error('Pan\'s OCR: empty or unreadable text');
    }

    const categories = parseMenuText(text);
    if (categories.length === 0) {
      throw new Error('Pan\'s OCR: no menu items found');
    }

    return { [weekday]: { categories } };
  } finally {
    await worker.terminate();
  }
}

const adapter: FullAdapter = {
  id: 'pans',
  title: '🍳 pAn\'s',
  url: 'https://www.pans.at/tagesmenue/',
  type: 'full',
  cuisine: ['Bistro'],
  outdoor: true,
  coordinates: { lat: 48.2242, lon: 16.3969 },
  fetchMenu,
};

export default adapter;
