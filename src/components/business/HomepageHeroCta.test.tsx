import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { HomepageHeroCta } from './HomepageHeroCta'
import { HOMEPAGE_ROUTES } from '@/constants/homepage'

const authState = { isLoaded: true, isSignedIn: false }
const openAuth = vi.fn()

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => authState,
}))

vi.mock('./AuthModalProvider', () => ({
  useAuthModal: () => ({
    openAuth,
    closeAuth: vi.fn(),
  }),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    key === 'startCreating' ? 'Start creating' : key,
}))

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

describe('HomepageHeroCta', () => {
  it('opens sign-up modal for signed-out visitors', () => {
    authState.isLoaded = true
    authState.isSignedIn = false
    render(<HomepageHeroCta />)
    expect(
      screen.getByRole('button', { name: 'Start creating' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('points signed-in visitors to Studio', () => {
    authState.isLoaded = true
    authState.isSignedIn = true
    render(<HomepageHeroCta />)
    expect(
      screen.getByRole('link', { name: 'Start creating' }),
    ).toHaveAttribute('href', HOMEPAGE_ROUTES.studio)
  })

  it('renders a placeholder (no control) while auth is loading', () => {
    authState.isLoaded = false
    authState.isSignedIn = false
    render(<HomepageHeroCta />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
