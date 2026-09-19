// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import { STUDIO_OPERATOR_SHELL } from '@/constants/studio-assistant-operator'
import { ASSISTANT_SURFACE_IDS } from '@/types/assistant-conversation'
import type { UseStudioOperatorHistoryResult } from '@/hooks/use-studio-operator-history'

import { StudioOperatorHeader } from './StudioOperatorHeader'

/**
 * 面板头部的回归闸（v2 §4.1 / 画板 BCards「头部」两态）。
 *
 * 钉六件事：
 *  ① 头高就是 `STUDIO_OPERATOR_SHELL.headerHeightPx`（真机目检读同一个数）；
 *  ② ⛔ **带子的东西一样都不许回来**：进度环 / 分数 / 清单开关（决策 14）；
 *  ③ 标题▾ 与右上历史图标开的是**同一个下拉**（§4.1），且图标能再点一下关掉；
 *  ④ 下拉里有历史列表（每行日期走「今天 / 昨天 / MM-DD」）＋ **底部**那颗新会话；
 *  ⑤ 右上两颗 32px 图标（历史 · 设置）各自可点；
 *  ⑥ 续跑 chip 只在**空闲**时露脸 —— 它暂挂在头部（§3.6 那条 ⚠ 的去处之一）。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ dateTime: () => '09/05' }),
}))

/**
 * Radix 的 portal 在 jsdom 里只会给这条断言添噪声，但**开合必须是真的**：
 * ③ 那一条要断言「两个入口开的是同一个受控菜单」。所以这份替身把 `open` 原样
 * 挂到 DOM 上，并让触发器把 `onOpenChange(true)` 调回去（Radix 真身做的就是这件事）。
 */
vi.mock('@/components/ui/dropdown-menu', async () => {
  const React = await import('react')
  const OpenChangeContext = React.createContext<(next: boolean) => void>(
    () => {},
  )
  return {
    DropdownMenu: ({
      children,
      open,
      onOpenChange,
    }: {
      children: React.ReactNode
      open?: boolean
      onOpenChange?: (next: boolean) => void
    }) => (
      <OpenChangeContext.Provider value={onOpenChange ?? (() => {})}>
        <div
          data-testid="operator-session-dropdown"
          data-open={open ? 'true' : 'false'}
        >
          {children}
        </div>
      </OpenChangeContext.Provider>
    ),
    DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => {
      const onOpenChange = React.useContext(OpenChangeContext)
      return <span onClick={() => onOpenChange(true)}>{children}</span>
    },
    DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    DropdownMenuItem: ({
      children,
      onSelect,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
      onSelect?: () => void
    }) => (
      <button {...props} onClick={onSelect}>
        {children}
      </button>
    ),
    DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    DropdownMenuSeparator: () => <hr />,
  }
})

const NOW = Date.now()
const DAY_MS = 86_400_000

const SESSIONS = [
  {
    id: 'today-session',
    title: '黄昏光的参考研究',
    surface: ASSISTANT_SURFACE_IDS.imageStudio,
    updatedAt: new Date(NOW).toISOString(),
  },
  {
    id: 'yesterday-session',
    title: '胶片颗粒对比测试',
    surface: ASSISTANT_SURFACE_IDS.imageStudio,
    updatedAt: new Date(NOW - DAY_MS).toISOString(),
  },
  {
    id: 'older-session',
    title: '城市天台构图',
    surface: ASSISTANT_SURFACE_IDS.videoStudio,
    updatedAt: new Date(NOW - 6 * DAY_MS).toISOString(),
  },
] as unknown as UseStudioOperatorHistoryResult['sessions']

const HISTORY: UseStudioOperatorHistoryResult = {
  sessions: [],
  currentSessionId: null,
  isHydrating: false,
  loadingSessionId: null,
  renamingSessionId: null,
  renameSession: vi.fn().mockResolvedValue(true),
  error: null,
  selectSession: vi.fn(),
  refreshSessions: vi.fn(),
  deletingSessionId: null,
  deleteSession: vi.fn().mockResolvedValue(true),
}

function renderHeader(
  overrides: Partial<Parameters<typeof StudioOperatorHeader>[0]> = {},
) {
  const onOpenAssistantSettings = vi.fn()
  const onCollapse = vi.fn()
  const onNewThread = vi.fn()
  render(
    <StudioOperatorHeader
      domain={ASSISTANT_PROTOCOL_DOMAIN_IDS.image}
      working={false}
      history={HISTORY}
      onNewThread={onNewThread}
      onOpenAssistantSettings={onOpenAssistantSettings}
      onCollapse={onCollapse}
      avatarOwned={false}
      {...overrides}
    />,
  )
  return { onOpenAssistantSettings, onCollapse, onNewThread }
}

