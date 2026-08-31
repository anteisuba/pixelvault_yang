'use client'

/**
 * 看图闭环的**客户端一半**（P3-C，拍板 4）：盯着生成结果，等它自己备的那一枪
 * 回来，把结果投回操作员线程。
 *
 * ── ⛔ 没有新轮询器 ────────────────────────────────────────────────
 * 结果是从 `useStudioGen()` 的 `activeRun` 读的 —— 那是工作台**本来就在跑**的
 * 那条回流（图片是 await 到完成，视频是后台轮询往 item 上落）。这里一个 timer
 * 都没起：多一条轮询就是多一条会与既有那条抢状态的路，而「视频不能排队」那个
 * 真 bug 的成因正是两处共用一个轮询引用。
 *
 * ── 判据不在这里，在 `lib/studio-operator-claim.ts` ────────────────
 * 「这一枪是不是助手备的」是一段纯逻辑，单测钉在那边。这颗 hook 只做三件事：
 * 把此刻的 item id 报给 store（领票时要用）、推动票的状态机、投递一次。
 */

import { useEffect, useRef } from 'react'

import { useStudioGenOptional } from '@/contexts/studio-context'
import {
  getOperatorClaim,
  publishOperatorRunItemIds,
  setOperatorClaim,
} from '@/hooks/use-studio-operator-store'
import {
  bindOperatorClaim,
  isOperatorClaimSettled,
  readOperatorClaimEvidence,
} from '@/lib/studio-operator-claim'
import type { AssistantOperatorResult } from '@/types/assistant-operator'

export interface UseStudioOperatorCritiqueOptions {
  /**
   * 助手备的那一枪出结果了 —— 把它投回线程并请一轮评价。
   *
   * ⚠ **必传**：可选 prop 漏传 = 编译器不报、测试全绿、闭环整条不响
   * （台账里那一类「三绿而功能全失效」）。
   */
  onResult(result: AssistantOperatorResult): void
}

export function useStudioOperatorCritique({
  onResult,
}: UseStudioOperatorCritiqueOptions): void {
  /**
   * ⭐ **可选的那个**（P4-C）：面板从 P4-C 起也挂在 `/studio/lora` 上，而那条路由
   * 故意不挂 `<StudioProvider>` —— 会抛的那版在装配台上会把整颗面板打红。
   * ⚠ 缺席时这颗 hook 整个退化成 no-op（`activeRun` 恒 undefined），而那正是
   * 正确行为：装配台走自己那条结果列，看图闭环的归属追踪盯不到它，所以 LoRA 域
   * 也没有 `critique_result` 这条工具（见域工具表里的注释）。
   */
  const activeRun = useStudioGenOptional()?.activeRun

  /**
   * ⚠ 走 latest-ref：投递发生在一次异步回流之后，直接闭包捕获会把 effect 的依赖
   * 拴在一个每次 render 都换引用的回调上 —— 那会让下面那条 effect 每帧重跑。
   * ⚠ 同步写在 effect 里（本仓 latest-ref 的既有写法）：render 阶段改 ref 会被
   *   `react-hooks/refs` 拦下来。
   */
  const latest = useRef(onResult)
  useEffect(() => {
    latest.current = onResult
  }, [onResult])

  useEffect(() => {
    const items = activeRun?.items ?? []
    // 领票那一刻要抄下「已经在跑的那些」，而按钮那边看不见 activeRun ——
    // 所以每次变化都报一份给 store（见 `publishOperatorRunItemIds` 头注）。
    publishOperatorRunItemIds(items.map((item) => item.id))

    const claim = getOperatorClaim()
    if (!claim || claim.delivered) return

    const binding = bindOperatorClaim(claim, items, Date.now())
    if (binding.kind === 'expired') {
      // 那一枪没打出去（被 blockedReason 挡了之类）——⛔ 票必须扔掉，
      // 留着它下一步就会认领用户自己发的那一枪（拍板 4 明令不许打扰的那种）。
      setOperatorClaim(null)
      return
    }
    if (binding.kind === 'waiting') return

    const bound = binding.claim
    setOperatorClaim(bound)
    if (!isOperatorClaimSettled(bound, items)) return

    const evidence = readOperatorClaimEvidence(bound, items)
    // 投递即销票 —— 无论有没有图。⭐ 这就是「只投一次」：轮询还会再来很多轮，
    // 每一轮都投一次的代价是每次一份视觉 token。
    setOperatorClaim(null)
    // 全失败 = 没有图可看。⛔ 不拿一句「失败了」去请一次视觉评价。
    if (evidence) latest.current(evidence)
  }, [activeRun])
}
