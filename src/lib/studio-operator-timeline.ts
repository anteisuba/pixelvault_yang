import {
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
  ASSISTANT_OPERATOR_TOOL_IDS,
  ASSISTANT_RESEARCH_DEPTHS,
  type AssistantResearchDepth,
} from '@/constants/assistant-operator'
import { STUDIO_OPERATOR_TIMELINE } from '@/constants/studio-assistant-operator'
import type {
  StudioOperatorStepEntry,
  StudioOperatorThreadEntry,
} from '@/types/studio-assistant-operator'

export function isOperatorResearchTool(tool: string): boolean {
  return (
    tool === ASSISTANT_OPERATOR_TOOL_IDS.searchWeb ||
    tool === ASSISTANT_OPERATOR_TOOL_IDS.readState ||
    tool === ASSISTANT_OPERATOR_TOOL_IDS.listAssetFolders ||
    tool === ASSISTANT_OPERATOR_TOOL_IDS.readProjectRules ||
    /** 翻卡与读卡都属于「查资料」那一档，折进同一组研究行（K1）。 */
    tool === ASSISTANT_OPERATOR_TOOL_IDS.listContextCards ||
    tool === ASSISTANT_OPERATOR_TOOL_IDS.readContextCard
  )
}

export function groupOperatorHistoryTools(
  entries: readonly {
    kind: string
    critique?: unknown
  }[],
) {
  const groups: { tools: boolean; indexes: number[]; round: number }[] = []
  let round = 0
  entries.forEach((entry, index) => {
    if (entry.kind === 'user') round += 1
    /**
     * ⚠ 看参考图那一条**跟着一起折**（56b 切片 5）：它此前因为要单独出一张分析卡
     * 而不进折叠组，而那张卡已经退场 —— 留着这条例外的表现是历史里一条孤零零的
     * 日志行挨着一组折起来的日志。
     */
    const tools = entry.kind === 'step' && !entry.critique
    const previous = groups.at(-1)
    if (tools && previous?.tools) previous.indexes.push(index)
    else groups.push({ tools, indexes: [index], round })
  })
  return groups
}

export type OperatorTimelinePresentation = 'research' | 'message' | 'result'

export function groupOperatorResearch(
  kinds: readonly OperatorTimelinePresentation[],
) {
  const folded = kinds.map((kind) => kind === 'research')
  for (let index = kinds.length - 2; index >= 0; index--) {
    if (kinds[index] === 'message' && folded[index + 1]) folded[index] = true
  }
  const groups: { research: boolean; indexes: number[] }[] = []
  for (let index = 0; index < kinds.length; index++) {
    const research = folded[index] ?? false
    const previous = groups.at(-1)
    if (research && previous?.research) previous.indexes.push(index)
    else groups.push({ research, indexes: [index] })
  }
  return groups
}

/**
 * **一段回答底下要摆哪几条资料**（56b 切片 1）。
 *
 * ⭐ 判据是**位置**而不是 runKey：消息条目身上**没有** runKey
 * （`StudioOperatorMessageEntry` 的形状），而「这段话用了哪几条资料」在时间线上
 * 本来就是位置关系 —— 查完再说话。所以扫一遍条目：攒着查到的证据，遇到下一条
 * 助手消息就全部挂上去并清零。
 * ⚠ 挂给**下一条消息**而不是「同一轮的最后一条」：一轮里「查一次 → 说一句 →
 * 再查一次 → 再说一句」是正常形状，按轮挂会把两次查证的来源全堆在第二句下面。
 * ⚠ 收不到消息的那几条证据（跑到一半停了）就**不挂**：⛔ 不硬塞给上一条消息 ——
 * 那会让一句还没用到这些资料的话底下凭空长出一排来源卡。
 */
