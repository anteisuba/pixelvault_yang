/**
 * 「重跑下游」的**投递口**（第三期 · 画布侧入口）。
 *
 * ── 为什么是一个模块级的口，不是一个逐层透传的回调 ──────────────────
 * 发起方是节点卡上的右键菜单（长在 ReactFlow 里、`NodeV4Provider` 之内），消费方
 * 是助手 dock（长在画布外壳上、那个 Provider **之外**）。中间隔着整棵组件树，而
 * 逐层透传一个可选回调正是本仓「漏传 = 三绿而功能全失效」的高发形态
 * （与 `requestOperatorAttachment` 逐字同源，见其头注）。
 *
 * ⚠ **只留一件**：连点两个节点的「重跑下游」，用户的意思是「重跑这一个的下游」
 * ——第二次点的那个。两件排队的下场是助手连问两遍。
 * ⚠ **取走即消费**：留着它，dock 每次重挂都会再发一遍同一句话。
 * ⛔ 它**不发请求、不算拓扑**：算拓扑要 nodes/edges（只有 dock 有），发请求要
 * 会话（也只有 dock 有）。这里只是一张便条。
 */

let pendingNodeId: string | null = null
const listeners = new Set<() => void>()

export function requestCanvasRerunDownstream(nodeId: string): void {
  pendingNodeId = nodeId
  for (const listener of listeners) listener()
}

export function takeCanvasRerunDownstream(): string | null {
  const next = pendingNodeId
  pendingNodeId = null
  return next
}

export function subscribeCanvasRerunDownstream(
  listener: () => void,
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
