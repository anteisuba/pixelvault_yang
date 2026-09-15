import {
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
  ASSISTANT_OPERATOR_TOOL_IDS,
} from '@/constants/assistant-operator'
import { STUDIO_OPERATOR_TIMELINE } from '@/constants/studio-assistant-operator'
import type { StudioOperatorStepEntry } from '@/types/studio-assistant-operator'

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
    referenceAnalysis?: unknown
  }[],
) {
  const groups: { tools: boolean; indexes: number[]; round: number }[] = []
  let round = 0
  entries.forEach((entry, index) => {
    if (entry.kind === 'user') round += 1
    const tools =
      entry.kind === 'step' && !entry.critique && !entry.referenceAnalysis
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
 * **调查卡**收哪几种步（2026-09-06 面板轮，第 6 件）。
 *
 * ⚠ 与 `isOperatorResearchTool` 是**两张表，不是一张**：那张管的是「这一段过程
 * 值不值得默认折起来」（`search_web` / 读状态 / 列文件夹 / 读规则 —— 全是无结论
 * 的翻找）；这一张管的是「这一轮查出来的**结论与证据**归到同一张卡上」。
 * `search_web_images` 在前一张表里明确**不是**可隐藏的调查（它有候选图要给人挑），
 * 而在这里它必须在 —— 那几张候选正是这张卡的下半部分。合成一张表的表现是：
 * 要么候选图被折进「调查过程」里没人看得见，要么整条 `search_web` 都摊开来占屏。
 */
export function isOperatorResearchCardTool(tool: string): boolean {
  return (
    tool === ASSISTANT_OPERATOR_TOOL_IDS.research ||
    tool === ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages ||
    tool === ASSISTANT_OPERATOR_TOOL_IDS.readUrl
  )
}

/**
 * 按 run 把调查步归组 —— 一轮一张卡。
 *
 * ⚠ 归的是 **run 不是「连不连续」**：`research` → `set_prompt` → `read_url` 是
 * 常见形状（先查一轮、顺手写一句、再回去读原页），按连续分会得到两张说同一件事
 * 的卡。而跨 run 合并同样错：那是两次不同的委托。
 * ⚠ 返回**下标**而不是元素，与 `groupOperatorResearch` 同一个约定：调用方那边
 * 一条渲染路走到底，⛔ 不在这里认识 React 节点。
 */
export function groupOperatorResearchRuns(
  steps: readonly { runKey: string; tool: string }[],
): { runKey: string; indexes: number[] }[] {
  const groups: { runKey: string; indexes: number[] }[] = []
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index]
    if (!step || !isOperatorResearchCardTool(step.tool)) continue
    const existing = groups.find((group) => group.runKey === step.runKey)
    if (existing) existing.indexes.push(index)
    else groups.push({ runKey: step.runKey, indexes: [index] })
  }
  return groups
}

/**
 * 这一轮的调查**查出东西来了没有**（2026-09-07 真机）。
 *
 * ⭐ 由来：一屏里三张调查卡，其中两张的结论行回落成占位文案「查了一下」（`goal`
 * 空）且右上角写着「0 条证据」，有一张连候选图都没有 —— 一张既没有结论、没有
 * 证据也没有候选的卡，占的是整整一张卡的重量，讲的是零。
 * ⛔ 判据**不含 `goal`**：光有一句「我打算查 X」而什么都没查回来，仍然不值一张卡。
 * ⚠ 不渲染卡 ≠ 把这几步藏起来：调用方那一支退回 `ToolGroup`（「N 个操作」那一行
 *   折叠行），过程照旧可展开复核。
 */
export function hasOperatorResearchFindings(
  steps: readonly StudioOperatorStepEntry[],
): boolean {
  for (const { step } of steps) {
    // ⚠ 先判 `status` 再判 `tool` —— 与调查卡同一条收窄顺序（载荷只挂跑完那一支）。
    if (step.status !== ASSISTANT_OPERATOR_STEP_STATUS_IDS.done) continue
    if (
      step.tool === ASSISTANT_OPERATOR_TOOL_IDS.research &&
      (step.result?.evidence?.length ?? 0) > 0
    ) {
      return true
    }
    if (
      step.tool === ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages &&
      (step.result?.images?.length ?? 0) > 0
    ) {
      return true
    }
  }
  return false
}

/**
 * 这一轮调查**查到的那几条证据的编号**（§7.3，2026-09-12 实测第三组 B）。
 *
 * ⭐ 钉住认卡靠它：钉住落在结论记录的 `pinnedEvidence` 一列里，而那一列里存的
 * 是编号 —— 刷新之后 `runKey` 对不上任何东西，编号对得上。
 * ⚠ 没有会话 id 的那几轮（第一轮 / 老客户端）证据不带编号，这里因此回空数组：
 * 调用方据此走「先留本地态」那一支，⛔ 不编一个号出来。
 */
export function collectOperatorResearchRefs(
  steps: readonly StudioOperatorStepEntry[],
): string[] {
  const refs: string[] = []
  for (const { step } of steps) {
    if (step.status !== ASSISTANT_OPERATOR_STEP_STATUS_IDS.done) continue
    if (step.tool !== ASSISTANT_OPERATOR_TOOL_IDS.research) continue
    for (const item of step.result?.evidence ?? []) {
      if (item.evidenceRef && !refs.includes(item.evidenceRef)) {
        refs.push(item.evidenceRef)
      }
    }
  }
  return refs
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
