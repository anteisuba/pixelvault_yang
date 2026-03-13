import { CLERK_LOCALIZATIONS } from '@/i18n/clerk'
import { LOCALES } from '@/i18n/routing'

describe('CLERK_LOCALIZATIONS', () => {
  it('provides a localization bundle for every supported locale', () => {
    expect(Object.keys(CLERK_LOCALIZATIONS)).toEqual(LOCALES)

    LOCALES.forEach((locale) => {
      expect(CLERK_LOCALIZATIONS[locale]).toBeTruthy()
    })
  })
})