export function collectOperatorAnswerSources(
  entries: readonly StudioOperatorThreadEntry[],
): Map<string, { runKey: string; steps: number[] }> {
  const byMessage = new Map<string, { runKey: string; steps: number[] }>()
  let pending: number[] = []
  let runKey = ''
  entries.forEach((entry, index) => {
    if (entry.kind === 'step') {
      const { step } = entry
      if (step.status !== ASSISTANT_OPERATOR_STEP_STATUS_IDS.done) return
      if (step.tool !== ASSISTANT_OPERATOR_TOOL_IDS.research) return
      if ((step.result?.evidence?.length ?? 0) === 0) return
      pending.push(index)
      runKey = entry.runKey
      return
    }
    if (entry.kind !== 'message') return
    if (pending.length === 0) return
    byMessage.set(entry.id, { runKey, steps: pending })
    pending = []
  })
  return byMessage
}

/**
 * **这一组步是不是一次调查，以及它那一行该写什么**（56b 切片 2）。
 *
 * ⭐ 判据是「里面有没有跑完的 `research` 步」：没有就 `null`，调用方退回
 * `StudioOperatorToolGroup`（「N 个操作」那一行）。⛔ 别把 `read_url` 单独算成
 * 一次调查 —— 模型顺手读一页不是「它去查了一轮」。
 * ⚠ **一组里出现过深档就算深档**：一轮里先快搜再深入是正常形状，而那一行要
 * 答的是「这一轮到底查到什么程度」。
 * ⚠ 读页数两处相加：快搜那几页由服务端读（进 `payload.readPages`），深档那几页
 * 是模型自己发的 `read_url` 步 —— 两者都是「读了一页全文」。
 */
export function summarizeOperatorResearchBlock(
  steps: readonly StudioOperatorStepEntry[],
): { depth: AssistantResearchDepth; found: number; readPages: number } | null {
  let seen = false
  let depth: AssistantResearchDepth = ASSISTANT_RESEARCH_DEPTHS.quick
  let found = 0
  let readPages = 0
  for (const { step } of steps) {
    // ⚠ 先判 `status` 再判 `tool` —— 载荷与结果只挂在跑完那一支上。
    if (step.status !== ASSISTANT_OPERATOR_STEP_STATUS_IDS.done) continue
    if (step.tool === ASSISTANT_OPERATOR_TOOL_IDS.readUrl) {
      readPages += 1
      continue
    }
    if (step.tool !== ASSISTANT_OPERATOR_TOOL_IDS.research) continue
    seen = true
    found += step.result?.evidence?.length ?? 0
    readPages += step.payload.readPages
    if (step.payload.depth === ASSISTANT_RESEARCH_DEPTHS.deep) {
      depth = ASSISTANT_RESEARCH_DEPTHS.deep
    }
  }
  return seen ? { depth, found, readPages } : null
}

/**
 * 新条目落位时**要不要跟着滚到底**（2026-09-07 真机）。
 *
 * ⭐ 由来：反问卡 / 新卡出现后视图停在旧位置 —— 那几张卡不是线程条目（住在 store
 * 的 `plan` / `spend` / `choice` 里），滚动那一发只盯着 `entries`，于是「等你定」
 * 的东西长在屏幕外面。
 * ⚠ 判据是「**用户本来就在底部附近**」：他已经手动上滚去读三轮之前那段话时，
 * 每来一条就把他拽回底部是本仓最讨厌的那种越俎代庖。阈值见常量头注。
 */
export function shouldStickOperatorScroll(metrics: {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}): boolean {
  const distance =
    metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight
  return distance <= STUDIO_OPERATOR_TIMELINE.stickToBottomPx
}

/**
 * 历史按**轮**切开（2026-09-06 面板轮，第 5 件）。
 *
 * ⭐ 一轮 = 从一条用户发言起，到下一条用户发言前。第一条用户发言之前的那些
 * （载回来的历史常常从助手那半句开始）自成一轮，⛔ 不丢掉也不并进后面那一轮。
 * ⚠ 切的依据是 `kind === 'user'` 而不是 runKey：历史条目**没有 runKey**
 * （见 `types/studio-operator-history.ts` 的头注），拿它当锚只会得到一个恒空的分组。
 */
export function splitOperatorHistoryRounds(
  kinds: readonly string[],
): { indexes: number[] }[] {
  const rounds: { indexes: number[] }[] = []
  for (let index = 0; index < kinds.length; index++) {
    if (kinds[index] === 'user' || rounds.length === 0) {
      rounds.push({ indexes: [index] })
      continue
    }
    rounds.at(-1)?.indexes.push(index)
  }
  return rounds
}

