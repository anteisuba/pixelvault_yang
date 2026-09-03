import type { ReactNode } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CONSENT_STORAGE_KEY } from '@/constants/privacy-consent'
import { ROUTES } from '@/constants/routes'

import { PrivacyConsentBanner } from './PrivacyConsentBanner'

const enableSessionReplay = vi.hoisted(() => vi.fn())

vi.mock('@/lib/sentry-session-replay', () => ({
  enableSessionReplay,
}))

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

const messages = JSON.parse(
  readFileSync(join(process.cwd(), 'src', 'messages', 'en.json'), 'utf-8'),
) as Record<string, unknown>

function renderBanner() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PrivacyConsentBanner />
    </NextIntlClientProvider>,
  )
}

function banner() {
  return screen.queryByRole('region', { name: 'Privacy notice' })
}

describe('PrivacyConsentBanner', () => {
  beforeEach(() => {
    localStorage.clear()
    enableSessionReplay.mockClear()
  })

  it('asks while no decision is on record, and links to the privacy policy', () => {
    renderBanner()

    expect(banner()).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Privacy Policy' }),
    ).toHaveAttribute('href', ROUTES.PRIVACY)
    expect(enableSessionReplay).not.toHaveBeenCalled()
  })

  it('accepting stores the decision, hides the banner and enables replay', () => {
    renderBanner()

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))

    expect(banner()).not.toBeInTheDocument()
    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBe('accepted')
    expect(enableSessionReplay).toHaveBeenCalledTimes(1)
  })

  it('rejecting stores the decision, hides the banner and leaves replay off', () => {
    renderBanner()

    fireEvent.click(screen.getByRole('button', { name: 'Essential only' }))

    expect(banner()).not.toBeInTheDocument()
    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBe('rejected')
    expect(enableSessionReplay).not.toHaveBeenCalled()
  })

  it('stays hidden for a returning visitor, but re-enables replay for one who accepted', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'accepted')
    renderBanner()

    expect(banner()).not.toBeInTheDocument()
    expect(enableSessionReplay).toHaveBeenCalledTimes(1)
  })

  it('stays hidden and silent for a returning visitor who rejected', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'rejected')
    renderBanner()

    expect(banner()).not.toBeInTheDocument()
    expect(enableSessionReplay).not.toHaveBeenCalled()
  })
})
