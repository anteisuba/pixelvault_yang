'use client'

import { useMemo } from 'react'

import type { StudioModelOption } from '@/components/business/ModelSelector'
import { getAvailableModel3DModels } from '@/constants/models'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import {
  buildSavedModelOptions,
  mergeModelOptionsWithPreferredSavedRoutes,
} from '@/lib/model-options'

export interface Use3DModelOptionsReturn {
  modelOptions: StudioModelOption[]
}

export function use3DModelOptions(): Use3DModelOptionsReturn {
  const { keys, healthMap } = useApiKeysContext()

  const model3DModels = useMemo(() => getAvailableModel3DModels(), [])

  const modelOptions = useMemo<StudioModelOption[]>(() => {
    const builtIn: StudioModelOption[] = model3DModels.map((model) => ({
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
      (k) => model3DModels.some((m) => m.id === k.modelId),
    )
    return mergeModelOptionsWithPreferredSavedRoutes(saved, builtIn, healthMap)
  }, [healthMap, model3DModels, keys])

  return { modelOptions }
}
