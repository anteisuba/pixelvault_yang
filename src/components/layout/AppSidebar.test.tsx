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

describe('AppSidebar 入口收口（D3 ④）', () => {
  it('顶端头像直接指向个人主页，不弹菜单', () => {
    mockProfile.current = {
      username: 'fulina',
      displayName: 'fulina',
      avatarUrl: null,
    }
    renderSidebar()

    const avatar = screen.getByLabelText('Navbar:viewProfile')
    expect(avatar.getAttribute('href')).toBe('/u/fulina')
    expect(avatar.getAttribute('aria-haspopup')).toBeNull()
  })

  it('用户名还没回来时不给死链接', () => {
    mockProfile.current = null
    renderSidebar()

    expect(screen.queryByLabelText('Navbar:viewProfile')).toBeNull()
  })

  it('最底一行「设置」带上来处进 /settings', () => {
    mockProfile.current = {
      username: 'fulina',
      displayName: 'fulina',
      avatarUrl: null,
    }
    renderSidebar()

    const settings = screen.getByLabelText('Navbar:settings')
    expect(settings.getAttribute('href')).toBe(
      '/settings?from=%2Fstudio%2Fimage',
    )
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

  it('不再有积分读数、也不再有头像菜单', () => {
    mockProfile.current = {
      username: 'fulina',
      displayName: 'fulina',
      avatarUrl: null,
    }
    const { container } = renderSidebar()

    expect(screen.queryByText('Navbar:requestsLoading')).toBeNull()
    expect(screen.queryByText('Navbar:apiKeys')).toBeNull()
    expect(screen.queryByText('Navbar:signOut')).toBeNull()
    expect(container.querySelector('[aria-haspopup="true"]')).toBeNull()
  })
})
