import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { GenerationRecord } from '@/types'

const dispatch = vi.hoisted(() => vi.fn())
vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => ({ dispatch }),
}))

import { useAskAssistantAboutImage } from '@/hooks/use-ask-assistant-about-image'
import * as store from '@/hooks/use-studio-operator-store'

const generation = {
  id: 'gen-1',
  url: 'https://cdn.example.com/gen-1.png',
  outputType: 'IMAGE',
  seq: 12,
} as unknown as GenerationRecord

describe('useAskAssistantAboutImage', () => {
  beforeEach(() => {
    dispatch.mockClear()
    store.clearOperatorMentions()
  })

  it('⭐ 把这张图挂成新助手输入框里的 chip，再打开面板（⛔ 不再注入旧面板的 store）', () => {
    const { result } = renderHook(() => useAskAssistantAboutImage())
    act(() => result.current(generation))
    expect(store.getOperatorState().mentions).toEqual([
      expect.objectContaining({
        id: 'gen-1',
        url: 'https://cdn.example.com/gen-1.png',
        kind: 'image',
        seq: 12,
      }),
    ])
    expect(dispatch).toHaveBeenCalledWith({
      type: 'OPEN_PANEL',
      payload: 'enhance',
    })
  })

  it('同一张点两次只挂一枚', () => {
    const { result } = renderHook(() => useAskAssistantAboutImage())
    act(() => {
      result.current(generation)
      result.current(generation)
    })
    expect(store.getOperatorState().mentions).toHaveLength(1)
  })
})
