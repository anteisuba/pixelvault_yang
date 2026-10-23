'use client'

import { useMemo } from 'react'

import { type AudioKind } from '@/constants/audio-options'
import { getAvailableAudioModels } from '@/constants/models'
import { resolveAudioKind } from '@/constants/models/audio'
import type { StudioModelOption } from '@/types/model-option'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import {
  buildSavedModelOptionsForModels,
  findSelectedModel,
  mergeModelOptionsWithPreferredSavedRoutes,
  withProviderKeyCoverage,
} from '@/lib/model-options'

export interface UseAudioModelOptionsReturn {
  modelOptions: StudioModelOption[]
  selectedModel: StudioModelOption | undefined
}

/**
 * 音频模型清单的**内核**：不认识 StudioContext。
 *
 * 拆出来的原因很具体：配音间（`/studio/audio`）是**故意住在工作台路由组外面**的，
 * 那里没有 `StudioProvider`。原先这个 hook 直接读 `useStudioForm()`，等于任何想用
 * 共享模型选择器的页面都必须把整个工作台外壳搬过去——而配音间的整个立足点就是
 * 不要那层壳。
 *
 * 它其实只从 studio 那儿要两个标量（当前音频档、选中的 optionId），做成参数即可。
 * ⚠ `useApiKeysContext` 仍然是必需的：渠道覆盖率要靠它。宿主自己挂
 * `ApiKeysProvider`——那是一个独立的小 provider，不是工作台外壳。
 */
export function useAudioModelOptionsFor(
  audioKind: AudioKind,
  selectedOptionId: string | null,
): UseAudioModelOptionsReturn {
  const { keys, healthMap } = useApiKeysContext()

  // Show only models of the active audio kind (speech / sfx), so the picker
  // follows the kind switcher instead of mixing voices with sound effects.
  const audioModels = useMemo(
    () =>
      getAvailableAudioModels().filter(
        (model) => resolveAudioKind(model) === audioKind,
      ),
    [audioKind],
  )

  const modelOptions = useMemo<StudioModelOption[]>(() => {
    const builtIn: StudioModelOption[] = audioModels.map((model) => ({
      optionId: `workspace:${model.id}`,
      modelId: model.id,
      adapterType: model.adapterType,
      providerConfig: model.providerConfig,
      requestCount: model.cost,
      isBuiltIn: true,
      sourceType: 'workspace',
    }))
    const activeKeys = keys.filter((k) => k.isActive)
    const saved = buildSavedModelOptionsForModels(activeKeys, audioModels)
    return withProviderKeyCoverage(
      mergeModelOptionsWithPreferredSavedRoutes(saved, builtIn, healthMap),
      activeKeys,
    )
  }, [healthMap, audioModels, keys])

  const selectedModel = useMemo(
    () =>
      selectedOptionId
        ? findSelectedModel(modelOptions, selectedOptionId)
        : undefined,
    [modelOptions, selectedOptionId],
  )

  return { modelOptions, selectedModel }
}
