'use client'

import { useMemo } from 'react'

import { getAvailableVideoModels } from '@/constants/models'
import type { StudioModelOption } from '@/components/business/ModelSelector'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import {
  buildSavedModelOptions,
  findSelectedModel,
  mergeModelOptionsWithPreferredSavedRoutes,
} from '@/lib/model-options'

export interface UseVideoModelOptionsReturn {
  modelOptions: StudioModelOption[]
  selectedModel: StudioModelOption | undefined
}

/**
 * Shared hook for building video model options from available models + user API keys.
 * Mirrors use-image-model-options and use-audio-model-options patterns.
 *
 * Accepts `selectedOptionId` as a parameter so it can be reused from any
 * caller that owns its own selection state (e.g. Studio context, legacy forms).
 */
export function useVideoModelOptions(
  selectedOptionId: string,
): UseVideoModelOptionsReturn {
  const { keys, healthMap } = useApiKeysContext()

  const videoModels = useMemo(() => getAvailableVideoModels(), [])

  const modelOptions = useMemo<StudioModelOption[]>(() => {
    const builtIn: StudioModelOption[] = videoModels.map((model) => ({
      optionId: `workspace:${model.id}`,
      modelId: model.id,
      adapterType: model.adapterType,
      providerConfig: model.providerConfig,
      requestCount: model.cost,
      isBuiltIn: true,
      sourceType: 'workspace',
    }))
    const saved = buildSavedModelOptions(
      keys.filter((k) => k.isActive),
      (k) => videoModels.some((m) => m.id === k.modelId),
    )
    return mergeModelOptionsWithPreferredSavedRoutes(saved, builtIn, healthMap)
  }, [healthMap, videoModels, keys])

  const selectedModel = useMemo(
    () =>
      selectedOptionId
        ? findSelectedModel(modelOptions, selectedOptionId)
        : undefined,
    [modelOptions, selectedOptionId],
  )

  return { modelOptions, selectedModel }
}
