/**
 * 助手外壳（`StudioOperatorDock`）的几何 / 开合相位 / 收起态角标 / 手机档（L2b）。
 *
 * 真 Dock + 真面板 + 真宿主 Provider，只假网络（`src/test/operator-dock.tsx`）。
 * 草稿与附件那一半在 `StudioOperatorDock.composer.web.test.tsx`。
 *
 * ⭐ 本来该由 `verify-real` 在真机上读这几个数（面板宽 · inset 24 · 头像 36），
 * ⛔ 静态检查不冒称视觉验证，但这几个**数**必须有机器守着。
 */
import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  STUDIO_OPERATOR_DEFAULT_ANCHOR,
  STUDIO_OPERATOR_MOBILE_SHELL,
  STUDIO_OPERATOR_PANEL_RESIZE,
  STUDIO_OPERATOR_SHELL,
  STUDIO_OPERATOR_WORKBENCH_COLUMN_ANCHOR,
  getStudioOperatorPanelWidthPx,
} from '@/constants/studio-assistant-operator'
import {
  appendOperatorEntry,
  resetOperatorThread,
  setOperatorStatus,
} from '@/hooks/use-studio-operator-store'
import { text } from '@/test/i18n-text'
import {
  DOCK_HOST,
  fakeDockServer,
  renderDock,
  resetDockHost,
  settleDock,
} from '@/test/operator-dock'
import { DESKTOP_WIDTH, MOBILE_WIDTH, setViewportWidth } from '@/test/viewport'

vi.mock('@clerk/nextjs', async () =>
  (await import('@/test/operator-dock-user')).clerkDockMock(),
)
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))

