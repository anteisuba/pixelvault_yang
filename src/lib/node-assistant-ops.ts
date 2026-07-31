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
 *
 * ⚠ **标记的匹配必须宽进**（2026-07-31 真机抓到）：模型写完整段合法载荷后，把
 * 闭合标记写成了 `[/canvas-ops]`（单括号）。原实现严格要求 `[[/canvas-ops]]`，
 * 于是把一段完好的提案当成「还没写完」藏掉了 —— **没有卡，也没有任何提示**。
 * 一个括号的差别不该让整个能力静默消失，所以单双括号都收。
 *
 * ⚠ 同一次事故的第二半：**流已经结束却没闭合，不能再当「还在写」**。那时候要么
 * 是标记写歪了、要么是输出被截断，两种都得给用户一个交代：先尽力把剩下的部分当
 * 载荷解析，解析不出来就报 `malformed`。调用方通过 `streamComplete` 告诉这里
 * 「流结束了」。
 */

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

/**
 * 标记的宽进匹配：单括号也认。提示词里给的是双括号（`NODE_ASSISTANT_OP_MARKERS`
 * 就是那份口径），但模型写成 `[/canvas-ops]` 是常事 —— 收下它，别为一个括号丢掉
 * 整段提案。
 */
const OPEN_MARKER_PATTERN = /\[\[?canvas-ops\]\]?/i
const CLOSE_MARKER_PATTERN = /\[\[?\/canvas-ops\]\]?/i

function matchMarker(
  pattern: RegExp,
  value: string,
): { index: number; length: number } | null {
  const match = pattern.exec(value)
  return match ? { index: match.index, length: match[0].length } : null
}

/** 载荷里最外层的那个 `{…}` —— 用来兜住模型在 JSON 前后多写的零碎。 */
const OUTERMOST_OBJECT_PATTERN = /\{[\s\S]*\}/

function parseJsonBlock(raw: string): unknown {
  const trimmed = raw.trim().replace(FENCE_PATTERN, '').trim()
  if (!trimmed) return undefined
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    // 前后有杂物（没被标记规则吃掉的收尾词、漏写的闭合标记残骸）时，退一步只取
    // 最外层的对象。同一招 `node-script-doc.service` 的 `parseJsonObject` 也在用。
    const match = OUTERMOST_OBJECT_PATTERN.exec(trimmed)
    if (!match) return undefined
    try {
      return JSON.parse(match[0]) as unknown
    } catch {
      return undefined
    }
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
  options: {
    /** 流已经结束（不会再有 chunk 了）。见文件头「宽进」那两段。 */
    streamComplete?: boolean
  } = {},
): NodeAssistantOpsExtraction {
  const { streamComplete = false } = options
  if (!OPEN_MARKER_PATTERN.test(rawContent)) {
    return { content: rawContent, batch: null, malformed: false }
  }

  let content = ''
  let rest = rawContent
  let batch: NodeAssistantOpBatch | null = null
  let malformed = false

  const readPayload = (payload: string) => {
    if (batch || malformed) return
    const parsed = NodeAssistantOpBatchSchema.safeParse(parseJsonBlock(payload))
    if (parsed.success) {
      batch = parsed.data
    } else {
      malformed = true
    }
  }

  while (true) {
    const openMatch = matchMarker(OPEN_MARKER_PATTERN, rest)
    if (!openMatch) {
      content += rest
      break
    }

    content += rest.slice(0, openMatch.index)
    const afterOpen = rest.slice(openMatch.index + openMatch.length)
    const closeMatch = matchMarker(CLOSE_MARKER_PATTERN, afterOpen)
    if (!closeMatch) {
      // 没有闭合标记。还在写就先藏起来（下一个 chunk 会重跑整段抽取）；流已经
      // 结束就说明标记写歪了或者输出被截断 —— 尽力把剩下的当载荷读，读不出来
      // 就明说，绝不无声无息。
      if (streamComplete) readPayload(afterOpen)
      break
    }

    readPayload(afterOpen.slice(0, closeMatch.index))
    rest = afterOpen.slice(closeMatch.index + closeMatch.length)
  }

  return {
    content: content.replace(/\n{3,}/g, '\n\n').trim(),
    batch,
    malformed,
  }
}
