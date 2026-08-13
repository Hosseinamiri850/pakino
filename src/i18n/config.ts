export type Locale = 'fa' | 'en';
export const locales: Locale[] = ['fa', 'en'];
export const defaultLocale: Locale = 'fa';

export const localeLabels: Record<Locale, string> = {
  fa: 'فارسی',
  en: 'English',
};

export function dir(locale: Locale): 'rtl' | 'ltr' {
  return locale === 'fa' ? 'rtl' : 'ltr';
}
