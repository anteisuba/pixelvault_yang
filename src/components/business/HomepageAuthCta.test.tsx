import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { HomepageAuthCta } from './HomepageAuthCta'

const { useAuthMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
}))

vi.mock('@clerk/nextjs', () => ({
  useAuth: useAuthMock,
}))

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => {
    const map: Record<string, string> = {
      'Homepage.actions.signedOutPrimary': 'Sign up free',
      'Homepage.actions.signedOutUtility': 'Log in',
      'Navbar.links.studio': 'Studio',
    }
    return map[`${namespace}.${key}`] ?? key
  },
}))

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

beforeEach(() => {
  vi.clearAllMocks()
  useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: false })
})

describe('HomepageAuthCta', () => {
  it('renders distinct sign-in and sign-up links when signed out', () => {
    render(<HomepageAuthCta />)

    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute(
      'href',
      expect.stringContaining('sign-in'),
    )
    expect(screen.getByRole('link', { name: 'Sign up free' })).toHaveAttribute(
      'href',
      expect.stringContaining('sign-up'),
    )
  })

  it('renders a studio link instead of auth links when signed in', () => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true })

    render(<HomepageAuthCta />)

    expect(screen.getByRole('link', { name: 'Studio' })).toHaveAttribute(
      'href',
      expect.stringContaining('studio'),
    )
    expect(
      screen.queryByRole('link', { name: 'Sign up free' }),
    ).not.toBeInTheDocument()
  })

  it('keeps auth links unavailable until Clerk state is loaded', () => {
    useAuthMock.mockReturnValue({ isLoaded: false, isSignedIn: false })

    render(<HomepageAuthCta />)

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
