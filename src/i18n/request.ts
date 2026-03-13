import { getRequestConfig } from 'next-intl/server'

import { DEFAULT_LOCALE, isAppLocale } from '@/i18n/routing'

export default getRequestConfig(async ({ requestLocale }) => {
  const requestedLocale = await requestLocale
  const locale =
    requestedLocale && isAppLocale(requestedLocale)
      ? requestedLocale
      : DEFAULT_LOCALE

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})
