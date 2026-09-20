import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SidebarProvider } from '@/components/ui/sidebar'

import { AppSidebar } from './AppSidebar'

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}:${key}` : key,
}))

vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ isLoaded: true }),
  SignedIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignedOut: () => null,
}))

const mockProfile = vi.hoisted(() => ({
  current: { username: 'fulina', displayName: 'fulina', avatarUrl: null } as {
    username: string
    displayName: string
    avatarUrl: string | null
  } | null,
}))

vi.mock('@/hooks/use-my-profile', () => ({
  useMyProfile: () => ({ profile: mockProfile.current }),
}))

vi.mock('@/hooks/use-has-hydrated', () => ({ useHasHydrated: () => true }))

vi.mock('@/hooks/use-nav-indicator', () => ({
  useNavIndicator: () => ({
    hover: null,
    active: null,
    hoverVisible: false,
    hoverJumped: false,
    onPointerOver: vi.fn(),
    onPointerLeave: vi.fn(),
  }),
}))

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

function renderSidebar() {
  return render(
    <SidebarProvider>
      <AppSidebar />
    </SidebarProvider>,
  )
}

describe('AppSidebar 入口收口（D11 ④）', () => {
  it('顶端不再有头像 —— 只剩品牌与折叠钮', () => {
    mockProfile.current = {
      username: 'fulina',
      displayName: 'fulina',
      avatarUrl: null,
    }
    const { container } = renderSidebar()

    const header = container.querySelector('[data-slot="sidebar-header"]')
    expect(header?.querySelector('img')).toBeNull()
    expect(screen.queryByLabelText('Navbar:viewProfile')).toBeNull()
  })

  it('最底一行是账号入口：一颗真 button，点开菜单，⛔ 不是链接', () => {
    mockProfile.current = {
      username: 'fulina',
      displayName: 'fulina',
      avatarUrl: null,
    }
    const { container } = renderSidebar()

    const trigger = screen.getByLabelText('Navbar:account')
    expect(trigger.tagName).toBe('BUTTON')
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
    // 「设置」那一行收进了菜单，底部不再有第二个常驻入口。
    expect(
      container.querySelector(
        '[data-slot="sidebar-footer"] a[href^="/settings"]',
      ),
    ).toBeNull()
  })

  it('引导锚点跟着搬到账号触发器上，⛔ 不留死锚点', () => {
    mockProfile.current = {
      username: 'fulina',
      displayName: 'fulina',
      avatarUrl: null,
    }
    const { container } = renderSidebar()

    const anchor = container.querySelector('[data-onboarding="apiKey"]')
    expect(anchor).not.toBeNull()
    expect(anchor).toBe(screen.getByLabelText('Navbar:account'))
  })

  it('「我的主页」是「去处」段的一条常规导航项，地址是当前用户的主页', () => {
    mockProfile.current = {
      username: 'fulina',
      displayName: 'fulina',
      avatarUrl: null,
    }
    const { container } = renderSidebar()

    const item = container.querySelector(
      '[data-slot="sidebar-menu-button"][href="/u/fulina"]',
    )
    expect(item?.textContent).toContain('Navbar.links.profile')
  })

  it('username 还没回来时「我的主页」整条不渲染，不给 /u/undefined', () => {
    mockProfile.current = null
    const { container } = renderSidebar()

    expect(screen.queryByText('Navbar.links.profile')).toBeNull()
    expect(container.querySelector('a[href^="/u/"]')).toBeNull()
  })

  it('⛔ 底部不读任何账户数字，也不挂红点 / 角标', () => {
    mockProfile.current = {
      username: 'fulina',
      displayName: 'fulina',
      avatarUrl: null,
    }
    renderSidebar()

    expect(screen.queryByText('Navbar:requestsLoading')).toBeNull()
    expect(screen.queryByText('Navbar:apiKeys')).toBeNull()
  })
})
