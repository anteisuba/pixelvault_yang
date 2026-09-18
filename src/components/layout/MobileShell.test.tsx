import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MobileShell } from './MobileShell'

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}:${key}` : key,
}))

vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ isLoaded: true }),
  SignedIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignedOut: () => null,
}))

vi.mock('@/hooks/use-my-profile', () => ({
  useMyProfile: () => ({
    profile: { username: 'fulina', displayName: 'fulina', avatarUrl: null },
  }),
}))

vi.mock('@/hooks/use-has-hydrated', () => ({ useHasHydrated: () => true }))

vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/image',
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

function openDrawer() {
  const trigger = document.querySelector('[aria-haspopup="dialog"]')
  if (!trigger) throw new Error('drawer trigger missing')
  fireEvent.click(trigger)
}

describe('MobileShell 入口收口（D3 ④）', () => {
  it('顶栏胶囊右端头像去个人主页', () => {
    render(<MobileShell />)

    expect(
      screen.getByLabelText('Navbar:viewProfile').getAttribute('href'),
    ).toBe('/u/fulina')
  })

  it('抽屉最底一行「设置」带上来处进 /settings', () => {
    render(<MobileShell />)
    openDrawer()

    const settings = screen.getByText('Navbar:settings').closest('a')
    expect(settings?.getAttribute('href')).toBe(
      '/settings?from=%2Fstudio%2Fimage',
    )
  })

  it('抽屉顶部「我」区也通向个人主页', () => {
    render(<MobileShell />)
    openDrawer()

    const dialog = screen.getByRole('dialog')
    const profileLink = dialog.querySelector('a[href="/u/fulina"]')
    expect(profileLink?.textContent).toContain('Navbar:viewProfile')
  })

  it('抽屉里没有 key 入口、没有额度读数、没有退出登录', () => {
    render(<MobileShell />)
    openDrawer()

    expect(screen.queryByText('Navbar:apiKeys')).toBeNull()
    expect(screen.queryByText('Navbar:signOut')).toBeNull()
  })
})
