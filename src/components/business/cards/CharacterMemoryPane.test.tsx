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
    memory({ id: 'm2', text: '观点：猫比狗可爱', pinned: true }),
    memory({ id: 'm3', text: '叫我旅人', source: 'creator' }),
  ],
  dormant: [memory({ id: 'm9', text: '很久以前的事', dormant: true })],
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
    removeFinding: vi.fn(async () => ({ ok: true as const })),
  }
}

describe('CharacterMemoryPane（她页「记忆」栏，第 ⑦ 步）', () => {
  it('全部：钉住的在最前，记得 / 观点 / 见闻都列；见闻只能删', () => {
    render(<CharacterMemoryPane memories={hookOf(list())} />)
    const rows = screen.getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('猫比狗可爱')
    expect(rows[0]).toHaveTextContent('kindOpinion')
    expect(rows[0]).toHaveTextContent('pinned')
    expect(screen.getByText('叫我旅人').parentElement).toHaveTextContent(
      'byYou',
    )
    const finding = rows.find((row) => row.textContent?.includes('PV 好看'))!
    expect(finding).toHaveTextContent('kindFinding')
    expect(finding.querySelectorAll('button')).toHaveLength(1)
  })

  it('切到「见闻」只剩见闻，沉睡那一行不出', () => {
    render(<CharacterMemoryPane memories={hookOf(list())} />)
    fireEvent.click(screen.getByRole('tab', { name: 'filterFinding' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.queryByTestId('character-memory-sleep')).toBeNull()
  })

  it('沉睡折叠在最底下，点开能唤醒', async () => {
    const hook = hookOf(list())
    render(<CharacterMemoryPane memories={hook} />)
    expect(screen.queryByText('很久以前的事')).toBeNull()
    fireEvent.click(screen.getByTestId('character-memory-sleep'))
    expect(screen.getByText('很久以前的事')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'wake' }))
    await waitFor(() => expect(hook.wake).toHaveBeenCalledWith('m9'))
  })

  it('钉住 / 记一条', async () => {
    const hook = hookOf(list())
    render(<CharacterMemoryPane memories={hook} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'pin' })[0]!)
    await waitFor(() => expect(hook.setPinned).toHaveBeenCalledWith('m1', true))
    fireEvent.click(screen.getByRole('button', { name: 'add' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'add' }), {
      target: { value: '她怕打雷' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'save' }))
    await waitFor(() => expect(hook.add).toHaveBeenCalledWith('她怕打雷'))
  })

  it('什么都没有：空状态', () => {
    render(
      <CharacterMemoryPane
        memories={hookOf(list({ remembered: [], dormant: [], findings: [] }))}
      />,
    )
    expect(screen.getByText('emptyTitle')).toBeTruthy()
  })
})
