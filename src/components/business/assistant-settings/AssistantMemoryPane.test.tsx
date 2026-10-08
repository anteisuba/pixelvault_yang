// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSISTANT_PERSONA_DEFAULTS } from '@/constants/assistant-persona'
import type { UseAssistantMemoriesValue } from '@/hooks/use-assistant-memories'
import type { UndoableActionOptions } from '@/lib/undoable-action'
import type { UseAssistantPersonaAutosaveValue } from '@/hooks/use-assistant-persona'
import type { AssistantMemory } from '@/types/assistant-memory'
import type { ProjectRule } from '@/types/assistant-persona'

import { AssistantMemoryPane } from './AssistantMemoryPane'

/**
 * 记忆页（助手设置 B · M-A）的回归闸：一列、你写的 / 助手记的、「让助手记住」、
 * 清空跟着筛选走、两步删、搜图来源名单。
 */

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => {
    const translate = (key: string, values?: Record<string, unknown>) =>
      values
        ? `${namespace}:${key}(${JSON.stringify(values)})`
        : `${namespace}:${key}`
    translate.has = (key: string) => key === 'assistantMemory.limitReached'
    return translate
  },
  useFormatter: () => ({
    dateTime: (_date: Date, options: Record<string, string>) =>
      options.hour ? '14:20' : '09-17',
  }),
}))

/** 删一条走「先拿掉、5 秒后才落库」：测试里把那一下接住，手动撤销 / 落库。 */
const undoable = vi.hoisted(() => ({
  last: null as UndoableActionOptions | null,
}))
vi.mock('@/lib/undoable-action', () => ({
  runUndoableAction: (options: UndoableActionOptions) => {
    undoable.last = options
    options.apply()
  },
}))

const rules = vi.hoisted(() => ({
  current: [] as ProjectRule[],
  add: vi.fn(async () => true),
  remove: vi.fn(async () => true),
}))
vi.mock('@/hooks/use-project-rules', () => ({
  useProjectRules: () => ({
    rules: rules.current,
    isLoading: false,
    error: null,
    add: rules.add,
    remove: rules.remove,
    reload: vi.fn(),
  }),
}))

const TODAY = new Date()
TODAY.setHours(14, 20, 0, 0)

function memory(overrides: Partial<AssistantMemory> = {}): AssistantMemory {
  return {
    id: 'mem-1',
    scope: 'global',
    kind: 'preference',
    source: 'assistant',
    text: '喜欢日系赛璐璐、线条干净',
    createdAt: TODAY.toISOString(),
    updatedAt: TODAY.toISOString(),
    ...overrides,
  }
}

const MINE = memory({
  id: 'mine-1',
  kind: 'rule',
  source: 'creator',
  scope: 'image',
  text: '角色图默认用 NovelAI V4.5 Full',
})
const LEARNED = memory({ id: 'learned-1' })

const store = {
  create: vi.fn(),
  update: vi.fn(async () => null),
  remove: vi.fn(async () => true),
  clear: vi.fn(async () => true),
}
const apply = vi.fn()

function renderPane(
  memories: AssistantMemory[],
  options: {
    isLoading?: boolean
    error?: UseAssistantMemoriesValue['error']
    memoryCapture?: boolean
  } = {},
) {
  const value: UseAssistantMemoriesValue = {
    memories,
    isLoading: options.isLoading ?? false,
    error: options.error ?? null,
    create: store.create,
    update: store.update,
    remove: store.remove,
    clear: store.clear,
    reload: vi.fn(),
  }
  const persona = {
    ...ASSISTANT_PERSONA_DEFAULTS,
    memoryCapture: options.memoryCapture ?? true,
  }
  const autosave = {
    persona,
    draft: persona,
    status: 'idle',
    isLoading: false,
    edit: vi.fn(),
    apply,
    replace: vi.fn(),
    commit: vi.fn(),
    retry: vi.fn(),
    uploadAvatar: vi.fn(),
  } as unknown as UseAssistantPersonaAutosaveValue
  return render(<AssistantMemoryPane memories={value} autosave={autosave} />)
}

