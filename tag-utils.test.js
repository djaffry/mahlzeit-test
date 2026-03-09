import { describe, it, before, after } from 'node:test';
import { deepStrictEqual, strictEqual } from 'node:assert';
import { createServer } from 'node:http';

globalThis.window = globalThis;
await import('./tag-utils.js');
const { TagUtils } = globalThis;

const TEST_DATA = {
  hierarchy: {
    Fleisch: ['Schweinefleisch', 'Rindfleisch', 'Geflügel', 'Lamm'],
    'Geflügel': ['Huhn', 'Ente', 'Pute'],
    'Meeresfrüchte': ['Fisch'],
    Vegetarisch: ['Vegan'],
  },
};

let server;

before(async () => {
  server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(TEST_DATA));
  });
  await new Promise(resolve => server.listen(0, resolve));
  await TagUtils.load(`http://localhost:${server.address().port}/tags.json`);
});

after(() => { server?.close(); });

describe('expandFilters', () => {
  it('expands Fleisch to all meat subcategories', () => {
    const expanded = TagUtils.expandFilters(new Set(['Fleisch']));
    for (const tag of ['Fleisch', 'Schweinefleisch', 'Rindfleisch', 'Geflügel', 'Huhn', 'Ente', 'Pute', 'Lamm']) {
      strictEqual(expanded.has(tag), true, `expected ${tag}`);
    }
  });

  it('expands Vegetarisch to include Vegan', () => {
    const expanded = TagUtils.expandFilters(new Set(['Vegetarisch']));
    strictEqual(expanded.has('Vegetarisch'), true);
    strictEqual(expanded.has('Vegan'), true);
  });

  it('expands Meeresfrüchte to include Fisch', () => {
    strictEqual(TagUtils.expandFilters(new Set(['Meeresfrüchte'])).has('Fisch'), true);
  });

  it('leaves leaf filters unchanged', () => {
    deepStrictEqual([...TagUtils.expandFilters(new Set(['Vegan']))], ['Vegan']);
  });

  it('does not expand unknown tags beyond themselves', () => {
    deepStrictEqual([...TagUtils.expandFilters(new Set(['Glutenfrei']))], ['Glutenfrei']);
  });

  it('expands multiple filters independently', () => {
    const expanded = TagUtils.expandFilters(new Set(['Fisch', 'Vegan']));
    strictEqual(expanded.has('Fisch'), true);
    strictEqual(expanded.has('Vegan'), true);
    strictEqual(expanded.has('Fleisch'), false);
  });
});

describe('getParentTags', () => {
  it('returns tags that have children', () => {
    const parents = TagUtils.getParentTags();
    strictEqual(parents.includes('Fleisch'), true);
    strictEqual(parents.includes('Vegetarisch'), true);
    strictEqual(parents.includes('Meeresfrüchte'), true);
    strictEqual(parents.includes('Vegan'), false);
  });
});

describe('isLoaded', () => {
  it('returns true after successful load', () => {
    strictEqual(TagUtils.isLoaded(), true);
  });
});
