/**
 * **成本计数**帧的读取（切片 Y）—— 纯函数。
 *
 * ── 为什么要一个读取器，而不是在 hook 里 `switch` 一支 ──────────────
 * `cost_tick` 是**计数帧不是步**（见 `ASSISTANT_OPERATOR_EVENTS.costTick` 头注）：
 * 它没有 step id、没有 payload / inverse，唯一的用途是往计数器上加一笔。把它的
 * 形状读取写成一颗纯函数，是因为它要在**契约那一侧尚未把这一帧并进事件联合时**
 * 也能安全地跑 —— 判别联合上分不出来的那一支，`switch` 里写不出来；而这里
 * 只问三件事：`type` 对不对、`kind` 是不是三档之一、`units` 是不是一个正数。
 *
 * ⚠ **读不出来就返回 `null`，⛔ 不抛**：一帧计数解不出来不该让整轮崩掉 ——
 * 它连一步都不是。
 * ⚠ ⛔ 它**不是闸**：这里只把数字读出来，拦是三档确认的事（§6）。
 */

import {
  ASSISTANT_COST_TICK_KINDS,
  ASSISTANT_OPERATOR_EVENTS,
} from '@/constants/assistant-operator'
import type { AssistantCostTickKind } from '@/constants/assistant-operator'
import type { StudioOperatorCostTick } from '@/types/studio-assistant-operator'

function isCostKind(value: unknown): value is AssistantCostTickKind {
  return ASSISTANT_COST_TICK_KINDS.some((kind) => kind === value)
}

/**
 * 一帧 `cost_tick` → 一记计数；不是这一帧（或形状不对）就 `null`。
 *
 * ⚠ `units` 非正数直接丢：`0` 加上去什么都没变，负数只会让计数倒着走 —— 两者
 * 都只可能是上游的错，而把它算进去的表现是界面上一个越用越小的数字。
 */
export function readOperatorCostTick(
  event: unknown,
): StudioOperatorCostTick | null {
  if (!event || typeof event !== 'object') return null
  const frame = event as Record<string, unknown>
  if (frame.type !== ASSISTANT_OPERATOR_EVENTS.costTick) return null
  if (!isCostKind(frame.kind)) return null
  const units = frame.units
  if (typeof units !== 'number' || !Number.isFinite(units) || units <= 0) {
    return null
  }
  const label = typeof frame.label === 'string' ? frame.label.trim() : ''
  return {
    kind: frame.kind,
    units,
    ...(label ? { label } : {}),
  }
}
