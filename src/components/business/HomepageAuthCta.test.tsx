import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { HomepageAuthCta } from './HomepageAuthCta'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      'actions.signedOutPrimary': 'Sign up',
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
  vi.clearAllMocks()
})

describe('HomepageAuthCta', () => {
  it('renders sign-in href on nav-utility variant when signed out', () => {
    render(<HomepageAuthCta variant="nav-utility" />)

    const link = screen.getByRole('link', { name: 'Sign In' })
    expect(link).toHaveAttribute('href', expect.stringContaining('sign-in'))
  })

  it('keeps sign-in href on nav-utility variant without auth-state swapping', () => {
    render(<HomepageAuthCta variant="nav-utility" />)

    const link = screen.getByRole('link', { name: 'Sign In' })
    expect(link).toHaveAttribute('href', expect.stringContaining('sign-in'))
  })

  it('renders sign-up href on nav-register variant when signed out', () => {
    render(<HomepageAuthCta variant="nav-register" />)

    const link = screen.getByRole('link', { name: 'Sign up' })
    expect(link).toHaveAttribute('href', expect.stringContaining('sign-up'))
  })

  it('keeps sign-up href on nav-register variant without auth-state swapping', () => {
    render(<HomepageAuthCta variant="nav-register" />)

    const link = screen.getByRole('link', { name: 'Sign up' })
    expect(link).toHaveAttribute('href', expect.stringContaining('sign-up'))
  })
})
