import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { HomeV4Topbar } from './HomeV4Topbar'

const mockAuth = vi.hoisted(() => ({ isLoaded: true, isSignedIn: true }))

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => mockAuth,
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'zh',
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}:${key}` : key,
}))

vi.mock('@/hooks/use-my-profile', () => ({
  useMyProfile: () => ({
    profile: { username: 'fulina', displayName: 'fulina', avatarUrl: null },
  }),
}))

vi.mock('@/components/business/auth/AuthDialog', () => ({
  useAuthDialog: () => ({ openAuth: vi.fn() }),
}))

vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn() }),
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: React.ReactNode
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

describe('HomeV4Topbar 浮岛胶囊两态（D3 ④）', () => {
  it('已登录：右端是齿轮 + 头像，没有「登录」', () => {
    mockAuth.isLoaded = true
    mockAuth.isSignedIn = true
    render(<HomeV4Topbar />)

    expect(screen.getByLabelText('Navbar:settings').getAttribute('href')).toBe(
      '/settings',
    )
    expect(
      screen.getByLabelText('Navbar:viewProfile').getAttribute('href'),
    ).toBe('/u/fulina')
    expect(screen.queryByRole('button', { name: 'Auth:open' })).toBeNull()
  })

  it('未登录：右端只有「登录」', () => {
    mockAuth.isLoaded = true
    mockAuth.isSignedIn = false
    render(<HomeV4Topbar />)

    expect(screen.getByRole('button', { name: 'Auth:open' })).toBeTruthy()
    expect(screen.queryByLabelText('Navbar:settings')).toBeNull()
    expect(screen.queryByLabelText('Navbar:viewProfile')).toBeNull()
  })
})
