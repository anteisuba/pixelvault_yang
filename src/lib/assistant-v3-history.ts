/**
 * v3 发给模型的对白（P2 第三片，设计方案 §2.2「历史压缩」）—— 纯函数：分轮、开窗、挑摘要、
 * 渲摘要、拼后台那一跳的原料。读写会话与调模型在 `assistant-v3-history.service.ts`。
 *
 * ── 窗口 ─────────────────────────────────────────────────────
 * 创作者这一句之前的对白按「轮」分组（一条 user 起一轮；最前面没有 user 的那几条自成一轮），
 * 只发最后几轮：总字数 ≤ `maxChars`、总条数 ≤ `maxMessages`。⭐ 起点只落在 `blockTurns` 的整数倍上
 * （从请求里第一轮数起）—— 两次滑动之间起点不动，对白那一段逐字是上一轮的再接两条，缓存吃得到。
 * 最后一块自己就超了才退到逐轮挪；最近那一轮无论多长都留着。
 *
 * ── 摘要 ─────────────────────────────────────────────────────
 * 滑出去的那几轮由后台写成一份摘要（决定 / 偏好 / 没做完的 / 名字与 id），接在系统提示里。
 * 一份摘要认它管到的最后一轮的**指纹**（那一轮的原字），⛔ 不认第几轮：刷新之后前端只重带最后
 * 几条，请求里的轮号整体挪了，指纹照样对得上；对不上（那一轮已经不在请求里）= 它管的全在请求
 * 之前。
 * - 挑：管得最远的那一份（一样远取新的）；它管到的那几轮不再原样发，最近那一轮总留着。
 * - 缺口（窗口起点越过了它管到的位置，中间那几轮没人管）：交给后台补一份「上一份 + 那几轮」；
 *   这一轮**多留一轮** —— 起点照它管到的位置、只多出最新的那一轮（上一轮的窗口本来放得下才留）；
 *   留不下就照样滑，那几轮这一轮看不见。
 */
import { ASSISTANT_V3_HISTORY } from '@/constants/assistant-v3'
import {
  AssistantV3HistorySummaryDraftSchema,
  type AssistantV3HistorySummary,
  type AssistantV3HistorySummaryDraft,
} from '@/types/assistant-v3'

export interface AssistantV3HistoryMessage {
  readonly role: 'user' | 'assistant'
  readonly content: string
}

export interface AssistantV3HistoryTurn {
  readonly messages: readonly AssistantV3HistoryMessage[]
  /** 这一轮第一条在请求 `messages` 里的下标（过程记录按它取模型看见的那几条原样存）。 */
  readonly index: number
  readonly chars: number
  /** 这一轮原字的指纹（`assistantV3TurnFingerprint`）：摘要靠它认「管到哪一轮」。 */
  readonly fingerprint: string
}

/**
 * 53 位的字串指纹（cyrb53）：只用来认「是不是同一轮」，⛔ 不防伪造 —— 前端带来的对白本来就是
 * 这位创作者自己的。纯 JS，不碰 `node:crypto`。
 */
function fingerprintOf(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0))
    .toString(16)
    .padStart(14, '0')
}

export function assistantV3TurnFingerprint(
  messages: readonly AssistantV3HistoryMessage[],
): string {
  return fingerprintOf(
    messages
      .map((message) => `${message.role}\u0001${message.content}`)
      .join('\u0002'),
  )
}

function toTurn(group: {
  index: number
  messages: AssistantV3HistoryMessage[]
}): AssistantV3HistoryTurn {
  const { messages } = group
  return {
    messages,
    index: group.index,
    chars: messages.reduce((sum, message) => sum + message.content.length, 0),
    fingerprint: assistantV3TurnFingerprint(messages),
  }
}

/**
 * 请求里的对话 → 创作者这一句之前的那几轮 + 这一句。空白的消息不算（出错 / 被打断那一轮留下的
 * 空助手行，与从前同一条）。
 */
