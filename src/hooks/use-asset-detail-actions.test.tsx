import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const deleteGenerationAPI = vi.fn()
const toastSuccess = vi.fn()
const toastError = vi.fn()

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}))
vi.mock('@/lib/api-client', () => ({
  createRecipeFromGenerationAPI: vi.fn(),
  deleteGenerationAPI: (...args: unknown[]) => deleteGenerationAPI(...args),
  downloadRemoteAsset: vi.fn(),
  setAudioCoverAPI: vi.fn(),
  setGenerationVisibility: vi.fn(),
  toggleLikeAPI: vi.fn(),
}))

import { FEEDBACK_TIMING } from '@/constants/motion'
import { resetUndoableActionsForTest } from '@/lib/undoable-action'
import type { GenerationRecord } from '@/types'

import { useAssetDetailActions } from './use-asset-detail-actions'

const GENERATION = {
  id: 'gen_1',
  outputType: 'IMAGE',
  url: 'https://r2.example.com/a.png',
  mimeType: 'image/png',
} as GenerationRecord

function undoFromLastBar() {
  const options = toastSuccess.mock.calls.at(-1)?.[1] as {
    action: { onClick: () => void }
  }
  options.action.onClick()
}

describe('useAssetDetailActions · remove with undo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    deleteGenerationAPI.mockReset()
    toastSuccess.mockClear()
    toastError.mockClear()
  })
  afterEach(() => {
    resetUndoableActionsForTest()
    vi.useRealTimers()
  })

  function setup() {
    const onLeave = vi.fn()
    const onDeleted = vi.fn()
    const onRestored = vi.fn()
    const { result } = renderHook(() =>
      useAssetDetailActions({
        generation: GENERATION,
        onLeave,
        onDeleted,
        onRestored,
      }),
    )
    return { result, onLeave, onDeleted, onRestored }
  }

  it('hides the asset at once, offers Undo, and deletes only after the window', async () => {
    deleteGenerationAPI.mockResolvedValue({ success: true })
    const { result, onLeave, onDeleted } = setup()

    await act(() => result.current.remove())
    expect(onLeave).toHaveBeenCalledWith('delete')
    expect(onDeleted).toHaveBeenCalledWith('gen_1')
    expect(toastSuccess).toHaveBeenCalledWith(
      'detailDeleted',
      expect.objectContaining({
        action: expect.objectContaining({ label: 'undo' }),
      }),
    )
    expect(deleteGenerationAPI).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(FEEDBACK_TIMING.undoWindowMs)
    })
    expect(deleteGenerationAPI).toHaveBeenCalledWith('gen_1')
  })

  it('Undo puts the asset back and never calls the delete API', async () => {
    const { result, onRestored } = setup()
    await act(() => result.current.remove())

    undoFromLastBar()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FEEDBACK_TIMING.undoWindowMs)
    })
    expect(onRestored).toHaveBeenCalledWith(GENERATION)
    expect(deleteGenerationAPI).not.toHaveBeenCalled()
  })

  it('a failed delete says so and puts the asset back', async () => {
    deleteGenerationAPI.mockResolvedValue({ success: false })
    const { result, onRestored } = setup()
    await act(() => result.current.remove())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FEEDBACK_TIMING.undoWindowMs)
    })
    expect(toastError).toHaveBeenCalledWith('detailDeleteFailed')
    expect(onRestored).toHaveBeenCalledWith(GENERATION)
  })
})
