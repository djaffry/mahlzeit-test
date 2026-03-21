import type { FullAdapter, WeekMenu, MenuItem } from '../types.js';
import { isWeekday } from '../types.js';
import { inferTags } from '../tags.js';

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


function parseDish(dish: BahnbistroDish): { category: string; item: MenuItem } {
  const title = dish.items[0] ?? dish.name;
  const description = dish.items.length > 1 ? dish.items.slice(1).join(', ') : null;

  return {
    category: CATEGORY_MAP[dish.name] ?? dish.name,
    item: {
      title,
      price: null,
      tags: inferTags({ title, description: description ?? undefined }),
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
  fetchMenu,
};

export default adapter;
