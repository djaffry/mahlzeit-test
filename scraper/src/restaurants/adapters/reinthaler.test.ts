import { describe, it, expect } from 'vitest';
import { findPdfCandidates, pickPdfForWeek } from './reinthaler.js';

const REAL_HTML_SAMPLE = `
  <a href="https://irp.cdn-website.com/fead4102/files/uploaded/MENU-KARTE+2026+KW+18-19+27.04-08.05.2026-91efd46f.pdf">DOWNLOAD PDF</a>
  <a href="https://irp.cdn-website.com/fead4102/files/uploaded/MENU-KARTE+2026+KW+20-21+11.05-22.05+2026-5badb31c.pdf">DOWNLOAD PDF</a>
  <a href="https://irp.cdn-website.com/fead4102/files/uploaded/WEINKARTE%28print%29no_marks.pdf">Weinkarte</a>
  <a href="https://irp.cdn-website.com/fead4102/files/uploaded/RT_KARTE_salate_digital.pdf">Salate</a>
`;

describe('reinthaler findPdfCandidates', () => {
  it('extracts biweekly MENU-KARTE PDFs from speisekarte HTML', () => {
    const candidates = findPdfCandidates(REAL_HTML_SAMPLE);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({ year: 2026, startWeek: 18, endWeek: 19 });
    expect(candidates[0].url).toContain('KW+18-19');
    expect(candidates[1]).toMatchObject({ year: 2026, startWeek: 20, endWeek: 21 });
  });

  it('ignores unrelated PDFs (Weinkarte, Salate, etc.)', () => {
    const candidates = findPdfCandidates(REAL_HTML_SAMPLE);
    expect(candidates.map(c => c.url)).not.toContain(expect.stringContaining('WEINKARTE'));
    expect(candidates.map(c => c.url)).not.toContain(expect.stringContaining('RT_KARTE_salate'));
  });

  it('deduplicates identical URLs that appear multiple times on the page', () => {
    const url = 'https://irp.cdn-website.com/fead4102/files/uploaded/MENU-KARTE+2026+KW+18-19-abc.pdf';
    const html = `<a href="${url}">1</a><a href="${url}">2</a>`;
    expect(findPdfCandidates(html)).toHaveLength(1);
  });

  it('returns an empty array when no matching URLs are present', () => {
    expect(findPdfCandidates('<html><body>no menu here</body></html>')).toEqual([]);
  });

  it('supports single-digit week numbers', () => {
    const html = `<a href="https://irp.cdn-website.com/fead4102/files/uploaded/MENU-KARTE+2026+KW+8-9+abc.pdf">x</a>`;
    expect(findPdfCandidates(html)).toEqual([
      { url: expect.stringContaining('KW+8-9'), year: 2026, startWeek: 8, endWeek: 9 },
    ]);
  });

});

describe('reinthaler pickPdfForWeek', () => {
  const candidates = [
    { url: 'a', year: 2026, startWeek: 18, endWeek: 19 },
    { url: 'b', year: 2026, startWeek: 20, endWeek: 21 },
  ];

  it('picks the candidate that covers the requested week', () => {
    expect(pickPdfForWeek(candidates, 2026, 18)?.url).toBe('a');
    expect(pickPdfForWeek(candidates, 2026, 19)?.url).toBe('a');
    expect(pickPdfForWeek(candidates, 2026, 20)?.url).toBe('b');
    expect(pickPdfForWeek(candidates, 2026, 21)?.url).toBe('b');
  });

  it('returns null when no candidate covers the week', () => {
    expect(pickPdfForWeek(candidates, 2026, 17)).toBeNull();
    expect(pickPdfForWeek(candidates, 2026, 22)).toBeNull();
  });

  it('accepts adjacent ISO week years at Dec/Jan boundaries', () => {
    // ISO week year and the calendar year embedded in the filename can differ by
    // ±1 at year boundaries — e.g. ISO year 2026 week 52 may live in a filename
    // tagged 2025 because its Monday fell in December 2025.
    const boundary = [{ url: 'z', year: 2025, startWeek: 52, endWeek: 53 }];
    expect(pickPdfForWeek(boundary, 2026, 52)?.url).toBe('z');
  });
});
