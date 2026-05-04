import type { ReactNode } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { HomepageHero } from './HomepageHero'

const EXPECTED_HERO = {
  en: {
    title: 'Create with any AI model',
    subtitle: 'Keep everything forever',
    primaryCta: 'Start Creating',
    secondaryCta: 'Browse Gallery',
  },
  zh: {
    title: '用任意 AI 模型创作',
    subtitle: '永久保存每一张作品',
    primaryCta: '开始创作',
    secondaryCta: '浏览画廊',
  },
  ja: {
    title: 'あらゆるAIモデルで創作',
    subtitle: 'すべての作品を永久保存',
    primaryCta: '創作を始める',
    secondaryCta: 'ギャラリーを見る',
  },
} as const

type Locale = keyof typeof EXPECTED_HERO

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      title: EXPECTED_HERO.en.title,
      subtitle: EXPECTED_HERO.en.subtitle,
      primaryCta: EXPECTED_HERO.en.primaryCta,
      secondaryCta: EXPECTED_HERO.en.secondaryCta,
    }
    return map[key] ?? key
  },
}))

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

vi.mock('@/components/ui/interactive-hover-button', () => ({
  InteractiveHoverButton: ({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  ),
}))

vi.mock('@/components/ui/shimmer-button', () => ({
  ShimmerButton: ({ children }: { children: ReactNode }) => (
    <span>{children}</span>
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
  it('uses the signed-out primary CTA href passed by the shell', () => {
    render(
      <HomepageHero
        primaryActionHref="/sign-up"
        primaryActionLabel={EXPECTED_HERO.en.primaryCta}
        galleryActionHref="/gallery"
        galleryActionLabel={EXPECTED_HERO.en.secondaryCta}
      />,
    )

    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(2)
    expect(
      screen.getByRole('link', { name: EXPECTED_HERO.en.primaryCta }),
    ).toHaveAttribute('href', '/sign-up')
    expect(
      screen.getByRole('link', { name: EXPECTED_HERO.en.secondaryCta }),
    ).toHaveAttribute('href', '/gallery')
  })

  it('uses the signed-in primary CTA href passed by the shell', () => {
    render(
      <HomepageHero
        primaryActionHref="/studio"
        primaryActionLabel="Open studio"
        galleryActionHref="/gallery"
        galleryActionLabel={EXPECTED_HERO.en.secondaryCta}
      />,
    )

    expect(screen.getByRole('link', { name: 'Open studio' })).toHaveAttribute(
      'href',
      '/studio',
    )
  })

  it('keeps Homepage.hero keys present in every locale', () => {
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

      expect(hero.title).toBe(EXPECTED_HERO[locale].title)
      expect(hero.subtitle).toBe(EXPECTED_HERO[locale].subtitle)
      expect(hero.primaryCta).toBe(EXPECTED_HERO[locale].primaryCta)
      expect(hero.secondaryCta).toBe(EXPECTED_HERO[locale].secondaryCta)
    }
  })
})
