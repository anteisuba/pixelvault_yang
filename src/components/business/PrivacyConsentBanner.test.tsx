import type { ReactNode } from 'react'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CONSENT_STORAGE_KEY,
  SENTRY_REPLAY_SESSION_SAMPLE_RATE,
} from '@/constants/privacy-consent'
import { ROUTES } from '@/constants/routes'
import { message, renderWithApp } from '@/test/app-harness'

// 边界：Sentry SDK。录屏真开没开，看「往 Sentry 客户端上加了录屏」这一下。
const sentry = vi.hoisted(() => ({
  addIntegration: vi.fn(),
  options: {} as Record<string, unknown>,
}))
vi.mock('@sentry/nextjs', () => ({
  getClient: () => ({
    getIntegrationByName: () => undefined,
    getOptions: () => sentry.options,
  }),
  addIntegration: sentry.addIntegration,
  replayIntegration: (options: unknown) => ({ name: 'Replay', options }),
}))

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

const T = (key: string) => message(`PrivacyConsent.${key}`, 'en')

/** 每例重新载入：「开录屏」在模块里只开一次（同一页面开过就不再开）。 */
async function renderBanner() {
  const { PrivacyConsentBanner } = await import('./PrivacyConsentBanner')
  return renderWithApp(<PrivacyConsentBanner />, { locale: 'en' })
}

function banner() {
  return screen.queryByRole('region', { name: T('label') })
}

async function replayEnabled() {
  await waitFor(() => expect(sentry.addIntegration).toHaveBeenCalledTimes(1))
  expect(sentry.options.replaysSessionSampleRate).toBe(
    SENTRY_REPLAY_SESSION_SAMPLE_RATE,
  )
}

/** 让「按需载入 Sentry」那几拍跑完，再断言它没开。 */
async function replayStillOff() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(sentry.addIntegration).not.toHaveBeenCalled()
}

describe('PrivacyConsentBanner', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
    sentry.addIntegration.mockClear()
    sentry.options = {}
  })

  it('asks while no decision is on record, and links to the privacy policy', async () => {
    await renderBanner()

    expect(banner()).toBeInTheDocument()
    expect(screen.getByRole('link', { name: T('policyLink') })).toHaveAttribute(
      'href',
      ROUTES.PRIVACY,
    )
    await replayStillOff()
  })

  it('accepting stores the decision, hides the banner and enables replay', async () => {
    await renderBanner()

    fireEvent.click(screen.getByRole('button', { name: T('acceptAction') }))

    expect(banner()).not.toBeInTheDocument()
    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBe('accepted')
    await replayEnabled()
  })

  it('rejecting stores the decision, hides the banner and leaves replay off', async () => {
    await renderBanner()

    fireEvent.click(screen.getByRole('button', { name: T('rejectAction') }))

    expect(banner()).not.toBeInTheDocument()
    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBe('rejected')
    await replayStillOff()
  })

  it('stays hidden for a returning visitor, but re-enables replay for one who accepted', async () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'accepted')
    await renderBanner()

    expect(banner()).not.toBeInTheDocument()
    await replayEnabled()
  })

  it('stays hidden and silent for a returning visitor who rejected', async () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'rejected')
    await renderBanner()

    expect(banner()).not.toBeInTheDocument()
    await replayStillOff()
  })
})
