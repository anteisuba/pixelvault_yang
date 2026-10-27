// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ASSISTANT_SURFACE_IDS } from '@/types/assistant-conversation'
import type { AssistantConversationSummary } from '@/types/assistant-conversation'

import {
  StudioOperatorSessionDeleteDialog,
  StudioOperatorSessionRow,
} from './StudioOperatorSessionRow'

/**
 * 历史会话行的回归闸（owner 2026-09-20 真机第 3 条 + D7c ④ 画板）。
 *
 * 钉七件事：
 *  ① 点铅笔 = **就地**出现输入框，⛔ 屏幕上一个 dialog 都没有，且进来就全选；
 *  ② 回车保存 · Esc 取消 · 失焦保存（与 56a 记忆行同一套）；
 *  ③ 点垃圾桶只交出 `onRequestDelete`；确认在弹窗里（owner 10-27「像 Claude」），删不掉走黑条；
 *  ⑤ ⭐ 两层一行：「工作台 · 日期」连在一起，⛔ 不是隔着一格的两段；
 *  ⑥ ⭐ 两颗图标**默认不可见**（只动 `opacity`，位子常驻），hover / 聚焦才淡入；
 *  ⑦ ⭐ 动的那几处都挂着 `motion-reduce:transition-none`（D7c ④ 动效表末行）；
 *  ⑧ ⭐ 「哪条是当前」由**行自己**说：⛔ 没有那枚 ✓，改成常驻选中底色 + 字重，
 *     语义由 `aria-current` 顶上。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}(${Object.values(values).join(',')})` : key,
}))

const toastError = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { error: toastError } }))

vi.mock('@/components/ui/dropdown-menu', () => ({
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
}))

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

afterEach(() => {
  vi.useRealTimers()
})

describe('StudioOperatorSessionRow — 摆在框里（用户 10-26 历史列）', () => {
  it('inMenu={false}：三格都是普通按钮（⛔ 菜单项离了菜单会报错），点了照样选中 / 改名 / 删除', () => {
    const { onSelect, onRequestDelete, container } = renderRow({
      compact: true,
      inMenu: false,
    })
    expect(container.querySelector('[data-mock-menu-item]')).toBeNull()

    fireEvent.click(screen.getByTestId('operator-session-item'))
    expect(onSelect).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByTestId('operator-session-delete'))
    expect(onRequestDelete).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByTestId('operator-session-rename'))
    expect(screen.getByTestId('operator-session-rename-input')).toBeTruthy()
  })
})

describe('StudioOperatorSessionRow — 编辑就地', () => {
  it('点铅笔直接变输入框，⛔ 不弹层；第二行换成操作提示', () => {
    renderRow()
    expect(screen.queryByTestId('operator-session-rename-input')).toBeNull()

    fireEvent.click(screen.getByTestId('operator-session-rename'))

    const input = screen.getByTestId('operator-session-rename-input')
    // ⭐ 预填的是**看得见的那一句**，⛔ 不是库里带噪音的那一份（owner：
    //   「最好是总结的标题，就像 claude 那样」）。
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

  /**
   * 派生不出标题时（这条会话本来就没名字）填**空串**：⛔ 不填
   * `history.untitled` —— 那是一句占位，用户一回车就会把「未命名会话」存成真标题。
   */
  it('⭐ 本来就没标题时预填空串，⛔ 不是那句占位词', () => {
    renderRow({
      session: { ...SESSION, title: null } as AssistantConversationSummary,
    })
    fireEvent.click(screen.getByTestId('operator-session-rename'))
    expect(screen.getByTestId('operator-session-rename-input')).toHaveValue('')
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

  it('失焦保存；与库里那份一字不差的不发请求', () => {
    const clean = {
      ...SESSION,
      title: '黄昏光的参考研究',
    } as AssistantConversationSummary
    const { onRename } = renderRow({ session: clean })
    fireEvent.click(screen.getByTestId('operator-session-rename'))
    fireEvent.blur(screen.getByTestId('operator-session-rename-input'))
    expect(onRename).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('operator-session-rename'))
    const input = screen.getByTestId('operator-session-rename-input')
    fireEvent.change(input, { target: { value: '换个名字' } })
    fireEvent.blur(input)
    expect(onRename).toHaveBeenCalledWith('换个名字')
  })

  /**
   * ⭐ **所见即所改**（owner 拍板）：存量噪音标题下直接回车，存下去的就是行上
   * 看得见的那一句 —— 用户不用先手删一串 `reference image N`。
   */
  it('⭐ 带噪音的标题：什么都不改直接回车，存的是看得见那一句', () => {
    const { onRename } = renderRow()
    fireEvent.click(screen.getByTestId('operator-session-rename'))
    const input = screen.getByTestId('operator-session-rename-input')
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.blur(input)
    expect(onRename).toHaveBeenCalledWith('黄昏光的参考研究')
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
})

describe('StudioOperatorSessionRow — 当前那一条', () => {
  /**
   * owner 2026-09-20 真机：「选中不要有这个 ✅。直接做成选中态就可以了。」
   * 那枚 ✓ 与铅笔、垃圾桶同尺寸同位置，看起来是第三颗按钮、实际按不了。
   */
  it('⭐ ⛔ 没有那枚 ✓；当前那一行常驻选中底色 + 字重上一档', () => {
    renderRow({ current: true })
    const row = screen.getByTestId('operator-session-row')
    // 图标槽只剩两颗（改名 · 删除）。
    expect(
      screen.getByTestId('operator-session-actions').children,
    ).toHaveLength(2)
    // 三档底色：选中静息 4% < 任意行 hover 7% < 选中且 hover 11%。
    expect(row.className).toContain('bg-surface-fill')
    expect(row.className).toContain('hover:bg-surface-fill-track')
    // 字重那一条只看**标题那一格**：删除药丸里的「确认」也是 medium。
    const title = screen
      .getByTestId('operator-session-item')
      .querySelector('.truncate') as HTMLElement
    expect(title.textContent).toBe('黄昏光的参考研究')
    expect(title.className).toContain('font-medium')
  })

  it('非当前那一行只有 hover 那一档，⛔ 不常驻底色', () => {
    renderRow()
    const row = screen.getByTestId('operator-session-row')
    expect(row.className).toContain('hover:bg-surface-fill-hover')
    // ⛔ 静息态不许带底色 —— 否则整张列表看起来每一条都是当前。
    expect(row.className).not.toMatch(/(^|\s)bg-surface-fill/)
    const title = screen
      .getByTestId('operator-session-item')
      .querySelector('.truncate') as HTMLElement
    expect(title.className).not.toContain('font-medium')
  })

  /**
   * ⭐ ✓ 曾经是唯一告诉读屏「这是当前项」的东西 —— 删了它，语义必须由
   * `aria-current` 顶上。⛔ 选中态那层底色对读屏什么都没说。
   */
  it('⭐ 当前行带 `aria-current`，非当前行不带', () => {
    renderRow({ current: true })
    expect(
      screen.getByTestId('operator-session-row').getAttribute('aria-current'),
    ).toBe('true')

    cleanup()
    renderRow()
    expect(
      screen.getByTestId('operator-session-row').hasAttribute('aria-current'),
    ).toBe(false)
  })
})

describe('StudioOperatorSessionRow — 降级', () => {
  /**
   * D7c ④ 动效表末行：「全部包在 `motion-reduce:` 里」。这一行里动的几处都是
   * `transition-*`（底色 / 图标淡入），所以都用 `transition-none`。
   * ⛔ 这条红 = 有人把降级删了。
   */
  it('⭐ 底色 · 图标淡入 · 两颗钮都带 `motion-reduce:transition-none`', () => {
    renderRow()
    for (const id of [
      'operator-session-row',
      'operator-session-actions',
      'operator-session-rename',
      'operator-session-delete',
    ]) {
      expect(screen.getByTestId(id).className).toContain(
        'motion-reduce:transition-none',
      )
    }
  })
})

describe('StudioOperatorSessionRow — 删除弹窗（owner 10-27）', () => {
  it('点垃圾桶只交出请求，⛔ 不删、⛔ 不在行上撑确认药丸', () => {
    const { onRequestDelete } = renderRow()

    fireEvent.click(screen.getByTestId('operator-session-delete'))

    expect(onRequestDelete).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('operator-session-delete').textContent).toBe('')
  })

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
