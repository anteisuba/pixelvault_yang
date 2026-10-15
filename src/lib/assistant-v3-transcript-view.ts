import {
  ASSISTANT_V3_GUIDE_HEADING,
  ASSISTANT_V3_LIMITS,
  ASSISTANT_V3_TOOL_IDS,
  ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS,
  ASSISTANT_V3_TRANSCRIPT_SLIM,
  type AssistantV3Tool,
} from '@/constants/assistant-v3'
import type { AssistantV3TranscriptEntry } from '@/types/assistant-v3'

/**
 * 本轮记录这一次发给模型的样子（P2 第二片「瘦身」，设计方案 §2.3；规则见
 * `ASSISTANT_V3_TRANSCRIPT_SLIM`）。⭐ 纯函数、只看记录本身：同一份记录永远算出同一份样子 ——
 * 接力那一跳、下一步都逐字相同，缓存才吃得到。⛔ 不改记录：瘦的只是发出去的字，记录照原样往返，
 * 「再调一次」拿到的仍是全文。
 */

/** 「查来的东西」：只有它们按「最近几条」瘦（改动回执、问题卡、出图确认都短，且说的是现状）。 */
const LOOKED_UP: ReadonlySet<AssistantV3Tool> = new Set([
  ASSISTANT_V3_TOOL_IDS.read,
  ASSISTANT_V3_TOOL_IDS.look,
  ASSISTANT_V3_TOOL_IDS.searchWeb,
  ASSISTANT_V3_TOOL_IDS.searchLibrary,
])

/** 摘要里要留住的指称：找到的 `#n`、查证的 `[n]`、各张脸的句柄（卡、角色、LoRA、参考位）。 */
const REFERENCE_SOURCE =
  '#\\d+|\\[\\d+\\]|\\b(?:img|vid|txt|aud|card|char|lora|ref|video)-[0-9a-z]+(?:~\\d+)?\\b'
const REFERENCE = new RegExp(REFERENCE_SOURCE, 'g')
/** 一条「条目行」：顶格、以指称开头（卡的头一行、`#n · …`、`[n] …`）。 */
const ITEM_LINE = new RegExp(`^(?:${REFERENCE_SOURCE})`)

/**
 * 一条结果的摘要：一行说明 + 第一行 + 条目行（卡的头一行、找到的 `#n`、查证的 `[n]`，前
 * `slimLines` 行）+ 其余地方出现的句柄 / 编号。
 */
export function slimAssistantV3Result(tool: string, text: string): string {
  const { slimLines, slimLineChars, slimRefs } = ASSISTANT_V3_TRANSCRIPT_SLIM
  const lines = text.split('\n').filter((line) => line.trim())
  const kept = [
    ...new Set([
      ...lines.slice(0, 1),
      ...lines.filter((line) => ITEM_LINE.test(line)).slice(0, slimLines),
    ]),
  ].map((line) =>
    line.length > slimLineChars ? `${line.slice(0, slimLineChars)}…` : line,
  )
  const keptText = kept.join('\n')
  const refs = [...new Set(text.match(REFERENCE) ?? [])]
    .filter((ref) => !keptText.includes(ref))
    .slice(0, slimRefs)
  return [
    `[Shown in full earlier this turn (${text.length} chars), slimmed here — call ${tool} again to see all of it]`,
    ...kept,
    ...(refs.length ? [`Also mentions: ${refs.join(', ')}`] : []),
  ].join('\n')
}

/**
 * 截到 `limit` 字以内（连那句说明一起算）。⚠ `limit` 比说明还短时只剩说明（略超一点，不至于
 * 让模型看到一条莫名其妙的空结果）。
 */
function clipToFit(text: string, limit: number, note: string): string {
  if (text.length <= limit) return text
  const tail = `\n…[${note}]`
  return `${text.slice(0, Math.max(0, limit - tail.length))}${tail}`
}

export interface AssistantV3TranscriptView {
  /** 结果那几条（按在 `entries` 里的下标）这一次发的字。 */
  readonly results: ReadonlyMap<number, string>
  /** assistant 那几条这一次发的正文。 */
  readonly assistantTexts: ReadonlyMap<number, string>
  /**
   * 0 = 没超 `maxTranscriptChars`（长轮次照「最近几条」瘦）；1–4 = 超了，瘦到了第几级。⚠ 调用的入参（模型
   * 自己写的 edit / write）一个字不动 —— 截了就不是合法的 JSON；第 4 级之后仍超也照发、记一条日志。
   */
  readonly level: 0 | 1 | 2 | 3 | 4
  /** 这一次本轮记录（不含板子）一共发多少字。 */
  readonly chars: number
}

