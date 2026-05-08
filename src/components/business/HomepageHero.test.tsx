import type { ReactNode } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { HomepageHero } from './HomepageHero'

const EXPECTED_HERO = {
  en: {
    title: 'Generate images, video, and voice from text',
    subtitle: 'One studio for AI image, video, audio, and LoRA workflows.',
    primaryCta: 'Start Creating',
    secondaryCta: 'Browse Gallery',
  },
  zh: {
    title: '文本生成图像、视频和语音',
    subtitle: '一个工作台覆盖 AI 图像、视频、语音和 LoRA 训练。',
    primaryCta: '开始创作',
    secondaryCta: '浏览画廊',
  },
  ja: {
    title: 'テキストから画像、動画、音声を生成',
    subtitle: 'AI画像、動画、音声、LoRAワークフローをひとつのスタジオで。',
    primaryCta: '創作を始める',
    secondaryCta: 'ギャラリーを見る',
  },
} as const

type Locale = keyof typeof EXPECTED_HERO

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: Record<string, number>) => {
    const map: Record<string, string> = {
      'hero.badge': `${values?.count ?? 0}+ image models`,
      'hero.title': EXPECTED_HERO.en.title,
      'hero.subtitle': EXPECTED_HERO.en.subtitle,
      'hero.description': 'Generate across media and keep the context.',
      'hero.primaryCta': EXPECTED_HERO.en.primaryCta,
      'hero.secondaryCta': EXPECTED_HERO.en.secondaryCta,
      'hero.stats.models': 'Available models',
      'hero.stats.providers': 'Providers',
      'hero.stats.workflows': 'Creation modes',
    }
    return map[key] ?? key
  },
}))

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

vi.mock('@/i18n/routing', () => ({
  isCjkLocale: () => false,
}))

vi.mock('./HomepageHeroVisual', () => ({
  HomepageHeroVisual: () => (
    <div data-testid="homepage-hero-visual">hero visual</div>
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
