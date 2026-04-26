import type { ReactNode } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { HomepageHero } from './HomepageHero'

const EXPECTED_HERO_REPEL_TEXT = {
  en: 'Generate images with 38+ AI models. Keep every creation, forever.',
  zh: '用 38+ AI 模型生成图片，永久归档每一张创作。',
  ja: '38以上のAIモデルで画像を生成。すべての作品を永久アーカイブ。',
} as const

type Locale = keyof typeof EXPECTED_HERO_REPEL_TEXT

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    if (key === 'heroRepelText') return EXPECTED_HERO_REPEL_TEXT.en
    return key
  },
}))

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}))

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

vi.mock('@/components/ui/text-repel', () => ({
  TextRepel: ({ text }: { text: string }) => <p>{text}</p>,
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
  it('renders only the Studio and Gallery CTA links', () => {
    render(
      <HomepageHero
        primaryActionHref="/studio"
        primaryActionLabel="Open studio"
        galleryActionHref="/gallery"
        galleryActionLabel="Browse gallery"
      />,
    )

    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(2)
    expect(
      screen.getByRole('link', { name: 'Open studio' }),
    ).toHaveAttribute('href', '/studio')
    expect(
      screen.getByRole('link', { name: 'Browse gallery' }),
    ).toHaveAttribute('href', '/gallery')
    expect(screen.queryByRole('link', { name: 'See models' })).toBeNull()
  })

  it('keeps Homepage.heroRepelText present in every locale', () => {
    for (const locale of Object.keys(EXPECTED_HERO_REPEL_TEXT) as Locale[]) {
      const homepage = loadMessages(locale).Homepage
      expect(isRecord(homepage)).toBe(true)
      if (!isRecord(homepage)) {
        throw new Error(`Homepage namespace missing in ${locale}.json`)
      }

      expect(homepage.heroRepelText).toBe(EXPECTED_HERO_REPEL_TEXT[locale])
    }
  })
})
