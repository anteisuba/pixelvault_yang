import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AssistantMemory } from '@/types/assistant-memory'
import type { CharacterMemoryList } from '@/types/character-growth'

const api = vi.hoisted(() => ({
  getCharacterMemoriesAPI: vi.fn(),
  deleteAssistantMemoryAPI: vi.fn(),
  createCharacterMemoryAPI: vi.fn(),
  updateAssistantMemoryAPI: vi.fn(),
}))

vi.mock('@/lib/api-client', () => api)

import { useCharacterMemories } from '@/features/cards/hooks/use-character-memories'

const memory = (id: string): AssistantMemory =>
  ({
    id,
    text: `记忆 ${id}`,
    updatedAt: '2026-11-01T00:00:00.000Z',
  }) as AssistantMemory

const LIST: CharacterMemoryList = {
  remembered: [memory('a'), memory('b'), memory('c')],
  dormant: [memory('z')],
  findings: [],
}

async function mounted() {
  api.getCharacterMemoriesAPI.mockResolvedValue({ success: true, data: LIST })
  const hook = renderHook(() => useCharacterMemories('card-1'))
  await waitFor(() => expect(hook.result.current.list).not.toBeNull())
  return hook
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useCharacterMemories · 删', () => {
  it('点了删那条立刻从手里拿掉，不等请求回来', async () => {
    const hook = await mounted()
    let resolveDelete!: (value: { success: true }) => void
    api.deleteAssistantMemoryAPI.mockReturnValue(
      new Promise((resolve) => {
        resolveDelete = resolve
      }),
    )
    let pending!: Promise<unknown>
    act(() => {
      pending = hook.result.current.remove('b')
    })
    expect(hook.result.current.list?.remembered.map((row) => row.id)).toEqual([
      'a',
      'c',
    ])
    await act(async () => {
      resolveDelete({ success: true })
      await pending
    })
    expect(hook.result.current.list?.remembered.map((row) => row.id)).toEqual([
      'a',
      'c',
    ])
  })

  it('删失败：原位放回，并把失败交给调用方提示', async () => {
    const hook = await mounted()
    api.deleteAssistantMemoryAPI.mockResolvedValue({
      success: false,
      error: 'boom',
    })
    let result: unknown
    await act(async () => {
      result = await hook.result.current.remove('b')
    })
    expect(result).toMatchObject({ ok: false, error: 'boom' })
    expect(hook.result.current.list?.remembered.map((row) => row.id)).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  it('沉睡区那条删失败也回到沉睡区', async () => {
    const hook = await mounted()
    api.deleteAssistantMemoryAPI.mockResolvedValue({
      success: false,
      error: 'boom',
    })
    await act(async () => {
      await hook.result.current.remove('z')
    })
    expect(hook.result.current.list?.dormant.map((row) => row.id)).toEqual([
      'z',
    ])
  })
})
