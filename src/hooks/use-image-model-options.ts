'use client'

import { useEffect, useMemo } from 'react'

import { getAvailableImageModels, IMAGE_KIND } from '@/constants/models'
import { pruneIncompatibleCapabilityValues } from '@/lib/model-capability-chips'
import type { StudioModelOption } from '@/types/model-option'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { useStudioForm } from '@/contexts/studio-context'
import { useDefaultImageModel } from '@/hooks/use-default-image-model'
import {
  buildSavedModelOptionsForModels,
  findSelectedModel,
  mergeModelOptionsWithPreferredSavedRoutes,
  withProviderKeyCoverage,
} from '@/lib/model-options'

export interface UseImageModelOptionsReturn {
  /** All available model options (workspace + saved routes) */
  modelOptions: StudioModelOption[]
  /** Currently selected model (resolved from selectedOptionId) */
  selectedModel: StudioModelOption | undefined
}

/**
 * Shared hook for building image model options from available models + user API keys.
 * Used by the unified model picker (`ModelPickerPopover`) and the generate path.
 */
export function useImageModelOptions(): UseImageModelOptionsReturn {
  const { state, dispatch } = useStudioForm()
  const { keys, healthMap } = useApiKeysContext()

  const imageModels = useMemo(
    () => getAvailableImageModels(IMAGE_KIND.GENERATE),
    [],
  )

  const modelOptions = useMemo<StudioModelOption[]>(() => {
    const builtIn: StudioModelOption[] = imageModels.map((model) => ({
      optionId: `workspace:${model.id}`,
      modelId: model.id,
      adapterType: model.adapterType,
      providerConfig: model.providerConfig,
      requestCount: model.cost,
      isBuiltIn: true,
      sourceType: 'workspace',
    }))
    const activeKeys = keys.filter((k) => k.isActive)
    const saved = buildSavedModelOptionsForModels(activeKeys, imageModels)
    return withProviderKeyCoverage(
      mergeModelOptionsWithPreferredSavedRoutes(saved, builtIn, healthMap),
      activeKeys,
    )
  }, [healthMap, imageModels, keys])

  // 图片工作台不许以空模型起手（owner 2026-09-03）。落在这里是因为它是图片路由
  // 唯一一定被挂上的那个 hook；自身的守卫（只在 `/studio/image` + 图片档 + 用户
  // 没显式动过模型时开火）让多个宿主同时挂它也只会选一次。
  useDefaultImageModel(modelOptions)

  const selectedModel = useMemo(
    () =>
      state.selectedOptionId
        ? findSelectedModel(modelOptions, state.selectedOptionId)
        : undefined,
    [modelOptions, state.selectedOptionId],
  )

  // 切模型 = **直接切**（D2 ④ 画板 + owner 批注 36）：通用值（提示词 · 参考轨 ·
  // 规格 · 张数）原样留着，新模型不认识的**专属**值静默回默认 —— 不提示、没有
  // 撤销、⛔ 不存上一个模型的快照。
  // ⚠ 这里以前只盯 OpenAI 的 `quality` 一个键，换到 Seedream 之后 GPT 的
  // `background` / `style` 会原样留在载荷里跟着发出去。判据换成能力表全量。
  useEffect(() => {
    if (!selectedModel) return
    const pruned = pruneIncompatibleCapabilityValues(
      state.advancedParams,
      selectedModel.adapterType,
      selectedModel.modelId,
    )
    // ⚠ 没有变化时 `pruned` 是 null —— 每次都写回一个新对象会把这个 effect
    // 打成死循环（依赖里就有 advancedParams）。
    if (!pruned) return
    dispatch({ type: 'SET_ADVANCED_PARAMS', payload: pruned })
  }, [selectedModel, state.advancedParams, dispatch])

  return { modelOptions, selectedModel }
}
