// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { createContext, useContext, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { ASSISTANT_SURFACE_IDS } from '@/types/assistant-conversation'
import type { AssistantConversationSummary } from '@/types/assistant-conversation'

import {
  StudioOperatorSessionDeleteDialog,
  StudioOperatorSessionRow,
} from './StudioOperatorSessionRow'

/**
 * 历史会话行的回归闸（方向 3「行上不放图标，像 Finder」，owner 2026-10-27）。
 *
 *  ① 行上只有标题 + 时间：⛔ 铅笔 / 垃圾桶；只有当前那一行常驻一颗 ⋯（顶替时间）；
 *  ② 右键 / ⋯ 开同一个小菜单：重命名 · 删除；
 *  ③ 改名就地：同尺寸输入框、光标在句尾（⛔ 全选）、⛔ 提示行；回车 / 失焦保存，Esc 退回；
 *     白板列里双击标题也进改名；F2 同上；
 *  ④ 删除只交出 `onRequestDelete`，弹窗与失败黑条在 `StudioOperatorSessionDeleteDialog`；
 *  ⑤ 「工作台 · 日期」连成一句；当前行常驻底色 + 字重 + `aria-current`。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}(${Object.values(values).join(',')})` : key,
}))

const toastError = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { error: toastError } }))

vi.mock('@/components/ui/dropdown-menu', () => {
  const Open = createContext(false)
  return {
    DropdownMenu: ({
      open,
      children,
    }: {
      open?: boolean
      children: ReactNode
    }) => <Open.Provider value={Boolean(open)}>{children}</Open.Provider>,
    DropdownMenuTrigger: ({ children }: { children: ReactNode }) => children,
    DropdownMenuContent: function Content({
      children,
      ...props
    }: { children: ReactNode } & Record<string, unknown>) {
      return useContext(Open) ? (
        <div role="menu" data-testid={props['data-testid'] as string}>
          {children}
        </div>
      ) : null
    },
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuItem: ({
      children,
      onSelect,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
      onSelect?: (event: { preventDefault(): void }) => void
    }) => (
      <button
        {...props}
        data-mock-menu-item=""
        onClick={(event) => onSelect?.(event)}
      >
        {children}
      </button>
    ),
  }
})

/**
 * ⚠ 标题带着**存量噪音**（`reference image 1`）—— 预填那一条要验的正是
 * 「填的是看得见的短名还是库里那一份」，干净标题两者相同，验不出来。
 */
const SESSION = {
  id: 'session-1',
  title: '黄昏光的参考研究reference image 1',
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
      {...handlers}
      {...overrides}
    />,
  )
  return { ...handlers, ...view }
}

function openMenu() {
  fireEvent.contextMenu(screen.getByTestId('operator-session-row'), {
    clientX: 40,
    clientY: 20,
  })
}

function startRename() {
  openMenu()
  fireEvent.click(screen.getByTestId('operator-session-rename'))
  return screen.getByTestId('operator-session-rename-input') as HTMLInputElement
}

