'use client'

import { useMemo } from 'react'

import { getAvailableImageModels } from '@/constants/models'
import { NODE_TYPE_IDS } from '@/constants/node-types'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import {
  buildSavedModelOptions,
  mergeModelOptionsWithPreferredSavedRoutes,
} from '@/lib/model-options'
import type {
  NodeWorkflowModelOption,
  NodeWorkflowModelOptionsByType,
} from '@/types/node-workflow'

function toNodeWorkflowModelOption(
  option: ReturnType<typeof mergeModelOptionsWithPreferredSavedRoutes>[number],
): NodeWorkflowModelOption {
  return {
    optionId: option.optionId,
    modelId: option.modelId,
    adapterType: option.adapterType,
    providerConfig: option.providerConfig,
    requestCount: option.requestCount,
    sourceType: option.sourceType,
    freeTier: option.freeTier,
    apiKeyId: option.keyId,
    keyLabel: option.keyLabel,
    maskedKey: option.maskedKey,
  }
}

export function useWorkflowModelOptions(): NodeWorkflowModelOptionsByType {
  const { keys, healthMap } = useApiKeysContext()
  const imageModels = useMemo(() => getAvailableImageModels(), [])

  const characterImageOptions = useMemo<NodeWorkflowModelOption[]>(() => {
    const workspaceOptions = imageModels.map((model) => ({
      optionId: `workspace:${model.id}`,
      modelId: model.id,
      adapterType: model.adapterType,
      providerConfig: model.providerConfig,
      requestCount: model.cost,
      isBuiltIn: true,
      freeTier: model.freeTier,
      sourceType: 'workspace' as const,
    }))
    const savedOptions = buildSavedModelOptions(
      keys.filter((key) => key.isActive),
      (key) =>
        imageModels.some(
          (model) =>
            model.id === key.modelId && model.adapterType === key.adapterType,
        ),
    )
    const mergedOptions = mergeModelOptionsWithPreferredSavedRoutes(
      savedOptions,
      workspaceOptions,
      healthMap,
    )

    return mergedOptions
      .filter((option) => option.sourceType === 'saved' || option.freeTier)
      .map(toNodeWorkflowModelOption)
  }, [healthMap, imageModels, keys])

  return useMemo(
    () => ({
      [NODE_TYPE_IDS.characterImage]: characterImageOptions,
    }),
    [characterImageOptions],
  )
}
