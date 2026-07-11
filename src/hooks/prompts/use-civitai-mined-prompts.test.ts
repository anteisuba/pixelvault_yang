import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mineCivitaiLoraPromptsAPI } from '@/lib/api-client/lora-assets'
import type { CivitaiMinedPromptsResult } from '@/types'

import {
  __resetMinedPromptsCacheForTests,
  useCivitaiMinedPrompts,
} from './use-civitai-mined-prompts'

vi.mock('@/lib/api-client/lora-assets', () => ({
  mineCivitaiLoraPromptsAPI: vi.fn(),
}))

vi.mock('next-intl', () => {
  const t = (key: string) => key
  return { useTranslations: () => t }
})

const mockMineCivitaiLoraPromptsAPI = vi.mocked(mineCivitaiLoraPromptsAPI)

function makeResult(
  prompt = 'trigger word, outfit',
): CivitaiMinedPromptsResult {
  return {
    outfits: [
      { label: '', prompt, sampleCount: 1, source: 'model_version_image' },
    ],
    totalSampled: 1,
    recipes: [
      {
        imageUrl: 'https://image.civitai.com/source.jpeg',
        source: 'model_version_image',
        prompt,
      },
    ],
  }
}

describe('useCivitaiMinedPrompts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetMinedPromptsCacheForTests()
  })

  it('stays idle when item is null', () => {
    const { result } = renderHook(() => useCivitaiMinedPrompts(null))

    expect(result.current.hasFetched).toBe(false)
    expect(result.current.isLoading).toBe(false)
    expect(mockMineCivitaiLoraPromptsAPI).not.toHaveBeenCalled()
  })

  // Issue A regression guard: modelVersionId is now the hard requirement,
  // not fileHash. A stack item that somehow carries a hash but no version
  // id (shouldn't happen for Civitai-sourced items, but the type allows
  // it) must not fire a request the route would 400 on.
  it('stays idle when modelVersionId is missing, even with modelId and a fileHash present', () => {
    const { result } = renderHook(() =>
      useCivitaiMinedPrompts({
        modelId: 1494914,
        fileHashAutoV3: 'deadbeef0000',
      }),
    )

    expect(result.current.hasFetched).toBe(false)
    expect(mockMineCivitaiLoraPromptsAPI).not.toHaveBeenCalled()
  })

  // Issue A core fix: meilisearch search-hit LoRAs carry modelId +
  // modelVersionId but fileHashAutoV3 is always null (hitToLibraryItem
  // writes null — the search index has no files[].hashes). The hook must
  // still fetch, and must not forward a falsy fileHash to the API client.
  it('fetches using modelId+modelVersionId when fileHashAutoV3 is null (search-hit LoRAs)', async () => {
    mockMineCivitaiLoraPromptsAPI.mockResolvedValueOnce({
      success: true,
      data: makeResult('phrolova, purple hair'),
    })

    const { result } = renderHook(() =>
      useCivitaiMinedPrompts({
        modelId: 1494914,
        modelVersionId: 2050454,
        fileHashAutoV3: null,
      }),
    )

    await waitFor(() => expect(result.current.hasFetched).toBe(true))

    expect(result.current.recipes).toHaveLength(1)
    expect(result.current.outfits[0]?.prompt).toBe('phrolova, purple hair')
    expect(mockMineCivitaiLoraPromptsAPI).toHaveBeenCalledTimes(1)
    expect(mockMineCivitaiLoraPromptsAPI).toHaveBeenCalledWith({
      modelId: 1494914,
      modelVersionId: 2050454,
      fileHash: undefined,
    })
  })

  it('fetches when fileHashAutoV3 is omitted (undefined) rather than explicitly null', async () => {
    mockMineCivitaiLoraPromptsAPI.mockResolvedValueOnce({
      success: true,
      data: makeResult(),
    })

    const { result } = renderHook(() =>
      useCivitaiMinedPrompts({ modelId: 1, modelVersionId: 2 }),
    )

    await waitFor(() => expect(result.current.hasFetched).toBe(true))
    expect(mockMineCivitaiLoraPromptsAPI).toHaveBeenCalledWith({
      modelId: 1,
      modelVersionId: 2,
      fileHash: undefined,
    })
  })

  // Regression: hash-bearing callers (browse-path LoRAs, favorited items
  // with a backfilled hash) must keep sending it — Issue A only makes the
  // hash optional, it must not stop being forwarded when present.
  it('still forwards fileHash when the item has one', async () => {
    mockMineCivitaiLoraPromptsAPI.mockResolvedValueOnce({
      success: true,
      data: makeResult(),
    })

    const { result } = renderHook(() =>
      useCivitaiMinedPrompts({
        modelId: 1,
        modelVersionId: 2,
        fileHashAutoV3: 'abc123def456',
      }),
    )

    await waitFor(() => expect(result.current.hasFetched).toBe(true))
    expect(mockMineCivitaiLoraPromptsAPI).toHaveBeenCalledWith({
      modelId: 1,
      modelVersionId: 2,
      fileHash: 'abc123def456',
    })
  })

  // cacheKey must not collapse two different hash-less LoRAs onto the same
  // cache entry just because they share the empty-string hash segment —
  // the plan calls this out explicitly ("cacheKey 里 hash 段允许空串").
  it('does not cache-collide two different hash-less LoRAs (distinct modelVersionId)', async () => {
    mockMineCivitaiLoraPromptsAPI
      .mockResolvedValueOnce({ success: true, data: makeResult('first lora') })
      .mockResolvedValueOnce({ success: true, data: makeResult('second lora') })

    const { result, rerender } = renderHook(
      (props: { modelVersionId: number }) =>
        useCivitaiMinedPrompts({
          modelId: 1,
          modelVersionId: props.modelVersionId,
          fileHashAutoV3: null,
        }),
      { initialProps: { modelVersionId: 100 } },
    )

    await waitFor(() => expect(result.current.hasFetched).toBe(true))
    expect(result.current.outfits[0]?.prompt).toBe('first lora')

    rerender({ modelVersionId: 200 })

    await waitFor(() =>
      expect(result.current.outfits[0]?.prompt).toBe('second lora'),
    )
    expect(mockMineCivitaiLoraPromptsAPI).toHaveBeenCalledTimes(2)
  })
})
