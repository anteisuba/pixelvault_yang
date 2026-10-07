'use client'

import { useMemo } from 'react'

import {
  getNovelAiCharacterLayoutMode,
  getNovelAiTextLimit,
} from '@/constants/novelai'
import { useStudioForm } from '@/contexts/studio-context'
import { useStudioRunModels } from '@/hooks/use-studio-run-models'
import {
  checkNovelAiText,
  planNovelAiText,
  type NovelAiTextPlan,
  type NovelAiTextProblem,
} from '@/lib/novelai-compose'

/**
 * 这一轮的台词 + 画面文字编排与上限 —— 标签台里那几格「全部文字 n / 上限」读它。
 * ⚠ 与生成闸（`use-studio-generate-action`）、服务端、worker 是同一份编排
 * （`novelai-compose`），只数真会发出去的人（停用 / 空白的发送前会被剔掉）。
 */
export function useNovelAiText(): {
  plan: NovelAiTextPlan
  maxChars: number | undefined
  latinOnly: boolean
  problem: NovelAiTextProblem | null
} {
  const { state } = useStudioForm()
  const { runModels } = useStudioRunModels()
  const modelId = runModels.find((model) =>
    getNovelAiCharacterLayoutMode(model.modelId),
  )?.modelId
  const layout = state.advancedParams.novelAiLayout
  const sceneTexts = state.advancedParams.novelAiSceneTexts
  const plan = useMemo(
    () =>
      planNovelAiText({
        characters: (layout?.characters ?? []).filter(
          (character) => character.enabled !== false && character.prompt.trim(),
        ),
        positioning: layout?.positioning ?? 'auto',
        sceneTexts,
      }),
    [layout, sceneTexts],
  )
  const limit = getNovelAiTextLimit(modelId)
  return {
    plan,
    maxChars: limit?.maxChars,
    latinOnly: limit?.latinOnly ?? false,
    problem: checkNovelAiText(plan, modelId),
  }
}
