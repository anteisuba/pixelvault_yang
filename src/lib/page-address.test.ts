import { afterEach, describe, expect, it, vi } from 'vitest'

import { ROUTES, creatorProfilePath } from '@/constants/routes'

import { localeUrl, pageAddress } from './page-address'

function withOrigin(origin: string) {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', origin)
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('localeUrl', () => {
  it('keeps the homepage free of a trailing segment', () => {
    withOrigin('https://pixelvault.app')
    expect(localeUrl('zh', ROUTES.HOME)).toBe('https://pixelvault.app/zh')
  })

  it('hangs a page path off the locale prefix', () => {
    withOrigin('https://pixelvault.app')
    expect(localeUrl('ja', ROUTES.GALLERY)).toBe(
      'https://pixelvault.app/ja/gallery',
    )
  })
})

describe('pageAddress', () => {
  it('points canonical and og:url at the page itself, not the homepage', () => {
    withOrigin('https://pixelvault.app')
    const address = pageAddress({ locale: 'zh', path: ROUTES.GALLERY })

    expect(address.alternates.canonical).toBe(
      'https://pixelvault.app/zh/gallery',
    )
    expect(address.openGraph.url).toBe('https://pixelvault.app/zh/gallery')
  })

  it('lists the same page in every locale as hreflang, with en as x-default', () => {
    withOrigin('https://pixelvault.app')
    const address = pageAddress({ locale: 'zh', path: ROUTES.GALLERY })

    expect(address.alternates.languages).toEqual({
      'x-default': 'https://pixelvault.app/en/gallery',
      en: 'https://pixelvault.app/en/gallery',
      ja: 'https://pixelvault.app/ja/gallery',
      zh: 'https://pixelvault.app/zh/gallery',
    })
  })

  it('carries siteName and locale so a page writing openGraph does not drop them', () => {
    withOrigin('https://pixelvault.app')
    const address = pageAddress({ locale: 'ja', path: ROUTES.GALLERY })

    expect(address.openGraph.siteName).toBe('PixelVault')
    expect(address.openGraph.locale).toBe('ja')
  })

  it('sends both canonical and og:url to the real address when the page is a shortcut', () => {
    withOrigin('https://pixelvault.app')
    const address = pageAddress({
      locale: 'zh',
      path: ROUTES.MY_PROFILE,
      canonicalPath: creatorProfilePath('yining120224'),
    })

    expect(address.alternates.canonical).toBe(
      'https://pixelvault.app/zh/u/yining120224',
    )
    expect(address.openGraph.url).toBe(
      'https://pixelvault.app/zh/u/yining120224',
    )
  })

  it('drops hreflang on a shortcut — the canonical already names the original', () => {
    withOrigin('https://pixelvault.app')
    const address = pageAddress({
      locale: 'zh',
      path: ROUTES.MY_PROFILE,
      canonicalPath: creatorProfilePath('yining120224'),
    })

    expect(address.alternates.languages).toBeUndefined()
  })
})
