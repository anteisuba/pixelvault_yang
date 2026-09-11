'use client'

/**
 * 加载态那**一句状态词**（v2 §3.6）—— 五个动词各一句。
 *
 * ⭐ 抽成 hook 的唯一理由是**两处要读同一句话**：展开时它长在助手头像旁
 * （`StudioOperatorPanel`），收起时它长在微状态卡上（§4.3 的「正在查 3 个
 * 来源…」，`StudioOperatorCollapsedCard`）。两边各算一遍的下场是其中一边哪天
 * 漏了新动词，而屏幕上看不出差别 —— 收起的那一张只有在收起的时候才有人看。
 *
 * ⚠ 动词**直接读 `step.verb`**（§3.1 的必填一等字段），⛔ 不按工具名反查对照表。
 * ⚠ 「查 N 个来源」的 N 数的是**这一轮已经跑完的检索步**：它就是进度本身
 * （决策 14 删掉进度带的全部理由）—— ⛔ 别拿计划步数去填。
 * ⚠ 抽帧那一段压过状态词：它跑在请求发出去之前，一步都还没有，而实测要几秒。
 * ⚠ 状态全从 store 读、不收参数：两个调用点都拿得到同一份 store，收参数只会
 *   多出「谁传错了」这一种失败。
 */

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'

import {
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
  ASSISTANT_OPERATOR_VERB_IDS,
} from '@/constants/assistant-operator'
import { useStudioOperatorState } from '@/hooks/use-studio-operator-store'
import type { StudioOperatorStepEntry } from '@/types/studio-assistant-operator'

/** 空闲（也没在抽帧）时是 `null` —— ⛔ 不返回空串，调用方靠它决定画不画那一行。 */
export function useStudioOperatorStatusWord(): string | null {
  const t = useTranslations('StudioOperator')
  const { entries, status, capturingFrames } = useStudioOperatorState()

  return useMemo<string | null>(() => {
    if (capturingFrames) return t('status.capturingFrames')
    if (status !== 'working') return null

    let latestRunKey: string | null = null
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index]
      if (entry?.kind === 'step') {
        latestRunKey = entry.runKey
        break
      }
    }
    if (!latestRunKey) return t('status.thinking')

    const runSteps = entries.filter(
      (entry): entry is StudioOperatorStepEntry =>
        entry.kind === 'step' && entry.runKey === latestRunKey,
    )
    const running = runSteps.find(
      (entry) =>
        entry.step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.running,
    )
    const verb = running ? running.step.verb : null
    if (!verb) return t('status.thinking')
    if (verb === ASSISTANT_OPERATOR_VERB_IDS.research) {
      return t('status.research', {
        count: runSteps.filter(
          (entry) => entry.step.verb === ASSISTANT_OPERATOR_VERB_IDS.research,
        ).length,
      })
    }
    return t(`status.${verb}`)
  }, [capturingFrames, entries, status, t])
}
