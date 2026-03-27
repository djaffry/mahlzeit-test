import { describe, it, expect } from 'vitest'
import {
  inferTags,
  resolveTags,
  isKnownTag,
  getTagMetadata,
} from './tags.js'

describe('inferTags', () => {
  it('infers Huhn from chicken-related words', () => {
    expect(inferTags({ title: 'Hühnersuppe' })).toEqual(['Huhn'])
    expect(inferTags({ title: 'Chicken Curry' })).toEqual(['Huhn'])
    expect(inferTags({ title: 'Hendl mit Kartoffelsalat' })).toEqual(['Huhn'])
  })

  it('infers Rindfleisch', () => {
    expect(inferTags({ title: 'Rindsgulasch' })).toEqual(['Rindfleisch'])
    expect(inferTags({ title: 'Tafelspitz mit Rösti' })).toEqual(['Rindfleisch'])
    expect(inferTags({ title: 'Beef Burger' })).toEqual(['Rindfleisch'])
  })

  it('infers Schweinefleisch', () => {
    expect(inferTags({ title: 'Schweinsbraten' })).toEqual(['Schweinefleisch'])
    expect(inferTags({ title: 'Ötscherblickschwein mit Tzatziki' })).toEqual(['Schweinefleisch'])
  })

  it('infers Lamm', () => {
    expect(inferTags({ title: 'Lammkeule mit Rosmarin' })).toEqual(['Lamm'])
  })

  it('infers Geflügel for generic poultry', () => {
    expect(inferTags({ title: 'Geflügelwurst' })).toEqual(['Geflügel'])
  })

  it('infers Pute', () => {
    expect(inferTags({ title: 'Putenfilet gegrillt' })).toEqual(['Pute'])
  })

  it('infers Ente', () => {
    expect(inferTags({ title: 'Ente mit Orangensauce' })).toEqual(['Ente'])
  })

  it('infers generic Fleisch only for standalone "fleisch"', () => {
    expect(inferTags({ title: 'Fleisch vom Grill' })).toEqual(['Fleisch'])
  })

  it('infers Fisch from fish keywords', () => {
    expect(inferTags({ title: 'Lachs mit Gemüse' })).toEqual(['Fisch'])
    expect(inferTags({ title: 'Zanderfilet' })).toEqual(['Fisch'])
    expect(inferTags({ title: 'Thunfisch Salat' })).toEqual(['Fisch'])
  })

  it('infers Meeresfrüchte from seafood keywords', () => {
    expect(inferTags({ title: 'Garnelen auf Pasta' })).toEqual(['Meeresfrüchte'])
    expect(inferTags({ title: 'Calamari fritti' })).toEqual(['Meeresfrüchte'])
  })

  it('infers Vegan', () => {
    expect(inferTags({ title: 'Veganes Curry' })).toEqual(['Vegan'])
    expect(inferTags({ title: 'Tofu Bowl' })).toEqual(['Vegan'])
    expect(inferTags({ title: 'Obst klein' })).toEqual(['Vegan'])
  })

  it('infers Vegetarisch', () => {
    expect(inferTags({ title: 'Vegetarisch Lasagne' })).toEqual(['Vegetarisch'])
  })

  it('returns empty for ambiguous or unknown items', () => {
    expect(inferTags({ title: 'Grüner Salat' })).toEqual([])
    expect(inferTags({ title: 'Schnitzel mit Pommes' })).toEqual([])
    expect(inferTags({ title: 'Pizza Margherita' })).toEqual([])
  })

  it('returns leaf tags only — no ancestors', () => {
    const tags = inferTags({ title: 'Hühnersuppe' })
    expect(tags).toEqual(['Huhn'])
    expect(tags.includes('Geflügel')).toBe(false)
    expect(tags.includes('Fleisch')).toBe(false)
  })

  it('prunes ancestors when both parent and child match', () => {
    expect(inferTags({ title: 'Geflügel Hühnersuppe' })).toEqual(['Huhn'])
  })

  it('respects word boundaries', () => {
    expect(inferTags({ title: 'Wildkräutersalat' })).toEqual([])
  })

  it('uses category fallback when no text match', () => {
    expect(inferTags({ title: 'Bowl', category: 'Bowl Station' })).toEqual(['Vegan'])
    expect(inferTags({ title: 'Penne', category: 'Pasta Station' })).toEqual(['Vegetarisch'])
    expect(inferTags({ title: 'Blattsalat', category: 'Salatecke' })).toEqual(['Vegetarisch'])
    expect(inferTags({ title: 'Apfel', category: 'Obst klein' })).toEqual(['Vegan'])
  })

  it('skips category fallback when text matches', () => {
    expect(inferTags({ title: 'Hühnercurry', category: 'vegan' })).toEqual(['Huhn'])
  })

  it('uses description for inference', () => {
    expect(inferTags({ title: 'Gulasch', description: 'mit Rindfleisch' })).toEqual(['Rindfleisch'])
  })

  it('removes contradictions per-item', () => {
    expect(inferTags({ title: 'Vegan Chicken Steak' })).toEqual(['Huhn'])
  })
})

