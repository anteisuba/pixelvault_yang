/**
 * 从助手回复正文里取出 op 提案（包 5）。
 *
 * 与 `[[capability:…]]` 同一条路数：**正文里留标记，客户端剥掉再渲染成可点的
 * 东西**。这里只做「取出来 + 校验形状」，合不合法（能不能连、能不能标）归
 * `node-assistant-op-plan`，做不做得成归 workbench。三段分开是为了让合法性可以
 * 纯函数单测 —— 那是本包唯一有意义的验收面。
 *
 * ⚠ **流式安全**是这个文件存在的主要理由。对话每来一个 chunk 就整段重跑一次抽取
 * （`toDisplayAssistantMessage`），所以：
 *   · 没闭合标记 = 还在写 → 载荷从正文里藏起来，但**不产出提案**；
 *   · 有闭合标记 = 写完了 → 才解析、才校验、才可能出卡。
 * 少了这条，用户会先看到半截 JSON，然后看到一张基于半截载荷的提案卡。
 */

import { NODE_ASSISTANT_OP_MARKERS } from '@/constants/node-assistant-ops'
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

const FENCE_PATTERN = /^```(?:json)?\s*|\s*```$/g

function parseJsonBlock(raw: string): unknown {
  const trimmed = raw.trim().replace(FENCE_PATTERN, '').trim()
  if (!trimmed) return undefined
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return undefined
  }
}

/**
 * 取出提案并给出剥干净的正文。
 *
 * 多个完整块时**只认第一个**：一次回复里两份提案就意味着两张卡、两套应用状态，
 * 那是提案卡还没有的形态。其余块照样从正文里剥掉（留在正文里更糟 —— 用户会看到
 * 一段没人管的 JSON）。
 */
export function extractNodeAssistantOps(
  rawContent: string,
): NodeAssistantOpsExtraction {
  const { open, close } = NODE_ASSISTANT_OP_MARKERS
  if (!rawContent.includes(open)) {
    return { content: rawContent, batch: null, malformed: false }
  }

  let content = ''
  let rest = rawContent
  let batch: NodeAssistantOpBatch | null = null
  let malformed = false

  while (true) {
    const openIndex = rest.indexOf(open)
    if (openIndex === -1) {
      content += rest
      break
    }

    content += rest.slice(0, openIndex)
    const afterOpen = rest.slice(openIndex + open.length)
    const closeIndex = afterOpen.indexOf(close)
    if (closeIndex === -1) {
      // 还在写。载荷藏起来，正文到此为止 —— 下一个 chunk 会重跑整段抽取。
      break
    }

    if (!batch && !malformed) {
      const parsed = NodeAssistantOpBatchSchema.safeParse(
        parseJsonBlock(afterOpen.slice(0, closeIndex)),
      )
      if (parsed.success) {
        batch = parsed.data
      } else {
        malformed = true
      }
    }

    rest = afterOpen.slice(closeIndex + close.length)
  }

  return {
    content: content.replace(/\n{3,}/g, '\n\n').trim(),
    batch,
    malformed,
  }
}
