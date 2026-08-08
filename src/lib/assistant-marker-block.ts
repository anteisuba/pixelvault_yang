/**
 * 助手正文里的标记块 —— **一台引擎，三个消费者**。
 *
 * 项目里的路数是：模型在 Markdown 正文里留一对标记，客户端剥掉标记段再渲染成可点
 * 的东西（`[[capability:…]]` 最早这么做，`[[canvas-ops]]` 把它扩到 JSON 载荷）。
 * A2 的对话协议又要两个（`[[ask]]` 结构化反问 / `[[next]]` 收敛选项），于是把抽取
 * 逻辑收到这里，让三处共用同一份流式安全规则。
 *
 * ⚠ 下面三条全部是 `[[canvas-ops]]` 用真机事故换来的，照搬不动：
 *
 * 1. **闭合标记不是装饰**。对话每来一个 chunk 就整段重跑一次抽取，所以
 *    「没闭合 = 还在写 → 藏起来但不产出载荷」「有闭合 = 写完了 → 才解析」。
 *    少了这条，用户会先看到半截 JSON，再看到一张基于半截载荷的卡。
 * 2. **标记匹配必须宽进**（2026-07-31 真机抓到）：模型写完整段合法载荷后，把闭合
 *    标记写成了单括号 `[/canvas-ops]`。严格匹配把一段完好的载荷当成「还没写完」
 *    藏掉了 —— 没有卡，也没有任何提示。一个括号不该让整个能力静默消失。
 * 3. **流结束却没闭合，不能再当「还在写」**。那时要么标记写歪了、要么输出被截断，
 *    两种都得给用户交代：先尽力把剩下的当载荷解析，读不出来就报 `malformed`。
 */

import type { z } from 'zod'

export interface MarkerBlockExtraction<T> {
  /** 正文，已剥掉标记段（含还没写完的那半截）。 */
  content: string
  /** 校验通过的载荷；没有载荷、或还在流式写入时为 null。 */
  payload: T | null
  /**
   * 出现了**完整**的标记块但读不出载荷（JSON 坏了 / 形状不对）。用来告诉用户
   * 「助手想说点什么但没说清楚」，而不是假装什么都没发生。
   */
  malformed: boolean
}

const FENCE_PATTERN = /^```(?:json)?\s*|\s*```$/g

/** 载荷里最外层的那个 `{…}` —— 兜住模型在 JSON 前后多写的零碎。 */
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

/** 单双括号都收 —— 见文件头第 2 条。marker 名按字面转义，允许 `-` 与字母数字。 */
function buildMarkerPatterns(marker: string): {
  open: RegExp
  close: RegExp
} {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return {
    open: new RegExp(`\\[\\[?${escaped}\\]\\]?`, 'i'),
    close: new RegExp(`\\[\\[?/${escaped}\\]\\]?`, 'i'),
  }
}

function matchMarker(
  pattern: RegExp,
  value: string,
): { index: number; length: number } | null {
  const match = pattern.exec(value)
  return match ? { index: match.index, length: match[0].length } : null
}

/**
 * 取出一种标记的载荷，并给出剥干净的正文。
 *
 * 多个完整块时**只认第一个**：一次回复里两份载荷就意味着两张卡、两套状态，那是
 * 渲染层还没有的形态。其余块照样从正文里剥掉 —— 留在正文里更糟，用户会看到一段
 * 没人管的 JSON。
 *
 * 要抽多种标记就串着调：把上一次的 `content` 喂给下一次。
 */
export function extractMarkerBlock<S extends z.ZodTypeAny>(
  rawContent: string,
  options: {
    /** 标记名，不含方括号与斜杠。例：`canvas-ops` / `ask` / `next`。 */
    marker: string
    schema: S
    /** 流已经结束（不会再有 chunk 了）。见文件头第 3 条。 */
    streamComplete?: boolean
  },
): MarkerBlockExtraction<z.infer<S>> {
  const { marker, schema, streamComplete = false } = options
  const patterns = buildMarkerPatterns(marker)

  if (!patterns.open.test(rawContent)) {
    return { content: rawContent, payload: null, malformed: false }
  }

  let content = ''
  let rest = rawContent
  let payload: z.infer<S> | null = null
  let malformed = false

  const readPayload = (raw: string) => {
    if (payload || malformed) return
    const parsed = schema.safeParse(parseJsonBlock(raw))
    if (parsed.success) {
      payload = parsed.data as z.infer<S>
    } else {
      malformed = true
    }
  }

  while (true) {
    const openMatch = matchMarker(patterns.open, rest)
    if (!openMatch) {
      content += rest
      break
    }

    content += rest.slice(0, openMatch.index)
    const afterOpen = rest.slice(openMatch.index + openMatch.length)
    const closeMatch = matchMarker(patterns.close, afterOpen)
    if (!closeMatch) {
      if (streamComplete) readPayload(afterOpen)
      break
    }

    readPayload(afterOpen.slice(0, closeMatch.index))
    rest = afterOpen.slice(closeMatch.index + closeMatch.length)
  }

  return {
    content: content.replace(/\n{3,}/g, '\n\n').trim(),
    payload,
    malformed,
  }
}
