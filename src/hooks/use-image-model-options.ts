'use client'

import { useMemo } from 'react'

import { getAvailableImageModels } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { StudioModelOption } from '@/components/business/ModelSelector'
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
 * Used by StudioLeftPanel (ModelSelector display) and StudioGenerateBar (canGenerate + generate).
 */
export function useImageModelOptions(): UseImageModelOptionsReturn {
  const { state } = useStudioForm()
  const { keys, healthMap } = useApiKeysContext()

  const imageModels = useMemo(
    () =>
      getAvailableImageModels().filter(
        (model) => model.adapterType !== AI_ADAPTER_TYPES.RUNNER,
      ),
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
      freeTier: model.freeTier,
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

  return { modelOptions, selectedModel }
}
