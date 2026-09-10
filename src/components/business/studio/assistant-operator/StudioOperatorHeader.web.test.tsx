// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import { STUDIO_OPERATOR_SHELL } from '@/constants/studio-assistant-operator'
import type { UseStudioOperatorHistoryResult } from '@/hooks/use-studio-operator-history'

import { StudioOperatorHeader } from './StudioOperatorHeader'

/**
 * 面板头部的回归闸（v2 §4.1）—— 进度带整条删掉（决策 14）之后剩下的那一行。
 *
 * 钉四件事：
 *  ① 头高就是 `STUDIO_OPERATOR_SHELL.headerHeightPx`（真机目检读同一个数）；
 *  ② ⛔ **带子的东西一样都不许回来**：进度环 / 分数 / 清单开关（决策 14）；
 *  ③ 齿轮（§4.1 右上）与收起各自可点；
 *  ④ 续跑 chip 只在**空闲**时露脸 —— 它暂挂在头部（§3.6 那条 ⚠ 的去处之一）。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ dateTime: () => '9/6 12:00' }),
}))

// Radix 的 portal 在 jsdom 里只会给这条断言添噪声 —— 菜单本身不是这颗组件的契约。
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
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
}))

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
  render(
    <StudioOperatorHeader
      domain={ASSISTANT_PROTOCOL_DOMAIN_IDS.image}
      working={false}
      history={HISTORY}
      onNewThread={vi.fn()}
      onOpenAssistantSettings={onOpenAssistantSettings}
      onCollapse={onCollapse}
      {...overrides}
    />,
  )
  return { onOpenAssistantSettings, onCollapse }
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

  it('齿轮与收起各自可点', () => {
    const { onOpenAssistantSettings, onCollapse } = renderHeader()
    fireEvent.click(screen.getByTestId('operator-assistant-settings'))
    expect(onOpenAssistantSettings).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByTestId('operator-collapse'))
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
