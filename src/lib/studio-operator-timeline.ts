import { ASSISTANT_OPERATOR_TOOL_IDS } from '@/constants/assistant-operator'
import { STUDIO_OPERATOR_TIMELINE } from '@/constants/studio-assistant-operator'

export function isOperatorResearchTool(tool: string): boolean {
  return (
    tool === ASSISTANT_OPERATOR_TOOL_IDS.searchWeb ||
    tool === ASSISTANT_OPERATOR_TOOL_IDS.readState ||
    tool === ASSISTANT_OPERATOR_TOOL_IDS.listAssetFolders ||
    tool === ASSISTANT_OPERATOR_TOOL_IDS.readProjectRules
  )
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
 * 连续的**切域标记**收成最后一条（2026-09-06 面板轮，第 5 件）。
 *
 * ⭐ 由来：切工作台会一次落好几条「切到 X 工作台」（图 → 视频 → 图 是三条），
 * 而它们说的是同一件事的三个瞬间 —— 用户要知道的只有「现在在哪」。
 * ⚠ 只折**连续的**：中间隔了一句话的两条切域是两次真的切换，合起来会让那句话
 * 看上去发生在它没发生的那台工作台上。
 *
 * 返回的是**要藏起来的下标**（`Set`）——⛔ 不返回过滤后的数组：调用方那边下标
 * 同时是 React key 与历史分组的锚，重排一次就全错位。
 */
export function foldOperatorDomainMarks(
  kinds: readonly string[],
  domainMarkKind: string,
): Set<number> {
  const hidden = new Set<number>()
  for (let index = 0; index < kinds.length - 1; index++) {
    if (
      kinds[index] === domainMarkKind &&
      kinds[index + 1] === domainMarkKind
    ) {
      hidden.add(index)
    }
  }
  return hidden
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
