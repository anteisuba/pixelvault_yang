import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const dispatch = vi.fn()
const formState = {
  promptDialect: 'tags' as string,
  tagCarrySource: null as string | null,
}
vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => ({ state: formState, dispatch }),
}))

const translate = vi.fn()
vi.mock('@/lib/api-client', () => ({
  translatePromptToTagsAPI: (...args: unknown[]) => translate(...args),
}))

import { useTagCarryTranslation } from '@/hooks/use-tag-carry-translation'

describe('useTagCarryTranslation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    formState.promptDialect = 'tags'
    formState.tagCarrySource = null
  })

  it('translates the carried sentence and swaps it for tags', async () => {
    formState.tagCarrySource = 'a girl in the rain'
    translate.mockResolvedValue({
      success: true,
      data: { tags: '1girl, solo, rain' },
    })

    const { result } = renderHook(() =>
      useTagCarryTranslation('nai-diffusion-4-5-full'),
    )

    expect(result.current.status).toBe('translating')
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({
        type: 'RESOLVE_TAG_CARRY',
        payload: {
          source: 'a girl in the rain',
          chips: [
            { text: '1girl', weight: 1 },
            { text: 'solo', weight: 1 },
            { text: 'rain', weight: 1 },
          ],
        },
      }),
    )
    expect(translate).toHaveBeenCalledWith({
      prompt: 'a girl in the rain',
      modelId: 'nai-diffusion-4-5-full',
    })
  })

  it('sends one request for the same sentence across remounts', async () => {
    formState.tagCarrySource = 'neon city at night'
    translate.mockResolvedValue({
      success: true,
      data: { tags: 'city, night, neon lights' },
    })

    renderHook(() => useTagCarryTranslation()).unmount()
    renderHook(() => useTagCarryTranslation())

    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1))
    expect(translate).toHaveBeenCalledTimes(1)
  })

  it('keeps the sentence on failure and retries on demand', async () => {
    formState.tagCarrySource = 'a cat on a windowsill'
    translate.mockResolvedValueOnce({ success: false, error: 'down' })

    const { result } = renderHook(() => useTagCarryTranslation())

    await waitFor(() => expect(result.current.status).toBe('failed'))
    expect(dispatch).not.toHaveBeenCalled()

    translate.mockResolvedValueOnce({
      success: true,
      data: { tags: 'cat, windowsill' },
    })
    act(() => result.current.retry())

    expect(result.current.status).toBe('translating')
    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1))
    expect(translate).toHaveBeenCalledTimes(2)
  })

  it('stays idle outside the tag studio', () => {
    formState.promptDialect = 'natural'
    formState.tagCarrySource = 'a quiet lake'

    const { result } = renderHook(() => useTagCarryTranslation())

    expect(result.current.status).toBe('idle')
    expect(translate).not.toHaveBeenCalled()
  })
})
