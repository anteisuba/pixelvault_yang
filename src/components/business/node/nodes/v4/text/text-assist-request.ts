/**
 * 文本节点助手栏的**投递口**（与 `@/lib/canvas-rerun-request` 逐字同源，见其头注）。
 *
 * 发起方是画布上的文本卡（长在 ReactFlow 与 `NodeV4Provider` 之内），消费方是助手
 * dock（长在画布外壳上、那个 Provider **之外**）。中间隔着整棵组件树，逐层透传一个
 * 可选回调正是本仓「漏传 = 三绿而功能全失效」的高发形态。
 *
 * ⛔ 它**不调模型**：写作请求照旧走 dock 那一条会话（同一条 tool-loop、同一份提案
 * 与撤销栈），结果以 `set_text` 落回正文。这里只是一张便条。
 * ⚠ **只留一件** + **取走即消费**：理由同 `canvas-rerun-request`。
 */

export const TEXT_ASSIST_ACTIONS = ['continue', 'rewrite'] as const

export type TextAssistAction = (typeof TEXT_ASSIST_ACTIONS)[number]

export interface TextAssistRequest {
  readonly nodeId: string
  /** chip 选的动作；用户只打了字没点 chip 时是 `undefined`。 */
  readonly action?: TextAssistAction
  /** 助手栏正文（可空——只点 chip 就发也成立）。 */
  readonly prompt: string
  /** 写作模型的 `optionId`（`useLLMRoutePicker('assistant')` 的口径）。 */
  readonly modelOptionId?: string
}

let pending: TextAssistRequest | null = null
const listeners = new Set<() => void>()

export function requestCanvasTextAssist(request: TextAssistRequest): void {
  pending = request
  for (const listener of listeners) listener()
}

export function takeCanvasTextAssist(): TextAssistRequest | null {
  const next = pending
  pending = null
  return next
}

export function subscribeCanvasTextAssist(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * 写作模型的选择**全画布共用一份**（画板 `TextBarModel.dc.html`：「模型 chip 记住
 * 上次选择，全画布共用」）。⛔ 不塞进节点数据：它是用户的偏好，不是这段字的属性。
 */
let writingModelOptionId: string | null = null
const modelListeners = new Set<() => void>()

export function getCanvasWritingModel(): string | null {
  return writingModelOptionId
}

export function setCanvasWritingModel(optionId: string | null): void {
  writingModelOptionId = optionId
  for (const listener of modelListeners) listener()
}

export function subscribeCanvasWritingModel(listener: () => void): () => void {
  modelListeners.add(listener)
  return () => {
    modelListeners.delete(listener)
  }
}
