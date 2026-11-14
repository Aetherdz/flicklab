import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path: string) => JSON.parse(readFileSync(join(root, path), 'utf8'));

const LOCALES: Record<string, string> = {
  en: 'content/modes.json',
  ar: 'content/modes.ar.json',
};
const ORDER = ['gridshot', 'flick', 'tracking', 'precision', 'reaction', 'cps'];

describe('page content', () => {
  it('has site chrome for every locale', () => {
    const site = read('content/site.json');
    for (const locale of Object.keys(LOCALES)) {
      const copy = site[locale];
      expect(copy, locale).toBeDefined();
      for (const key of [
        'title',
        'description',
        'h1',
        'lede',
        'cta',
        'allModes',
        'mainNav',
        'playNow',
        'questions',
      ]) {
        expect(typeof copy[key], `${locale}.${key}`).toBe('string');
        expect(copy[key].length, `${locale}.${key}`).toBeGreaterThan(0);
      }
    }
  });

  for (const [locale, path] of Object.entries(LOCALES)) {
    it(`gives every ${locale} mode the copy the generated pages render`, () => {
      const modes = read(path);
      for (const slug of ORDER) {
        const entry = modes[slug];
        expect(entry, `${locale}/${slug}`).toBeDefined();

        // Home cards and the top navigation read these two directly.
        for (const key of ['name', 'card']) {
          expect(typeof entry[key], `${locale}/${slug}.${key}`).toBe('string');
          expect(entry[key].length, `${locale}/${slug}.${key}`).toBeGreaterThan(0);
          expect(entry[key], `${locale}/${slug}.${key}`).not.toMatch(/undefined/);
        }

        for (const key of ['title', 'description', 'ogTitle', 'ogDescription', 'h1', 'lede', 'preboot']) {
          expect(typeof entry[key], `${locale}/${slug}.${key}`).toBe('string');
          expect(entry[key].length, `${locale}/${slug}.${key}`).toBeGreaterThan(0);
        }

        expect(entry.sections.length, `${locale}/${slug}.sections`).toBeGreaterThan(0);
        for (const section of entry.sections) {
          expect(typeof section.h2, `${locale}/${slug} section h2`).toBe('string');
        }
        expect(entry.faq.length, `${locale}/${slug}.faq`).toBeGreaterThan(0);
        for (const [question, answer] of entry.faq) {
          expect(typeof question).toBe('string');
          expect(typeof answer).toBe('string');
        }
      }
    });
  }
});
