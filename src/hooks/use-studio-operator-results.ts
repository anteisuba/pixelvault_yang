'use client'

/**
 * **结果卡的回流那一半**（v2 §6，commit #10）。
 *
 * 「确认生成」那一刻时间线里已经落了一张**生成中**的结果卡
 * （`confirmGeneration` → `appendOperatorPendingResult`）。这颗 hook 把宿主那条
 * 在飞回流写回那张卡上：张数（「正在出图 · 1 / 3」）→ 缩略图 + 「已入库」。
 *
 * ── ⛔ 没有新轮询器 ────────────────────────────────────────────────
 * 数据来自宿主契约的 `resultRun`（工作台那边就是 `useStudioGen` 的 `activeRun`，
 * 图片档 await 到完成、视频档后台轮询往 item 上落）。这里一个 timer 都没起 ——
 * 多一条轮询就是多一条会与既有那条抢状态的路。
 *
 * ── ⚠ 「这一批是不是那张卡的」：先见过它没跑完 ────────────────────
 * 卡落下的那一瞬间，`resultRun` 里装的多半还是**上一批**（已经跑完的那一批）。
 * 直接拿它填卡的表现是：点完「确认生成」，卡上立刻出现了上一轮的三张图。
 * 所以这里要求**先见过一次未结账的回流**才认账（`boundRef`），⛔ 不按 run id 认
 * （视频档的队列会复用同一个 run id）。
 *
 * ── ⚠ 那一枪没打出去也要有交代 ───────────────────────────────────
 * 生成键有自己的闸（模型必选 / 提示词长度 / 参考图能力 / 视频队列上限），被挡下时
 * 根本不会有新的一批。没有 TTL 的话那张卡会**永远转着** —— 本仓最讨厌的那种失败。
 * 到点了就把卡撤掉、落一行系统行说清楚。
 */

import { useEffect, useRef } from 'react'

import { STUDIO_OPERATOR_CLAIM_TTL_MS } from '@/constants/studio-assistant-operator'
import {
  appendOperatorEntry,
  clearOperatorPendingResult,
  dropOperatorPendingResult,
  getOperatorState,
  nextOperatorEntryId,
  updateOperatorResult,
  useStudioOperatorState,
} from '@/hooks/use-studio-operator-store'
import type { StudioOperatorResultRun } from '@/types/studio-assistant-operator'

/** 撤掉那张转不动的卡，并留下一行交代。 */
function failPendingResult(id: string): void {
  dropOperatorPendingResult(id)
  appendOperatorEntry({
    kind: 'system',
    id: nextOperatorEntryId('sys'),
    code: 'generationFailed',
  })
}

export function useStudioOperatorResults(
  run: StudioOperatorResultRun | undefined,
): void {
  const { pendingResultId } = useStudioOperatorState()
  /**
   * 已经认下这一批的那张卡。
   *
   * ⚠ 走 ref 不走 state：认账这件事**不改变任何画面**（卡上画什么全由 store 里
   * 那条条目说了算），为它多跑一轮渲染是白烧的。TTL 那条到点时同步读它就够。
   * ⚠ 同步写在 effect 里（本仓 latest-ref 的既有写法）：render 阶段改 ref 会被
   *   `react-hooks/refs` 拦下来。
   */
  const boundRef = useRef<string | null>(null)

  useEffect(() => {
    if (!pendingResultId || !run) return
    if (!run.settled) {
      boundRef.current = pendingResultId
      updateOperatorResult(pendingResultId, {
        total: run.total,
        completed: run.completed,
      })
      return
    }
    // 还没认下就已经结账的那一批 = 卡出现之前就跑完的上一批（见头注）。
    if (boundRef.current !== pendingResultId) return
    if (run.items.length === 0) {
      // 一张都没出来 —— ⛔ 不画一张每一格都是空的结果卡（见系统码头注）。
      failPendingResult(pendingResultId)
    } else {
      /**
       * ⚠ **部分失败照样入库**：出来几张就写几张（`completed` 与 `total` 都如实
       * 写上去），⛔ 不因为掉了一张就把整批判成失败 —— 那几张是真的已经在库里了。
       */
      updateOperatorResult(pendingResultId, {
        total: run.total,
        completed: run.completed,
        items: run.items,
        storedAt: new Date().toISOString(),
      })
      clearOperatorPendingResult()
    }
    boundRef.current = null
  }, [pendingResultId, run])

  useEffect(() => {
    if (!pendingResultId) return
    const timer = window.setTimeout(() => {
      // ⚠ 到点了再核两件事：线程可能已经被＋新对话清了；
      //   而已经开跑的那一批**不算超时**（视频档跑几分钟是常态，等它结账）。
      if (getOperatorState().pendingResultId !== pendingResultId) return
      if (boundRef.current === pendingResultId) return
      failPendingResult(pendingResultId)
    }, STUDIO_OPERATOR_CLAIM_TTL_MS)
    return () => window.clearTimeout(timer)
  }, [pendingResultId])
}
