/**
 * 上下文预算的量法（设计方案 §2 / P2）：一次碰模型的请求体 → 「工具 + 系统提示 + 消息」三段字数，
 * 外加相邻两次之间**逐字相同的前缀**有多长，以及按各家缓存规则这一次真能复用多少（`PrefixCache`）。
 *
 * ⭐ 四种协议各拆各的，拼成同一种规范串：`TOOLS …` → `SYSTEM …` → `MESSAGES …`（Claude 缓存
 *   的认前缀顺序；别家把工具也渲在最前）。量的是字数，⛔ 不是 token：同一份输入换一家 token
 *   数就变，字数在五家之间可比、逐字可复现。
 * ⚠ 图 / 片子的字节换成 `<media 指纹 长度>`：base64 不算进字数（另有张数），但两步之间换了
 *   一张图仍然断前缀。`cache_control` 标记剥掉：它是给厂商的提示，不是模型读的内容。
 */
import { createHash } from 'node:crypto'

import type { RecordedModelCall } from './fake-network'

export interface PromptSections {
  readonly tools: string
  readonly system: string
  readonly messages: string
}

const BASE64_RUN = /^[A-Za-z0-9+/=\s]+$/
const MEDIA_MIN_CHARS = 256

function mediaPlaceholder(value: string): string {
  const digest = createHash('sha1').update(value).digest('hex').slice(0, 10)
  return `<media ${digest} ${value.length}>`
}

/** 规范 JSON：媒体换占位、剥 `cache_control`，键序沿用请求体（SDK 每次同序）。 */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (key, inner: unknown) => {
    if (key === 'cache_control') return undefined
    if (typeof inner !== 'string' || inner.length < MEDIA_MIN_CHARS)
      return inner
    if (inner.startsWith('data:')) return mediaPlaceholder(inner)
    return BASE64_RUN.test(inner) ? mediaPlaceholder(inner) : inner
  })
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/** 几块系统提示首尾相接（分块只是给缓存断点用的，模型读到的是同一段字）。 */
function textOf(value: unknown): string {
  if (typeof value === 'string') return value
  return asArray(value)
    .map((part) => {
      const record = asRecord(part)
      return typeof record.text === 'string' ? record.text : canonicalJson(part)
    })
    .join('')
}

const SYSTEM_ROLES = new Set(['system', 'developer'])

/** 一次请求 → 三段规范串（四种协议各拆各的）。 */
export function promptSections(call: RecordedModelCall): PromptSections {
  const body = asRecord(call.body)
  const tools = canonicalJson(asArray(body.tools))
  if (call.protocol === 'gemini') {
    const system = asRecord(body.systemInstruction)
    return {
      tools,
      system: textOf(system.parts),
      messages: canonicalJson(asArray(body.contents)),
    }
  }
  if (call.protocol === 'anthropic')
    return {
      tools,
      system: textOf(body.system),
      messages: canonicalJson(asArray(body.messages)),
    }
  const items = asArray(
    call.protocol === 'responses' ? body.input : body.messages,
  )
  const isSystem = (item: unknown) => {
    const role = asRecord(item).role
    return typeof role === 'string' && SYSTEM_ROLES.has(role)
  }
  return {
    tools,
    system: [
      ...(typeof body.instructions === 'string' ? [body.instructions] : []),
      ...items.filter(isSystem).map((item) => textOf(asRecord(item).content)),
    ].join('\n'),
    messages: canonicalJson(items.filter((item) => !isSystem(item))),
  }
}

export function canonicalPrompt(sections: PromptSections): string {
  return `TOOLS ${sections.tools}\nSYSTEM ${sections.system}\nMESSAGES ${sections.messages}`
}

export function commonPrefixLength(a: string, b: string): number {
  const limit = Math.min(a.length, b.length)
  let index = 0
  while (index < limit && a.charCodeAt(index) === b.charCodeAt(index))
    index += 1
  return index
}

export interface StepBudget {
  readonly tools: number
  readonly system: number
  readonly messages: number
  readonly total: number
  /** 与上一步逐字相同的前缀（第一步为 0）：只看字节稳不稳，与厂商规则无关。 */
  readonly stablePrefix: number
  /** 按这一家的缓存规则，这一次能从之前的请求复用的前缀（`PrefixCache`）。 */
  readonly reused: number
}

/** Claude 一个断点往回找已缓存前缀时最多看几块（官方文档：20 块）。 */
const ANTHROPIC_LOOKBACK_BLOCKS = 20

interface AnthropicBlock {
  /** 截到这一块（含）为止的规范串 —— 缓存条目的键。 */
  readonly key: string
  readonly cached: boolean
}

function hasCacheControl(value: unknown): boolean {
  return asRecord(value).cache_control !== undefined
}

/** Claude 请求体 → 逐块（工具、系统块、每条消息的每一块）截断后的规范串。 */
function anthropicBlocks(call: RecordedModelCall): AnthropicBlock[] {
  const body = asRecord(call.body)
  const tools = asArray(body.tools)
  const system = Array.isArray(body.system)
    ? body.system
    : typeof body.system === 'string'
      ? [{ type: 'text', text: body.system }]
      : []
  const messages = asArray(body.messages)
  const render = (cut: Record<string, unknown>) =>
    canonicalPrompt(promptSections({ ...call, body: { ...body, ...cut } }))
  const blocks: AnthropicBlock[] = []
  tools.forEach((tool, index) =>
    blocks.push({
      key: render({
        tools: tools.slice(0, index + 1),
        system: [],
        messages: [],
      }),
      cached: hasCacheControl(tool),
    }),
  )
  system.forEach((block, index) =>
    blocks.push({
      key: render({ system: system.slice(0, index + 1), messages: [] }),
      cached: hasCacheControl(block),
    }),
  )
  messages.forEach((message, index) => {
    const record = asRecord(message)
    const content =
      typeof record.content === 'string'
        ? [{ type: 'text', text: record.content }]
        : asArray(record.content)
    content.forEach((part, partIndex) =>
      blocks.push({
        key: render({
          messages: [
            ...messages.slice(0, index),
            { ...record, content: content.slice(0, partIndex + 1) },
          ],
        }),
        cached: hasCacheControl(part),
      }),
    )
  })
  return blocks
}

