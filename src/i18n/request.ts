import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';
import type { Locale } from '@/i18n/config';

export default getRequestConfig(async ({ requestLocale }) => {
  let requested = (await requestLocale) as Locale;
  if (!requested || !routing.locales.includes(requested as never)) {
    requested = routing.defaultLocale;
  }

  return {
    locale: requested,
    messages: (await import(`../../messages/${requested}.json`)) as never,
  };
});
