import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  list: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
}))
vi.mock('@/lib/api-client/danbooru-favorites', () => ({
  listDanbooruFavoritesAPI: api.list,
  addDanbooruFavoriteAPI: api.add,
  removeDanbooruFavoriteAPI: api.remove,
}))

import { useDanbooruFavorites } from './use-danbooru-favorites'

const input = {
  kind: 'artist' as const,
  name: 'mizuiro_sora',
  count: 1200,
  work: null,
  previews: [],
}
const saved = { ...input, id: 'fav_1', createdAt: '2026-09-28T00:00:00.000Z' }

beforeEach(() => {
  vi.clearAllMocks()
  api.list.mockResolvedValue([])
})

describe('useDanbooruFavorites', () => {
  it('lights up at once and keeps the saved row', async () => {
    api.add.mockResolvedValue(saved)
    const { result } = renderHook(() => useDanbooruFavorites())
    await waitFor(() => expect(api.list).toHaveBeenCalled())
    act(() => result.current.toggle(input))
    expect(result.current.has('artist', 'mizuiro_sora')).toBe(true)
    await waitFor(() =>
      expect(result.current.of('artist')[0]?.id).toBe('fav_1'),
    )
  })

  it('puts it back when saving fails', async () => {
    api.add.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useDanbooruFavorites())
    await waitFor(() => expect(api.list).toHaveBeenCalled())
    act(() => result.current.toggle(input))
    await waitFor(() =>
      expect(result.current.has('artist', 'mizuiro_sora')).toBe(false),
    )
  })

  it('restores a favorite whose removal fails', async () => {
    api.list.mockResolvedValue([saved])
    api.remove.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useDanbooruFavorites())
    await waitFor(() =>
      expect(result.current.has('artist', 'mizuiro_sora')).toBe(true),
    )
    act(() => result.current.toggle(input))
    expect(result.current.has('artist', 'mizuiro_sora')).toBe(false)
    await waitFor(() =>
      expect(result.current.has('artist', 'mizuiro_sora')).toBe(true),
    )
  })
})
