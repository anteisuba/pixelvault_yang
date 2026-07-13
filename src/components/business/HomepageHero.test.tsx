import type { ReactNode } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { HomepageHero } from './HomepageHero'

const EXPECTED_HERO = {
  en: {
    title: 'Generate across every model, keep every result',
    headline: 'Generate across every model',
    subline: 'keep every result',
  },
  zh: {
    title: '用每一个模型生成，保留每一次结果',
    headline: '用每一个模型生成',
    subline: '保留每一次结果',
  },
  ja: {
    title: 'あらゆるモデルで生成し、すべての結果を保存',
    headline: 'あらゆるモデルで生成',
    subline: 'すべての結果を保存',
  },
} as const

type Locale = keyof typeof EXPECTED_HERO

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      title: EXPECTED_HERO.en.title,
      headline: EXPECTED_HERO.en.headline,
      subline: EXPECTED_HERO.en.subline,
      startCreating: 'Start creating',
      gallerySecondary: 'Browse gallery',
    }
    return map[key] ?? key
  },
}))

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false }),
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
  it('renders outcome headline, subline, primary and gallery CTAs', () => {
    render(<HomepageHero />)

    expect(
      screen.getByRole('heading', { name: EXPECTED_HERO.en.title }),
    ).toBeInTheDocument()
    expect(screen.getByText(EXPECTED_HERO.en.headline)).toBeInTheDocument()
    expect(screen.getByText(EXPECTED_HERO.en.subline)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Start creating' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Browse gallery' }),
    ).toHaveAttribute('href', expect.stringContaining('gallery'))
  })

  it('keeps Homepage.hero headline/subline in every locale, without legacy keys', () => {
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

      expect('brand' in hero).toBe(false)
      expect('mediums' in hero).toBe(false)
      expect('platform' in hero).toBe(false)
      expect(hero.title).toBe(EXPECTED_HERO[locale].title)
      expect(hero.headline).toBe(EXPECTED_HERO[locale].headline)
      expect(hero.subline).toBe(EXPECTED_HERO[locale].subline)
    }
  })
})
