'use client'

import { useCallback, useMemo } from 'react'
import { useTranslations } from 'next-intl'

import { supportsSearchGrounding } from '@/constants/models'
import { useStudioForm, useStudioGenOptional } from '@/contexts/studio-context'
import { useStudioRunModels } from '@/hooks/use-studio-run-models'
import { resolveGeneratingStageKey } from '@/lib/generation-progress'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { studioRunForWorkspace } from '@/lib/studio-operator-result-run'

export interface UseStudioSearchGroundingReturn {
  /** 这一轮名单里有支持的型号 —— 没有就不出现（chip 与槽一起收）。 */
  available: boolean
  /** 开关本身（按会话记；换到不支持的型号再换回来照旧）。 */
  on: boolean
  setOn: (on: boolean) => void
  /** 同系列一起跑、只有部分格子会搜时，标出是哪一个型号。 */
  onlyModelLabel?: string
  /** 正在出图、而且这一枪开着搜索、按已用时长还在搜索那一段。 */
  searching: boolean
}

/**
 * 「先搜再画」在图片台（输入框 / 手机「＋」抽屉 / 助手确认卡）的那一份状态：
 * 三处读写同一个开关（owner 2026-10-07：确认卡上的开关就是图片台那一份）。
 */
export function useStudioSearchGrounding(): UseStudioSearchGroundingReturn {
  const { state, dispatch } = useStudioForm()
  // ⚠ 可选：助手宿主也读这一份，而有的路由（装配台）没有生成那一层 context。
  const gen = useStudioGenOptional()
  const activeRun = gen?.activeRun ?? null
  const isGenerating = gen?.isGenerating ?? false
  const elapsedSeconds = gen?.elapsedSeconds ?? 0
  const { runModels } = useStudioRunModels()
  const tModels = useTranslations('Models')

  const supported = useMemo(
    () => runModels.filter((model) => supportsSearchGrounding(model.modelId)),
    [runModels],
  )
  const available = state.outputType === 'image' && supported.length > 0
  const onlyModelLabel =
    available && supported.length < runModels.length
      ? getTranslatedModelLabel(tModels, supported[0].modelId)
      : undefined

  const run = studioRunForWorkspace(activeRun, state)
  const runSearches = Boolean(run?.items.some((item) => item.searchGrounding))
  const searching =
    isGenerating &&
    runSearches &&
    resolveGeneratingStageKey(elapsedSeconds, undefined, true) === 'searching'

  const setOn = useCallback(
    (on: boolean) => dispatch({ type: 'SET_SEARCH_GROUNDING', payload: on }),
    [dispatch],
  )

  return {
    available,
    on: state.searchGrounding,
    setOn,
    onlyModelLabel,
    searching,
  }
}
