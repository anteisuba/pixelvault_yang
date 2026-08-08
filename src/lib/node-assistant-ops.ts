/**
 * 从助手回复正文里取出 op 提案（包 5）。
 *
 * 与 `[[capability:…]]` 同一条路数：**正文里留标记，客户端剥掉再渲染成可点的
 * 东西**。这里只做「取出来 + 校验形状」，合不合法（能不能连、能不能标）归
 * `node-assistant-op-plan`，做不做得成归 workbench。三段分开是为了让合法性可以
 * 纯函数单测 —— 那是本包唯一有意义的验收面。
 *
 * ⚠ **流式安全的三条规则已上收到 `lib/assistant-marker-block.ts`**（A2 的
 * `[[ask]]` / `[[next]]` 要用同一套）。那三条是这里的真机事故换来的，别在这个
 * 文件里再写一份 —— 两份规则迟早分叉，而分叉的表现是「某一种标记会静默消失」。
 */

import { extractMarkerBlock } from '@/lib/assistant-marker-block'
import {
  NodeAssistantOpBatchSchema,
  type NodeAssistantOpBatch,
} from '@/types/node-assistant-ops'

export interface NodeAssistantOpsExtraction {
  /** 正文，已剥掉 op 块（含还没写完的那半截）。 */
  content: string
  /** 校验通过的提案；没有提案、或还在流式写入时为 null。 */
  batch: NodeAssistantOpBatch | null
  /**
   * 出现了**完整**的 op 块但读不出提案（JSON 坏了 / 形状不对）。
   * 用来告诉用户「助手想动画布但没说清楚」，而不是假装什么都没发生 ——
   * 静默吞掉会让人以为助手偷偷改了画布。
   */
  malformed: boolean
}

/** 标记名（不含方括号）。口径与 `NODE_ASSISTANT_OP_MARKERS` 一致。 */
const OPS_MARKER = 'canvas-ops'

export function extractNodeAssistantOps(
  rawContent: string,
  options: {
    /** 流已经结束（不会再有 chunk 了）。 */
    streamComplete?: boolean
  } = {},
): NodeAssistantOpsExtraction {
  const { content, payload, malformed } = extractMarkerBlock(rawContent, {
    marker: OPS_MARKER,
    schema: NodeAssistantOpBatchSchema,
    streamComplete: options.streamComplete,
  })

  return { content, batch: payload, malformed }
}
