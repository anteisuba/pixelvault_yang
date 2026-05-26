import type { ReactNode } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { HomepageHero } from './HomepageHero'

const EXPECTED_HERO = {
  en: {
    title: 'ANTEI image, video, and voice creation platform',
    brand: 'ANTEI',
    mediums: 'Image, video, voice',
    platform: 'Creation platform',
  },
  zh: {
    title: 'ANTEI 图像、视频、声音创作平台',
    brand: 'ANTEI',
    mediums: '图像、视频、声音',
    platform: '创作平台',
  },
  ja: {
    title: 'ANTEI 画像・動画・音声 制作プラットフォーム',
    brand: 'ANTEI',
    mediums: '画像・動画・音声',
    platform: '制作プラットフォーム',
  },
} as const

type Locale = keyof typeof EXPECTED_HERO

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      title: EXPECTED_HERO.en.title,
      brand: EXPECTED_HERO.en.brand,
      mediums: EXPECTED_HERO.en.mediums,
      platform: EXPECTED_HERO.en.platform,
      gallerySecondary: 'Browse gallery',
    }
    return map[key] ?? key
  },
}))

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function loadMessages(locale: Locale): Record<string, unknown> {
  const raw = readFileSync(
    join(process.cwd(), 'src', 'messages', `${locale}.json`),
    'utf-8',
  )
  const parsed: unknown = JSON.parse(raw)
  if (!isRecord(parsed)) {
    throw new Error(`${locale}.json did not parse to an object`)
  }
  return parsed
}

describe('HomepageHero', () => {
  it('renders title and gallery CTA without eyebrow or subtitle copy', () => {
    render(<HomepageHero />)

    expect(
      screen.getByRole('heading', { name: EXPECTED_HERO.en.title }),
    ).toBeInTheDocument()
    expect(screen.getByText(EXPECTED_HERO.en.brand)).toBeInTheDocument()
    expect(screen.getByText(EXPECTED_HERO.en.mediums)).toBeInTheDocument()
    expect(screen.getByText(EXPECTED_HERO.en.platform)).toBeInTheDocument()
    expect(screen.queryByText(/API key/i)).not.toBeInTheDocument()
    expect(
      screen.queryByText(/save every result|保存每次结果/i),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Browse gallery' }),
    ).toHaveAttribute('href', expect.stringContaining('gallery'))
  })

  it('keeps Homepage.hero title present in every locale', () => {
    for (const locale of Object.keys(EXPECTED_HERO) as Locale[]) {
      const homepage = loadMessages(locale).Homepage
      expect(isRecord(homepage)).toBe(true)
      if (!isRecord(homepage)) {
        throw new Error(`Homepage namespace missing in ${locale}.json`)
      }

      const hero = (homepage as Record<string, unknown>).hero
      expect(isRecord(hero)).toBe(true)
      if (!isRecord(hero)) {
        throw new Error(`Homepage.hero missing in ${locale}.json`)
      }

      expect('eyebrow' in hero).toBe(false)
      expect('subtitle' in hero).toBe(false)
      expect(hero.title).toBe(EXPECTED_HERO[locale].title)
      expect(hero.brand).toBe(EXPECTED_HERO[locale].brand)
      expect(hero.mediums).toBe(EXPECTED_HERO[locale].mediums)
      expect(hero.platform).toBe(EXPECTED_HERO[locale].platform)
    }
  })
})
