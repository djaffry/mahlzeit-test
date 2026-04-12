import type { FullAdapter, WeekMenu, Weekday, DayMenu, MenuItem } from '../types.js';
import { WEEKDAYS, isWeekday } from '../types.js';
import { inferTags, resolveTags } from '../tags.js';

const BASE_URL = 'https://www.kissthecook.at';
const TOKENS_URL = `${BASE_URL}/_api/v1/access-tokens`;
const API_URL = `${BASE_URL}/_api/cloud-data/v2/items/query?.r=ewogICJkYXRhQ29sbGVjdGlvbklkIjogIk1lbnUiLAogICJxdWVyeSI6IHsKICAgICJmaWx0ZXIiOiB7CiAgICAgICIkb3IiOiBbCiAgICAgICAgeyAic2ljaHRiYXJrZWl0IjogdHJ1ZSwgImRhdHVtIjogIk1vbnRhZyIgfSwKICAgICAgICB7ICJzaWNodGJhcmtlaXQiOiB0cnVlLCAiZGF0dW0iOiAiRGllbnN0YWciIH0sCiAgICAgICAgeyAic2ljaHRiYXJrZWl0IjogdHJ1ZSwgImRhdHVtIjogIk1pdHR3b2NoIiB9LAogICAgICAgIHsgInNpY2h0YmFya2VpdCI6IHRydWUsICJkYXR1bSI6ICJEb25uZXJzdGFnIiB9LAogICAgICAgIHsgInNpY2h0YmFya2VpdCI6IHRydWUsICJkYXR1bSI6ICJGcmVpdGFnIiB9LAogICAgICAgIHsgImRhdHVtIjogIkdhbnplLVdvY2hlIiB9CiAgICAgIF0KICAgIH0sCiAgICAicGFnaW5nIjogeyAib2Zmc2V0IjogMCwgImxpbWl0IjogMTAwIH0sCiAgICAiZmllbGRzIjogW10KICB9LAogICJyZWZlcmVuY2VkSXRlbU9wdGlvbnMiOiBbXSwKICAicmV0dXJuVG90YWxDb3VudCI6IHRydWUsCiAgImVudmlyb25tZW50IjogIkxJVkUiLAogICJhcHBJZCI6ICIyZWMzZmUzMC02MzE0LTRkNWYtYjMzMy03ZTlkMzk1ZTI1MDkiCn0=`;

const CATEGORY_ORDER = ['Suppe', 'Hauptspeise', 'Buffet', 'Bowls', 'Dessert'];
const IGNORED_CATEGORIES = new Set(['Suppe-Mano']);

interface WixAccessTokens {
  svSession: string;
  hs: number;
}

interface WixItemData {
  title?: string;
  preis?: string;
  kategorie?: string;
  arraystring?: string;
  allergene?: string;
  datum?: string;
  sichtbarkeit?: boolean;
  index?: number;
}

interface WixItem {
  data: WixItemData;
}

interface WixResponse {
  dataItems?: WixItem[];
}

async function fetchWixData(): Promise<WixItem[]> {
  const tokenRes = await fetch(TOKENS_URL);
  if (!tokenRes.ok) {
    throw new Error(`Kiss The Cook access-tokens returned HTTP ${tokenRes.status}`);
  }
  const tokens: WixAccessTokens = await tokenRes.json();

  const res = await fetch(API_URL, {
    headers: {
      'Cookie': `svSession=${tokens.svSession}; hs=${tokens.hs}`,
      'Referer': `${BASE_URL}/mano-cafe-und-bistro`,
      'Accept': 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`Kiss The Cook API returned HTTP ${res.status}`);
  }

  const json: WixResponse = await res.json();
  return json.dataItems ?? [];
}

function groupByDay(items: WixItem[]): Map<Weekday, WixItemData[]> {
  const byDay = new Map<Weekday, WixItemData[]>(
    WEEKDAYS.map(day => [day, []])
  );

  for (const { data } of items) {
    if (!data.sichtbarkeit) continue;
    if ((data.arraystring ?? '').trim() === 'Kiss') continue;
    if (data.datum && isWeekday(data.datum)) {
      byDay.get(data.datum)!.push(data);
    }
  }

  for (const dayItems of byDay.values()) {
    dayItems.sort((a, b) => {
      const categoryDiff =
        CATEGORY_ORDER.indexOf(a.kategorie ?? '') -
        CATEGORY_ORDER.indexOf(b.kategorie ?? '');
      if (categoryDiff !== 0) return categoryDiff;
      return (a.index ?? 0) - (b.index ?? 0);
    });
  }

  return byDay;
}

function buildDayMenu(dayItems: WixItemData[]): DayMenu {
  const catMap = new Map<string, MenuItem[]>();

  for (const item of dayItems) {
    const category = item.kategorie ?? 'Sonstiges';
    if (IGNORED_CATEGORIES.has(category)) continue;
    if (!catMap.has(category)) catMap.set(category, []);

    const rawTag = (item.arraystring ?? '').trim();
    const adapterTags = rawTag ? [rawTag] : [];
    const title = (item.title ?? '').trim();

    catMap.get(category)!.push({
      title,
      price: item.preis?.trim() || null,
      tags: resolveTags(adapterTags, inferTags({ title })),
      allergens: item.allergene?.replace(/^,+|,+$/g, '').trim() || null,
      description: null,
    });
  }

  const orderedCats = CATEGORY_ORDER.filter(c => catMap.has(c));
  for (const c of catMap.keys()) {
    if (!orderedCats.includes(c)) orderedCats.push(c);
  }

  return {
    categories: orderedCats.map(name => ({
      name,
      items: catMap.get(name)!,
    })),
  };
}

async function fetchMenu(): Promise<WeekMenu> {
  const items = await fetchWixData();
  const byDay = groupByDay(items);

  const result: WeekMenu = {};
  for (const day of WEEKDAYS) {
    const dayItems = byDay.get(day)!;
    if (dayItems.length > 0) {
      result[day] = buildDayMenu(dayItems);
    }
  }
  return result;
}

const adapter: FullAdapter = {
  id: 'mano',
  title: 'Mano Café & Bistro',
  icon: 'coffee',
  url: 'https://www.kissthecook.at/mano-cafe-und-bistro',
  type: 'full',
  cuisine: ['Café', 'Bistro'],
  edenred: true,
  outdoor: true,
  coordinates: { lat: 48.2211, lon: 16.3926 },
  fetchMenu,
};

export default adapter;
