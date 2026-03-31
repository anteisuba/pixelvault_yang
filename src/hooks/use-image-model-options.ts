'use client'

import { useMemo } from 'react'

import { getAvailableImageModels } from '@/constants/models'
import type { StudioModelOption } from '@/components/business/ModelSelector'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { useStudioForm } from '@/contexts/studio-context'
import { buildSavedModelOptions, findSelectedModel } from '@/lib/model-options'

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
  const { keys } = useApiKeysContext()

  const imageModels = useMemo(() => getAvailableImageModels(), [])

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
    const saved = buildSavedModelOptions(
      keys.filter((k) => k.isActive),
      (k) => imageModels.some((m) => m.id === k.modelId),
    )
    return [...builtIn, ...saved]
  }, [imageModels, keys])

  const selectedModel = useMemo(
    () =>
      state.selectedOptionId
        ? findSelectedModel(modelOptions, state.selectedOptionId)
        : undefined,
    [modelOptions, state.selectedOptionId],
  )

  return { modelOptions, selectedModel }
}
