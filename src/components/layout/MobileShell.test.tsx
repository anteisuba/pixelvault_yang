import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  MOBILE_NAV_LAST_CHAT_STORAGE_KEY,
  MOBILE_NAV_LAST_TOOL_STORAGE_KEY,
  MOBILE_NAV_RETURN_STORAGE_KEY,
} from '@/constants/navigation'
import { setMobileDrawerOpen } from '@/hooks/use-mobile-drawer'

import { MobileShell } from './MobileShell'

const nav = vi.hoisted(() => ({
  pathname: '/library/assets',
  push: vi.fn(),
}))

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ userId: null }),
}))

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}:${key}` : key,
  useFormatter: () => ({
    dateTime: () => '12:00',
  }),
}))

vi.mock('@/i18n/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: nav.push }),
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

beforeEach(() => {
  nav.pathname = '/library/assets'
  nav.push.mockReset()
  setMobileDrawerOpen(false)
  window.localStorage.clear()
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ success: true, data: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('MobileShell Apple HIG 分组侧滑抽屉', () => {
  it('主空间卡片列出对话 · 素材 · 画廊 · 角色，创作台折叠组默认收起、点开呈现 7 个台', async () => {
    render(<MobileShell />)
    expect(screen.queryByRole('navigation')).toBeNull()

    await act(async () => {
      setMobileDrawerOpen(true)
    })
    const navCard = screen.getByTestId('studio-mobile-drawer-nav')
    const spaceHrefs = [...navCard.querySelectorAll('a')].map((a) =>
      a.getAttribute('href'),
    )
    expect(spaceHrefs).toEqual([
      '/studio',
      '/library/assets',
      '/gallery',
      '/library/cards',
    ])
    expect(navCard.querySelector('a[href="/library/assets"]')).toHaveAttribute(
      'aria-current',
      'page',
    )

    const studiosToggle = screen.getByTestId(
      'studio-mobile-drawer-studios-toggle',
    )
    expect(studiosToggle).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(studiosToggle)
    expect(studiosToggle).toHaveAttribute('aria-expanded', 'true')

    const studiosGrid = screen.getByTestId('studio-mobile-drawer-studios-grid')
    const toolHrefs = [...studiosGrid.querySelectorAll('a')].map((a) =>
      a.getAttribute('href'),
    )
    expect(toolHrefs).toEqual([
      '/studio/image',
      '/studio/image/tags',
      '/studio/lora',
      '/studio/audio',
      '/studio/video',
      '/studio/3d',
      '/studio/node',
    ])
    expect(screen.getByTestId('studio-mobile-drawer-me')).toHaveAttribute(
      'href',
      '/settings',
    )
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
  })

  it('侧栏「对话」回到上次那段对话，没有记录才去开新的', async () => {
    window.localStorage.setItem(
      MOBILE_NAV_LAST_CHAT_STORAGE_KEY,
      '/studio/c/abc',
    )
    await act(async () => {
      setMobileDrawerOpen(true)
      render(<MobileShell />)
    })
    expect(
      screen.getByTestId('studio-mobile-drawer-link-chat'),
    ).toHaveAttribute('href', '/studio/c/abc')
  })

  it('页面上记下最近访问与最近对话', () => {
    nav.pathname = '/studio/c/abc'
    render(<MobileShell />)
    expect(window.localStorage.getItem(MOBILE_NAV_RETURN_STORAGE_KEY)).toBe(
      '/studio/c/abc',
    )
    expect(window.localStorage.getItem(MOBILE_NAV_LAST_CHAT_STORAGE_KEY)).toBe(
      '/studio/c/abc',
    )
  })
})

describe('MobileShell 工作台顶栏与侧栏打通', () => {
  it('工作台里点左上侧栏键：创作台分组自动展开且只高亮当前台（不误亮对话）', async () => {
    nav.pathname = '/studio/lora'
    render(<MobileShell />)

    expect(
      screen.getByRole('button', { name: 'MobileNav:switchTool' }).textContent,
    ).toContain('StudioTools.tools.lora.label')

    await act(async () => {
      fireEvent.click(screen.getByTestId('studio-mobile-drawer-trigger'))
    })

    expect(
      screen.getByTestId('studio-mobile-drawer-studios-toggle'),
    ).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByTestId('studio-mobile-drawer-tool-lora'),
    ).toHaveAttribute('aria-current', 'page')
    expect(
      screen.getByTestId('studio-mobile-drawer-link-chat'),
    ).not.toHaveAttribute('aria-current')
  })

  it('工作台里点正中台名拉起换台面板（列出七个台并高亮当前台）', () => {
    window.localStorage.setItem(MOBILE_NAV_LAST_TOOL_STORAGE_KEY, 'video')
    nav.pathname = '/studio/image'
    render(<MobileShell />)
    fireEvent.click(
      screen.getByRole('button', { name: 'MobileNav:switchTool' }),
    )

    const panel = screen.getByRole('dialog', { name: 'MobileNav:switchTool' })
    expect(
      screen.queryByRole('textbox', { name: 'MobileNav:quickPlaceholder' }),
    ).toBeNull()
    expect(panel.querySelectorAll('li a')).toHaveLength(7)
    expect(panel.querySelector('a[href="/studio/image"]')).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
})
