import type { ReactNode } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { HomepageHero } from './HomepageHero'

const EXPECTED_HERO = {
  en: {
    eyebrow: '22 image models',
    title: 'Text to Image',
  },
  zh: {
    eyebrow: '22 个图像模型',
    title: '文生图',
  },
  ja: {
    eyebrow: '22 の画像モデル',
    title: 'Text to Image',
  },
} as const

type Locale = keyof typeof EXPECTED_HERO

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      eyebrow: EXPECTED_HERO.en.eyebrow,
      title: EXPECTED_HERO.en.title,
      subtitle: 'Run prompts across 22 image models.',
    }
    return map[key] ?? key
  },
}))

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

// Hero now delegates the auth-aware CTA to HomepageAuthCta. Stub it to keep
// this test focused on Hero's own rendering — CTA behaviour is covered in
// HomepageAuthCta.test.tsx.
vi.mock('./HomepageAuthCta', () => ({
  HomepageAuthCta: ({ variant }: { variant: string }) => (
    <button data-testid={`auth-cta-${variant}`}>cta</button>
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
  it('renders eyebrow, title and subtitle copy', () => {
    render(<HomepageHero />)

    expect(screen.getByText(EXPECTED_HERO.en.eyebrow)).toBeInTheDocument()
    expect(screen.getByText(EXPECTED_HERO.en.title)).toBeInTheDocument()
  })

  it('mounts the hero-variant auth CTA placeholder', () => {
    render(<HomepageHero />)
    expect(screen.getByTestId('auth-cta-hero')).toBeInTheDocument()
  })

  it('keeps Homepage.hero.eyebrow and title present in every locale', () => {
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

      expect(hero.eyebrow).toBe(EXPECTED_HERO[locale].eyebrow)
      expect(hero.title).toBe(EXPECTED_HERO[locale].title)
      expect(typeof hero.subtitle).toBe('string')
      expect((hero.subtitle as string).length).toBeGreaterThan(20)
    }
  })
})
