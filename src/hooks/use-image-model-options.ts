'use client'

import { useEffect, useMemo } from 'react'

import { getAvailableImageModels, IMAGE_KIND } from '@/constants/models'
import { getCapabilityConfig } from '@/constants/provider-capabilities'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { StudioModelOption } from '@/types/model-option'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { useStudioForm } from '@/contexts/studio-context'
import { useDefaultImageModel } from '@/hooks/use-default-image-model'
import {
  buildSavedModelOptionsForModels,
  findSelectedModel,
  mergeModelOptionsWithPreferredSavedRoutes,
  withProviderKeyCoverage,
} from '@/lib/model-options'

export interface UseImageModelOptionsReturn {
  /** All available model options (workspace + saved routes) */
  modelOptions: StudioModelOption[]
  /** Currently selected model (resolved from selectedOptionId) */
  selectedModel: StudioModelOption | undefined
}

/**
 * Shared hook for building image model options from available models + user API keys.
 * Used by the unified model picker (`ModelPickerPopover`) and the generate path.
 */
export function useImageModelOptions(): UseImageModelOptionsReturn {
  const { state, dispatch } = useStudioForm()
  const { keys, healthMap } = useApiKeysContext()

  const imageModels = useMemo(
    () => getAvailableImageModels(IMAGE_KIND.GENERATE),
    [],
  )

  const modelOptions = useMemo<StudioModelOption[]>(() => {
    const builtIn: StudioModelOption[] = imageModels.map((model) => ({
      optionId: `workspace:${model.id}`,
      modelId: model.id,
      adapterType: model.adapterType,
      providerConfig: model.providerConfig,
      requestCount: model.cost,
      isBuiltIn: true,
      sourceType: 'workspace',
    }))
    const activeKeys = keys.filter((k) => k.isActive)
    const saved = buildSavedModelOptionsForModels(activeKeys, imageModels)
    return withProviderKeyCoverage(
      mergeModelOptionsWithPreferredSavedRoutes(saved, builtIn, healthMap),
      activeKeys,
    )
  }, [healthMap, imageModels, keys])

  // 图片工作台不许以空模型起手（owner 2026-09-03）。落在这里是因为它是图片路由
  // 唯一一定被挂上的那个 hook；自身的守卫（只在 `/studio/image` + 图片档 + 用户
  // 没显式动过模型时开火）让多个宿主同时挂它也只会选一次。
  useDefaultImageModel(modelOptions)

  const selectedModel = useMemo(
    () =>
      state.selectedOptionId
        ? findSelectedModel(modelOptions, state.selectedOptionId)
        : undefined,
    [modelOptions, state.selectedOptionId],
  )

  useEffect(() => {
    if (!selectedModel || selectedModel.adapterType !== AI_ADAPTER_TYPES.OPENAI)
      return
    const quality = state.advancedParams.quality
    const config = getCapabilityConfig(
      selectedModel.adapterType,
      selectedModel.modelId,
    )
    if (quality && !config.qualityOptions?.includes(quality)) {
      dispatch({
        type: 'SET_ADVANCED_PARAMS',
        payload: { ...state.advancedParams, quality: 'auto' },
      })
    }
  }, [selectedModel, state.advancedParams, dispatch])

  return { modelOptions, selectedModel }
}
