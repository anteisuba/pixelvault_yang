'use client'

import { useMemo } from 'react'

import { getAvailableAudioModels } from '@/constants/models'
import type { StudioModelOption } from '@/components/business/ModelSelector'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { useStudioForm } from '@/contexts/studio-context'
import {
  buildSavedModelOptions,
  findSelectedModel,
  mergeModelOptionsWithPreferredSavedRoutes,
} from '@/lib/model-options'

export interface UseAudioModelOptionsReturn {
  modelOptions: StudioModelOption[]
  selectedModel: StudioModelOption | undefined
}

export function useAudioModelOptions(): UseAudioModelOptionsReturn {
  const { state } = useStudioForm()
  const { keys, healthMap } = useApiKeysContext()

  const audioModels = useMemo(() => getAvailableAudioModels(), [])

  const modelOptions = useMemo<StudioModelOption[]>(() => {
    const builtIn: StudioModelOption[] = audioModels.map((model) => ({
      optionId: `workspace:${model.id}`,
      modelId: model.id,
      adapterType: model.adapterType,
      providerConfig: model.providerConfig,
      requestCount: model.cost,
      isBuiltIn: true,
      freeTier: model.freeTier,
      sourceType: 'workspace',
    }))
    const saved = buildSavedModelOptions(
      keys.filter((k) => k.isActive),
      (k) => audioModels.some((m) => m.id === k.modelId),
    )
    return mergeModelOptionsWithPreferredSavedRoutes(saved, builtIn, healthMap)
  }, [healthMap, audioModels, keys])

  const selectedModel = useMemo(
    () =>
      state.selectedOptionId
        ? findSelectedModel(modelOptions, state.selectedOptionId)
        : undefined,
    [modelOptions, state.selectedOptionId],
  )

  return { modelOptions, selectedModel }
}
