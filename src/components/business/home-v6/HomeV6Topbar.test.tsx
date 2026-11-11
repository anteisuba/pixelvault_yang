import { fireEvent, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { AuthDialogProvider } from '@/components/business/auth/AuthDialog'
import { message, renderWithApp } from '@/test/app-harness'
import { text } from '@/test/i18n-text'

import { HomeV6Topbar } from './HomeV6Topbar'

// 边界：Clerk（登录态 + 登录窗里那套流程）、路由跳转。登录窗本身是真的。
const mockAuth = vi.hoisted(() => ({ isLoaded: true, isSignedIn: true }))

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => mockAuth,
  useClerk: () => ({
    client: { lastAuthenticationStrategy: null },
    buildAfterSignInUrl: () => '/zh/studio/image',
    buildAfterSignUpUrl: () => '/zh/studio/image',
  }),
  useSignIn: () => ({ isLoaded: true, signIn: {}, setActive: vi.fn() }),
  useSignUp: () => ({ isLoaded: true, signUp: {} }),
  GoogleOneTap: () => null,
}))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn() }),
  getPathname: ({ locale, href }: { locale: string; href: string }) =>
    `/${locale}${href}`,
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

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

function renderTopbar() {
  return renderWithApp(<HomeV6Topbar />, { inner: AuthDialogProvider })
}

/**
 * 首页顶栏**不承载应用壳的 chrome**（owner 2026-09-20）：没有齿轮、没有头像，
 * 右端有且只有一颗入口按钮，文案随登录态变。
 */
describe('HomeV6Topbar 浮岛胶囊：一颗门', () => {
  it('已登录：唯一的按钮是「进入工作台」', () => {
    mockAuth.isLoaded = true
    mockAuth.isSignedIn = true
    const { container } = renderTopbar()

    const buttons = container.querySelectorAll('header button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]?.textContent).toBe(message('Auth.enterStudio'))
  })

  it('未登录：唯一的按钮是「登录」，按下就地开登录窗', async () => {
    mockAuth.isLoaded = true
    mockAuth.isSignedIn = false
    const { container } = renderTopbar()

    const buttons = container.querySelectorAll('header button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]?.textContent).toBe(message('Auth.open'))

    fireEvent.click(buttons[0]!)
    expect(await screen.findByRole('dialog')).toHaveTextContent(
      text('Auth.title', { brand: message('Common.brand') }),
    )
  })

  it('两态都没有设置入口、没有头像', () => {
    for (const signedIn of [true, false]) {
      mockAuth.isLoaded = true
      mockAuth.isSignedIn = signedIn
      const { container, unmount } = renderTopbar()

      expect(screen.queryByLabelText(message('Navbar.settings'))).toBeNull()
      expect(container.querySelector('.settings')).toBeNull()
      expect(container.querySelector('.avatar')).toBeNull()
      unmount()
    }
  })
})
