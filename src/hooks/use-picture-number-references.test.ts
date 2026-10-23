import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'

const lookup = vi.fn()
vi.mock('@/lib/api-client', () => ({
  lookupAssistantMentionAssetsAPI: (...args: unknown[]) => lookup(...args),
}))

import {
  resetPictureNumberCacheForTests,
  usePictureNumberReferences,
} from './use-picture-number-references'

beforeEach(() => {
  lookup.mockReset()
  resetPictureNumberCacheForTests()
})

it('正文里的 图_N 按编号查一次，查到的换成缩略图；查不到的留字', async () => {
  lookup.mockResolvedValue({
    success: true,
    data: [{ seq: 12, thumb: 'https://cdn.test/12.png' }],
  })
  const { result } = renderHook(() =>
    usePictureNumberReferences('挂上 图_012 和 图_99，别动 图_0123x'),
  )
  await waitFor(() =>
    expect(result.current).toEqual([
      { url: 'https://cdn.test/12.png', name: '图_012', aliases: ['图_012'] },
    ]),
  )
  expect(lookup).toHaveBeenCalledExactlyOnceWith([], [12, 99, 123])
})

it('没有编号不查', () => {
  renderHook(() => usePictureNumberReferences('只是一句话'))
  expect(lookup).not.toHaveBeenCalled()
})
