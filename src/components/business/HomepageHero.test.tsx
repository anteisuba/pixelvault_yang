import type { ReactNode } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { HOMEPAGE_MODEL_COUNTS } from '@/constants/homepage'

import { HomepageHero } from './HomepageHero'

const EXPECTED_HERO = {
  en: {
    eyebrow: '{count} active models. Bring your own API key. Pay as you go.',
    renderedEyebrow: `${HOMEPAGE_MODEL_COUNTS.total} active models. Bring your own API key. Pay as you go.`,
    title: 'Turn ideas into images, footage, and voice.',
  },
  zh: {
    eyebrow: '{count} 个可用模型。自带 API key。按用量付费。',
    renderedEyebrow: `${HOMEPAGE_MODEL_COUNTS.total} 个可用模型。自带 API key。按用量付费。`,
    title: '把想法做成画面、镜头和声音。',
  },
  ja: {
    eyebrow: '{count} 件の有効モデル。BYO API キー。従量課金。',
    renderedEyebrow: `${HOMEPAGE_MODEL_COUNTS.total} 件の有効モデル。BYO API キー。従量課金。`,
    title: 'アイデアを、絵と映像と声に。',
  },
} as const

type Locale = keyof typeof EXPECTED_HERO

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, number>) => {
    const map: Record<string, string> = {
      eyebrow: EXPECTED_HERO.en.eyebrow,
      title: EXPECTED_HERO.en.title,
      subtitle: 'Run prompts across active image, video, and audio models.',
    }
    return (map[key] ?? key).replaceAll(
      '{count}',
      String(values?.count ?? HOMEPAGE_MODEL_COUNTS.total),
    )
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

    expect(
      screen.getByText(EXPECTED_HERO.en.renderedEyebrow),
    ).toBeInTheDocument()
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
