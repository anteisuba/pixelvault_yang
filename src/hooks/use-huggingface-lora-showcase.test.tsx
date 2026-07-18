import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchHuggingFaceShowcaseAPI } from '@/lib/api-client/lora-assets'

import { useHuggingFaceLoraShowcase } from './use-huggingface-lora-showcase'

vi.mock('@/lib/api-client/lora-assets', () => ({
  fetchHuggingFaceShowcaseAPI: vi.fn(),
}))

const mockFetchShowcase = vi.mocked(fetchHuggingFaceShowcaseAPI)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useHuggingFaceLoraShowcase', () => {
  it('returns empty + not loading and fetches nothing when no HF LoRA is mounted (source=null)', () => {
    const { result } = renderHook(() => useHuggingFaceLoraShowcase(null))

    expect(result.current).toEqual({
      images: [],
      prompts: [],
      isLoading: false,
    })
    expect(mockFetchShowcase).not.toHaveBeenCalled()
  })

  it('fetches immediately (no viewport gate — this is a mounted panel, not a scrolling grid) and resolves images + prompts', async () => {
    mockFetchShowcase.mockResolvedValue({
      success: true,
      data: {
        images: ['https://cdn-uploads.huggingface.co/production/uploads/a.png'],
        prompts: [
          'change the picture 1 to realistic photograph, [description]',
        ],
      },
    })

    const { result } = renderHook(() =>
      useHuggingFaceLoraShowcase({
        repoId: 'lrzjason/Anything2Real',
        revision: 'main',
      }),
    )

    expect(result.current.isLoading).toBe(true)
    expect(mockFetchShowcase).toHaveBeenCalledWith({
      repoId: 'lrzjason/Anything2Real',
      revision: 'main',
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.images).toEqual([
      'https://cdn-uploads.huggingface.co/production/uploads/a.png',
    ])
    expect(result.current.prompts).toEqual([
      'change the picture 1 to realistic photograph, [description]',
    ])
  })

  it('resolves to empty arrays (not a throw) when the showcase request fails', async () => {
    mockFetchShowcase.mockResolvedValue({ success: false, error: 'boom' })

    const { result } = renderHook(() =>
      useHuggingFaceLoraShowcase({
        repoId: 'author/failing',
        revision: 'main',
      }),
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.images).toEqual([])
    expect(result.current.prompts).toEqual([])
  })

  it('caches the resolved showcase across mounts for the same repo — a second mount skips the fetch', async () => {
    mockFetchShowcase.mockResolvedValue({
      success: true,
      data: {
        images: [
          'https://cdn-uploads.huggingface.co/production/uploads/cached.png',
        ],
        prompts: ['masterpiece, best quality'],
      },
    })

    const source = { repoId: 'author/cached-repo', revision: 'main' }
    const first = renderHook(() => useHuggingFaceLoraShowcase(source))
    await waitFor(() => expect(first.result.current.isLoading).toBe(false))
    first.unmount()
    expect(mockFetchShowcase).toHaveBeenCalledTimes(1)

    const second = renderHook(() => useHuggingFaceLoraShowcase(source))
    expect(second.result.current.isLoading).toBe(false)
    expect(second.result.current.images).toEqual([
      'https://cdn-uploads.huggingface.co/production/uploads/cached.png',
    ])
    expect(mockFetchShowcase).toHaveBeenCalledTimes(1)
  })
})