export function splitAssistantV3History(
  messages: readonly AssistantV3HistoryMessage[],
): { turns: AssistantV3HistoryTurn[]; latest: string } {
  const lastUser = messages.findLastIndex((message) => message.role === 'user')
  const groups: { index: number; messages: AssistantV3HistoryMessage[] }[] = []
  for (const [index, message] of messages
    .slice(0, Math.max(lastUser, 0))
    .entries()) {
    if (!message.content.trim()) continue
    const kept = { role: message.role, content: message.content }
    const current = groups.at(-1)
    if (!current || message.role === 'user')
      groups.push({ index, messages: [kept] })
    else current.messages.push(kept)
  }
  return {
    turns: groups.map(toTurn),
    latest: lastUser >= 0 ? messages[lastUser]!.content : '',
  }
}

/** 窗口那三条线（v3 用 `ASSISTANT_V3_HISTORY`；新内核第 6 步给自己那一份）。 */
export interface AssistantV3HistoryWindow {
  readonly maxChars: number
  readonly maxMessages: number
  readonly blockTurns: number
}

function prefixSums(
  turns: readonly AssistantV3HistoryTurn[],
  window: AssistantV3HistoryWindow,
) {
  const chars = [0]
  const messages = [0]
  for (const turn of turns) {
    chars.push(chars.at(-1)! + turn.chars)
    messages.push(messages.at(-1)! + turn.messages.length)
  }
  /** `turns[from, to)` 一共几条。 */
  const count = (from: number, to: number) => messages[to]! - messages[from]!
  /** `turns[from, to)` 放不放得下。 */
  const fits = (from: number, to: number) =>
    chars[to]! - chars[from]! <= window.maxChars &&
    count(from, to) <= window.maxMessages
  return { fits, count }
}

/** 不看摘要时窗口从第几轮起：整块对齐的最小起点；最后一块自己就超了才逐轮挪，最近那一轮总留着。 */
export function assistantV3HistoryWindowStart(
  turns: readonly AssistantV3HistoryTurn[],
  window: AssistantV3HistoryWindow = ASSISTANT_V3_HISTORY,
): number {
  const total = turns.length
  if (total === 0) return 0
  const { fits } = prefixSums(turns, window)
  let lastAligned = 0
  for (let start = 0; start < total; start += window.blockTurns) {
    if (fits(start, total)) return start
    lastAligned = start
  }
  for (let start = lastAligned + 1; start < total; start += 1)
    if (fits(start, total)) return start
  return total - 1
}

/** 一份摘要管到请求里的第几轮为止（不含）：指纹对不上 = 它管的全在请求之前，记 0。 */
export function assistantV3SummaryCoversUpTo(
  summary: AssistantV3HistorySummary,
  turns: readonly AssistantV3HistoryTurn[],
): number {
  return turns.findIndex((turn) => turn.fingerprint === summary.through) + 1
}

export interface AssistantV3HistoryPlan {
  /** 窗口从请求里的第几轮起。 */
  readonly start: number
  /** 接在系统提示里的那一份（没有 = 不带）。 */
  readonly summary: AssistantV3HistorySummary | null
  /** 要后台补的那一份：`previous` + `turns[from, to)`，管到 `turns[to - 1]`。 */
  readonly summarize: {
    readonly previous: AssistantV3HistorySummary | null
    readonly from: number
    readonly to: number
  } | null
}

/**
 * 开轮那一跳：开窗、挑摘要、看要不要后台补一份。`canSummarize` = 这一轮补得了也存得下
 * （有会话、不隐身、存得下）；补不了就不留那一轮，照样滑。
 */
