import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { AssistantMemory } from '@/types/assistant-memory'
import type { CharacterMemoryList } from '@/types/character-growth'

vi.mock('next-intl', () => {
  const t = (key: string, values?: Record<string, string | number>) =>
    values ? `${key}|${Object.values(values).join(',')}` : key
  t.has = () => false
  return {
    useTranslations: () => t,
    useFormatter: () => ({ dateTime: () => '10/30' }),
  }
})
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

import { CharacterMemoryPane } from './CharacterMemoryPane'

const memory = (patch: Partial<AssistantMemory> = {}): AssistantMemory => ({
  id: 'm1',
  scope: 'cards',
  kind: 'fact',
  source: 'assistant',
  text: '主人周六要去海边',
  characterCardId: 'card-1',
  pinned: false,
  expiresAt: null,
  dormant: false,
  createdAt: '2026-10-30T01:00:00.000Z',
  updatedAt: '2026-10-30T01:00:00.000Z',
  ...patch,
})

const list = (
  patch: Partial<CharacterMemoryList> = {},
): CharacterMemoryList => ({
  remembered: [
    memory(),
    memory({
      id: 'm2',
      text: '叫我旅人',
      source: 'creator',
      pinned: true,
      updatedAt: '2026-10-29T01:00:00.000Z',
    }),
    // 观点住在「小房间」的活动记录里，这一页不列
    memory({ id: 'o1', text: '观点：猫比狗可爱' }),
  ],
  dormant: [
    memory({ id: 'm9', text: '很久以前的事', dormant: true }),
    memory({ id: 'o9', text: '观点：睡着的观点', dormant: true }),
  ],
  findings: [
    {
      id: 'f1',
      source: 'bilibili',
      url: 'https://www.bilibili.com/video/BV1',
      title: '新番 PV',
      note: '这个 PV 好看',
      seenAt: '2026-10-29T01:00:00.000Z',
    },
  ],
  ...patch,
})

function hookOf(data: CharacterMemoryList | null) {
  return {
    list: data,
    isLoading: false,
    error: null,
    reload: vi.fn(),
    add: vi.fn(async () => ({ ok: true as const })),
    edit: vi.fn(async () => ({ ok: true as const })),
    setPinned: vi.fn(async () => ({ ok: true as const })),
    wake: vi.fn(async () => ({ ok: true as const })),
    remove: vi.fn(async () => ({ ok: true as const })),
  }
}

describe('CharacterMemoryPane（她页「记忆」页签：只留记忆）', () => {
  it('只列她记得的：钉住的在最前；没有筛选条，见闻和观点都不在这页', () => {
    render(<CharacterMemoryPane memories={hookOf(list())} />)
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('叫我旅人')
    expect(rows[0]).toHaveTextContent('pinned')
    expect(rows[0]).toHaveTextContent('byYou')
    expect(rows[1]).toHaveTextContent('主人周六要去海边')
    expect(screen.queryByRole('tab')).toBeNull()
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.queryByText('猫比狗可爱')).toBeNull()
    expect(screen.queryByText(/PV 好看/)).toBeNull()
  })

  it('沉睡折叠在最底下，点开能唤醒；睡着的观点不算在这里', async () => {
    const hook = hookOf(list())
    render(<CharacterMemoryPane memories={hook} />)
    expect(screen.getByTestId('character-memory-sleep')).toHaveTextContent(
      'sleeping|1',
    )
    expect(screen.queryByText('很久以前的事')).toBeNull()
    fireEvent.click(screen.getByTestId('character-memory-sleep'))
    expect(screen.getByText('很久以前的事')).toBeTruthy()
    expect(screen.queryByText('睡着的观点')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'wake' }))
    await waitFor(() => expect(hook.wake).toHaveBeenCalledWith('m9'))
  })

  it('钉住 / 改 / 删 / 记一条', async () => {
    const hook = hookOf(list())
    render(<CharacterMemoryPane memories={hook} />)
    fireEvent.click(screen.getByRole('button', { name: 'pin' }))
    await waitFor(() => expect(hook.setPinned).toHaveBeenCalledWith('m1', true))
    fireEvent.click(screen.getByRole('button', { name: 'unpin' }))
    await waitFor(() =>
      expect(hook.setPinned).toHaveBeenCalledWith('m2', false),
    )

    fireEvent.click(screen.getByRole('button', { name: 'add' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'add' }), {
      target: { value: '她怕打雷' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'save' }))
    await waitFor(() => expect(hook.add).toHaveBeenCalledWith('她怕打雷'))

    fireEvent.click(screen.getAllByRole('button', { name: 'delete' })[0]!)
    expect(hook.remove).not.toHaveBeenCalled()
    expect(screen.getByText('deleteTitle')).toBeTruthy()
  })

  it('记得的和沉睡的里都只有观点 / 见闻时：空状态（观点和见闻在小房间管）', () => {
    render(
      <CharacterMemoryPane
        memories={hookOf(
          list({
            remembered: [memory({ id: 'o1', text: '观点：猫比狗可爱' })],
            dormant: [memory({ id: 'o9', text: '观点：睡着的观点' })],
          }),
        )}
      />,
    )
    expect(screen.getByText('emptyTitle')).toBeTruthy()
    expect(screen.queryByTestId('character-memory-sleep')).toBeNull()
  })

  it('什么都没有：空状态', () => {
    render(
      <CharacterMemoryPane
        memories={hookOf(list({ remembered: [], dormant: [], findings: [] }))}
      />,
    )
    expect(screen.getByText('emptyTitle')).toBeTruthy()
  })

  it('没读出来：错误态带重试', () => {
    const hook = hookOf(null)
    render(<CharacterMemoryPane memories={hook} />)
    fireEvent.click(screen.getByRole('button', { name: 'retry' }))
    expect(hook.reload).toHaveBeenCalled()
  })
})
