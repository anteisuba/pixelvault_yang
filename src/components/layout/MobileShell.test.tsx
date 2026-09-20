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

describe('MobileShell 入口收口（D11 ④）', () => {
  it('顶栏胶囊右端头像是账号菜单触发器，⛔ 不再是个人主页的快捷方式', () => {
    render(<MobileShell />)

    const trigger = screen.getByLabelText('Navbar:account')
    expect(trigger.tagName).toBe('BUTTON')
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
    expect(trigger.getAttribute('href')).toBeNull()
  })

  it('顶栏那颗头像也带 motion-reduce 降级', () => {
    render(<MobileShell />)

    const trigger = screen.getByLabelText('Navbar:account')
    expect(trigger.className).toContain('transition-colors')
    expect(trigger.className).toContain('motion-reduce:transition-none')
  })

  it('抽屉「去处」段里的「我的主页」也是静态 /u/me，与桌面同一条清单', () => {
    render(<MobileShell />)
    openDrawer()

    const dialog = screen.getByRole('dialog')
    const item = dialog.querySelector('a[href="/u/me"]')
    expect(item?.textContent).toContain('Navbar.links.profile')
    expect(dialog.querySelector('a[href="/u/fulina"]')).toBeNull()
  })

  it('抽屉里不再有「我」区，也不再有最底那一行「设置」—— 都进了账号菜单', () => {
    render(<MobileShell />)
    openDrawer()

    const dialog = screen.getByRole('dialog')
    expect(dialog.querySelector('a[href^="/settings"]')).toBeNull()
    expect(screen.queryByText('Navbar:viewProfile')).toBeNull()
  })

  it('抽屉里没有 key 入口、没有额度读数、没有退出登录', () => {
    render(<MobileShell />)
    openDrawer()

    expect(screen.queryByText('Navbar:apiKeys')).toBeNull()
    expect(screen.queryByText('Navbar:signOut')).toBeNull()
  })
})
