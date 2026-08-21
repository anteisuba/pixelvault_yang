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
 * 4. **开标记自己也是一个字一个字长出来的**（2026-08-21 真机抓到）：第 1 条藏的是
 *    「开标记之后」的内容，而 `[[set` 这种**还没长完的开标记**压根匹配不上，于是
 *    原样当正文返回 —— 用户眼看着裸标记蹦出来又消失。所以尾部凡是「还可能长成开
 *    标记」的片段，流没结束前一律扣留。⛔ 别改成「等流结束再显示全部」：那会毁掉
 *    打字机，而打字机是「传输与呈现解耦」这条结论的落点。
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

/**
 * 开标记的两种起手式，与下面 `open` 正则里的 `\[\[?` 是同一件事的两种写法：
 * 一个用来**认已经写完的**，一个用来**认正在写的**。改一个就得改另一个。
 */
const MARKER_OPEN_LEADS = ['[[', '['] as const

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
 * 尾巴上那截「还可能长成开标记」的字符有多长 —— 见文件头第 4 条。
 *
 * 候选就是「起手括号 + marker 名的任意前缀」（`[`、`[[`、`[[s`…`[[setup`）。
 * `[[setup]` 不在候选里，因为它已经能被 `open` 命中 —— 走到这里就说明没命中。
 *
 * ⚠ **只判尾巴**：流式文本只会从末尾长，中间的 `[[` 要么早就凑成了标记、要么
 * 这辈子都凑不成。扣留量最多 `marker.length + 2` 个字符，兑现为打字机上一两拍的
 * 延迟，判定得出来立刻放行 —— 正文里的 `[1]`、markdown 链接不会被永久吃掉。
 */
function partialOpenMarkerLength(value: string, marker: string): number {
  const tail = value.toLowerCase()
  const name = marker.toLowerCase()
  let held = 0
  for (const lead of MARKER_OPEN_LEADS) {
    for (let taken = 0; taken <= name.length; taken += 1) {
      const candidate = lead + name.slice(0, taken)
      if (candidate.length > held && tail.endsWith(candidate)) {
        held = candidate.length
      }
    }
  }
  return held
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

  /** 尾巴上那截还可能长成开标记的字符，流没结束前不外显 —— 见文件头第 4 条。 */
  const holdBackPartialMarker = (value: string) =>
    streamComplete
      ? value
      : value.slice(0, value.length - partialOpenMarkerLength(value, marker))

  // ⚠ 「没有这种标记」的快路也要扣留：`[[set` 里既没有 `[[ask]]` 也没有
  // `[[setup]]`，四种标记全从这里原样返回，正是 2026-08-21 那次泄漏的通道。
  if (!patterns.open.test(rawContent)) {
    return {
      content: holdBackPartialMarker(rawContent),
      payload: null,
      malformed: false,
    }
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
      // 没命中开标记不等于「剩下的都是正文」：尾巴可能正是一个写到一半的开标记。
      // 流结束了就没有「一半」这回事了，那时残缺括号就是普通文字。
      content += holdBackPartialMarker(rest)
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
