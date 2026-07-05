'use client'

import { useMemo } from 'react'

import { getAvailableAudioModels } from '@/constants/models'
import { resolveAudioKind } from '@/constants/models/audio'
import { AUDIO_KIND } from '@/constants/audio-options'
import type { StudioModelOption } from '@/components/business/ModelSelector'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { useStudioForm } from '@/contexts/studio-context'
import {
  buildSavedModelOptionsForModels,
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

  // Speech-only workspace for now — SFX / music kinds get their own surface in
  // the audio-kind switcher (Phase B3), so keep them out of the voice picker.
  const audioModels = useMemo(
    () =>
      getAvailableAudioModels().filter(
        (model) => resolveAudioKind(model) === AUDIO_KIND.SPEECH,
      ),
    [],
  )

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
    const saved = buildSavedModelOptionsForModels(
      keys.filter((k) => k.isActive),
      audioModels,
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
