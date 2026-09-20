'use client'

import { useCallback, useMemo } from 'react'

import { getPromptDialect } from '@/constants/prompt-dialects'
import { useStudioForm } from '@/contexts/studio-context'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import type { StudioModelOption } from '@/types/model-option'

export interface UseStudioRunModelsReturn {
  /** 这一轮要跑的模型 = 主模型 + 额外模型，按名单顺序去重。 */
  runModels: StudioModelOption[]
  runModelIds: ReadonlySet<string>
  /** 模型选择器的方言闸 —— 两台的名单互不相交。 */
  filterModelByDialect: (option: StudioModelOption) => boolean
}

/**
 * 「这一轮跑哪几个模型」——**纯读**，⛔ 不带任何执行端副作用。
 *
 * ⚠ 从 `useStudioGenerateAction` 里拆出来就是为了这一条：那颗 hook 里有
 * `REQUEST_GENERATE` 的执行端 effect，谁挂它谁就会在一次请求上再发一遍。
 * 右列控件、移动端条目这类**只想知道选了谁**的宿主必须走这一颗。
 */
export function useStudioRunModels(): UseStudioRunModelsReturn {
  const { state } = useStudioForm()
  const { modelOptions } = useImageModelOptions()

  const runModels = useMemo(() => {
    const byId = new Map(
      modelOptions.map((option) => [option.optionId, option]),
    )
    const ids = [
      ...(state.selectedOptionId ? [state.selectedOptionId] : []),
      ...state.extraModelOptionIds,
    ]
    const seen = new Set<string>()
    return (
      ids
        .filter((id) => (seen.has(id) ? false : (seen.add(id), true)))
        .map((id) => byId.get(id))
        .filter((option): option is StudioModelOption => Boolean(option))
        /**
         * ⛔ **不跨方言**（D10 ② Q3）：两台各自只跑本方言的模型。跨台留下来的
         * 陈旧选择在这里就被挡住 —— 让一条吃自然语言的线路收到一串 danbooru
         * 标签（或反过来），两边都出不好。
         */
        .filter(
          (option) =>
            getPromptDialect(option.adapterType) === state.promptDialect,
        )
        /**
         * ⭐ **同一条路只跑一次**。目录那一层已经把 `workspace:` / `key:` 双胞胎
         * 折掉了（`foldRedundantWorkspaceRoutes`），这里是第二道：这份名单是
         * 算钱、裁剪 payload、画 chip 的**同一份**，名单里多一条就是多发一次请求、
         * 多扣一次钱。⛔ 不在渲染层去重 —— 那样名单里仍旧躺着两份。
         */
        .filter((option, index, list) => {
          const route = `${option.adapterType}::${option.modelId}`
          return (
            list.findIndex(
              (other) => `${other.adapterType}::${other.modelId}` === route,
            ) === index
          )
        })
    )
  }, [
    modelOptions,
    state.selectedOptionId,
    state.extraModelOptionIds,
    state.promptDialect,
  ])

  const runModelIds = useMemo(
    () => new Set(runModels.map((option) => option.optionId)),
    [runModels],
  )

  const filterModelByDialect = useCallback(
    (option: StudioModelOption) =>
      getPromptDialect(option.adapterType) === state.promptDialect,
    [state.promptDialect],
  )

  return { runModels, runModelIds, filterModelByDialect }
}