/**
 * 理想化的厂商前缀缓存（量「这一次真要重算多少字」用；⛔ 不是实测命中率）：
 * - **Claude**：只在显式断点（`cache_control`）处写条目；读时从每个断点往回最多 20 块找已写过
 *   的条目，命中的那一段才算复用。没有断点 = 一字不复用。
 * - **别家**（OpenAI / Gemini / DeepSeek / Grok 的隐式缓存）：与之前任何一次请求逐字相同的
 *   最长前缀都算复用。
 * ⚠ 都没算最小可缓存长度、过期时间与厂商的切块粒度：真机数要看日志里的缓存 token。
 */
export class PrefixCache {
  private readonly prompts: string[] = []
  private readonly anthropicEntries = new Set<string>()

  /** 记下这一次请求，回它能复用的前缀字数。 */
  serve(call: RecordedModelCall, prompt: string): number {
    let reused = 0
    if (call.protocol === 'anthropic') {
      const blocks = anthropicBlocks(call)
      blocks.forEach((block, index) => {
        if (!block.cached) return
        for (
          let back = index;
          back >= 0 && back > index - ANTHROPIC_LOOKBACK_BLOCKS;
          back -= 1
        ) {
          const candidate = blocks[back]!
          if (this.anthropicEntries.has(candidate.key)) {
            reused = Math.max(reused, commonPrefixLength(candidate.key, prompt))
            break
          }
        }
      })
      for (const block of blocks)
        if (block.cached) this.anthropicEntries.add(block.key)
    } else {
      for (const previous of this.prompts)
        reused = Math.max(reused, commonPrefixLength(previous, prompt))
    }
    this.prompts.push(prompt)
    return reused
  }
}

export interface TurnBudget {
  readonly steps: readonly StepBudget[]
  /** 本轮主步的规范串（跨轮比对用）。 */
  readonly prompts: readonly string[]
  /** 本轮主步的「工具 + 系统提示」（逐字）：整轮应当只有一份。 */
  readonly prefixes: readonly string[]
  /** 主步以外的调用（抽记忆、规划、联网查……）：几次、共多少字。 */
  readonly auxCalls: number
  readonly auxChars: number
}

/** 一轮的主步与辅助调用；`cache` 跨轮共用（第二轮接着第一轮写下的缓存）。 */
export function measureTurn(
  calls: readonly RecordedModelCall[],
  cache: PrefixCache,
): TurnBudget {
  const steps: StepBudget[] = []
  const prompts: string[] = []
  const prefixes = new Set<string>()
  let auxCalls = 0
  let auxChars = 0
  for (const call of calls) {
    const sections = promptSections(call)
    const prompt = canonicalPrompt(sections)
    if (call.purpose !== 'step') {
      auxCalls += 1
      auxChars += prompt.length
      continue
    }
    const previous = prompts.at(-1)
    steps.push({
      tools: sections.tools.length,
      system: sections.system.length,
      messages: sections.messages.length,
      total: prompt.length,
      stablePrefix: previous ? commonPrefixLength(previous, prompt) : 0,
      reused: cache.serve(call, prompt),
    })
    prompts.push(prompt)
    prefixes.add(`${sections.tools}\n${sections.system}`)
  }
  return { steps, prompts, prefixes: [...prefixes], auxCalls, auxChars }
}

/** Σ（每步字数 − 复用的前缀）：按厂商缓存规则这些步真要重算的字数。 */
export function freshChars(turn: TurnBudget): number {
  return turn.steps.reduce((sum, step) => sum + step.total - step.reused, 0)
}

/** 一轮的汇总：首步多大、整轮发了多少、其中多少要重算。 */
export interface TurnSummary {
  readonly steps: number
  /** 每一步主调用的总字数（按调用顺序）：看一轮里每一步涨了多少。 */
  readonly stepTotals: readonly number[]
  readonly firstStep: number
  readonly firstStepTools: number
  readonly firstStepSystem: number
  readonly firstStepMessages: number
  readonly turnTotal: number
  /** 开轮（缓存是空的）这一轮真要重算的字数（`freshChars`）。 */
  readonly turnFresh: number
  /** 本轮相邻两步之间相同前缀的最小值（只有一步时为 null）。 */
  readonly minStablePrefixInTurn: number | null
  readonly auxCalls: number
  readonly auxChars: number
}

export function summarizeTurn(turn: TurnBudget): TurnSummary {
  const first = turn.steps[0]
  const later = turn.steps.slice(1)
  return {
    steps: turn.steps.length,
    stepTotals: turn.steps.map((step) => step.total),
    firstStep: first?.total ?? 0,
    firstStepTools: first?.tools ?? 0,
    firstStepSystem: first?.system ?? 0,
    firstStepMessages: first?.messages ?? 0,
    turnTotal: turn.steps.reduce((sum, step) => sum + step.total, 0),
    turnFresh: freshChars(turn),
    minStablePrefixInTurn: later.length
      ? Math.min(...later.map((step) => step.stablePrefix))
      : null,
    auxCalls: turn.auxCalls,
    auxChars: turn.auxChars,
  }
}
