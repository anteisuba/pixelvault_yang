// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ASSISTANT_SURFACE_IDS } from '@/types/assistant-conversation'
import type { AssistantConversationSummary } from '@/types/assistant-conversation'

import { StudioOperatorSessionRow } from './StudioOperatorSessionRow'

/**
 * 历史会话行的回归闸（owner 2026-09-20 真机第 3 条 + D7c ④ 画板）。
 *
 * 钉六件事：
 *  ① 点铅笔 = **就地**出现输入框，⛔ 屏幕上一个 dialog 都没有，且进来就全选；
 *  ② 回车保存 · Esc 取消 · 失焦保存（与 56a 记忆行同一套）；
 *  ③ 点垃圾桶 = 原位切确认态，**第一下不删**，第二下才删；
 *  ④ 确认态自己退回去的三条路（3 秒 · 指针离开 · 焦点离开），且有 `aria-live`；
 *  ⑤ ⭐ 两层一行：「工作台 · 日期」连在一起，⛔ 不是隔着一格的两段；
 *  ⑥ ⭐ 两颗图标**默认不可见**（只动 `opacity`，位子常驻），hover / 聚焦才淡入。
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
  it('点铅笔直接变输入框，⛔ 不弹层；第二行换成操作提示', () => {
    renderRow()
    expect(screen.queryByTestId('operator-session-rename-input')).toBeNull()

    fireEvent.click(screen.getByTestId('operator-session-rename'))

    const input = screen.getByTestId('operator-session-rename-input')
    expect(input).toHaveValue('黄昏光的参考研究')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('alertdialog')).toBeNull()
    // 编辑态里两颗动作钮让位（⛔ 不在输入框旁边留一颗会删掉它的按钮）。
    expect(screen.queryByTestId('operator-session-delete')).toBeNull()
    // 第二行从「工作台 · 日期」换成「Enter 保存 · Esc 取消」（画板「改名中」）。
    expect(screen.getByTestId('operator-session-rename-hint').textContent).toBe(
      'history.renameHint',
    )
  })

  /**
   * 画板「改名中」：进来就全选 —— 按铅笔多半是要重写整句，先全选让「直接打字」
   * 就等于覆盖。⛔ 不淡入（动效表：要等动画才能打字的输入框是坏动画）。
   */
  it('⭐ 输入框一出现就全选了整句', () => {
    renderRow()
    fireEvent.click(screen.getByTestId('operator-session-rename'))
    const input = screen.getByTestId(
      'operator-session-rename-input',
    ) as HTMLInputElement
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe('黄昏光的参考研究'.length)
    expect(input.className).not.toContain('animate-in')
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

describe('StudioOperatorSessionRow — 一行两层（D7c ④）', () => {
  it('⭐ 「工作台 · 日期」连成一句，⛔ 不是隔着一格的两段', () => {
    renderRow()
    const row = screen.getByTestId('operator-session-item')
    expect(row.textContent).toContain('图片 · 今天')
  })

  it('⭐ 两颗图标默认不可见、位子常驻；hover / 聚焦才淡入', () => {
    renderRow()
    const actions = screen.getByTestId('operator-session-actions')
    expect(actions.className).toContain('opacity-0')
    expect(actions.className).toContain('group-hover/row:opacity-100')
    expect(actions.className).toContain('group-focus-within/row:opacity-100')
    // 触屏没有 hover —— 留一颗看不见却按得到的删除是陷阱。
    expect(actions.className).toContain('coarse:opacity-100')
    // ⛔ 只动 opacity：位移会让行抖，标题的截断点也会跟着变。
    expect(actions.className).toContain('transition-opacity')
  })

  it('确认态里那两颗强制可见（⛔ 不许随 hover 消失）', () => {
    renderRow({ confirming: true })
    expect(screen.getByTestId('operator-session-actions').className).toContain(
      'opacity-100',
    )
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

  /**
   * D7c ④：确认态是垃圾桶**就地撑成**一颗红色药丸（画板「删除确认」）——
   * ⚠ 它与「命中区不变」那条旧口径不同：形变本身是反馈，但起点（垃圾桶那一格）
   *   没动，所以第二下点的还是同一个位置。
   */
  it('确认态：红底药丸 + aria-live，再点一次才删', () => {
    const { onConfirmDelete } = renderRow({ confirming: true })

    const button = screen.getByTestId('operator-session-delete')
    expect(button).toHaveAttribute('data-confirming', 'true')
    expect(button.className).toContain('bg-status-risk')
    expect(button.textContent).toContain('history.deleteConfirm')
    // 宽度靠那两个字的 max-width 撑（`width:auto` 过渡不了），⛔ 不是换一颗按钮。
    expect(button.className).toContain(
      'transition-[background-color,color,padding]',
    )
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
