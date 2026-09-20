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

/**
 * 首页顶栏**不承载应用壳的 chrome**（owner 2026-09-20）：没有齿轮、没有头像，
 * 右端有且只有一颗入口按钮，文案随登录态变。
 */
describe('HomeV4Topbar 浮岛胶囊：一颗门', () => {
  it('已登录：唯一的按钮是「进入工作台」', () => {
    mockAuth.isLoaded = true
    mockAuth.isSignedIn = true
    const { container } = render(<HomeV4Topbar />)

    const buttons = container.querySelectorAll('header button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]?.textContent).toBe('Auth:enterStudio')
  })

  it('未登录：唯一的按钮是「登录」', () => {
    mockAuth.isLoaded = true
    mockAuth.isSignedIn = false
    const { container } = render(<HomeV4Topbar />)

    const buttons = container.querySelectorAll('header button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]?.textContent).toBe('Auth:open')
  })

  it('两态都没有设置入口、没有头像', () => {
    for (const signedIn of [true, false]) {
      mockAuth.isLoaded = true
      mockAuth.isSignedIn = signedIn
      const { container, unmount } = render(<HomeV4Topbar />)

      expect(screen.queryByLabelText('Navbar:settings')).toBeNull()
      expect(screen.queryByLabelText('Navbar:viewProfile')).toBeNull()
      expect(container.querySelector('.settings')).toBeNull()
      expect(container.querySelector('.avatar')).toBeNull()
      unmount()
    }
  })
})
