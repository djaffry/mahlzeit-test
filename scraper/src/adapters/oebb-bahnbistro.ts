import type { FullAdapter, WeekMenu, MenuItem } from '../types.js';
import { isWeekday } from '../types.js';

const API_URL = 'https://bahnbistro.digiattack.net/api/menu';

const CATEGORY_MAP: Record<string, string> = {
  Entree: 'Vorspeise',
  Main1: 'Hauptspeise',
  Main2: 'Hauptspeise',
  Main3: 'Hauptspeise',
  Dessert: 'Dessert',
};

interface BahnbistroDish {
  name: string;
  items: string[];
  allergens?: string | null;
}

interface BahnbistroDay {
  name: string;
  date: string;
  dishes: BahnbistroDish[];
}

interface BahnbistroResponse {
  calendar_week: number;
  week: string;
  days: BahnbistroDay[];
}

const KEYWORD_TAGS: [RegExp, string][] = [
  [/chicken|hendl|henderl|h[üu]hn|pute|gefl[üu]gel/i, 'Geflügel'],
  [/lachs|forelle|scholle|garnele|zander|saibling/i, 'Fisch'],
  [/\bbeef\b|rind(?:s|er|fleisch)|tafelspitz/i, 'Rindfleisch'],
  [/bratwurst|schwein/i, 'Schweinefleisch'],
  [/\btofu\b|\byofu\b/i, 'Vegan'],
];

function inferTags(text: string): string[] {
  const tags: string[] = [];
  for (const [re, tag] of KEYWORD_TAGS) {
    if (re.test(text) && !tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

function parseDish(dish: BahnbistroDish): { category: string; item: MenuItem } {
  const title = dish.items[0] ?? dish.name;
  const description = dish.items.length > 1 ? dish.items.slice(1).join(', ') : null;
  const searchText = description ? `${title} ${description}` : title;

  return {
    category: CATEGORY_MAP[dish.name] ?? dish.name,
    item: {
      title,
      price: null,
      tags: inferTags(searchText),
      allergens: dish.allergens?.trim().split(/\s+/).join(',') ?? null,
      description,
    },
  };
}

async function fetchMenu(): Promise<WeekMenu> {
  const res = await fetch(API_URL, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Bahnbistro API returned HTTP ${res.status}`);
  const data: BahnbistroResponse = await res.json();

  const result: WeekMenu = {};

  for (const day of data.days) {
    if (!isWeekday(day.name)) continue;

    const catMap = new Map<string, MenuItem[]>();

    for (const dish of day.dishes) {
      const parsed = parseDish(dish);
      if (!catMap.has(parsed.category)) catMap.set(parsed.category, []);
      catMap.get(parsed.category)!.push(parsed.item);
    }

    if (catMap.size > 0) {
      result[day.name] = {
        categories: Array.from(catMap, ([name, items]) => ({ name, items })),
      };
    }
  }

  return result;
}

const adapter: FullAdapter = {
  id: 'bahnbistro',
  title: '🚂 OEBB Bahnbistro',
  url: 'https://bahnbistro.digiattack.net',
  type: 'full',
  cuisine: ['Kantine'],
  coordinates: { lat: 48.2215, lon: 16.3952 },
  mapUrl: 'https://maps.app.goo.gl/KGhWssEY2zJs7oF4A',
  fetchMenu,
};

export default adapter;
