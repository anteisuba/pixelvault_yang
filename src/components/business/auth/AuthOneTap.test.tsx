import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { markAuthArrival } from '@/lib/auth-marks'

import { AuthArrivalToast } from './AuthArrivalToast'
import { AuthOneTap } from './AuthOneTap'

const auth = vi.hoisted(() => ({ isLoaded: true, isSignedIn: false }))
const toastSuccess = vi.hoisted(() => vi.fn())

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => auth,
  GoogleOneTap: () => <div data-testid="one-tap" />,
}))

vi.mock('sonner', () => ({ toast: { success: toastSuccess } }))

vi.mock('next-intl', () => ({
  useLocale: () => 'zh',
  useTranslations: (ns: string) => (key: string) => `${ns}:${key}`,
}))

vi.mock('@/i18n/navigation', () => ({
  getPathname: ({ locale, href }: { locale: string; href: string }) =>
    `/${locale}${href}`,
}))

afterEach(() => {
  window.sessionStorage.clear()
  toastSuccess.mockClear()
  auth.isLoaded = true
  auth.isSignedIn = false
})

describe('AuthOneTap — Google 一键框', () => {
  it('shows for a signed-out visitor, once per visit', () => {
    const first = render(<AuthOneTap />)
    expect(screen.getByTestId('one-tap')).toBeInTheDocument()
    first.unmount()

    render(<AuthOneTap />)
    expect(screen.queryByTestId('one-tap')).toBeNull()
  })

  it('never shows to a signed-in visitor, or before Clerk knows', () => {
    auth.isSignedIn = true
    const signedIn = render(<AuthOneTap />)
    expect(screen.queryByTestId('one-tap')).toBeNull()
    signedIn.unmount()

    auth.isLoaded = false
    auth.isSignedIn = false
    render(<AuthOneTap />)
    expect(screen.queryByTestId('one-tap')).toBeNull()
  })
})

describe('AuthArrivalToast — 底部黑条「已登录」', () => {
  it('fires once after a sign-in that started in this tab', () => {
    auth.isSignedIn = true
    markAuthArrival()
    const first = render(<AuthArrivalToast />)
    expect(toastSuccess).toHaveBeenCalledWith('Toasts:signedIn')
    first.unmount()

    render(<AuthArrivalToast />)
    expect(toastSuccess).toHaveBeenCalledTimes(1)
  })

  it('stays quiet for an ordinary page load', () => {
    auth.isSignedIn = true
    render(<AuthArrivalToast />)
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it('keeps the mark while still signed out (cancelled OAuth)', () => {
    markAuthArrival()
    render(<AuthArrivalToast />)
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem('pv-auth-arrival')).not.toBeNull()
  })
})
