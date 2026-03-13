import { CJK_LOCALES, DEFAULT_LOCALE, isAppLocale, isCjkLocale, LOCALES } from '@/i18n/routing'

describe('routing', () => {
  it('keeps English as the default locale', () => {
    expect(DEFAULT_LOCALE).toBe('en')
  })

  it('recognizes supported locales', () => {
    expect(LOCALES.every((locale) => isAppLocale(locale))).toBe(true)
    expect(isAppLocale('fr')).toBe(false)
  })

  it('recognizes CJK locales for typography adjustments', () => {
    expect(CJK_LOCALES).toEqual(['ja', 'zh'])
    expect(isCjkLocale('ja')).toBe(true)
    expect(isCjkLocale('zh')).toBe(true)
    expect(isCjkLocale('en')).toBe(false)
  })
})
