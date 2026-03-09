import { describe, it } from 'node:test';
import { deepStrictEqual, strictEqual } from 'node:assert';
import {
  inferTags,
  resolveTags,
  isKnownTag,
  getTagMetadata,
} from './tags.js';

describe('inferTags', () => {
  it('infers Huhn from chicken-related words', () => {
    deepStrictEqual(inferTags({ title: 'Hühnersuppe' }), ['Huhn']);
    deepStrictEqual(inferTags({ title: 'Chicken Curry' }), ['Huhn']);
    deepStrictEqual(inferTags({ title: 'Hendl mit Kartoffelsalat' }), ['Huhn']);
  });

  it('infers Rindfleisch', () => {
    deepStrictEqual(inferTags({ title: 'Rindsgulasch' }), ['Rindfleisch']);
    deepStrictEqual(inferTags({ title: 'Tafelspitz mit Rösti' }), ['Rindfleisch']);
    deepStrictEqual(inferTags({ title: 'Beef Burger' }), ['Rindfleisch']);
  });

  it('infers Schweinefleisch', () => {
    deepStrictEqual(inferTags({ title: 'Schweinsbraten' }), ['Schweinefleisch']);
    deepStrictEqual(inferTags({ title: 'Ötscherblickschwein mit Tzatziki' }), ['Schweinefleisch']);
  });

  it('infers Lamm', () => {
    deepStrictEqual(inferTags({ title: 'Lammkeule mit Rosmarin' }), ['Lamm']);
  });

  it('infers Geflügel for generic poultry', () => {
    deepStrictEqual(inferTags({ title: 'Geflügelwurst' }), ['Geflügel']);
  });

  it('infers Pute', () => {
    deepStrictEqual(inferTags({ title: 'Putenfilet gegrillt' }), ['Pute']);
  });

  it('infers Ente', () => {
    deepStrictEqual(inferTags({ title: 'Ente mit Orangensauce' }), ['Ente']);
  });

  it('infers generic Fleisch only for standalone "fleisch"', () => {
    deepStrictEqual(inferTags({ title: 'Fleisch vom Grill' }), ['Fleisch']);
  });

  it('infers Fisch from fish keywords', () => {
    deepStrictEqual(inferTags({ title: 'Lachs mit Gemüse' }), ['Fisch']);
    deepStrictEqual(inferTags({ title: 'Zanderfilet' }), ['Fisch']);
    deepStrictEqual(inferTags({ title: 'Thunfisch Salat' }), ['Fisch']);
  });

  it('infers Meeresfrüchte from seafood keywords', () => {
    deepStrictEqual(inferTags({ title: 'Garnelen auf Pasta' }), ['Meeresfrüchte']);
    deepStrictEqual(inferTags({ title: 'Calamari fritti' }), ['Meeresfrüchte']);
  });

  it('infers Vegan', () => {
    deepStrictEqual(inferTags({ title: 'Veganes Curry' }), ['Vegan']);
    deepStrictEqual(inferTags({ title: 'Tofu Bowl' }), ['Vegan']);
    deepStrictEqual(inferTags({ title: 'Obst klein' }), ['Vegan']);
  });

  it('infers Vegetarisch', () => {
    deepStrictEqual(inferTags({ title: 'Vegetarisch Lasagne' }), ['Vegetarisch']);
  });

  it('returns empty for ambiguous or unknown items', () => {
    deepStrictEqual(inferTags({ title: 'Grüner Salat' }), []);
    deepStrictEqual(inferTags({ title: 'Schnitzel mit Pommes' }), []);
    deepStrictEqual(inferTags({ title: 'Pizza Margherita' }), []);
  });

  it('returns leaf tags only — no ancestors', () => {
    const tags = inferTags({ title: 'Hühnersuppe' });
    deepStrictEqual(tags, ['Huhn']);
    strictEqual(tags.includes('Geflügel'), false);
    strictEqual(tags.includes('Fleisch'), false);
  });

  it('prunes ancestors when both parent and child match', () => {
    deepStrictEqual(inferTags({ title: 'Geflügel Hühnersuppe' }), ['Huhn']);
  });

  it('respects word boundaries', () => {
    deepStrictEqual(inferTags({ title: 'Wildkräutersalat' }), []);
  });

  it('uses category fallback when no text match', () => {
    deepStrictEqual(inferTags({ title: 'Bowl', category: 'Bowl Station' }), ['Vegan']);
    deepStrictEqual(inferTags({ title: 'Penne', category: 'Pasta Station' }), ['Vegetarisch']);
    deepStrictEqual(inferTags({ title: 'Blattsalat', category: 'Salatecke' }), ['Vegetarisch']);
    deepStrictEqual(inferTags({ title: 'Apfel', category: 'Obst klein' }), ['Vegan']);
  });

  it('skips category fallback when text matches', () => {
    deepStrictEqual(inferTags({ title: 'Hühnercurry', category: 'vegan' }), ['Huhn']);
  });

  it('uses description for inference', () => {
    deepStrictEqual(inferTags({ title: 'Gulasch', description: 'mit Rindfleisch' }), ['Rindfleisch']);
  });

  it('removes contradictions per-item', () => {
    deepStrictEqual(inferTags({ title: 'Vegan Chicken Steak' }), ['Huhn']);
  });
});

