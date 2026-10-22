import { getRequestConfig } from 'next-intl/server'

import { DEFAULT_LOCALE, isAppLocale } from '@/i18n/routing'
import { MESSAGES } from '@/messages'

export default getRequestConfig(async ({ requestLocale }) => {
  const requestedLocale = await requestLocale
  const locale =
    requestedLocale && isAppLocale(requestedLocale)
      ? requestedLocale
      : DEFAULT_LOCALE

  return {
    locale,
    messages: MESSAGES[locale],
  }
})
