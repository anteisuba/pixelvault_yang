import type { ReactNode } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'

import { LEGAL_DOCS } from '@/constants/legal'

import { LegalPage } from './LegalPage'

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

function loadMessages(locale: string): Record<string, unknown> {
  const raw = readFileSync(
    join(process.cwd(), 'src', 'messages', `${locale}.json`),
    'utf-8',
  )
  return JSON.parse(raw) as Record<string, unknown>
}

const DASH = /[—–]/

describe('LegalPage', () => {
  it('renders the privacy doc title, intro, and section headings', () => {
    const messages = loadMessages('en')
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <LegalPage doc="privacy" />
      </NextIntlClientProvider>,
    )

    expect(
      screen.getByRole('heading', { level: 1, name: 'Privacy Policy' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/bring-your-own-key AI gallery/),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: 'Your API keys' }),
    ).toBeInTheDocument()
    // back-home link present for a clear way out
    expect(screen.getByRole('link', { name: /Back home/ })).toBeInTheDocument()
  })

  it('renders the terms doc for every configured locale', () => {
    for (const locale of ['en', 'zh', 'ja'] as const) {
      const messages = loadMessages(locale)
      const { unmount } = render(
        <NextIntlClientProvider locale={locale} messages={messages}>
          <LegalPage doc="terms" />
        </NextIntlClientProvider>,
      )
      // level-1 title renders (proves sections array + intro resolved too)
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
      unmount()
    }
  })

  it('keeps Legal copy free of em/en dashes in all locales (anti-slop)', () => {
    for (const locale of ['en', 'zh', 'ja']) {
      const legal = JSON.stringify(loadMessages(locale).Legal)
      expect(DASH.test(legal), `${locale} Legal contains a banned dash`).toBe(
        false,
      )
    }
  })

  it('exposes exactly the privacy and terms docs', () => {
    expect([...LEGAL_DOCS]).toEqual(['privacy', 'terms'])
  })
})
