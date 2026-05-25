'use client'

import { useCallback, useMemo } from 'react'

import {
  getAvailableAudioModels,
  getAvailableImageModels,
  getAvailableVideoModels,
  type ModelOption,
} from '@/constants/models'
import {
  NODE_AUDIO_MODEL_NODE_TYPES,
  NODE_IMAGE_MODEL_NODE_TYPES,
  NODE_VIDEO_MODEL_NODE_TYPES,
} from '@/constants/node-types'
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
  const videoModels = useMemo(() => getAvailableVideoModels(), [])
  const audioModels = useMemo(() => getAvailableAudioModels(), [])

  const buildOptionsForModels = useCallback(
    (models: ModelOption[]): NodeWorkflowModelOption[] => {
      const workspaceOptions = models.map((model) => ({
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
          models.some(
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
    },
    [healthMap, keys],
  )

  const imageOptions = useMemo<NodeWorkflowModelOption[]>(
    () => buildOptionsForModels(imageModels),
    [buildOptionsForModels, imageModels],
  )
  const videoOptions = useMemo<NodeWorkflowModelOption[]>(
    () => buildOptionsForModels(videoModels),
    [buildOptionsForModels, videoModels],
  )
  const audioOptions = useMemo<NodeWorkflowModelOption[]>(
    () => buildOptionsForModels(audioModels),
    [audioModels, buildOptionsForModels],
  )

  return useMemo(() => {
    const optionsByType: NodeWorkflowModelOptionsByType = {}

    for (const type of NODE_IMAGE_MODEL_NODE_TYPES) {
      optionsByType[type] = imageOptions
    }

    for (const type of NODE_VIDEO_MODEL_NODE_TYPES) {
      optionsByType[type] = videoOptions
    }

    for (const type of NODE_AUDIO_MODEL_NODE_TYPES) {
      optionsByType[type] = audioOptions
    }

    return optionsByType
  }, [audioOptions, imageOptions, videoOptions])
}
