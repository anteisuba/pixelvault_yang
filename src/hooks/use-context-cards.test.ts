import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import {
  CONTEXT_CARD_IMAGE_ROLE_IDS,
  CONTEXT_CARD_KIND_IDS,
} from '@/constants/context-cards'

vi.mock('@/lib/api-client', () => ({
  listContextCardsAPI: vi.fn(),
  createContextCardAPI: vi.fn(),
  updateContextCardAPI: vi.fn(),
  deleteContextCardAPI: vi.fn(),
  addContextCardImageAPI: vi.fn(),
  removeContextCardImageAPI: vi.fn(),
}))

import {
  addContextCardImageAPI,
  createContextCardAPI,
  deleteContextCardAPI,
  listContextCardsAPI,
  updateContextCardAPI,
} from '@/lib/api-client'
import { useContextCards } from './use-context-cards'

const CARD = {
  id: 'card-1',
  kind: CONTEXT_CARD_KIND_IDS.character,
  name: 'Sigrika',
  summary: 'Silver hair.',
  body: '',
  images: [],
  negative: null,
  pinnedScopes: ['image'],
  status: 'confirmed' as const,
  createdAt: '2026-09-07T10:00:00.000Z',
  updatedAt: '2026-09-07T10:00:00.000Z',
}

describe('useContextCards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listContextCardsAPI).mockResolvedValue({
      success: true,
      data: [CARD],
    })
  })

  it('挂载时按 kind / 常挂域拉一次', async () => {
    const { result } = renderHook(() =>
      useContextCards({
        kind: CONTEXT_CARD_KIND_IDS.character,
        pinnedScope: 'image',
      }),
    )

    await waitFor(() => expect(result.current.cards).toEqual([CARD]))
    expect(listContextCardsAPI).toHaveBeenCalledWith({
      kind: CONTEXT_CARD_KIND_IDS.character,
      pinnedScope: 'image',
    })
  })

  it('enabled=false 时一次都不拉', async () => {
    renderHook(() => useContextCards({ enabled: false }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(listContextCardsAPI).not.toHaveBeenCalled()
  })

  it('新建之后那张卡插到最前', async () => {
    const created = { ...CARD, id: 'card-2', name: 'Ashborn' }
    vi.mocked(createContextCardAPI).mockResolvedValue({
      success: true,
      data: created,
    })

    const { result } = renderHook(() => useContextCards())
    await waitFor(() => expect(result.current.cards).toHaveLength(1))

    await act(async () => {
      await result.current.create({
        kind: CONTEXT_CARD_KIND_IDS.character,
        name: 'Ashborn',
        summary: '',
        body: '',
        pinnedScopes: [],
      })
    })

    expect(result.current.cards.map((card) => card.id)).toEqual([
      'card-2',
      'card-1',
    ])
    expect(result.current.error).toBeNull()
  })

  /**
   * ⭐ 常挂用**服务端回来的那一份**替换，⛔ 不在客户端自己拼一份乐观值：
   * 另一个工作台可能刚挂上，本地拼出来的 `pinnedScopes` 与库里不是同一份。
   */
  it('常挂开关把服务端回来的那一份就地替换掉', async () => {
    vi.mocked(updateContextCardAPI).mockResolvedValue({
      success: true,
      data: { ...CARD, pinnedScopes: ['image', 'video'] },
    })

    const { result } = renderHook(() => useContextCards())
    await waitFor(() => expect(result.current.cards).toHaveLength(1))

    await act(async () => {
      await result.current.setPinned('card-1', 'video', true)
    })

    expect(updateContextCardAPI).toHaveBeenCalledWith('card-1', {
      pin: { scope: 'video', pinned: true },
    })
    expect(result.current.cards[0].pinnedScopes).toEqual(['image', 'video'])
  })

  it('保存失败时把错误摆出来，列表不动', async () => {
    vi.mocked(updateContextCardAPI).mockResolvedValue({
      success: false,
      error: 'Failed to save context card',
    })

    const { result } = renderHook(() => useContextCards())
    await waitFor(() => expect(result.current.cards).toHaveLength(1))

    await act(async () => {
      await result.current.update('card-1', { name: 'Renamed' })
    })

    expect(result.current.error).toBe('Failed to save context card')
    expect(result.current.cards[0].name).toBe('Sigrika')
  })

  it('删除之后本地列表也没了', async () => {
    vi.mocked(deleteContextCardAPI).mockResolvedValue({
      success: true,
      data: null,
    })

    const { result } = renderHook(() => useContextCards())
    await waitFor(() => expect(result.current.cards).toHaveLength(1))

    await act(async () => {
      await result.current.remove('card-1')
    })

    expect(result.current.cards).toEqual([])
  })

  it('传图之后用回来的那张卡替换（图数以服务端为准）', async () => {
    const withImage = {
      ...CARD,
      images: [
        {
          url: 'https://cdn.test/sheet.png',
          role: CONTEXT_CARD_IMAGE_ROLE_IDS.sheet,
          sourceRef: null,
        },
      ],
    }
    vi.mocked(addContextCardImageAPI).mockResolvedValue({
      success: true,
      data: withImage,
    })

    const { result } = renderHook(() => useContextCards())
    await waitFor(() => expect(result.current.cards).toHaveLength(1))

    await act(async () => {
      await result.current.addImage('card-1', {
        imageData: 'data:image/png;base64,AAA',
        role: CONTEXT_CARD_IMAGE_ROLE_IDS.sheet,
      })
    })

    expect(result.current.cards[0].images).toHaveLength(1)
  })
})
