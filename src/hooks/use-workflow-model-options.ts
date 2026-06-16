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
  buildSavedModelOptionsForModels,
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
      const savedOptions = buildSavedModelOptionsForModels(
        keys.filter((key) => key.isActive),
        models,
      )
      const mergedOptions = mergeModelOptionsWithPreferredSavedRoutes(
        savedOptions,
        workspaceOptions,
        healthMap,
      )

      // Surface ALL workspace + saved options so the picker can group them
      // into 已配置 / 平台免费 / 需要 key — locked options route through
      // QuickSetupDialog instead of going disabled (CLAUDE.md Hard Rule #8).
      return mergedOptions.map(toNodeWorkflowModelOption)
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
