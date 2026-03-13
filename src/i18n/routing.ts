import { defineRouting } from 'next-intl/routing'

export const LOCALES = ['en', 'ja', 'zh'] as const
export const CJK_LOCALES = ['ja', 'zh'] as const

export type AppLocale = (typeof LOCALES)[number]
export type CjkLocale = (typeof CJK_LOCALES)[number]

export const DEFAULT_LOCALE: AppLocale = 'en'

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'always',
})

export function isAppLocale(locale: string): locale is AppLocale {
  return LOCALES.includes(locale as AppLocale)
}

export function isCjkLocale(locale: string): locale is CjkLocale {
  return CJK_LOCALES.includes(locale as CjkLocale)
}