beforeEach(() => {
  resetDockHost()
  resetOperatorThread()
  setViewportWidth(DESKTOP_WIDTH)
  fakeDockServer()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const panel = () => screen.getByTestId('operator-panel')
const avatar = () => screen.getByTestId('operator-avatar-toggle')

describe('StudioOperatorDock · 桌面外壳', () => {
  it('展开态：宽 = 视口三成（夹在上下限里）、顶 / 右由宿主锚点给（缺省 24），里面是真面板', async () => {
    renderDock()
    await settleDock()
    expect(panel().style.width).toBe(
      `${getStudioOperatorPanelWidthPx(
        STUDIO_OPERATOR_PANEL_RESIZE.defaultRatio,
        window.innerWidth,
      )}px`,
    )
    expect(STUDIO_OPERATOR_SHELL.insetPx).toBe(24)
    expect(panel()).toHaveClass('fixed')
    expect(panel().style.top).toBe(
      `${STUDIO_OPERATOR_DEFAULT_ANCHOR.panelTopPx}px`,
    )
    expect(panel().style.right).toBe(
      `${STUDIO_OPERATOR_DEFAULT_ANCHOR.panelRightPx}px`,
    )
    expect(screen.getByTestId('operator-input-area')).toBeInTheDocument()
  })

  it('展开态皮肤走三层玻璃①「面板」：玻璃面 + 细边 + 柔投影 + 18px 圆角', async () => {
    renderDock()
    await settleDock()
    expect(panel().className).toContain('rounded-2xl')
    expect(panel().className).toContain('border border-border')
    expect(panel().className).toContain('assistant-glass-panel')
    expect(panel().className).not.toContain('bg-card')
    expect(panel().dataset.phase).toBe('open')
    expect(panel().className).toContain('shadow-assistant-panel')
  })

  /** 布局 A（图片台桌面）：工作台旁边的一列，头部不给头像留位，头像留在原位。 */
  it('布局 A：白卡一列、不走 B 形状，头像留在原位', async () => {
    DOCK_HOST.anchor = STUDIO_OPERATOR_WORKBENCH_COLUMN_ANCHOR
    renderDock()
    await settleDock()
    expect(panel().className).toContain('bg-card')
    expect(panel().className).toContain('rounded-node')
    expect(panel().className).toContain('border border-border')
    expect(panel().className).not.toContain('shadow-assistant-panel')
    expect(panel().className).not.toContain('assistant-glass-panel')
    expect(panel().style.clipPath).toBe('none')
    expect(panel().style.top).toBe(
      `${STUDIO_OPERATOR_WORKBENCH_COLUMN_ANCHOR.panelTopPx}px`,
    )
    expect(panel().style.height).toBe(
      `calc(100dvh - ${
        STUDIO_OPERATOR_WORKBENCH_COLUMN_ANCHOR.panelTopPx +
        (STUDIO_OPERATOR_WORKBENCH_COLUMN_ANCHOR.panelBottomPx ?? 0)
      }px)`,
    )
    // 头部不画头像（`headerAvatar: 'none'`）：既没头像也没给它留的位。
    expect(screen.queryByTestId('operator-header-avatar')).toBeNull()
    expect(screen.queryByTestId('operator-header-avatar-slot')).toBeNull()
    expect(avatar().className).toContain('shadow-node-chrome')
    expect(avatar().className).not.toContain('border-border')
    expect(avatar().getAttribute('title')).toBe(
      text('StudioOperator.collapseHint'),
    )
    expect(avatar().style.transform).not.toContain('translate')
  })

  /**
   * ⭐ Dock 自己声明可点：画布宿主把助手渲染在一条 `pointer-events-none` 的全屏
   * rail 里，展开态不自己写 `auto` 就继承成 none。
   */
  it('⭐ 展开态自己 `pointer-events-auto`；收起态 aside 不渲染、头像同样自己声明', async () => {
    const view = renderDock()
    await settleDock()
    expect(panel().className).toContain('pointer-events-auto')
    view.unmount()

    DOCK_HOST.open = false
    renderDock()
    await settleDock()
    expect(screen.queryByTestId('operator-panel')).toBeNull()
    expect(avatar().className).toContain('pointer-events-auto')
  })

  it('收起态：aside 不渲染，右上角一颗 36px 头像', async () => {
    DOCK_HOST.open = false
    renderDock()
    await settleDock()
    expect(screen.queryByTestId('operator-panel')).toBeNull()
    expect(avatar().style.width).toBe(`${STUDIO_OPERATOR_SHELL.avatarSizePx}px`)
    expect(avatar().style.top).toBe(
      `${STUDIO_OPERATOR_DEFAULT_ANCHOR.avatarTopPx}px`,
    )
    expect(avatar().style.bottom).toBe('')
    expect(avatar().getAttribute('aria-pressed')).toBe('false')
    expect(screen.queryByTestId('operator-input-area')).toBeNull()
  })

  it('展开态：同一颗头像还在，aria-pressed 翻成 true', async () => {
    renderDock()
    await settleDock()
    expect(avatar().getAttribute('aria-pressed')).toBe('true')
    expect(avatar().style.transform).toContain('scale(')
  })

  /** 结果卡落地那一刻面板多半是收着的（点生成键 = 点工作台 = 收面板）。 */
  const arriveResult = (id: string) => {
    act(() => {
      appendOperatorEntry({
        kind: 'result',
        id,
        total: 1,
        completed: 1,
        items: [{ id: `${id}-img`, url: 'https://cdn.test/a.png' }],
        storedAt: '2026-09-19T00:00:00.000Z',
      })
    })
  }

  it('无事无角标；收着时回来一张结果就画数字', async () => {
    DOCK_HOST.open = false
    renderDock()
    await settleDock()
    expect(screen.queryByTestId('operator-avatar-badge')).toBeNull()
    arriveResult('result-unread')
    expect(screen.getByTestId('operator-avatar-badge').textContent).toBe('1')
  })

  it('打开面板即把未读结果清零', async () => {
    DOCK_HOST.open = false
    const view = renderDock()
    await settleDock()
    arriveResult('result-unread')
    expect(screen.getByTestId('operator-avatar-badge').textContent).toBe('1')
    DOCK_HOST.open = true
    view.rerender()
    DOCK_HOST.open = false
    view.rerender()
    expect(screen.queryByTestId('operator-avatar-badge')).toBeNull()
  })

  it('收着时在跑：运行环 + 状态点，aria-label 说「正在处理」', async () => {
    DOCK_HOST.open = false
    renderDock()
    await settleDock()
    expect(screen.queryByTestId('operator-avatar-running-ring')).toBeNull()
    expect(screen.queryByTestId('operator-avatar-status-dot')).toBeNull()
    act(() => setOperatorStatus('working'))
    expect(screen.getByTestId('operator-avatar-running-ring')).toBeTruthy()
    expect(
      screen.getByTestId('operator-avatar-status-dot').dataset.status,
    ).toBe('running')
    expect(avatar().getAttribute('aria-label')).toContain(
      text('StudioOperator.collapsedActivity.running'),
    )
  })

  it('收着时跑完留完成点；出错留风险点；打开面板即清', async () => {
    DOCK_HOST.open = false
    const view = renderDock()
    await settleDock()
    act(() => setOperatorStatus('working'))
    act(() => setOperatorStatus('idle'))
    expect(screen.queryByTestId('operator-avatar-running-ring')).toBeNull()
    expect(
      screen.getByTestId('operator-avatar-status-dot').dataset.status,
    ).toBe('done')

    act(() => setOperatorStatus('working'))
    act(() => setOperatorStatus('error', 'boom', null, 'INTERNAL'))
    const dot = screen.getByTestId('operator-avatar-status-dot')
    expect(dot.dataset.status).toBe('failed')
    expect(dot.className).toContain('bg-status-risk')

    DOCK_HOST.open = true
    view.rerender()
    DOCK_HOST.open = false
    view.rerender()
    expect(screen.queryByTestId('operator-avatar-status-dot')).toBeNull()
  })

  it('开着面板跑完⛔ 不留点：用户就在看着', async () => {
    const view = renderDock()
    await settleDock()
    act(() => setOperatorStatus('working'))
    act(() => setOperatorStatus('idle'))
    DOCK_HOST.open = false
    view.rerender()
    expect(screen.queryByTestId('operator-avatar-status-dot')).toBeNull()
  })

  /** 注意力收放法则的宿主开关：缺省仍旧收，宿主显式说不收才不收。 */
  const clickOutside = () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    fireEvent.pointerDown(outside)
    outside.remove()
  }

  it('缺省仍旧收：点面板外任意元素就收起', async () => {
    renderDock()
    await settleDock()
    clickOutside()
    expect(DOCK_HOST.open).toBe(false)
    expect(avatar().getAttribute('aria-pressed')).toBe('false')
  })

  it('宿主说不收时：点面板外不收', async () => {
    DOCK_HOST.collapseOnOutsidePointer = false
    renderDock()
    await settleDock()
    clickOutside()
    expect(DOCK_HOST.open).toBe(true)
    expect(avatar().getAttribute('aria-pressed')).toBe('true')
  })

  it('⭐ Esc 收起面板（owner 11-10）；面板里有人先接住那一下（preventDefault）时⛔ 不收', async () => {
    renderDock()
    await settleDock()
    const editor = within(panel()).getByRole('combobox')
    editor.addEventListener('keydown', (event) => event.preventDefault(), {
      once: true,
    })
    fireEvent.keyDown(editor, { key: 'Escape' })
    expect(DOCK_HOST.open).toBe(true)
    fireEvent.keyDown(editor, { key: 'Escape' })
    expect(DOCK_HOST.open).toBe(false)
  })

  it('输入法组字时的 Esc 是取消组字，⛔ 不收', async () => {
    renderDock()
    await settleDock()
    fireEvent.keyDown(within(panel()).getByRole('combobox'), {
      key: 'Escape',
      keyCode: 229,
    })
    expect(DOCK_HOST.open).toBe(true)
  })

  it('点头像展开；展开态再点一次收起（同一颗按钮两件事）', async () => {
    DOCK_HOST.open = false
    renderDock()
    await settleDock()
    fireEvent.click(avatar())
    expect(DOCK_HOST.open).toBe(true)
    expect(avatar().getAttribute('aria-pressed')).toBe('true')
    expect(panel()).toBeInTheDocument()
    fireEvent.click(avatar())
    expect(DOCK_HOST.open).toBe(false)
    expect(avatar().getAttribute('aria-pressed')).toBe('false')
  })
})

describe('StudioOperatorDock · 手机档', () => {
  beforeEach(() => setViewportWidth(MOBILE_WIDTH))

  /** 半屏 Sheet 一开，头像就整颗不渲染。 */
  it('渲染半屏 Sheet；开着时⛔ 不画收起态按钮，也没有桌面 aside', async () => {
    renderDock()
    await settleDock()
    expect(screen.getByTestId('operator-mobile-sheet')).toBeTruthy()
    expect(screen.queryByTestId('operator-avatar-toggle')).toBeNull()
    expect(screen.queryByTestId('operator-panel')).toBeNull()
  })

  it('Sheet 装的是同一个面板（open 时挂上、关闭时卸载）', async () => {
    const view = renderDock()
    await settleDock()
    expect(screen.getByTestId('operator-input-area')).toBeTruthy()
    view.unmount()

    DOCK_HOST.open = false
    renderDock()
    await settleDock()
    expect(screen.queryByTestId('operator-mobile-sheet')).toBeNull()
    expect(screen.queryByTestId('operator-input-area')).toBeNull()
    // 面板收起时那颗头像仍在 —— 它是手机上唯一的入口。
    expect(avatar()).toBeTruthy()
  })

  it('点头像打开；手机档同样挂**右上角**', async () => {
    DOCK_HOST.open = false
    renderDock()
    await settleDock()
    expect(avatar().style.top).toBe(
      `${STUDIO_OPERATOR_MOBILE_SHELL.avatarTopPx}px`,
    )
    expect(avatar().style.bottom).toBe('')
    fireEvent.click(avatar())
    expect(DOCK_HOST.open).toBe(true)
    expect(screen.getByTestId('operator-mobile-sheet')).toBeTruthy()
  })

  it.each(['canvas', 'cards', 'lora'])(
    '%s 域在手机上也有这套外壳（⛔ 不再被白名单挡掉）',
    async (domain) => {
      DOCK_HOST.domain = domain
      renderDock()
      await settleDock()
      expect(screen.getByTestId('operator-mobile-sheet')).toBeTruthy()
    },
  )
})

/**
 * 开合的相位机：
 *  ① 动着时面板不可点、无毛玻璃；② 毛玻璃在形状落定之后才出现；
 *  ③ 收回靠**定时器**（`closeMs`）卸载；④ 展开那条兜底定时器照样把相位推到 `open`；
 *  ⑤ 动着时投影挂在外层包裹上。
 */
describe('StudioOperatorDock · 头像开关的过渡', () => {
  beforeEach(() => {
    DOCK_HOST.open = false
  })

  const fakeTimers = () =>
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    })

  it('①②④⑤ 动着时不可点、无毛玻璃、影子在外层；兜底定时器到点两样都到位', async () => {
    const view = renderDock()
    await settleDock()
    fakeTimers()
    DOCK_HOST.open = true
    view.rerender()

    expect(panel().dataset.phase).toBe('opening')
    expect(panel().className).not.toContain('assistant-glass-panel')
    expect(panel().className).not.toContain('pointer-events-auto')
    expect(panel().parentElement?.className).toContain('shapeShadow')
    expect(avatar().dataset.phase).toBe('opening')

    act(() => vi.advanceTimersByTime(STUDIO_OPERATOR_SHELL.openMs + 60))
    expect(panel().dataset.phase).toBe('open')
    expect(panel().className).toContain('assistant-glass-panel')
    expect(panel().className).toContain('pointer-events-auto')
    // ⚠ clip-path 由 motion 在下一帧写进 DOM，jsdom 里帧循环不跑 —— 那一条在真机上验。
    expect(panel().parentElement?.className).not.toContain('shapeShadow')
  })

  it('③ 收回：内容立刻不可达，`closeMs` 后**定时器**把面板整颗卸载', async () => {
    DOCK_HOST.open = true
    const view = renderDock()
    await settleDock()
    fakeTimers()
    DOCK_HOST.open = false
    view.rerender()
    expect(panel().dataset.phase).toBe('closing')
    expect(
      screen.getByTestId('operator-input-area').closest('[inert]'),
    ).not.toBeNull()
    act(() => vi.advanceTimersByTime(STUDIO_OPERATOR_SHELL.closeMs - 1))
    expect(screen.queryByTestId('operator-panel')).not.toBeNull()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByTestId('operator-panel')).toBeNull()
    expect(avatar()).toBeInTheDocument()
  })

  it('reduced-motion 直切：没有中间相位，毛玻璃当场就挂', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches:
        query.includes('reduce') ||
        (query.includes('min-width') && !query.includes('max-width')),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }))
    const view = renderDock()
    await settleDock()
    DOCK_HOST.open = true
    view.rerender()
    expect(panel().dataset.phase).toBe('open')
    expect(panel().className).toContain('assistant-glass-panel')

    DOCK_HOST.open = false
    view.rerender()
    expect(screen.queryByTestId('operator-panel')).toBeNull()
  })
})

/**
 * **⛔ 外壳里不许按 domain 分叉**：四张脸的差异住在宿主的 `face` 里。
 * ⚠ 这条是**源码扫描**：运行时断言看不见一条写死的分支有没有被执行到。
 */
describe('⛔ 外壳与面板不按 domain 挑脸', () => {
  const FACE_FORK = /domain\s*===\s*ASSISTANT_PROTOCOL_DOMAIN_IDS\.\w+\s*\?/

  it.each([
    'StudioOperatorDock.tsx',
    'StudioOperatorPanel.tsx',
    'StudioOperatorHeader.tsx',
    'StudioOperatorEmptyState.tsx',
  ])('%s 里没有「按域挑一张脸」的三元分叉', async (file) => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const source = readFileSync(
      join(process.cwd(), 'src/features/assistant/components/operator', file),
      'utf-8',
    )
    expect(FACE_FORK.test(source)).toBe(false)
  })
})
