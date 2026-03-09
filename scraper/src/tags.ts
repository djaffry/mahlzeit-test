
const TAGS = {
  Vegetarisch: 'Vegetarisch',
  Vegan: 'Vegan',
  Glutenfrei: 'Glutenfrei',
  Laktosefrei: 'Laktosefrei',
  Fleisch: 'Fleisch',
  Schweinefleisch: 'Schweinefleisch',
  Rindfleisch: 'Rindfleisch',
  Gefluegel: 'Geflügel',
  Huhn: 'Huhn',
  Ente: 'Ente',
  Pute: 'Pute',
  Lamm: 'Lamm',
  Meeresfruechte: 'Meeresfrüchte',
  Fisch: 'Fisch',
} as const;

const TAG_HIERARCHY: Record<string, string[]> = {
  [TAGS.Fleisch]: [TAGS.Schweinefleisch, TAGS.Rindfleisch, TAGS.Gefluegel, TAGS.Lamm],
  [TAGS.Gefluegel]: [TAGS.Huhn, TAGS.Ente, TAGS.Pute],
  [TAGS.Meeresfruechte]: [TAGS.Fisch],
  [TAGS.Vegetarisch]: [TAGS.Vegan],
};

const TAG_ALIASES: Record<string, string> = {
  Hühnerfleisch: TAGS.Huhn,
  Chicken: TAGS.Huhn,
  Hendl: TAGS.Huhn,
  Henderl: TAGS.Huhn,
  Truthahn: TAGS.Pute,
  Vegetarische: TAGS.Vegetarisch,
  Vegane: TAGS.Vegan,
};

const CHILD_TO_PARENT: Record<string, string> = {};
for (const [parent, children] of Object.entries(TAG_HIERARCHY)) {
  for (const child of children) {
    CHILD_TO_PARENT[child] = parent;
  }
}

const MEAT_SEAFOOD_ROOTS = new Set<string>([TAGS.Fleisch, TAGS.Meeresfruechte]);
const PLANT_BASED = new Set<string>([TAGS.Vegan, TAGS.Vegetarisch]);
const ALL_TAGS = new Set<string>(Object.values(TAGS));

type TagPattern = readonly [RegExp, string];

const KEYWORD_PATTERNS: TagPattern[] = [
  [/\bh[üu]hn|chicken\b|hendl\b|henderl\b/i, TAGS.Huhn],
  [/\bpute|truthahn/i, TAGS.Pute],
  [/\bente/i, TAGS.Ente],
  [/\bgefl[üu]gel/i, TAGS.Gefluegel],
  [/\bbeef\b|\brind(s|er|fleisch)?|\btafelspitz/i, TAGS.Rindfleisch],
  [/schwein/i, TAGS.Schweinefleisch],
  [/\blamm/i, TAGS.Lamm],
  [/(?<!\w)fleisch(?![\wäöü])/i, TAGS.Fleisch],
  [/\blachs|\bforelle|\bscholle|\bzander|\bsaibling|\bkarpfen|\bthunfisch/i, TAGS.Fisch],
  [/\bgarnele|\bshrimp|\bmuschel|\bcalamari|\btintenfisch|\boktopus|\bhummer\b|\bkrabbe/i, TAGS.Meeresfruechte],
  [/\bvegan|\btofu\b|\byofu\b|\bobst\b/i, TAGS.Vegan],
  [/\bvegetarisch/i, TAGS.Vegetarisch],
];

const CATEGORY_PATTERNS: TagPattern[] = [
  [/\bvegan\b/i, TAGS.Vegan],
  [/\bvegetarisch\b/i, TAGS.Vegetarisch],
  [/\bpasta\s+station\b/i, TAGS.Vegetarisch],
  [/\bbowl\s+station\b/i, TAGS.Vegan],
  [/\bsalatecke\b/i, TAGS.Vegetarisch],
  [/\bobst\b/i, TAGS.Vegan],
];


export interface InferTagsInput {
  title: string;
  description?: string;
  category?: string;
}

export interface TagMetadata {
  tags: string[];
  hierarchy: Record<string, string[]>;
  aliases: Record<string, string>;
}

export function inferTags(input: InferTagsInput): string[] {
  const text = [input.title, input.description].filter(Boolean).join(' ');
  const tags: string[] = [];

  for (const [pattern, tag] of KEYWORD_PATTERNS) {
    if (pattern.test(text) && !tags.includes(tag)) {
      tags.push(tag);
    }
  }

  if (tags.length === 0 && input.category) {
    for (const [pattern, tag] of CATEGORY_PATTERNS) {
      if (pattern.test(input.category)) {
        tags.push(tag);
        break;
      }
    }
  }

  return pruneAncestors(removeContradictions(tags));
}

export function resolveTags(adapterTags: string[], inferredTags: string[]): string[] {
  const normalized = normalizeTags(adapterTags);

  const allowedInferred = normalized.some(t => PLANT_BASED.has(t))
    ? inferredTags.filter(t => !isMeatOrSeafood(t))
    : inferredTags;

  const merged = [...normalized];
  for (const tag of allowedInferred) {
    if (!merged.includes(tag)) merged.push(tag);
  }

  return pruneAncestors(removeContradictions(merged));
}

export function isKnownTag(tag: string): boolean {
  return ALL_TAGS.has(tag);
}

export function getTagMetadata(): TagMetadata {
  return {
    tags: Object.values(TAGS),
    hierarchy: TAG_HIERARCHY,
    aliases: TAG_ALIASES,
  };
}

function getAncestors(tag: string): string[] {
  const ancestors: string[] = [];
  let current = tag;
  while (CHILD_TO_PARENT[current]) {
    current = CHILD_TO_PARENT[current];
    ancestors.push(current);
  }
  return ancestors;
}

function pruneAncestors(tags: string[]): string[] {
  const ancestorSet = new Set(tags.flatMap(getAncestors));
  return tags.filter(t => !ancestorSet.has(t));
}

function isMeatOrSeafood(tag: string): boolean {
  return MEAT_SEAFOOD_ROOTS.has(tag) || getAncestors(tag).some(a => MEAT_SEAFOOD_ROOTS.has(a));
}

function removeContradictions(tags: string[]): string[] {
  if (!tags.some(isMeatOrSeafood)) return tags;
  return tags.filter(t => !PLANT_BASED.has(t));
}

function normalizeTag(tag: string): string {
  return TAG_ALIASES[tag] ?? tag;
}

function normalizeTags(tags: string[]): string[] {
  return tags.map(normalizeTag);
}
