'use client'

import { useMemo } from 'react'

import { EDIT_MODELS } from '@/constants/edit-tasks'
import { getModelById } from '@/constants/models'
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import {
  buildSavedModelOptions,
  mergeModelOptionsWithPreferredSavedRoutes,
  withProviderKeyCoverage,
} from '@/lib/model-options'
import type { StudioModelOption } from '@/types/model-option'

export function useImageEditModelOptions(modelIds: readonly string[]) {
  const { keys, healthMap } = useApiKeysContext()
  return useMemo(() => {
    const builtIn = modelIds.flatMap((modelId): StudioModelOption[] => {
      const model = getModelById(modelId)
      const editModel = EDIT_MODELS[modelId]
      const adapterType =
        model?.adapterType ??
        (editModel?.provider === 'openai'
          ? AI_ADAPTER_TYPES.OPENAI
          : editModel?.provider === 'gemini'
            ? AI_ADAPTER_TYPES.GEMINI
            : editModel?.provider === 'fal'
              ? AI_ADAPTER_TYPES.FAL
              : undefined)
      if (!adapterType) return []
      return [
        {
          optionId: `edit:${modelId}`,
          modelId,
          displayLabel: editModel?.displayName,
          adapterType,
          providerConfig:
            model?.providerConfig ?? getDefaultProviderConfig(adapterType),
          requestCount: model?.cost ?? 1,
          isBuiltIn: Boolean(model),
          sourceType: 'workspace',
        },
      ]
    })
    const activeKeys = keys.filter((key) => key.isActive)
    const saved = buildSavedModelOptions(activeKeys, (key) =>
      builtIn.some(
        (option) =>
          option.modelId === key.modelId &&
          option.adapterType === key.adapterType,
      ),
    ).map((option) => ({
      ...option,
      displayLabel: EDIT_MODELS[option.modelId]?.displayName,
    }))
    return withProviderKeyCoverage(
      mergeModelOptionsWithPreferredSavedRoutes(saved, builtIn, healthMap),
      activeKeys,
    )
  }, [healthMap, keys, modelIds])
}