function rowTexts(): string[] {
  return screen
    .queryAllByTestId('assistant-memory-row')
    .map((row) => row.querySelector('button')?.textContent ?? '')
}

beforeEach(() => {
  vi.clearAllMocks()
  rules.current = []
  undoable.last = null
})

describe('AssistantMemoryPane · 一列（M-A）', () => {
  it('空态：一句话 + 「写第一条」把光标送进输入框', () => {
    renderPane([])
    expect(
      screen.getByText('AssistantSettings:memory.emptyTitle'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByText('AssistantSettings:memory.emptyAction'))
    expect(screen.getByTestId('assistant-memory-new')).toHaveFocus()
  })

  it('还在读：⛔ 不闪「还没有记忆」', () => {
    renderPane([], { isLoading: true })
    expect(screen.getByText('AssistantSettings:memory.loading')).toBeTruthy()
    expect(screen.queryByText('AssistantSettings:memory.emptyTitle')).toBeNull()
  })

  it('每行标「你写的 / 助手记的」；只有不是全部工作台的才挂范围标签', () => {
    renderPane([MINE, LEARNED])
    expect(rowTexts()).toEqual([MINE.text, LEARNED.text])
    expect(
      screen.getByText('AssistantSettings:memory.scope.image'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('AssistantSettings:memory.scope.global'),
    ).toBeNull()
    expect(
      screen.getByText(/memory\.meta\(.*memory\.source\.creator.*today/),
    ).toBeInTheDocument()
  })

  it('筛选：你写的 / 助手记的 纯前端收窄；这一类没有时说一句', () => {
    renderPane([MINE, LEARNED])
    fireEvent.click(screen.getByTestId('assistant-memory-filter-creator'))
    expect(rowTexts()).toEqual([MINE.text])
    fireEvent.click(screen.getByTestId('assistant-memory-filter-assistant'))
    expect(rowTexts()).toEqual([LEARNED.text])
  })

  it('筛选后这一类空了：「这一类还没有。」', () => {
    renderPane([LEARNED])
    fireEvent.click(screen.getByTestId('assistant-memory-filter-creator'))
    expect(
      screen.getByText('AssistantSettings:memory.filteredEmpty'),
    ).toBeInTheDocument()
    // 这一类是空的就没有东西可清。
    expect(screen.queryByTestId('assistant-memory-clear')).toBeNull()
  })
})

describe('AssistantMemoryPane · 写一条', () => {
  it('回车存成「你写的」，存好清空输入框', async () => {
    store.create.mockResolvedValue(
      memory({ id: 'new-1', source: 'creator', text: '以后都用中文回复' }),
    )
    renderPane([LEARNED])
    const input = screen.getByTestId('assistant-memory-new')
    fireEvent.change(input, { target: { value: '  以后都用中文回复 ' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() =>
      expect(store.create).toHaveBeenCalledWith({ text: '以后都用中文回复' }),
    )
    await waitFor(() => expect(input).toHaveValue(''))
  })

  it('没存上时字留着，⛔ 不清空', async () => {
    store.create.mockResolvedValue(null)
    renderPane([])
    const input = screen.getByTestId('assistant-memory-new')
    fireEvent.change(input, { target: { value: '再来一条' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(store.create).toHaveBeenCalled())
    expect(input).toHaveValue('再来一条')
  })

  it('Esc 清空输入框，⛔ 不存', () => {
    renderPane([])
    const input = screen.getByTestId('assistant-memory-new')
    fireEvent.change(input, { target: { value: '算了' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input).toHaveValue('')
    expect(store.create).not.toHaveBeenCalled()
  })

  it('你写的满了：说人话（Errors 里那句），⛔ 不印英文原话', () => {
    renderPane([], {
      error: {
        message: 'Creator memory limit reached (50)',
        i18nKey: 'errors.assistantMemory.limitReached',
      },
    })
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Errors:assistantMemory.limitReached',
    )
  })

  it('没有 i18nKey 的失败：一句通用的「没存上」', () => {
    renderPane([], { error: { message: 'Failed to save memory' } })
    expect(screen.getByRole('alert')).toHaveTextContent(
      'AssistantSettings:memory.failed',
    )
  })
})

describe('AssistantMemoryPane · 让助手记住', () => {
  it('开关跟着人设；关掉当场存 memoryCapture=false', () => {
    renderPane([LEARNED])
    const toggle = screen.getByTestId('assistant-memory-capture')
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(toggle)
    expect(apply).toHaveBeenCalledWith({ memoryCapture: false })
  })

  it('关着时说明换成「不再记新的，清单照样生效」', () => {
    renderPane([LEARNED], { memoryCapture: false })
    expect(
      screen.getByText('AssistantSettings:memory.captionPaused'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('assistant-memory-capture')).toHaveAttribute(
      'aria-checked',
      'false',
    )
  })
})

describe('AssistantMemoryPane · 改 / 删', () => {
  it('点文字就地改：回车只存那一行字', async () => {
    renderPane([LEARNED])
    fireEvent.click(screen.getByText(LEARNED.text))
    const input = screen.getByLabelText('AssistantSettings:memory.editLabel')
    fireEvent.change(input, { target: { value: '喜欢赛璐璐' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() =>
      expect(store.update).toHaveBeenCalledWith('learned-1', {
        text: '喜欢赛璐璐',
      }),
    )
  })

  it('Esc 取消：一个字都不写回去', () => {
    renderPane([LEARNED])
    fireEvent.click(screen.getByText(LEARNED.text))
    const input = screen.getByLabelText('AssistantSettings:memory.editLabel')
    fireEvent.change(input, { target: { value: '改坏了' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(store.update).not.toHaveBeenCalled()
    expect(screen.getByText(LEARNED.text)).toBeInTheDocument()
  })

  it('「用在哪」选一项当场存', async () => {
    renderPane([LEARNED])
    fireEvent.click(screen.getByText(LEARNED.text))
    fireEvent.pointerDown(screen.getByTestId('assistant-memory-scope'), {
      button: 0,
      ctrlKey: false,
    })
    fireEvent.click(
      await screen.findByText('AssistantSettings:memory.scope.video'),
    )
    await waitFor(() =>
      expect(store.update).toHaveBeenCalledWith('learned-1', {
        scope: 'video',
      }),
    )
  })

  it('就地改完：时间那一格闪「✓ 已保存」，⛔ 不弹提示', async () => {
    store.update.mockResolvedValueOnce(memory({ text: '喜欢赛璐璐' }) as never)
    renderPane([LEARNED])
    fireEvent.click(screen.getByText(LEARNED.text))
    const input = screen.getByLabelText('AssistantSettings:memory.editLabel')
    fireEvent.change(input, { target: { value: '喜欢赛璐璐' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(
      await screen.findByText('AssistantSettings:memory.saved'),
    ).toBeInTheDocument()
  })

  it('删要点两下：先拉长成「确认删除」，再点这一行收起、底部黑条给撤销', async () => {
    renderPane([LEARNED])
    const del = screen.getByTestId('assistant-memory-delete')
    fireEvent.click(del)
    expect(undoable.last).toBeNull()
    expect(del).toHaveTextContent('AssistantSettings:memory.deleteConfirm')
    expect(del).toHaveAttribute('data-feedback', 'danger')
    fireEvent.click(del)

    expect(undoable.last?.message).toBe('AssistantSettings:memory.deleted')
    expect(undoable.last?.undoLabel).toBe('AssistantSettings:memory.undo')
    // 先在界面上拿掉，服务端还没碰。
    await waitFor(() => expect(rowTexts()).toEqual([]))
    expect(store.remove).not.toHaveBeenCalled()

    // 撤销：原样放回来。
    act(() => undoable.last?.undo())
    await waitFor(() => expect(rowTexts()).toEqual([LEARNED.text]))
    expect(store.remove).not.toHaveBeenCalled()
  })

  it('撤销窗口过了才真删', async () => {
    renderPane([LEARNED])
    const del = screen.getByTestId('assistant-memory-delete')
    fireEvent.click(del)
    fireEvent.click(del)
    await act(async () => {
      await undoable.last?.commit()
    })
    expect(store.remove).toHaveBeenCalledWith('learned-1')
  })
})

describe('AssistantMemoryPane · 清空跟着筛选走', () => {
  it('全部：正中弹窗写清你写的也一起删，确认才清', async () => {
    renderPane([MINE, LEARNED])
    fireEvent.click(screen.getByTestId('assistant-memory-clear'))
    const dialog = await screen.findByRole('alertdialog')
    expect(
      within(dialog).getByText(
        /memory\.clear\.descAllWithMine\(\{"count":1\}\)/,
      ),
    ).toBeInTheDocument()
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'AssistantSettings:memory.clear.all',
      }),
    )
    await waitFor(() => expect(store.clear).toHaveBeenCalledWith(undefined))
  })

  it('筛着助手记的：只清助手记的', async () => {
    renderPane([MINE, LEARNED])
    fireEvent.click(screen.getByTestId('assistant-memory-filter-assistant'))
    expect(screen.getByTestId('assistant-memory-clear')).toHaveTextContent(
      'AssistantSettings:memory.clear.assistant',
    )
    fireEvent.click(screen.getByTestId('assistant-memory-clear'))
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'AssistantSettings:memory.clear.assistant',
      }),
    )
    await waitFor(() => expect(store.clear).toHaveBeenCalledWith('assistant'))
  })

  it('取消不清', async () => {
    renderPane([LEARNED])
    fireEvent.click(screen.getByTestId('assistant-memory-clear'))
    fireEvent.click(
      await screen.findByText('AssistantSettings:memory.clear.cancel'),
    )
    expect(store.clear).not.toHaveBeenCalled()
  })
})

describe('AssistantMemoryPane · 搜图来源', () => {
  const rule = (id: string, kind: ProjectRule['kind'], text: string) => ({
    id,
    scope: null,
    text,
    kind,
    source: 'creator' as const,
    createdAt: '2026-09-20T00:00:00.000Z',
  })

  it('两行名单各自列出；× 移除那一条', () => {
    rules.current = [
      rule('r1', 'sourceAllow', 'danbooru.donmai.us'),
      rule('r2', 'sourceDeny', 'pinterest.com'),
    ]
    renderPane([])
    expect(screen.getByText('danbooru.donmai.us')).toBeInTheDocument()
    fireEvent.click(
      screen.getByLabelText(
        'AssistantSettings:sources.remove({"token":"pinterest.com"})',
      ),
    )
    expect(rules.remove).toHaveBeenCalledWith('r2')
  })

  it('添加：把地址收成域名再存；一句话不收', async () => {
    renderPane([])
    const [allowAdd] = screen.getAllByText('AssistantSettings:sources.add')
    fireEvent.click(allowAdd!)
    const input = screen.getByLabelText('AssistantSettings:sources.addLabel')

    fireEvent.change(input, { target: { value: '只信官方站' } })
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
    })
    expect(rules.add).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'AssistantSettings:sources.invalid',
    )

    fireEvent.change(input, {
      target: { value: 'https://www.Danbooru.donmai.us/posts' },
    })
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
    })
    expect(rules.add).toHaveBeenCalledWith({
      text: 'danbooru.donmai.us',
      kind: 'sourceAllow',
    })
  })
})
