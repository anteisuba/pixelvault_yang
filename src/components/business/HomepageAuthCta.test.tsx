import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { HomepageAuthCta } from './HomepageAuthCta'

const { mockUseUser } = vi.hoisted(() => ({ mockUseUser: vi.fn() }))

vi.mock('@clerk/nextjs', () => ({
  useUser: mockUseUser,
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      'actions.signedInPrimary': 'Open Studio',
      'actions.signedOutPrimary': 'Get Started',
      'actions.signedInUtility': 'Open Studio',
      'actions.signedOutUtility': 'Sign In',
    }
    return map[key] ?? key
  },
}))

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

beforeEach(() => {
  mockUseUser.mockReset()
})

describe('HomepageAuthCta', () => {
  it('renders signed-out hero CTA before Clerk loads', () => {
    mockUseUser.mockReturnValue({ isLoaded: false, isSignedIn: undefined })
    render(<HomepageAuthCta variant="hero" />)

    const link = screen.getByRole('link', { name: 'Get Started' })
    expect(link).toHaveAttribute('href', expect.stringContaining('sign-up'))
  })

  it('renders signed-in hero CTA after Clerk loads with a session', () => {
    mockUseUser.mockReturnValue({ isLoaded: true, isSignedIn: true })
    render(<HomepageAuthCta variant="hero" />)

    const link = screen.getByRole('link', { name: 'Open Studio' })
    expect(link).toHaveAttribute('href', expect.stringContaining('studio'))
  })

  it('renders sign-in href on nav-utility variant when signed out', () => {
    mockUseUser.mockReturnValue({ isLoaded: true, isSignedIn: false })
    render(<HomepageAuthCta variant="nav-utility" />)

    const link = screen.getByRole('link', { name: 'Sign In' })
    expect(link).toHaveAttribute('href', expect.stringContaining('sign-in'))
  })

  it('renders studio href on nav-utility variant when signed in', () => {
    mockUseUser.mockReturnValue({ isLoaded: true, isSignedIn: true })
    render(<HomepageAuthCta variant="nav-utility" />)

    const link = screen.getByRole('link', { name: 'Open Studio' })
    expect(link).toHaveAttribute('href', expect.stringContaining('studio'))
  })
})