export function planAssistantV3History(input: {
  turns: readonly AssistantV3HistoryTurn[]
  summaries: readonly AssistantV3HistorySummary[]
  canSummarize: boolean
  window?: AssistantV3HistoryWindow
}): AssistantV3HistoryPlan {
  const { turns } = input
  const window = input.window ?? ASSISTANT_V3_HISTORY
  const need = assistantV3HistoryWindowStart(turns, window)
  let summary: AssistantV3HistorySummary | null = null
  let coveredUpTo = 0
  // 最旧的在前：`>=` 让一样远的取新的。
  for (const candidate of input.summaries) {
    const upTo = assistantV3SummaryCoversUpTo(candidate, turns)
    if (summary === null || upTo >= coveredUpTo) {
      summary = candidate
      coveredUpTo = upTo
    }
  }
  /**
   * 它管到的那几轮不再原样发（刷新之后前端重带的最后几条里可能就有它管过的）；最近那一轮总留着。
   * 会话里窗口只往后滑、摘要只补到窗口起点，这一条只在刷新 / 两个标签页时才起作用。
   */
  const floor = Math.min(coveredUpTo, Math.max(0, turns.length - 1))
  if (need <= floor || !input.canSummarize)
    return { start: Math.max(need, floor), summary, summarize: null }
  const { fits, count } = prefixSums(turns, window)
  const held =
    // 上一轮的窗口（不含最新那一轮）本来放得下，才多留这一轮；条数照样封顶（只有字数可以多出一轮）。
    fits(coveredUpTo, turns.length - 1) &&
    count(coveredUpTo, turns.length) <= window.maxMessages
  return {
    start: held ? coveredUpTo : need,
    summary,
    summarize: { previous: summary, from: coveredUpTo, to: need },
  }
}

/** 接力那几跳：照开轮板子上冻的那一份（从后往前数几轮）。 */
export function pinnedAssistantV3History(
  turns: readonly AssistantV3HistoryTurn[],
  pinned: { turns: number; summary?: AssistantV3HistorySummary | undefined },
): AssistantV3HistoryPlan {
  return {
    start: Math.max(0, turns.length - pinned.turns),
    summary: pinned.summary ?? null,
    summarize: null,
  }
}

export function assistantV3HistoryMessages(
  turns: readonly AssistantV3HistoryTurn[],
  start: number,
): AssistantV3HistoryMessage[] {
  return turns.slice(start).flatMap((turn) => turn.messages)
}

/**
 * 摘要四栏的两种读法：干活（定下的事…）与和角色聊天的故事向（第 7a 步 D，owner 10-23）。
 * ⚠ 存的是同一副四栏（⛔ 不加列）：一段会话只有一种模式，写的时候按那种意思写（摘要提示见
 *   `assistant-v3-history.service`），读的时候按同一种标题摆出来。
 */
export type AssistantV3HistorySummaryKind = 'work' | 'story'

const SUMMARY_SECTIONS = {
  work: [
    ['decisions', 'Decided'],
    ['preferences', 'How they like it'],
    ['openItems', 'Still open'],
    ['names', 'Names and ids'],
  ],
  story: [
    ['decisions', 'What happened'],
    ['preferences', 'Where things stand between you'],
    ['openItems', 'Promises and threads still open'],
    ['names', 'People and things in the story'],
  ],
} as const satisfies Record<
  AssistantV3HistorySummaryKind,
  readonly (readonly [keyof AssistantV3HistorySummaryDraft, string])[]
>

export const ASSISTANT_V3_HISTORY_SUMMARY_HEADING =
  'EARLIER IN THIS CONVERSATION'

/**
 * 系统提示里的那一段（接在记忆之后、板上型号的写法之前）。同一份摘要逐字相同（四栏顺序固定、
 * 每栏照存的顺序）。四栏都空 = 不出这一段。
 */
export function renderAssistantV3HistorySummary(
  summary: AssistantV3HistorySummary | null,
  kind: AssistantV3HistorySummaryKind = 'work',
): string {
  if (!summary) return ''
  const sections = SUMMARY_SECTIONS[kind].flatMap(([key, label]) =>
    summary[key].length
      ? [`${label}:\n${summary[key].map((item) => `  - ${item}`).join('\n')}`]
      : [],
  )
  if (sections.length === 0) return ''
  return `

${ASSISTANT_V3_HISTORY_SUMMARY_HEADING} — the first ${summary.turns} turn${summary.turns === 1 ? '' : 's'} of this conversation are no longer shown below; ${kind === 'story' ? 'these notes are the story so far' : 'these notes are what they settled'}.
${sections.join('\n')}
- ${kind === 'story' ? 'Carry the story on from here without recapping it.' : 'Treat these as already agreed: build on them without asking again or reciting them back.'} What the creator says now wins over them.`
}