/** `entries` = 本轮记录去掉开头的板子（与 `transcriptMessages` 收的同一份）。 */
export function planAssistantV3TranscriptView(
  entries: readonly AssistantV3TranscriptEntry[],
): AssistantV3TranscriptView {
  const {
    slimAboveChars,
    keepFullResults,
    slimMinChars,
    clippedAssistantChars,
  } = ASSISTANT_V3_TRANSCRIPT_SLIM
  const max = ASSISTANT_V3_LIMITS.maxTranscriptChars
  /** 最后一条 assistant 之后的结果 = 模型刚要的，它还没看过：前两级都不碰。 */
  const lastAssistant = entries.findLastIndex(
    (entry) => entry.type === ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.assistant,
  )
  const base = new Map<number, string>()
  const tools = new Map<number, string>()
  const results = new Map<number, string>()
  const assistantTexts = new Map<number, string>()
  let callChars = 0
  /** 本轮记录原样多少字（只增不减：过了 `slimAboveChars` 就一直瘦，不会来回翻）。 */
  let rawChars = 0
  const looked: number[] = []
  const guides = new Set<number>()
  for (const [index, entry] of entries.entries()) {
    if (entry.type === ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.assistant) {
      assistantTexts.set(index, entry.text)
      const inputs = entry.calls.reduce(
        (sum, call) => sum + call.input.length,
        0,
      )
      callChars += inputs
      rawChars += entry.text.length + inputs
    } else if (entry.type === ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.result) {
      // 查证那一步的短版：最后一条 assistant 之前就读它（搜索期第三片，原有的规矩）。
      const text =
        entry.compact && index < lastAssistant ? entry.compact : entry.output
      base.set(index, text)
      tools.set(index, entry.tool)
      results.set(index, text)
      rawChars += entry.output.length
      if (entry.output.includes(ASSISTANT_V3_GUIDE_HEADING)) guides.add(index)
      else if (LOOKED_UP.has(entry.tool)) looked.push(index)
    }
  }
  /** 只在够长、且摘要不到原样一半时才换（换一次断一次缓存前缀，省不下多少就不换）。 */
  const slim = (index: number) => {
    const text = base.get(index)!
    if (text.length <= slimMinChars) return
    const slimmed = slimAssistantV3Result(tools.get(index)!, text)
    if (slimmed.length * 2 <= text.length) results.set(index, slimmed)
  }
  const sum = (values: Iterable<string>) => {
    let total = 0
    for (const value of values) total += value.length
    return total
  }
  const total = () =>
    callChars + sum(results.values()) + sum(assistantTexts.values())
  const earlier = (index: number) => index < lastAssistant

  // 长轮次：查来的东西只留最近几条原样（模型刚要的那几条永远原样）。没过线一字不动（缓存）。
  if (rawChars > slimAboveChars) {
    const keep = new Set(looked.slice(-keepFullResults))
    for (const index of looked)
      if (earlier(index) && !keep.has(index)) slim(index)
  }

  let level: AssistantV3TranscriptView['level'] = 0
  if (total() > max) {
    level = 1
    for (const index of looked) if (earlier(index)) slim(index)
  }
  if (total() > max) {
    level = 2
    for (const index of base.keys()) if (earlier(index)) slim(index)
  }
  if (total() > max) {
    level = 3
    for (const [index, text] of assistantTexts)
      if (earlier(index))
        assistantTexts.set(
          index,
          clipToFit(text, clippedAssistantChars, 'cut to fit this turn'),
        )
  }
  if (total() > max) {
    level = 4
    const fresh = [...base.keys()].filter((index) => index > lastAssistant)
    const others = total() - sum(fresh.map((index) => results.get(index)!))
    const share = Math.max(
      0,
      Math.floor((max - others) / Math.max(fresh.length, 1)),
    )
    for (const index of fresh) {
      const text = results.get(index)!
      results.set(
        index,
        clipToFit(
          text,
          share,
          `cut to fit this turn's room: ${text.length} chars in all — ask for less at a time`,
        ),
      )
    }
  }
  return { results, assistantTexts, level, chars: total() }
}
