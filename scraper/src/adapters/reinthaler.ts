import { extractText } from 'unpdf';
import type { FullAdapter, WeekMenu, Weekday, MenuItem, MenuCategory } from '../types.js';

const PDF_BASE = 'https://irp.cdn-website.com/fead4102/files/uploaded';

const DAY_MAP: Record<string, Weekday> = {
  MO: 'Montag', DI: 'Dienstag', MI: 'Mittwoch', DO: 'Donnerstag', FR: 'Freitag',
};

const ALLERGEN_LETTERS = new Set('ABCDEFGHLMNOPR');

const DAY_RE = /^(MO|DI|MI|DO|FR)\s+\d{2}\.\d{2}/;
const PRICE_INLINE_RE = /^(.+?)\s+€\s*(\d+[.,]\d{2})\s*$/;
const PRICE_STANDALONE_RE = /^€\s*(\d+[.,]\d{2})\s*$/;
const TAGESTELLER_RE = /^TAGESTELLER\b/i;
const SECTION_RE = /^MEN(?:Ü|U)\s+UND\s+TAGESTELLER/i;
const DISCLAIMER_RE = /^BITTE\s+UM\s+VERST/i;

interface ParsedDish {
  title: string;
  allergens: string | null;
  price: string | null;
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function getPdfUrl(): string {
  const now = new Date();
  const year = now.getFullYear();
  const week = getISOWeek(now);
  const even = week % 2 === 0 ? week : week - 1;
  return `${PDF_BASE}/MENU-KARTE+${year}+KW+${even}-${even + 1}.pdf`;
}

function formatPrice(raw: string): string {
  const m = raw.match(/(\d+)[.,](\d{2})/);
  return m ? `${m[1]},${m[2]} €` : raw;
}

function extractAllergens(text: string): { title: string; allergens: string | null } {
  const m = text.match(/\s+([A-Z]+)$/);
  if (m && [...m[1]].every(ch => ALLERGEN_LETTERS.has(ch))) {
    return {
      title: text.slice(0, m.index!).trim(),
      allergens: [...m[1]].join(','),
    };
  }
  return { title: text, allergens: null };
}

function toSentenceCase(text: string): string {
  let s = text.replace(/(\w)-\s+(\w)/g, '$1$2');
  s = s.toLowerCase();
  s = s.charAt(0).toUpperCase() + s.slice(1);
  s = s.replace(/\(\s*(\w)/g, (_, ch) => `(${ch.toUpperCase()}`);
  return s;
}

function parseDishBlock(lines: string[]): ParsedDish[] {
  const dishTexts: string[] = [];
  const prices: string[] = [];
  let current = '';

  for (const line of lines) {
    const priceOnly = line.match(PRICE_STANDALONE_RE);
    if (priceOnly) {
      if (current) { dishTexts.push(current); current = ''; }
      prices.push(formatPrice(priceOnly[1]));
      continue;
    }

    const inlinePrice = line.match(PRICE_INLINE_RE);
    if (inlinePrice) {
      const text = current ? `${current} ${inlinePrice[1]}` : inlinePrice[1];
      dishTexts.push(text);
      prices.push(formatPrice(inlinePrice[2]));
      current = '';
      continue;
    }

    if (line.endsWith('ODER')) {
      const text = current ? `${current} ${line.slice(0, -4).trim()}` : line.slice(0, -4).trim();
      dishTexts.push(text);
      current = '';
      continue;
    }

    current = current ? `${current} ${line}` : line;
  }
  if (current) dishTexts.push(current);

  return dishTexts.map((raw, i) => {
    const { title, allergens } = extractAllergens(raw.trim());
    return { title: toSentenceCase(title), allergens, price: prices[i] ?? null };
  });
}

interface DayBlock { weekday: Weekday; lines: string[] }

function parseText(fullText: string) {
  const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);

  const week1: DayBlock[] = [];
  const week2: DayBlock[] = [];
  const tagestellerLines: string[] = [];
  let tagestellerPrice: string | null = null;

  let currentWeek = week1;
  let currentDay: DayBlock | null = null;
  let inTavesteller = false;

  for (const line of lines) {
    if (SECTION_RE.test(line)) {
      if (currentDay) { currentWeek.push(currentDay); currentDay = null; }
      continue;
    }

    if (TAGESTELLER_RE.test(line)) {
      inTavesteller = true;
      continue;
    }

    if (DISCLAIMER_RE.test(line)) {
      inTavesteller = false;
      currentWeek = week2;
      continue;
    }

    if (inTavesteller) {
      tagestellerLines.push(line);
      continue;
    }

    const dayMatch = line.match(DAY_RE);
    if (dayMatch) {
      if (currentDay) currentWeek.push(currentDay);
      const weekday = DAY_MAP[dayMatch[1]];
      currentDay = { weekday, lines: [] };
      continue;
    }

    if (line === 'TAGESSUPPE') continue;

    if (currentDay) {
      currentDay.lines.push(line);
    }
  }
  if (currentDay) currentWeek.push(currentDay);

  // Tagesteller price floats at the very end of the PDF text (visual label)
  const lastPrice = fullText.trimEnd().match(/€\s*(\d+[.,]\d{2})\s*$/);
  if (lastPrice) tagestellerPrice = formatPrice(lastPrice[1]);

  const tagesteller = tagestellerLines.map(raw => {
    const { title, allergens } = extractAllergens(raw.trim());
    return { title: toSentenceCase(title), allergens, price: tagestellerPrice } as ParsedDish;
  });

  return { week1, week2, tagesteller };
}

function buildWeekMenu(days: DayBlock[], tagesteller: ParsedDish[]): WeekMenu {
  const tagestellerCat: MenuCategory = {
    name: 'Tagesteller',
    items: tagesteller.map(d => ({
      title: d.title, price: d.price, tags: [], allergens: d.allergens, description: null,
    })),
  };

  const result: WeekMenu = {};
  for (const day of days) {
    const dailyItems: MenuItem[] = [
      { title: 'Tagessuppe', price: null, tags: [], allergens: null, description: null },
      ...parseDishBlock(day.lines).map(d => ({
        title: d.title, price: d.price, tags: [], allergens: d.allergens, description: null,
      })),
    ];

    const categories: MenuCategory[] = [{ name: 'Tagesmenü', items: dailyItems }];
    if (tagestellerCat.items.length > 0) categories.push(tagestellerCat);
    result[day.weekday] = { categories };
  }
  return result;
}

async function fetchMenu(): Promise<WeekMenu> {
  const url = getPdfUrl();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Reinthaler PDF: HTTP ${res.status}`);

  const buffer = await res.arrayBuffer();
  const { text } = await extractText(new Uint8Array(buffer));
  const fullText = Array.isArray(text) ? text.join('\n') : text;

  const currentWeek = getISOWeek(new Date());
  const even = currentWeek % 2 === 0 ? currentWeek : currentWeek - 1;
  const { week1, week2, tagesteller } = parseText(fullText);
  const days = currentWeek === even ? week1 : week2;

  return buildWeekMenu(days, tagesteller);
}

const adapter: FullAdapter = {
  id: 'reinthaler',
  title: '🍽️ Gasthaus Reinthaler',
  url: 'https://www.gasthaus-reinthaler.at/speisekarte#mittagsmenue',
  type: 'full',
  cuisine: ['Wirtshaus'],
  reservationUrl: 'https://www.gasthaus-reinthaler.at/kontakt#Online-Reservierung',
  coordinates: { lat: 48.21892, lon: 16.39778 },
  mapUrl: 'https://maps.app.goo.gl/HN1hvZRF9ZsyWzKe8',
  fetchMenu,
};

export default adapter;
