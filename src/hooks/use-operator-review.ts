'use client'

/**
 * 结果格上那两颗「✓ 已确认 / ✕ 已否」（切片 Y）。
 *
 * ── 三条结构约束 ──────────────────────────────────────────────────
 * ① **乐观更新**：点下去先写 store，再打 PATCH。一次往返的空窗里那一格什么都不
 *    变的表现是「点了没反应」，而用户会再点一次（于是标了两遍）。
 * ② **失败退回原值**，⛔ 不静默：退回去之外还要让调用方看得见错在哪 ——
 *    `error` 是这颗 hook 唯一的输出。悄悄退回去比不退更糟：界面上那一格自己
 *    变回来了，没有人知道为什么。
 * ③ **再点一次同一颗 = 回到 `pending`**（取消标记）。判据与结果行卡的选中格
 *    逐字同源（再点一次取消）—— 少了它，用户点错一颗就再也改不回「还没看」。
 *
 * ⚠ 审核态**跨会话活着**（住 store 的 `reviewStates`，`resetOperatorThread` 不清）：
 * 它说的是用户对这件产物的判断，与他在哪条线程里聊天无关。
 */

import { useCallback, useState } from 'react'

import { GENERATION_REVIEW_STATE_IDS } from '@/constants/assistant-operator'
import type { GenerationReviewState } from '@/constants/assistant-operator'
import {
  getOperatorReviewState,
  setOperatorReviewState,
  useStudioOperatorState,
} from '@/hooks/use-studio-operator-store'
import { setGenerationReviewStateAPI } from '@/lib/api-client'

export interface UseOperatorReviewResult {
  /** 这一张此刻是什么态（缺席 = `pending`）。 */
  stateOf(id: string): GenerationReviewState
  /**
   * 点一颗 —— 已经是这一态时**改回 `pending`**（取消标记）。
   * ⚠ 「交出去就不管」：调用方在 onClick 里调它，不等 Promise。
   */
  toggle(id: string, next: GenerationReviewState): void
  /** 上一次失败说了什么；`null` = 没失败过。 */
  error: string | null
}

export function useOperatorReview(): UseOperatorReviewResult {
  const { reviewStates } = useStudioOperatorState()
  const [error, setError] = useState<string | null>(null)

  const stateOf = useCallback(
    (id: string): GenerationReviewState =>
      reviewStates[id] ?? GENERATION_REVIEW_STATE_IDS.pending,
    [reviewStates],
  )

  const toggle = useCallback((id: string, next: GenerationReviewState) => {
    /**
     * ⚠ 现值从 store 同步读（`getOperatorReviewState`），⛔ 不读 render 时那一份：
     * 连点两下时第二下读到的会是渲染前的旧值 —— 表现是「点两下没回到未标」。
     */
    const previous = getOperatorReviewState(id)
    const target =
      previous === next ? GENERATION_REVIEW_STATE_IDS.pending : next
    setOperatorReviewState(id, target)
    setError(null)
    void setGenerationReviewStateAPI(id, target).then((result) => {
      if (result.success) return
      // ⚠ 退回**点之前那一档**而不是 `pending`：用户之前标过什么，那才是真相。
      setOperatorReviewState(id, previous)
      setError(result.error ?? null)
    })
  }, [])

  return { stateOf, toggle, error }
}