describe('resolveTags', () => {
  it('combines adapter and inferred tags', () => {
    deepStrictEqual(resolveTags(['Vegetarisch'], ['Glutenfrei']), ['Vegetarisch', 'Glutenfrei']);
  });

  it('blocks meat/seafood inference when adapter provides plant-based', () => {
    deepStrictEqual(resolveTags(['Vegetarisch'], ['Huhn']), ['Vegetarisch']);
    deepStrictEqual(resolveTags(['Vegan'], ['Fisch']), ['Vegan']);
  });

  it('removes contradictions from adapter tags', () => {
    deepStrictEqual(resolveTags(['Vegan', 'Huhn'], []), ['Huhn']);
    deepStrictEqual(resolveTags(['Vegetarisch', 'Fisch'], []), ['Fisch']);
  });

  it('preserves plant-based when no meat present', () => {
    deepStrictEqual(resolveTags(['Vegan'], []), ['Vegan']);
    deepStrictEqual(resolveTags(['Vegetarisch'], []), ['Vegetarisch']);
  });

  it('keeps non-dietary tags alongside meat', () => {
    deepStrictEqual(resolveTags(['Rindfleisch', 'Glutenfrei'], []), ['Rindfleisch', 'Glutenfrei']);
  });

  it('prunes ancestors when inference adds specificity', () => {
    deepStrictEqual(resolveTags(['Fleisch'], ['Rindfleisch']), ['Rindfleisch']);
  });

  it('deduplicates', () => {
    deepStrictEqual(resolveTags(['Vegan'], ['Vegan']), ['Vegan']);
  });

  it('normalizes adapter tags', () => {
    deepStrictEqual(resolveTags(['Hühnerfleisch'], []), ['Huhn']);
  });
});


describe('isKnownTag', () => {
  it('returns true for canonical tags', () => {
    strictEqual(isKnownTag('Huhn'), true);
    strictEqual(isKnownTag('Vegan'), true);
    strictEqual(isKnownTag('Meeresfrüchte'), true);
  });

  it('returns false for aliases and unknown strings', () => {
    strictEqual(isKnownTag('Hühnerfleisch'), false);
    strictEqual(isKnownTag('RandomTag'), false);
  });
});

describe('getTagMetadata', () => {
  it('returns hierarchy and aliases', () => {
    const meta = getTagMetadata();
    strictEqual(meta.tags.length > 0, true);
    strictEqual('Fleisch' in meta.hierarchy, true);
    strictEqual(meta.hierarchy['Fleisch'].includes('Rindfleisch'), true);
    strictEqual('Hühnerfleisch' in meta.aliases, true);
    strictEqual(meta.aliases['Hühnerfleisch'], 'Huhn');
  });

  it('contains no presentation data', () => {
    const meta = getTagMetadata();
    strictEqual('colors' in meta, false);
  });
});
