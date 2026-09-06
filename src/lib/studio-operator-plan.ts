/**
 * **计划卡出不出**（`docs/references/pages/assistant-shell.md` §5，owner 2026-09-06 定）。
 *
 * ── 为什么这条判据在客户端，而不在服务端 ──────────────────────────
 * 试过的另一条路是「让模型自己决定要不要先问一句」。它不稳定（同一句话两次跑出
 * 两个结果），而且与本仓「服务端零会话态」相冲：模型判不出「用户这一轮开没开
 * 先问我」，那颗开关活在客户端。所以服务端只**摆事实**（`plan_request` 里的阶段、
 * 待定项、预估、观察到的理由），判定放在这一个纯函数里 —— 一处判、到处一致，
 * 而且脱离 React 就能钉死。
 *
 * ── 三条判据，任一成立就出卡 ───────────────────────────────────────
 *  ① 用户自己要求先问（输入区那颗「先问我」，§3.3）；
 *  ② 这一轮的工具是**花钱档**（`plan_request.reason === 'spend'`，服务端观察到的
 *     事实：本轮 tool 是 `prime_generate` / `request_generation`）；
 *  ③ 步数 ≥ `ASSISTANT_PLAN_CARD_MIN_STEPS`（3）—— 「它要替我做一串事」。
 *
 * ⛔ 三条都不成立就**直接进 working**：改一句提示词还先弹一张卡，是纯打扰。
 */

import {
  ASSISTANT_PLAN_CARD_MIN_STEPS,
  ASSISTANT_PLAN_REQUEST_REASON_IDS,
} from '@/constants/assistant-operator'
import type {
  AssistantOperatorPlanRequestEvent,
  AssistantOperatorRequest,
} from '@/types/assistant-operator'

/**
 * 判定要用的那两样东西。
 *
 * ⚠ 第二个参数收的是**请求的一格**而不是整份 `AssistantOperatorRequest`：这个函数
 * 只读 `forcePlan`，把整份请求（含快照、消息、apiKey）拖进签名只会让它看起来
 * 依赖更多（与 `removeReferenceByUrl` 那条论据同源）。
 */
export type ShouldShowPlanCardRequest = Pick<
  AssistantOperatorRequest,
  'forcePlan'
>

export function shouldShowPlanCard(
  plan: AssistantOperatorPlanRequestEvent,
  request: ShouldShowPlanCardRequest,
): boolean {
  if (request.forcePlan === true) return true
  if (plan.reason === ASSISTANT_PLAN_REQUEST_REASON_IDS.spend) return true
  return plan.steps.length >= ASSISTANT_PLAN_CARD_MIN_STEPS
}
