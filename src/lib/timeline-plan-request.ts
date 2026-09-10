/**
 * 一句话排片的**投递口**（S10）：剪辑台 ⇄ 助手 dock 之间那两张便条。
 *
 * ── 为什么又是一张便条而不是回调 ────────────────────────────────────────
 * 与 `canvas-rerun-request.ts` 逐字同源：发起方（剪辑台底部那条排片栏）与消费方
 * （助手 dock）住在组件树的两端，中间隔着画布外壳；逐层透传一个可选回调正是本仓
 * 「漏传 = 三绿而功能全失效」的高发形态。
 *
 * ⚠ 这里比重跑下游多一条**回程**：提案要送回剪辑台。回程同样是「只留一件、取走
 * 即消费」——两份提案并排摆着没有人读得懂哪份是这一次的。
 * ⛔ 它不发请求、不算时间线：请求要会话（只有 dock 有），算术在 `timeline-plan.ts`。
 */

import type { TimelineProposal } from '@/types/edit-desk-plan'
import type { EditProject } from '@/types/node-workflow'

export interface TimelinePlanRequest {
  /** 用户在排片栏里写的那一句。 */
  readonly prompt: string
  /** 当前时间线（没进过剪辑台时缺席）—— 排片是在它的基础上改。 */
  readonly project?: EditProject
}

let pendingRequest: TimelinePlanRequest | null = null
const requestListeners = new Set<() => void>()

export function requestTimelinePlan(request: TimelinePlanRequest): void {
  pendingRequest = request
  for (const listener of requestListeners) listener()
}

export function takeTimelinePlanRequest(): TimelinePlanRequest | null {
  const next = pendingRequest
  pendingRequest = null
  return next
}

export function subscribeTimelinePlanRequest(listener: () => void): () => void {
  requestListeners.add(listener)
  return () => {
    requestListeners.delete(listener)
  }
}

/* ─── 回程：提案 → 剪辑台 ──────────────────────────────────────────────── */

let pendingProposal: TimelineProposal | null = null
const proposalListeners = new Set<() => void>()

export function deliverTimelineProposal(proposal: TimelineProposal): void {
  pendingProposal = proposal
  for (const listener of proposalListeners) listener()
}

export function takeTimelineProposal(): TimelineProposal | null {
  const next = pendingProposal
  pendingProposal = null
  return next
}

export function subscribeTimelineProposal(listener: () => void): () => void {
  proposalListeners.add(listener)
  return () => {
    proposalListeners.delete(listener)
  }
}