describe('StudioOperatorHeader', () => {
  it('头高钉在 40px，且带子的读数一样都没有', () => {
    renderHeader()
    const head = screen.getByTestId('operator-header')
      .firstElementChild as HTMLElement
    expect(head.style.height).toBe(`${STUDIO_OPERATOR_SHELL.headerHeightPx}px`)
    // ⛔ 决策 14：进度环 / 分数 / 清单开关整条删掉。
    expect(screen.queryByTestId('operator-band-ring')).toBeNull()
    expect(screen.queryByTestId('operator-band-fraction')).toBeNull()
    expect(screen.queryByTestId('operator-band-toggle')).toBeNull()
    expect(screen.queryByTestId('operator-band-list')).toBeNull()
  })

  it('标题▾ 与历史图标开的是同一个下拉，且图标能再点一下关掉', () => {
    renderHeader()
    const dropdown = screen.getByTestId('operator-session-dropdown')
    const historyButton = screen.getByTestId('operator-history-button')
    expect(dropdown.dataset.open).toBe('false')
    expect(historyButton.getAttribute('aria-expanded')).toBe('false')

    // 第二条路：右上那颗时钟。
    fireEvent.click(historyButton)
    expect(dropdown.dataset.open).toBe('true')
    expect(historyButton.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(historyButton)
    expect(dropdown.dataset.open).toBe('false')

    // 第一条路：标题自己（Radix 真身把触发器的点击变成 onOpenChange(true)）。
    fireEvent.click(screen.getByTestId('operator-session-menu'))
    expect(dropdown.dataset.open).toBe('true')
  })

  it('下拉里是历史列表：每行一枚「今天 / 昨天 / MM-DD」，新会话在最底下', () => {
    const { onNewThread } = renderHeader({
      history: { ...HISTORY, sessions: SESSIONS },
    })
    const rows = screen.getAllByTestId('operator-session-item')
    expect(rows.map((row) => row.dataset.sessionId)).toEqual([
      'today-session',
      'yesterday-session',
      'older-session',
    ])
    expect(rows[0]?.textContent).toContain('history.today')
    expect(rows[1]?.textContent).toContain('history.yesterday')
    expect(rows[2]?.textContent).toContain('09/05')

    // ⚠ 新会话排在**所有会话行之后**（画板 BCards「历史下拉展开」）。
    const newThread = screen.getByTestId('operator-new-thread')
    expect(
      rows[2]?.compareDocumentPosition(newThread) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    fireEvent.click(newThread)
    expect(onNewThread).toHaveBeenCalledTimes(1)
  })

  it('右上两颗图标（历史 · 设置）各自可点，且同为 32px 档', () => {
    const { onOpenAssistantSettings } = renderHeader()
    for (const id of [
      'operator-history-button',
      'operator-assistant-settings',
    ]) {
      expect(screen.getByTestId(id).className).toContain('size-8')
    }
    fireEvent.click(screen.getByTestId('operator-assistant-settings'))
    expect(onOpenAssistantSettings).toHaveBeenCalledTimes(1)
  })

  /**
   * 收起钮已删（D7b ④）—— 收起改点左上那颗头像。
   * ⚠ 桌面上头部只留**空槽**（那颗头像是外壳里那个持久 fixed 元素滑进来的），
   *   手机上头部自己画一颗可点的。
   */
  it('⛔ 不再有收起钮；桌面留空槽、手机画真头像且点了就收', () => {
    renderHeader()
    expect(screen.queryByTestId('operator-collapse')).toBeNull()
    const slot = screen.getByTestId('operator-header-avatar-slot')
    expect(slot.style.width).toBe(
      `${STUDIO_OPERATOR_SHELL.avatarHeaderSizePx}px`,
    )
    expect(screen.queryByTestId('operator-header-avatar')).toBeNull()
    cleanup()

    const { onCollapse } = renderHeader({ avatarOwned: true })
    expect(screen.queryByTestId('operator-header-avatar-slot')).toBeNull()
    fireEvent.click(screen.getByTestId('operator-header-avatar'))
    expect(onCollapse).toHaveBeenCalledTimes(1)
  })

  it('续跑 chip 只在空闲时露脸', () => {
    const onResume = vi.fn()
    renderHeader({ resume: { stepNumber: 3, onResume } })
    const chip = screen.getByTestId('operator-band-resume')
    expect(chip.dataset.step).toBe('3')
    fireEvent.click(chip)
    expect(onResume).toHaveBeenCalledTimes(1)
  })

  it('干活中 ⛔ 不画续跑 chip（会让人以为要开第二条流）', () => {
    renderHeader({
      working: true,
      resume: { stepNumber: 3, onResume: vi.fn() },
    })
    expect(screen.queryByTestId('operator-band-resume')).toBeNull()
  })
})
