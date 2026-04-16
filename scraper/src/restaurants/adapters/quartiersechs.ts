import type { FullAdapter, WeekMenu, MenuItem } from '../types.js';
import { isWeekday } from '../types.js';
import { inferTags, resolveTags } from '../tags.js';

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

interface ProductInfo {
  Product?: XmlAttributes | XmlAttributes[];
}

interface SetMenuDetails {
  GastDesc?: XmlAttributes;
  GastDescTranslation?: XmlAttributes;
  AdditiveInfo?: AdditiveInfo;
  ProductInfo?: ProductInfo;
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

  return tags;
}

function normalizeCategoryName(lineName: string): string {
  return lineName.replace(/\s*\d+$/, '').trim();
}

function buildItemTags(category: string, title: string, xmlTags: string[]): string[] {
  if (xmlTags.length > 0) {
    return resolveTags(xmlTags, inferTags({ title, category }));
  }
  return inferTags({ title, category });
}

function extractProductPrice(setMenu: SetMenu): string | null {
  const products = toArray(setMenu.SetMenuDetails?.ProductInfo?.Product);
  for (const product of products) {
    const price = product['@attributes']?.ProductPrice;
    if (price && price !== '0.00') {
      return `${price.replace('.', ',')} €`;
    }
  }
  return null;
}

function hasDistinctDishes(dishTags: string[][]): boolean {
  return new Set(dishTags.flat()).size >= 2;
}

function splitAsiaCornerWarmDishes(title: string, price: string | null, allergens: string | null): MenuItem[] {
  const sections = title.split(/•\s*\n/).map(s => s.trim()).filter(Boolean);
  if (sections.length < 3) return [];

  const dishes = sections.slice(0, 3);
  const dishTags = dishes.map(d => inferTags({ title: d, category: 'Asia Corner' }));
  if (!hasDistinctDishes(dishTags)) return [];

  const sides = sections.length > 3
    ? sections.slice(3).join(' • ')
    : null;

  return dishes.map((dish, i) => {
    const dishTitle = sides ? `${dish} mit ${sides}` : dish;
    return {
      title: dishTitle.replace(/\s*•\s*/g, ', '),
      price,
      tags: dishTags[i],
      allergens,
      description: null,
    };
  });
}

function parseMenuLine(menuLine: EurestMenuLine): { category: string; item: MenuItem }[] {
  const lineName = menuLine['@attributes']?.Name ?? '';
  const fallbackCategory = normalizeCategoryName(lineName);
  if (!fallbackCategory) return [];

  const results: { category: string; item: MenuItem }[] = [];

  for (const setMenu of toArray(menuLine.SetMenu)) {
    const rawTitle = (setMenu.SetMenuDetails?.GastDesc?.['@attributes']?.value ?? '').trim();
    if (!rawTitle || /station heute geschlossen/i.test(rawTitle)) continue;
    const title = rawTitle.replace(/\s*•\s*/g, ', ').replace(/\s*\n\s*/g, ' ').replace(/,\s*,/g, ',').replace(/\s{2,}/g, ' ').replace(/^,\s*|,\s*$/g, '').trim();

    const displayName = setMenu['@attributes']?.DisplayName ?? '';
    const category = normalizeCategoryName(displayName) || fallbackCategory;

    if (/asia corner/i.test(category) && rawTitle.includes('•\n')) {
      const split = splitAsiaCornerWarmDishes(rawTitle, extractProductPrice(setMenu), extractAllergens(setMenu));
      if (split.length > 0) {
        for (const item of split) results.push({ category, item });
        continue;
      }
    }

    const tags = buildItemTags(category, title, extractDietaryTags(setMenu));

    if (/pasta station/i.test(category) && !tags.includes('Vegetarisch')) {
      tags.push('Vegetarisch');
    }
    if (/pizza/i.test(category) && /margherita/i.test(title) && !tags.includes('Vegetarisch')) {
      tags.push('Vegetarisch');
    }

    results.push({
      category,
      item: {
        title,
        price: extractProductPrice(setMenu),
        tags,
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
  title: 'Quartier Sechs',
  icon: 'utensils',
  url: 'https://www.quartiersechs.at/',
  type: 'full',
  cuisine: ['Kantine'],
  edenred: true,
  coordinates: { lat: 48.2218, lon: 16.3935 },
  fetchMenu,
};

export default adapter;