describe('resolveTags', () => {
  it('combines adapter and inferred tags', () => {
    expect(resolveTags(['Vegetarisch'], ['Glutenfrei'])).toEqual(['Vegetarisch', 'Glutenfrei'])
  })

  it('blocks meat/seafood inference when adapter provides plant-based', () => {
    expect(resolveTags(['Vegetarisch'], ['Huhn'])).toEqual(['Vegetarisch'])
    expect(resolveTags(['Vegan'], ['Fisch'])).toEqual(['Vegan'])
  })

  it('removes contradictions from adapter tags', () => {
    expect(resolveTags(['Vegan', 'Huhn'], [])).toEqual(['Huhn'])
    expect(resolveTags(['Vegetarisch', 'Fisch'], [])).toEqual(['Fisch'])
  })

  it('preserves plant-based when no meat present', () => {
    expect(resolveTags(['Vegan'], [])).toEqual(['Vegan'])
    expect(resolveTags(['Vegetarisch'], [])).toEqual(['Vegetarisch'])
  })

  it('keeps non-dietary tags alongside meat', () => {
    expect(resolveTags(['Rindfleisch', 'Glutenfrei'], [])).toEqual(['Rindfleisch', 'Glutenfrei'])
  })

  it('prunes ancestors when inference adds specificity', () => {
    expect(resolveTags(['Fleisch'], ['Rindfleisch'])).toEqual(['Rindfleisch'])
  })

  it('deduplicates', () => {
    expect(resolveTags(['Vegan'], ['Vegan'])).toEqual(['Vegan'])
  })

  it('normalizes adapter tags', () => {
    expect(resolveTags(['Hühnerfleisch'], [])).toEqual(['Huhn'])
  })
})

describe('isKnownTag', () => {
  it('returns true for canonical tags', () => {
    expect(isKnownTag('Huhn')).toBe(true)
    expect(isKnownTag('Vegan')).toBe(true)
    expect(isKnownTag('Meeresfrüchte')).toBe(true)
  })

  it('returns false for aliases and unknown strings', () => {
    expect(isKnownTag('Hühnerfleisch')).toBe(false)
    expect(isKnownTag('RandomTag')).toBe(false)
  })
})

describe('getTagMetadata', () => {
  it('returns hierarchy and aliases', () => {
    const meta = getTagMetadata()
    expect(meta.tags.length).toBeGreaterThan(0)
    expect(meta.hierarchy['Fleisch']).toContain('Rindfleisch')
    expect(meta.aliases['Hühnerfleisch']).toBe('Huhn')
  })

  it('contains no presentation data', () => {
    const meta = getTagMetadata()
    expect('colors' in meta).toBe(false)
  })
})
