import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn() }))
vi.mock('@/lib/api-client/prompt-tag-stack', () => ({
  getPromptTagStackAPI: api.get,
  savePromptTagStackAPI: api.save,
}))
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, userId: 'clerk_1' }),
}))

import type {
  PromptTagDefinition,
  PromptTagSelection,
} from '@/types/prompt-tags'

import { PromptTagProvider, usePromptTagStack } from './use-prompt-tag-stack'

const wrapper = ({ children }: { children: ReactNode }) => (
  <PromptTagProvider>{children}</PromptTagProvider>
)

const selection: PromptTagSelection = {
  id: 's1',
  tagId: 'danbooru:pink_hair',
  promptText: 'pink hair',
  label: 'pink hair',
  polarity: 'positive',
  source: 'danbooru',
  type: 'character_trait',
  enabled: true,
  orderIndex: 0,
  insertedAt: '2026-10-01T00:00:00.000Z',
}

const tag: PromptTagDefinition = {
  id: 'danbooru:smile',
  type: 'character_trait',
  source: 'danbooru',
  label: 'smile',
  promptText: 'smile',
  aliases: [],
  category: 'general',
  polarity: 'positive',
  modelFamilies: ['any'],
  orderGroup: 0,
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  api.save.mockResolvedValue(undefined)
})

describe('usePromptTagStack', () => {
  it('reads the stack from the account', async () => {
    api.get.mockResolvedValue({ positive: [selection], negative: [] })
    const { result } = renderHook(() => usePromptTagStack(), { wrapper })
    await waitFor(() => expect(result.current.positive).toHaveLength(1))
    expect(api.save).not.toHaveBeenCalled()
  })

  it('uploads the old browser copy once when the account has none', async () => {
    window.localStorage.setItem(
      'pv.prompt-tag-stack.v1.clerk_1',
      JSON.stringify({
        ownerClerkId: 'clerk_1',
        version: 1,
        positive: [selection, { broken: true }],
        negative: [],
        updatedAt: '2026-10-01T00:00:00.000Z',
      }),
    )
    api.get.mockResolvedValue(null)
    const { result } = renderHook(() => usePromptTagStack(), { wrapper })
    await waitFor(() => expect(result.current.positive).toHaveLength(1))
    expect(api.save).toHaveBeenCalledTimes(1)
    expect(api.save).toHaveBeenCalledWith({
      positive: [selection],
      negative: [],
    })
  })

  it('saves changes to the account after a short pause', async () => {
    api.get.mockResolvedValue({ positive: [], negative: [] })
    const { result } = renderHook(() => usePromptTagStack(), { wrapper })
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    await act(async () => {})
    act(() => result.current.addTag(tag))
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1))
    expect(api.save.mock.calls[0]![0].positive[0].tagId).toBe('danbooru:smile')
  })

  it('never overwrites the account when the read failed', async () => {
    api.get.mockRejectedValue(new Error('PROMPT_TAG_STACK_500'))
    const { result, unmount } = renderHook(() => usePromptTagStack(), {
      wrapper,
    })
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    act(() => result.current.addTag(tag))
    unmount()
    await new Promise((resolve) => setTimeout(resolve, 900))
    expect(api.save).not.toHaveBeenCalled()
  })
})