describe('StudioOperatorSessionRow — 行上不放图标（方向 3）', () => {
  it('⭐ 非当前行只有标题和时间：⛔ 铅笔 / 垃圾桶 / ⋯', () => {
    renderRow({ compact: true })
    expect(screen.getByTestId('operator-session-row').textContent).toContain(
      '今天',
    )
    expect(screen.queryByTestId('operator-session-more')).toBeNull()
    expect(screen.queryByTestId('operator-session-rename')).toBeNull()
    expect(screen.queryByTestId('operator-session-delete')).toBeNull()
  })

  it('⭐ 当前行常驻一颗 ⋯（顶替时间），点了开菜单', () => {
    renderRow({ compact: true, current: true })
    expect(
      screen.getByTestId('operator-session-row').textContent,
    ).not.toContain('今天')
    fireEvent.click(screen.getByTestId('operator-session-more'))
    expect(screen.getByTestId('operator-session-menu')).toBeTruthy()
  })

  it('右键任意一行开菜单：重命名 · 删除；删除只交出请求', () => {
    const { onRequestDelete } = renderRow({ compact: true })
    openMenu()
    expect(screen.getByTestId('operator-session-menu')).toBeTruthy()
    fireEvent.click(screen.getByTestId('operator-session-delete'))
    expect(onRequestDelete).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('operator-session-menu')).toBeNull()
  })

  it('inMenu={false}：选中这一格是普通按钮（⛔ 菜单项离了菜单会报错）', () => {
    const { onSelect } = renderRow({ compact: true, inMenu: false })
    const item = screen.getByTestId('operator-session-item')
    expect(item).not.toHaveAttribute('data-mock-menu-item')
    fireEvent.click(item)
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})

describe('StudioOperatorSessionRow — 改名就地', () => {
  it('⭐ 同尺寸输入框、光标在句尾（⛔ 全选）、⛔ 提示行；预填看得见那一句', () => {
    renderRow()
    const input = startRename()
    expect(input).toHaveValue('黄昏光的参考研究')
    fireEvent.focus(input)
    expect(input.selectionStart).toBe('黄昏光的参考研究'.length)
    expect(input.selectionEnd).toBe('黄昏光的参考研究'.length)
    expect(screen.queryByTestId('operator-session-rename-hint')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('⭐ 本来就没标题时预填空串，⛔ 不是那句占位词', () => {
    renderRow({
      session: { ...SESSION, title: null } as AssistantConversationSummary,
    })
    expect(startRename()).toHaveValue('')
  })

  it('白板列里双击进改名；下拉里双击不进（那里单击就选中关菜单）', () => {
    renderRow({ compact: true, inMenu: false })
    fireEvent.doubleClick(screen.getByTestId('operator-session-row'))
    expect(screen.getByTestId('operator-session-rename-input')).toBeTruthy()
    cleanup()
    renderRow({ compact: true })
    fireEvent.doubleClick(screen.getByTestId('operator-session-row'))
    expect(screen.queryByTestId('operator-session-rename-input')).toBeNull()
  })

  it('⭐ 选中键禁用时（在飞）双击照样进改名', () => {
    renderRow({ compact: true, inMenu: false, selectDisabled: true })
    fireEvent.doubleClick(screen.getByTestId('operator-session-row'))
    expect(screen.getByTestId('operator-session-rename-input')).toBeTruthy()
  })

  it('F2 进改名', () => {
    renderRow()
    fireEvent.keyDown(screen.getByTestId('operator-session-row'), {
      key: 'F2',
    })
    expect(screen.getByTestId('operator-session-rename-input')).toBeTruthy()
  })

  it('回车保存', () => {
    const { onRename } = renderRow()
    const input = startRename()
    fireEvent.change(input, { target: { value: '胶片颗粒对比' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.blur(input)
    expect(onRename).toHaveBeenCalledWith('胶片颗粒对比')
    expect(screen.queryByTestId('operator-session-rename-input')).toBeNull()
  })

  it('Esc 取消 —— 紧接着那一拍 blur ⛔ 不许当成保存', () => {
    const { onRename } = renderRow()
    const input = startRename()
    fireEvent.change(input, { target: { value: '改坏了' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    fireEvent.blur(input)
    expect(onRename).not.toHaveBeenCalled()
    expect(screen.queryByTestId('operator-session-rename-input')).toBeNull()
  })

  it('失焦保存；与库里那份一字不差的不发请求', () => {
    const clean = {
      ...SESSION,
      title: '黄昏光的参考研究',
    } as AssistantConversationSummary
    const { onRename } = renderRow({ session: clean })
    fireEvent.blur(startRename())
    expect(onRename).not.toHaveBeenCalled()

    const input = startRename()
    fireEvent.change(input, { target: { value: '换个名字' } })
    fireEvent.blur(input)
    expect(onRename).toHaveBeenCalledWith('换个名字')
  })

  it('⭐ 长标题预填全句，⛔ 带着「…」存回去', () => {
    const long = {
      ...SESSION,
      title: '把罗恩和高尔的黑袍定妆照各生成一次并且对照九宫格试验',
    } as AssistantConversationSummary
    renderRow({ session: long })
    expect(startRename().value.endsWith('…')).toBe(false)
  })
})

describe('StudioOperatorSessionRow — 长相', () => {
  it('⭐ 「工作台 · 日期」连成一句，⛔ 不是隔着一格的两段', () => {
    renderRow()
    expect(screen.getByTestId('operator-session-item').textContent).toContain(
      '图片 · 今天',
    )
  })

  it('⭐ 当前那一行常驻选中底色 + 字重 + `aria-current`；非当前行只有 hover 那一档', () => {
    renderRow({ current: true })
    const row = screen.getByTestId('operator-session-row')
    expect(row.className).toContain('bg-surface-fill ')
    expect(row).toHaveAttribute('aria-current', 'true')
    expect(row.innerHTML).toContain('font-medium')
    cleanup()
    renderRow()
    const other = screen.getByTestId('operator-session-row')
    expect(other.className).not.toContain('bg-surface-fill ')
    expect(other).not.toHaveAttribute('aria-current')
  })

  it('⭐ 底色过渡带 `motion-reduce:transition-none`', () => {
    renderRow()
    expect(screen.getByTestId('operator-session-row').className).toContain(
      'motion-reduce:transition-none',
    )
  })
})

describe('StudioOperatorSessionRow — 删除弹窗（owner 10-27）', () => {
  it('弹窗点删除：关窗、按 id 删', async () => {
    const onClose = vi.fn()
    const onDelete = vi.fn().mockResolvedValue(true)
    render(
      <StudioOperatorSessionDeleteDialog
        target={{ id: 'session-1' }}
        onClose={onClose}
        onDelete={onDelete}
      />,
    )

    expect(screen.getByText('history.deleteTitle')).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'deleteDialog.confirm' }),
    )

    expect(onClose).toHaveBeenCalled()
    expect(onDelete).toHaveBeenCalledWith('session-1')
    await act(async () => {})
    expect(toastError).not.toHaveBeenCalled()
  })

  it('⭐ 删不掉走底部黑条（⛔ 不再塞在列表最底下）', async () => {
    toastError.mockClear()
    render(
      <StudioOperatorSessionDeleteDialog
        target={{ id: 'session-1' }}
        onClose={vi.fn()}
        onDelete={vi.fn().mockResolvedValue(false)}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'deleteDialog.confirm' }),
    )

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('history.deleteFailed'),
    )
  })

  it('没有要删的就不开窗', () => {
    render(
      <StudioOperatorSessionDeleteDialog
        target={null}
        onClose={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.queryByText('history.deleteTitle')).toBeNull()
  })
})