/**
 * 载回来的结论记录**挂在历史的哪几条后面**（v2 §7.7，commit #13）。
 *
 * ⭐ 为什么要算：库里**没有**「这条结论长在哪条消息之后」的锚 ——
 * `roundIndex` 是结论的序号（`rounds.length`），不是消息的下标（见
 * `appendAssistantConversationRound`）。结论记录与消息分住两列，跨列的位置关系
 * 从来没有被写下来过。
 *
 * ⭐ 所以这里按**从尾对齐**摊：最后一条结论挂在最后一轮的末尾，倒数第二条挂在
 * 倒数第二轮的末尾，以此类推。判据是常态 —— 每轮 `done` 都会结账一次，两边条数
 * 一致，对齐就是精确的。条数不一致时（有的轮次没产出、更旧的被 100 条上限截过）
 * 多出来的那几条落进 `leading`，由调用方摊在历史段的最前面：它们确实发生在
 * 摊得出位置的那些之前，⛔ 不丢掉（丢掉 = 用户改过的结论凭空消失）。
 *
 * @param kinds 历史条目的 `kind` 序列（与 `splitOperatorHistoryRounds` 同一份）
 * @param summaryCount 载回来几条结论记录
 * @returns `byIndex`: 历史条目下标 → 挂在它后面的结论下标（升序）；
 *          `leading`: 没有宿主轮次的那几条（升序），摊在最前面
 */
export function placeOperatorRoundSummaries(
  kinds: readonly string[],
  summaryCount: number,
): { byIndex: Map<number, number[]>; leading: number[] } {
  const byIndex = new Map<number, number[]>()
  if (summaryCount <= 0) return { byIndex, leading: [] }

  const rounds = splitOperatorHistoryRounds(kinds)
  const paired = Math.min(rounds.length, summaryCount)
  for (let offset = 0; offset < paired; offset++) {
    const round = rounds[rounds.length - 1 - offset]
    const last = round?.indexes.at(-1)
    if (last === undefined) continue
    byIndex.set(last, [summaryCount - 1 - offset])
  }

  const leading: number[] = []
  for (let index = 0; index < summaryCount - paired; index++) {
    leading.push(index)
  }
  return { byIndex, leading }
}

/**
 * 助手长回话要不要自动折叠（第 5 件）。
 *
 * ⚠ 数**换行**不是渲染行 —— 理由见 `STUDIO_OPERATOR_TIMELINE.collapseAfterLines`
 * 的头注（量 DOM 换来的是拖宽面板时会抖的折叠开关）。
 */
export function shouldCollapseOperatorText(text: string): boolean {
  return (
    countOperatorTextLines(text) > STUDIO_OPERATOR_TIMELINE.collapseAfterLines
  )
}

export function countOperatorTextLines(text: string): number {
  if (text.length === 0) return 0
  return text.split('\n').length
}

/**
 * 折起来那一行摘要写什么 —— **首句**。
 *
 * ⚠ 断句认中英日三套句号（`。！？.!?`）并把标点留在句子里：切掉句号的摘要读起来
 * 像被截断的，而它其实是完整的一句。
 * ⚠ **数字后面那个英文句点不算句号**（`(?<!\d)\.`）：`1. 先定光源` 这种编号列表
 * 会在「1.」处断开，摘要于是变成一个孤零零的「1.」——2026-09-06 真机上量到的。
 * 小数（`3.5`）同理。
 * ⚠ 一句话都没有（全是列表 / 代码）时退回**第一行**，⛔ 不退回「前 N 个字」：
 * 从一行代码中间切一刀得到的是乱码。
 */
export function firstOperatorSentence(text: string): string {
  const trimmed = text.trim()
  if (trimmed.length === 0) return ''
  const match = trimmed.match(/^[\s\S]*?(?:[。！？！？!?]|(?<!\d)\.)/)
  const sentence = (match?.[0] ?? trimmed.split('\n')[0] ?? trimmed).trim()
  return sentence
}