function cleanItems(items: readonly string[]): string[] {
  const { maxItems, maxItemChars } = ASSISTANT_V3_HISTORY.summary
  const out: string[] = []
  for (const raw of items) {
    const flat = raw.replace(/\s+/g, ' ').trim()
    if (!flat) continue
    const item =
      flat.length > maxItemChars ? `${flat.slice(0, maxItemChars - 1)}…` : flat
    if (!out.includes(item)) out.push(item)
    if (out.length >= maxItems) break
  }
  return out
}

/**
 * 后台那一跳的原话 → 草稿；读不出来回 null。`responseFormat: 'json_object'` 不是每家都硬保证，
 * 有的照样包一层 ```json —— 先剥围栏，再整段，再取第一个 `{…}`。
 */
export function readAssistantV3HistorySummaryDraft(
  raw: string,
): AssistantV3HistorySummaryDraft | null {
  const trimmed = raw.trim()
  const candidates = [
    trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1]?.trim(),
    trimmed,
    trimmed.match(/\{[\s\S]*\}/)?.[0],
  ]
  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      const value = JSON.parse(candidate) as unknown
      // ⚠ 四栏一栏都没有的 JSON 不算（栏是宽松的，`{}` 也过得了 schema —— 当成「什么都没定」存下去
      //   就把那几轮白白丢了）。
      if (
        typeof value !== 'object' ||
        value === null ||
        !SUMMARY_SECTIONS.work.some(([key]) => key in value)
      )
        continue
      const parsed = AssistantV3HistorySummaryDraftSchema.safeParse(value)
      if (parsed.success) return parsed.data
    } catch {
      // 下一个候选
    }
  }
  return null
}

/** 后台那一跳的原样 → 存得下的一份（每栏去空、去重、截字、限条数）。 */
export function normalizeAssistantV3HistorySummary(
  draft: AssistantV3HistorySummaryDraft,
  coverage: { through: string; turns: number },
): AssistantV3HistorySummary {
  return {
    through: coverage.through,
    turns: coverage.turns,
    decisions: cleanItems(draft.decisions),
    preferences: cleanItems(draft.preferences),
    openItems: cleanItems(draft.openItems),
    names: cleanItems(draft.names),
  }
}

/** 新的一份并进会话上存的那几份：管到同一轮的旧的换掉，只留最近 `keep` 份（最旧的在前）。 */
export function mergeAssistantV3HistorySummaries(
  current: readonly AssistantV3HistorySummary[],
  next: AssistantV3HistorySummary,
): AssistantV3HistorySummary[] {
  return [
    ...current.filter((summary) => summary.through !== next.through),
    next,
  ].slice(-ASSISTANT_V3_HISTORY.summary.keep)
}

/**
 * 后台那一跳的原料：上一份（原样 JSON）+ 滑出去的那几轮。每条先截到 `sourceMessageChars`，
 * 整份还超 `sourceChars` 就把每条再平分着截短（⛔ 不整轮丢：决定可能在任何一轮里）。
 */
export function assistantV3HistorySummaryMaterial(
  previous: AssistantV3HistorySummary | null,
  turns: readonly AssistantV3HistoryTurn[],
): string {
  const { sourceChars, sourceMessageChars } = ASSISTANT_V3_HISTORY.summary
  const notes = previous
    ? JSON.stringify({
        decisions: previous.decisions,
        preferences: previous.preferences,
        openItems: previous.openItems,
        names: previous.names,
      })
    : '(none)'
  const messages = turns.flatMap((turn) => turn.messages)
  const budget = Math.max(0, sourceChars - notes.length)
  const perMessage = Math.max(
    400,
    Math.min(
      sourceMessageChars,
      Math.floor(budget / Math.max(1, messages.length)),
    ),
  )
  const lines = messages.map((message) => {
    const text =
      message.content.length > perMessage
        ? `${message.content.slice(0, perMessage - 1)}…`
        : message.content
    return `[${message.role === 'user' ? 'creator' : 'assistant'}] ${text}`
  })
  return `PREVIOUS NOTES\n${notes}\n\nTURNS LEAVING VIEW (oldest first)\n${lines.join('\n\n')}`
}
