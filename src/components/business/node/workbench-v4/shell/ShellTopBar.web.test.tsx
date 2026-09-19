// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CANVAS_SHELL_LAYOUT } from '@/constants/canvas-shell'
import { STUDIO_OPERATOR_SHELL } from '@/constants/studio-assistant-operator'

import { ShellTopBar } from './ShellTopBar'

/**
 * 画布顶栏右上那一格的回归闸（D7b ④，owner 2026-09-20）。
 *
 * 钉两件事：
 *  ① 「助手」胶囊（`shell-assistant-toggle`）**不再渲染** —— 同一位置换成 Dock
 *     自己那颗人设头像（`StudioOperatorAvatarToggle`，fixed 在 `edgeInsetPx` 右缘）；
 *  ② 顶栏那一格因此**往左让出一个头像 + 一个空隙**，「剪辑台」才排得在头像左边。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('./ShellProjectPill', () => ({
  ShellProjectPill: () => <div data-testid="shell-project-pill" />,
}))

function renderTopBar() {
  render(
    <ShellTopBar
      projectName="借伞"
      projects={[]}
      currentProjectId="p1"
      isSaving={false}
      onSwitchProject={vi.fn()}
      onCreateProject={vi.fn()}
      onRenameProject={vi.fn()}
      onDuplicateProject={vi.fn()}
      onDeleteProject={vi.fn()}
      onOpenEditDesk={vi.fn()}
    />,
  )
}

describe('ShellTopBar', () => {
  it('① 「助手」胶囊已退场，右上只剩「剪辑台」', () => {
    renderTopBar()
    expect(screen.queryByTestId('shell-assistant-toggle')).toBeNull()
    expect(screen.getByTestId('shell-edit-desk')).toBeTruthy()
  })

  it('② 右上那一格为头像让出 36 + 8', () => {
    renderTopBar()
    const row = screen.getByTestId('shell-edit-desk').parentElement
    expect(row?.style.right).toBe(
      `${
        CANVAS_SHELL_LAYOUT.edgeInsetPx +
        STUDIO_OPERATOR_SHELL.avatarSizePx +
        STUDIO_OPERATOR_SHELL.avatarGapPx
      }px`,
    )
  })
})
