// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ASSISTANT_SURFACE_IDS } from '@/types/assistant-conversation'
import type { AssistantConversationSummary } from '@/types/assistant-conversation'

import { StudioOperatorSessionRow } from './StudioOperatorSessionRow'

/**
 * 历史会话行的回归闸（owner 2026-09-20 真机第 3 条）。
 *
 * 钉四件事：
 *  ① 点铅笔 = **就地**出现输入框，⛔ 屏幕上一个 dialog 都没有；
 *  ② 回车保存 · Esc 取消 · 失焦保存（与 56a 记忆行同一套）；
 *  ③ 点垃圾桶 = 原位切确认态，**第一下不删**，第二下才删；
 *  ④ 确认态自己退回去的三条路（3 秒 · 指针离开 · 焦点离开），且有 `aria-live`。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}(${Object.values(values).join(',')})` : key,
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenuItem: ({
    children,
    onSelect,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    onSelect?: (event: { preventDefault(): void }) => void
  }) => (
    <button {...props} onClick={(event) => onSelect?.(event)}>
      {children}
    </button>
  ),
}))

const SESSION = {
  id: 'session-1',
  title: '黄昏光的参考研究',
  surface: ASSISTANT_SURFACE_IDS.imageStudio,
  updatedAt: new Date().toISOString(),
} as unknown as AssistantConversationSummary

function renderRow(
  overrides: Partial<Parameters<typeof StudioOperatorSessionRow>[0]> = {},
) {
  const handlers = {
    onSelect: vi.fn(),
    onRename: vi.fn(),
    onRequestDelete: vi.fn(),
    onCancelDelete: vi.fn(),
    onConfirmDelete: vi.fn(),
  }
  const view = render(
    <StudioOperatorSessionRow
      session={SESSION}
      domainLabel="图片"
      dateLabel="今天"
      current={false}
      selectDisabled={false}
      deleteDisabled={false}
      renaming={false}
      deleting={false}
      confirming={false}
      {...handlers}
      {...overrides}
    />,
  )
  return { ...handlers, ...view }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('StudioOperatorSessionRow — 编辑就地', () => {
  it('点铅笔直接变输入框，⛔ 不弹层', () => {
    renderRow()
    expect(screen.queryByTestId('operator-session-rename-input')).toBeNull()

    fireEvent.click(screen.getByTestId('operator-session-rename'))

    const input = screen.getByTestId('operator-session-rename-input')
    expect(input).toHaveValue('黄昏光的参考研究')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('alertdialog')).toBeNull()
    // 编辑态里两颗动作钮让位（⛔ 不在输入框旁边留一颗会删掉它的按钮）。
    expect(screen.queryByTestId('operator-session-delete')).toBeNull()
  })

  it('回车保存', () => {
    const { onRename } = renderRow()
    fireEvent.click(screen.getByTestId('operator-session-rename'))
    const input = screen.getByTestId('operator-session-rename-input')

    fireEvent.change(input, { target: { value: '胶片颗粒对比' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.blur(input)

    expect(onRename).toHaveBeenCalledWith('胶片颗粒对比')
    expect(screen.queryByTestId('operator-session-rename-input')).toBeNull()
  })

  it('Esc 取消 —— 紧接着那一拍 blur ⛔ 不许当成保存', () => {
    const { onRename } = renderRow()
    fireEvent.click(screen.getByTestId('operator-session-rename'))
    const input = screen.getByTestId('operator-session-rename-input')

    fireEvent.change(input, { target: { value: '改坏了' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    fireEvent.blur(input)

    expect(onRename).not.toHaveBeenCalled()
    expect(screen.queryByTestId('operator-session-rename-input')).toBeNull()
  })

  it('失焦保存；原样没改的不发请求', () => {
    const { onRename } = renderRow()
    fireEvent.click(screen.getByTestId('operator-session-rename'))
    fireEvent.blur(screen.getByTestId('operator-session-rename-input'))
    expect(onRename).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('operator-session-rename'))
    const input = screen.getByTestId('operator-session-rename-input')
    fireEvent.change(input, { target: { value: '换个名字' } })
    fireEvent.blur(input)
    expect(onRename).toHaveBeenCalledWith('换个名字')
  })
})

describe('StudioOperatorSessionRow — 删除两段', () => {
  it('第一下只切确认态，⛔ 不删', () => {
    const { onRequestDelete, onConfirmDelete } = renderRow()

    fireEvent.click(screen.getByTestId('operator-session-delete'))

    expect(onRequestDelete).toHaveBeenCalledTimes(1)
    expect(onConfirmDelete).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('确认态：红字 + 命中区不变 + aria-live，再点一次才删', () => {
    const { onConfirmDelete } = renderRow({ confirming: true })

    const button = screen.getByTestId('operator-session-delete')
    expect(button).toHaveAttribute('data-confirming', 'true')
    expect(button.className).toContain('text-status-risk')
    // ⚠ 两态同一格内距：位置跳一下的按钮会让第二下点空。
    expect(button.className).toContain('p-2')
    expect(
      screen.getByTestId('operator-session-delete-live'),
    ).toHaveTextContent('history.deleteConfirmInline')

    fireEvent.click(button)
    expect(onConfirmDelete).toHaveBeenCalledTimes(1)
  })

  it('3 秒无操作自己退回去', () => {
    vi.useFakeTimers()
    const { onCancelDelete } = renderRow({ confirming: true })

    expect(onCancelDelete).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(onCancelDelete).toHaveBeenCalledTimes(1)
  })

  it('指针离开 / 焦点离开这一行也退回去', () => {
    const { onCancelDelete, rerender } = renderRow({ confirming: true })
    fireEvent.pointerLeave(screen.getByTestId('operator-session-row'))
    expect(onCancelDelete).toHaveBeenCalledTimes(1)

    rerender(<div />)
    const second = renderRow({ confirming: true })
    fireEvent.blur(screen.getByTestId('operator-session-delete'), {
      relatedTarget: document.body,
    })
    expect(second.onCancelDelete).toHaveBeenCalledTimes(1)
  })

  it('⛔ 不在确认态时不画那句 aria-live', () => {
    renderRow()
    expect(screen.getByTestId('operator-session-delete-live').textContent).toBe(
      '',
    )
  })
})
