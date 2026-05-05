import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FAKE_GENERATION } from '@/test/api-helpers'

vi.mock('@/lib/api-client/image-edit', () => ({
  inpaintImageAPI: vi.fn(),
  outpaintImageAPI: vi.fn(),
}))

import {
  inpaintImageAPI,
  outpaintImageAPI,
  type ImageEditApiResult,
} from '@/lib/api-client/image-edit'
import { useInpaint } from './use-inpaint'

const EDIT_RESULT: ImageEditApiResult = {
  imageUrl: 'https://cdn.example.com/edited.png',
  width: 1024,
  height: 1024,
  generation: FAKE_GENERATION,
}

describe('useInpaint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls inpaint API and stores the result', async () => {
    vi.mocked(inpaintImageAPI).mockResolvedValue({
      success: true,
      data: EDIT_RESULT,
    })

    const { result } = renderHook(() => useInpaint())

    await act(async () => {
      const response = await result.current.inpaint({
        imageUrl: 'https://example.com/source.png',
        maskImageUrl: 'data:image/png;base64,mask',
        prompt: 'A red sports car',
      })

      expect(response).toEqual(EDIT_RESULT)
    })

    expect(inpaintImageAPI).toHaveBeenCalledWith({
      imageUrl: 'https://example.com/source.png',
      maskImageUrl: 'data:image/png;base64,mask',
      prompt: 'A red sports car',
    })
    expect(result.current.result).toEqual(EDIT_RESULT)
    expect(result.current.error).toBeNull()
    expect(result.current.isLoading).toBe(false)
  })

  it('calls outpaint API and stores the result', async () => {
    vi.mocked(outpaintImageAPI).mockResolvedValue({
      success: true,
      data: EDIT_RESULT,
    })

    const { result } = renderHook(() => useInpaint())

    await act(async () => {
      await result.current.outpaint({
        imageUrl: 'https://example.com/source.png',
        padding: { top: 64, right: 64, bottom: 64, left: 64 },
        prompt: 'Extend the landscape',
      })
    })

    expect(outpaintImageAPI).toHaveBeenCalledWith({
      imageUrl: 'https://example.com/source.png',
      padding: { top: 64, right: 64, bottom: 64, left: 64 },
      prompt: 'Extend the landscape',
    })
    expect(result.current.result).toEqual(EDIT_RESULT)
  })

  it('stores error state when the API returns an error response', async () => {
    vi.mocked(inpaintImageAPI).mockResolvedValue({
      success: false,
      error: 'bad mask',
    })

    const { result } = renderHook(() => useInpaint())

    await act(async () => {
      const response = await result.current.inpaint({
        imageUrl: 'https://example.com/source.png',
        maskImageUrl: 'data:image/png;base64,mask',
        prompt: 'A red sports car',
      })

      expect(response).toBeNull()
    })

    expect(result.current.error).toBe('bad mask')
    expect(result.current.result).toBeNull()
    expect(result.current.isLoading).toBe(false)
  })
})
