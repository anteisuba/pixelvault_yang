import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  MOBILE_CREATE_LONG_PRESS_MS,
  MOBILE_NAV_LAST_TOOL_STORAGE_KEY,
  MOBILE_NAV_LAST_CHAT_STORAGE_KEY,
  MOBILE_NAV_RETURN_STORAGE_KEY,
} from '@/constants/navigation'

import { MobileShell } from './MobileShell'

const nav = vi.hoisted(() => ({
  pathname: '/library/assets',
  push: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}:${key}` : key,
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
  window.localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

function createButton() {
  return screen.getByRole('button', { name: 'MobileNav:create' })
}

describe('MobileShell 底栏（P3 · v10）', () => {
  it('页面上是底栏：对话 · 素材 · 画廊 · 角色 · 我的 + ＋', () => {
    render(<MobileShell />)
    const bar = screen.getByRole('navigation', { name: 'MobileNav:tabs.label' })
    const hrefs = [...bar.querySelectorAll('a')].map((a) =>
      a.getAttribute('href'),
    )
    expect(hrefs).toEqual([
      '/studio',
      '/library/assets',
      '/gallery',
      '/library/cards',
      '/settings',
    ])
    expect(bar).toContainElement(createButton())
    // 窄格子里「我的主页」叫「我的」。
    expect(bar.textContent).toContain('MobileNav:tabs.profile')
    expect(bar.querySelector('a[href="/library/assets"]')).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('「对话」回到上次那段对话，没有记录才去开新的', () => {
    window.localStorage.setItem(
      MOBILE_NAV_LAST_CHAT_STORAGE_KEY,
      '/studio/c/abc',
    )
    render(<MobileShell />)
    const bar = screen.getByRole('navigation', { name: 'MobileNav:tabs.label' })
    expect(bar.querySelector('a')).toHaveAttribute('href', '/studio/c/abc')
  })

  it('点已经在的那一格回到顶部，⛔ 原地再导航；点别的格照常导航', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    render(<MobileShell />)
    const bar = screen.getByRole('navigation', { name: 'MobileNav:tabs.label' })
    const current = bar.querySelector('a[href="/library/assets"]')!
    const other = bar.querySelector('a[href="/gallery"]')!

    // fireEvent 返回 false = 默认动作被拦下（不导航）。
    expect(fireEvent.click(current)).toBe(false)
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }))
    expect(fireEvent.click(other)).toBe(true)
    scrollTo.mockRestore()
  })

  it('提示词不上底栏', () => {
    render(<MobileShell />)
    expect(document.querySelector('a[href="/library/prompts"]')).toBeNull()
  })

  it('点 ＋ 打开新建面板：一句话输入 + 七个台（标签台 11-04 单列），上次用的标「上次」', () => {
    window.localStorage.setItem(MOBILE_NAV_LAST_TOOL_STORAGE_KEY, 'video')
    render(<MobileShell />)
    fireEvent.click(createButton())

    const panel = screen.getByRole('dialog', { name: 'MobileNav:create' })
    expect(
      screen.getByRole('textbox', { name: 'MobileNav:quickPlaceholder' }),
    ).toBeInTheDocument()
    expect(panel.querySelectorAll('li a')).toHaveLength(7)
    const video = panel.querySelector('a[href="/studio/video"]')
    expect(video?.textContent).toContain('MobileNav:last')
    expect(
      panel.querySelector('a[href="/studio/image"]')?.textContent,
    ).not.toContain('MobileNav:last')
  })

  it('一句话提交 = 带着 ?prompt=&generate=1 进图片工作台直接出图', () => {
    render(<MobileShell />)
    fireEvent.click(createButton())
    fireEvent.change(
      screen.getByRole('textbox', { name: 'MobileNav:quickPlaceholder' }),
      { target: { value: '海边的猫' } },
    )
    fireEvent.click(screen.getByRole('button', { name: 'MobileNav:quickGo' }))
    expect(nav.push).toHaveBeenCalledWith(
      `/studio/image?prompt=${encodeURIComponent('海边的猫')}&generate=1`,
    )
  })

  it('长按 ＋ 直接进上次的工具，不打开面板', () => {
    vi.useFakeTimers()
    window.localStorage.setItem(MOBILE_NAV_LAST_TOOL_STORAGE_KEY, 'audio')
    render(<MobileShell />)
    const button = createButton()
    fireEvent.pointerDown(button, { button: 0 })
    act(() => {
      vi.advanceTimersByTime(MOBILE_CREATE_LONG_PRESS_MS)
    })
    fireEvent.pointerUp(button)
    fireEvent.click(button)

    expect(nav.push).toHaveBeenCalledWith('/studio/audio')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('页面上记下这一页（工作台 ← 回这里）', () => {
    nav.pathname = '/gallery'
    render(<MobileShell />)
    expect(window.localStorage.getItem(MOBILE_NAV_RETURN_STORAGE_KEY)).toBe(
      '/gallery',
    )
  })
})

describe('MobileShell 工作台顶栏', () => {
  it('工作台里没有底栏，换成「← · 当前工具 ▾」', () => {
    nav.pathname = '/studio/video'
    render(<MobileShell />)

    expect(screen.queryByRole('navigation')).toBeNull()
    expect(
      screen.getByRole('button', { name: 'MobileNav:switchTool' }).textContent,
    ).toContain('StudioTools.tools.video.label')
  })

  it('← 回到进工作台之前那一页；没有记录回对话', () => {
    window.localStorage.setItem(MOBILE_NAV_RETURN_STORAGE_KEY, '/library/cards')
    nav.pathname = '/studio/image'
    const { unmount } = render(<MobileShell />)
    expect(screen.getByLabelText('MobileNav:back')).toHaveAttribute(
      'href',
      '/library/cards',
    )
    unmount()

    window.localStorage.clear()
    render(<MobileShell />)
    expect(screen.getByLabelText('MobileNav:back')).toHaveAttribute(
      'href',
      '/studio',
    )
  })

  it('对话页带底栏、不是台：「对话」那一格亮着，也记成 ← 的去处', () => {
    nav.pathname = '/studio/c/abc'
    render(<MobileShell />)
    const bar = screen.getByRole('navigation', { name: 'MobileNav:tabs.label' })
    // 记下了这段对话，「对话」那一格也就指回它。
    expect(bar.querySelector('a[href="/studio/c/abc"]')).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.queryByLabelText('MobileNav:back')).toBeNull()
    expect(window.localStorage.getItem(MOBILE_NAV_RETURN_STORAGE_KEY)).toBe(
      '/studio/c/abc',
    )
  })

  it('进工作台记下工具（＋ 面板的「上次」）', () => {
    nav.pathname = '/studio/lora/library'
    render(<MobileShell />)
    expect(window.localStorage.getItem(MOBILE_NAV_LAST_TOOL_STORAGE_KEY)).toBe(
      'lora',
    )
  })
})
