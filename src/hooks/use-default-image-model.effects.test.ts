import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { STUDIO_LAST_IMAGE_MODEL_STORAGE_KEY } from '@/constants/studio'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { StudioModelOption } from '@/components/business/ModelSelector'

const usePathname = vi.fn(() => '/zh/studio/image')
vi.mock('next/navigation', () => ({ usePathname: () => usePathname() }))

const dispatch = vi.fn()
const formState = {
  outputType: 'image' as string,
  selectedOptionId: null as string | null,
  modelSelectionTouched: false as boolean | undefined,
}
vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => ({ state: formState, dispatch }),
}))

import { useDefaultImageModel } from '@/hooks/use-default-image-model'

const option = (
  optionId: string,
  modelId: string,
  extra: Partial<StudioModelOption> = {},
): StudioModelOption => ({
  optionId,
  modelId,
  adapterType: AI_ADAPTER_TYPES.FAL,
  providerConfig: { label: 'fal.ai', baseUrl: '' },
  requestCount: 1,
  isBuiltIn: true,
  sourceType: 'workspace',
  ...extra,
})

const OPTIONS: StudioModelOption[] = [
  option('workspace:flux-2-pro', 'flux-2-pro', { providerKeyId: 'k-1' }),
  option('workspace:flux-2-flash', 'flux-2-flash', { providerKeyId: 'k-1' }),
  option('workspace:recraft-v4-pro', 'recraft-v4-pro'),
]

describe('useDefaultImageModel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    usePathname.mockReturnValue('/zh/studio/image')
    formState.outputType = 'image'
    formState.selectedOptionId = null
    formState.modelSelectionTouched = false
  })

  it('auto-selects the cheapest key-configured model on the image studio', () => {
    renderHook(() => useDefaultImageModel(OPTIONS))

    expect(dispatch).toHaveBeenCalledWith({
      type: 'AUTO_SELECT_OPTION_ID',
      payload: 'workspace:flux-2-flash',
    })
    // 自动补位不写「上次使用」——那格只记用户自己的选择。
    expect(
      window.localStorage.getItem(STUDIO_LAST_IMAGE_MODEL_STORAGE_KEY),
    ).toBeNull()
  })

  it('restores the remembered model instead of the cheapest one', () => {
    window.localStorage.setItem(
      STUDIO_LAST_IMAGE_MODEL_STORAGE_KEY,
      'workspace:flux-2-pro',
    )
    renderHook(() => useDefaultImageModel(OPTIONS))

    expect(dispatch).toHaveBeenCalledWith({
      type: 'AUTO_SELECT_OPTION_ID',
      payload: 'workspace:flux-2-pro',
    })
  })

  it('stays empty when the user deliberately cleared the model', () => {
    formState.modelSelectionTouched = true
    renderHook(() => useDefaultImageModel(OPTIONS))

    expect(dispatch).not.toHaveBeenCalled()
  })

  it('does nothing on the video studio route', () => {
    usePathname.mockReturnValue('/zh/studio/video')
    renderHook(() => useDefaultImageModel(OPTIONS))

    expect(dispatch).not.toHaveBeenCalled()
  })

  it('does nothing while the modality is not image', () => {
    formState.outputType = 'video'
    renderHook(() => useDefaultImageModel(OPTIONS))

    expect(dispatch).not.toHaveBeenCalled()
  })

  it('stays empty when no provider key is configured', () => {
    renderHook(() =>
      useDefaultImageModel([option('workspace:bare', 'flux-2-flash')]),
    )

    expect(dispatch).not.toHaveBeenCalled()
  })

  it('persists an explicit selection', () => {
    formState.selectedOptionId = 'workspace:seedream-5.0-lite'
    formState.modelSelectionTouched = true
    renderHook(() => useDefaultImageModel(OPTIONS))

    expect(
      window.localStorage.getItem(STUDIO_LAST_IMAGE_MODEL_STORAGE_KEY),
    ).toBe('workspace:seedream-5.0-lite')
  })

  it('does not persist a selection the user never made', () => {
    formState.selectedOptionId = 'workspace:flux-2-flash'
    formState.modelSelectionTouched = false
    renderHook(() => useDefaultImageModel(OPTIONS))

    expect(
      window.localStorage.getItem(STUDIO_LAST_IMAGE_MODEL_STORAGE_KEY),
    ).toBeNull()
  })
})
