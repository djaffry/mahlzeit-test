import type { FullAdapter, WeekMenu, MenuItem } from '../types.js';
import { isWeekday } from '../types.js';

const API_URL = 'https://www.quartiersechs.at/wp-json/wp/v2/pages/4';

// Eurest catering API types, deeply nested XML-to-JSON structure
interface XmlAttributes {
  '@attributes': Record<string, string>;
}

interface AdditiveGroup extends XmlAttributes {
  Additive?: XmlAttributes | XmlAttributes[];
}

interface AdditiveInfo {
  AdditiveGroup?: AdditiveGroup | AdditiveGroup[];
}

interface CategoryGroup extends XmlAttributes {
  Category?: XmlAttributes | XmlAttributes[];
}

interface CategoryInfo {
  CategoryGroup?: CategoryGroup | CategoryGroup[];
}

interface ComponentDetails {
  GastDesc?: XmlAttributes;
  CategoryInfo?: CategoryInfo;
}

interface Component {
  ComponentDetails?: ComponentDetails;
}

interface SetMenuDetails {
  GastDesc?: XmlAttributes;
  GastDescTranslation?: XmlAttributes;
  AdditiveInfo?: AdditiveInfo;
}

interface SetMenu extends XmlAttributes {
  SetMenuDetails?: SetMenuDetails;
  Component?: Component | Component[];
}

interface EurestMenuLine extends XmlAttributes {
  SetMenu?: SetMenu | SetMenu[];
}

interface EurestWeekDay extends XmlAttributes {
  MenuLine?: EurestMenuLine | EurestMenuLine[];
}

interface EurestWeeklyMenu {
  WeekDays?: { WeekDay?: EurestWeekDay | EurestWeekDay[] };
}

interface WpMensaBlock {
  wu_mensa_daily_menu?: WpMensaDailyMenu[];
}

interface WpMensaDailyMenu {
  apiWeeklyMenu?: EurestWeeklyMenu;
}

interface WpPage {
  acf?: {
    webblocks?: WpMensaBlock[];
  };
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function extractAllergens(setMenu: SetMenu): string | null {
  const info = setMenu.SetMenuDetails?.AdditiveInfo;
  if (!info) return null;

  const groups = toArray(info.AdditiveGroup);
  const allergenGroup = groups.find(
    g => g['@attributes']?.name === 'Allergene' || g['@attributes']?.code === 'Allergen'
  );
  if (!allergenGroup) return null;

  const additives = toArray(allergenGroup.Additive);
  const codes = additives.map(a => a['@attributes']?.shortName).filter(Boolean);
  return codes.length ? codes.join(',') : null;
}

const MEAT_FISH_TAGS = ['Schweinefleisch', 'Rindfleisch', 'Geflügel', 'Fisch', 'Lamm', 'Wild'];
const PLANTBASED_DIET_TAGS = ['Vegan', 'Vegetarisch'];

function removeContradictoryDietTags(tags: string[]): string[] {
  if (tags.some(t => MEAT_FISH_TAGS.includes(t))) {
    return tags.filter(t => !PLANTBASED_DIET_TAGS.includes(t));
  }
  return tags;
}

function extractDietaryTags(setMenu: SetMenu): string[] {
  const tags: string[] = [];

  const components = toArray(setMenu.Component);
  for (const component of components) {
    const groups = toArray(component.ComponentDetails?.CategoryInfo?.CategoryGroup);
    for (const group of groups) {
      if (group['@attributes']?.name !== 'Kennzeichnung') continue;

      const categories = toArray(group.Category);
      for (const category of categories) {
        const raw = category['@attributes']?.value ?? category['@attributes']?.name;
        if (!raw) continue;
        for (const part of raw.split(' / ')) {
          const tag = part.trim();
          if (tag && !tags.includes(tag)) tags.push(tag);
        }
      }
    }
  }

  return removeContradictoryDietTags(tags);
}

function normalizeCategoryName(lineName: string): string {
  return lineName.replace(/\s*\d+$/, '').trim();
}

function inferTagsFromCategory(category: string, title: string, tags: string[]): string[] {
  if (tags.length > 0) return tags;

  const cat = category.toLowerCase();
  if (cat.includes('vegan') && !cat.includes('vegetarisch')) return ['Vegan'];
  if (cat.includes('vegetarisch')) return ['Vegetarisch'];
  if (cat === 'pasta station') return ['Vegetarisch'];
  if (cat === 'bowl station') return ['Vegan'];
  if (cat === 'salatecke') return ['Vegetarisch'];
  if (cat === 'pizza & co' && /margherita/i.test(title)) return ['Vegetarisch'];
  if (cat.startsWith('obst')) return ['Vegan'];
  return tags;
}

function parseMenuLine(menuLine: EurestMenuLine): { category: string; item: MenuItem }[] {
  const lineName = menuLine['@attributes']?.Name ?? '';
  const fallbackCategory = normalizeCategoryName(lineName);
  if (!fallbackCategory) return [];

  const results: { category: string; item: MenuItem }[] = [];

  for (const setMenu of toArray(menuLine.SetMenu)) {
    const title = (setMenu.SetMenuDetails?.GastDesc?.['@attributes']?.value ?? '').trim();
    if (!title || /station heute geschlossen/i.test(title)) continue;

    const price = setMenu['@attributes']?.SalesPrice;

    const displayName = setMenu['@attributes']?.DisplayName ?? '';
    const category = normalizeCategoryName(displayName) || fallbackCategory;

    results.push({
      category,
      item: {
        title,
        price: price && price !== '0.00' ? `${price} €` : null,
        tags: inferTagsFromCategory(category, title, extractDietaryTags(setMenu)),
        allergens: extractAllergens(setMenu),
        description: null,
      },
    });
  }

  return results;
}

async function fetchMenu(): Promise<WeekMenu> {
  const res = await fetch(API_URL);
  if (!res.ok) throw new Error(`Quartier Sechs API returned HTTP ${res.status}`);
  const page: WpPage = await res.json();

  const webblocks = page.acf?.webblocks ?? [];
  const menuBlock = webblocks.find(b => b.wu_mensa_daily_menu);
  if (!menuBlock) throw new Error('Menu block not found in webblocks');

  const weeklyMenu = menuBlock.wu_mensa_daily_menu?.[0]?.apiWeeklyMenu;
  if (!weeklyMenu) throw new Error('apiWeeklyMenu not found');

  const result: WeekMenu = {};

  for (const weekDay of toArray(weeklyMenu.WeekDays?.WeekDay)) {
    const dayAttr = weekDay['@attributes']?.Day;
    if (!dayAttr || !isWeekday(dayAttr)) continue;

    const catMap = new Map<string, MenuItem[]>();

    for (const menuLine of toArray(weekDay.MenuLine)) {
      for (const { category, item } of parseMenuLine(menuLine)) {
        if (!catMap.has(category)) catMap.set(category, []);
        catMap.get(category)!.push(item);
      }
    }

    if (catMap.size > 0) {
      result[dayAttr] = {
        categories: Array.from(catMap, ([name, items]) => ({ name, items })),
      };
    }
  }

  return result;
}

const adapter: FullAdapter = {
  id: 'quartiersechs',
  title: '🏠 Quartier Sechs',
  url: 'https://www.quartiersechs.at/',
  type: 'full',
  cuisine: ['Kantine'],
  edenred: true,
  coordinates: { lat: 48.2218, lon: 16.3935 },
  mapUrl: 'https://maps.app.goo.gl/7wG2m5UuYbBC8HUi6',
  fetchMenu,
};

export default adapter;
