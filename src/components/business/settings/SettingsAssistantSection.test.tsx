import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AssistantMemory } from '@/types/assistant-memory'

import { SettingsAssistantSection } from './SettingsAssistantSection'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => {
    const translate = (key: string, values?: Record<string, unknown>) =>
      values
        ? `${namespace}:${key}(${JSON.stringify(values)})`
        : `${namespace}:${key}`
    return translate
  },
  useFormatter: () => ({
    dateTime: (date: Date, options: Record<string, string>) =>
      options.hour ? '14:20' : '9/17',
  }),
}))

vi.mock('@/hooks/use-assistant-persona', () => ({
  useAssistantPersona: () => ({
    persona: { verbosity: 'standard' },
    isSaving: false,
    save: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-local-preference', () => ({
  useLocalPreference: () => ['0', mockSetIncognito],
}))

const mockSetIncognito = vi.hoisted(() => vi.fn())
const mockUpdate = vi.hoisted(() => vi.fn(async () => null))
const mockRemove = vi.hoisted(() => vi.fn(async () => true))
const mockClearAll = vi.hoisted(() => vi.fn(async () => true))
const mockMemories = vi.hoisted(() => ({ current: [] as AssistantMemory[] }))

vi.mock('@/hooks/use-assistant-memories', () => ({
  useAssistantMemories: () => ({
    memories: mockMemories.current,
    isLoading: false,
    error: null,
    update: mockUpdate,
    remove: mockRemove,
    clearAll: mockClearAll,
    reload: vi.fn(),
  }),
}))

const TODAY = new Date()
TODAY.setHours(14, 20, 0, 0)

function memory(overrides: Partial<AssistantMemory> = {}): AssistantMemory {
  return {
    id: 'mem-1',
    scope: 'image',
    kind: 'preference',
    text: '偏好横构图 16:9，除非我明说要竖的',
    createdAt: TODAY.toISOString(),
    updatedAt: TODAY.toISOString(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockMemories.current = []
})

describe('SettingsAssistantSection · 记忆区（56a）', () => {
  it('⭐ 空态：一句话 + 隐身入口，⛔ 不摆示例记忆', () => {
    render(<SettingsAssistantSection />)

    expect(
      screen.getByText('Settings:assistant.memoryEmpty'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Settings:assistant.memoryEmptyHint'),
    ).toBeInTheDocument()
    // 空态里没有筛选 chip、也没有「全部清空」。
    expect(
      screen.queryByText('Settings:assistant.memoryClearAll'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Settings:assistant.memoryScope.all'),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Settings:assistant.memoryIncognitoCta'))
    expect(mockSetIncognito).toHaveBeenCalledWith('1')
  })

  it('⭐ 一行字 + 时间，按服务端给的顺序原样渲染（⛔ 不在前端重排）', () => {
    const older = new Date(TODAY.getTime() - 8 * 86_400_000).toISOString()
    mockMemories.current = [
      memory(),
      memory({ id: 'mem-2', text: '训练集偏好 40 张以内', updatedAt: older }),
    ]
    render(<SettingsAssistantSection />)

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('偏好横构图 16:9，除非我明说要竖的')
    expect(rows[1]).toHaveTextContent('训练集偏好 40 张以内')
    // 今天 HH:mm · 更早的走 M/D。
    expect(rows[0]).toHaveTextContent('14:20')
    expect(rows[1]).toHaveTextContent('9/17')
  })

  it('⭐ 筛选 chip 纯前端收窄，默认全部', () => {
    mockMemories.current = [
      memory(),
      memory({ id: 'mem-2', scope: 'video', text: '视频默认 24fps' }),
      memory({ id: 'mem-3', scope: 'global', text: '回答用中文' }),
    ]
    render(<SettingsAssistantSection />)

    // 默认「全部」：global 那条也在（⛔ 它没有自己的 chip）。
    expect(screen.getAllByRole('listitem')).toHaveLength(3)

    fireEvent.click(screen.getByText('Settings:assistant.memoryScope.video'))
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('视频默认 24fps')
  })

  it('⭐ 点文字就地改：回车保存', () => {
    mockMemories.current = [memory()]
    render(<SettingsAssistantSection />)

    fireEvent.click(screen.getByText('偏好横构图 16:9，除非我明说要竖的'))
    const input = screen.getByLabelText('Settings:assistant.memoryEditLabel')
    fireEvent.change(input, { target: { value: '偏好竖构图 9:16' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.blur(input)

    expect(mockUpdate).toHaveBeenCalledWith('mem-1', '偏好竖构图 9:16')
  })

  it('⛔ Esc 取消：一个字都不写回去', () => {
    mockMemories.current = [memory()]
    render(<SettingsAssistantSection />)

    fireEvent.click(screen.getByText('偏好横构图 16:9，除非我明说要竖的'))
    const input = screen.getByLabelText('Settings:assistant.memoryEditLabel')
    fireEvent.change(input, { target: { value: '改坏了' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    fireEvent.blur(input)

    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('⛔ 就地改不弹层', () => {
    mockMemories.current = [memory()]
    render(<SettingsAssistantSection />)
    fireEvent.click(screen.getByText('偏好横构图 16:9，除非我明说要竖的'))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('⭐ 行尾那颗「删」真删（唯一动作）', () => {
    mockMemories.current = [memory()]
    render(<SettingsAssistantSection />)

    const row = screen.getAllByRole('listitem')[0]
    const buttons = within(row).getAllByRole('button')
    // 一行上只有两颗可点：文字本身（就地改）与「删」。
    expect(buttons).toHaveLength(2)
    fireEvent.click(screen.getByLabelText('Settings:assistant.memoryDelete'))
    expect(mockRemove).toHaveBeenCalledTimes(1)
  })

  it('⭐ 「全部清空」走二次确认，取消不清', () => {
    mockMemories.current = [memory()]
    render(<SettingsAssistantSection />)

    fireEvent.click(screen.getByText('Settings:assistant.memoryClearAll'))
    expect(
      screen.getByText('Settings:assistant.memoryClearTitle'),
    ).toBeInTheDocument()
    expect(mockClearAll).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('Settings:assistant.memoryCancel'))
    expect(mockClearAll).not.toHaveBeenCalled()
  })

  it('⭐ 确认之后才清', () => {
    mockMemories.current = [memory()]
    render(<SettingsAssistantSection />)

    fireEvent.click(screen.getByText('Settings:assistant.memoryClearAll'))
    fireEvent.click(screen.getByText('Settings:assistant.memoryClearConfirm'))
    expect(mockClearAll).toHaveBeenCalledTimes(1)
  })

  it('⛔ 「不记的类目」整块已退场（负规则不做）', () => {
    mockMemories.current = [memory()]
    render(<SettingsAssistantSection />)
    expect(
      screen.queryByText('Settings:assistant.mutedLabel'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Settings:assistant.addMuted'),
    ).not.toBeInTheDocument()
  })
})
