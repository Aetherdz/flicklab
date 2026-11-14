import en from './en.json';
import ar from './ar.json';

export type Locale = 'en' | 'ar';
export type StringKey = keyof typeof en;

const CATALOGUES: Record<Locale, Record<StringKey, string>> = { en, ar };

export { en as enStrings, ar as arStrings };

/** Locale comes from the document, because each page is generated per language. */
export function currentLocale(): Locale {
  return document.documentElement.lang === 'ar' ? 'ar' : 'en';
}

export function isRtl(locale: Locale = currentLocale()): boolean {
  return locale === 'ar';
}

/**
 * Looks up a string and fills `{placeholders}`. A missing translation falls
 * back to English rather than rendering the key, so a page never shows raw
 * identifiers in front of a visitor.
 */
export function translate(
  key: StringKey,
  vars?: Record<string, string | number>,
  locale: Locale = currentLocale(),
): string {
  const template = CATALOGUES[locale][key] ?? CATALOGUES.en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = vars[name];
    return value === undefined ? `{${name}}` : String(value);
  });
}

export const t = translate;
