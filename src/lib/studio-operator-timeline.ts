import {
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
  ASSISTANT_OPERATOR_TOOL_IDS,
  ASSISTANT_OPERATOR_VERB_IDS,
  ASSISTANT_RESEARCH_DEPTHS,
  ASSISTANT_WEB_FIND_LIMITS,
  type AssistantOperatorVerb,
  type AssistantResearchDepth,
} from '@/constants/assistant-operator'
import {
  STUDIO_OPERATOR_LIBRARY_TOOLS,
  STUDIO_OPERATOR_RUNNING_PHRASE_IDS,
  STUDIO_OPERATOR_TIMELINE,
  type StudioOperatorRunningPhrase,
} from '@/constants/studio-assistant-operator'
import type {
  StudioOperatorMessageEntry,
  StudioOperatorStepEntry,
  StudioOperatorThreadEntry,
} from '@/types/studio-assistant-operator'
import type { AssistantWebFind } from '@/types/assistant-web-finds'
import {
  carriedWebFinds,
  WEB_FIND_REF_PATTERN,
  webImageToFind,
  webVideoToFind,
} from '@/lib/assistant-web-finds'

/**
 * 过程行跑着时那一句人话动词（2026-10-14 设计方案 §9.1）—— 按这一步的**动词**取，
 * 「查」再按工具分「查素材」（创作者自己的库）与「查资料」（外面）。
 * ⛔ 不读模型起的 `step.title`：它每轮都不一样，读起来像日志不像人话（附录 E）。
 */
export function operatorRunningPhrase(step: {
  tool: string
  verb: AssistantOperatorVerb
}): StudioOperatorRunningPhrase {
  if (STUDIO_OPERATOR_LIBRARY_TOOLS.has(step.tool))
    return STUDIO_OPERATOR_RUNNING_PHRASE_IDS.library
  if (step.tool === ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages)
    return STUDIO_OPERATOR_RUNNING_PHRASE_IDS.webImages
  if (step.tool === ASSISTANT_OPERATOR_TOOL_IDS.searchWebVideos)
    return STUDIO_OPERATOR_RUNNING_PHRASE_IDS.webVideos
  switch (step.verb) {
    case ASSISTANT_OPERATOR_VERB_IDS.look:
      return STUDIO_OPERATOR_RUNNING_PHRASE_IDS.look
    case ASSISTANT_OPERATOR_VERB_IDS.research:
      return STUDIO_OPERATOR_RUNNING_PHRASE_IDS.research
    case ASSISTANT_OPERATOR_VERB_IDS.ask:
      return STUDIO_OPERATOR_RUNNING_PHRASE_IDS.ask
    case ASSISTANT_OPERATOR_VERB_IDS.apply:
      return STUDIO_OPERATOR_RUNNING_PHRASE_IDS.apply
    case ASSISTANT_OPERATOR_VERB_IDS.requestGeneration:
      return STUDIO_OPERATOR_RUNNING_PHRASE_IDS.generate
  }
}

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
    // 只想没说的那一格（工具步上面的思考回执，10-27）不是回答，⛔ 当锚。
    if (!entry.text && !entry.streaming) return
    byMessage.set(entry.id, { runKey, steps: pending })
    pending = []
  })
  return byMessage
}

/**
 * 跑完且真找到了东西的那一步联网找（`search_web_images` 找到图 / `search_web_videos`
 * 找到视频，搜索期第二片）。
 */
export function isOperatorWebFindFound(
  entry: StudioOperatorStepEntry,
): boolean {
  const { step } = entry
  // ⚠ 先判 `status` 再判 `tool` —— 结果只挂在跑完那一支上。
  if (step.status !== ASSISTANT_OPERATOR_STEP_STATUS_IDS.done) return false
  if (step.tool === ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages)
    return (step.result?.images.length ?? 0) > 0
  if (step.tool === ASSISTANT_OPERATOR_TOOL_IDS.searchWebVideos)
    return (step.result?.videos.length ?? 0) > 0
  return false
}

/**
 * 同一处的找图与找视频怎么排：**图的网格在上、视频那一排在下**（附录 I §四），
 * 各自保持出场顺序。
 */
export function orderOperatorWebFinds(
  entries: readonly StudioOperatorStepEntry[],
): StudioOperatorStepEntry[] {
  const isVideo = (entry: StudioOperatorStepEntry) =>
    entry.step.tool === ASSISTANT_OPERATOR_TOOL_IDS.searchWebVideos
  return [
    ...entries.filter((entry) => !isVideo(entry)),
    ...entries.filter(isVideo),
  ]
}

/**
 * **找到的图 / 视频挂在哪一段回答底下**（搜索期切片 1 · 附录 I §四「搜到的东西就是答案的
 * 一部分」，2026-10-15；第二片起视频同一条路）。
 *
 * ⭐ 判据与 `collectOperatorAnswerSources` 同一种**位置**关系：攒着跑完且找到了东西的那几步，
 *   遇到下一条**能当锚**的助手消息就全部挂上去并清零。
 * ⚠ 能不能当锚由调用方说（`isAnchor`）：还在写的那条（网格等这段话说完再摆，同来源卡）、
 *   折进调查组的那条（收尾后整组不画 —— 挂上去图就跟着没了）都不行，就往后找下一条。
 * ⚠ **一条用户发言就清零**：上一轮没等到回答（停了 / 出错）的那几次找图⛔ 不跨轮挂到
 *   下一轮的回答底下 —— 它们不在 `anchored` 里，面板就地画在自己那一块。
 */
export function collectOperatorAnswerWebFinds(
  entries: readonly StudioOperatorThreadEntry[],
  isAnchor: (entry: StudioOperatorMessageEntry) => boolean,
): {
  byMessage: Map<string, StudioOperatorStepEntry[]>
  /** 已经挂到某段回答底下的找图 / 找视频步（线程条目 id）。 */
  anchored: ReadonlySet<string>
} {
  const byMessage = new Map<string, StudioOperatorStepEntry[]>()
  const anchored = new Set<string>()
  let pending: StudioOperatorStepEntry[] = []
  for (const entry of entries) {
    if (entry.kind === 'user') {
      pending = []
      continue
    }
    if (entry.kind === 'step') {
      if (isOperatorWebFindFound(entry)) pending.push(entry)
      continue
    }
    if (entry.kind !== 'message' || pending.length === 0) continue
    if (!isAnchor(entry)) continue
    byMessage.set(entry.id, pending)
    for (const step of pending) anchored.add(step.id)
    pending = []
  }
  return { byMessage, anchored }
}

/** 一步跑完的联网找图 / 找视频里带编号的那几条（`#n`，搜索期第三片）。 */
function webFindsOfStep(entry: StudioOperatorStepEntry): AssistantWebFind[] {
  const { step } = entry
  if (step.status !== ASSISTANT_OPERATOR_STEP_STATUS_IDS.done) return []
  if (step.tool === ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages)
    return (step.result?.images ?? []).flatMap((image) => {
      const find = webImageToFind(image)
      return find ? [find] : []
    })
  if (step.tool === ASSISTANT_OPERATOR_TOOL_IDS.searchWebVideos)
    return (step.result?.videos ?? []).flatMap((video) => {
      const find = webVideoToFind(video)
      return find ? [find] : []
    })
  return []
}

/**
 * 这一条是不是开了服务端的新一轮：用户发言，或答了题 / 定了卡的那一条（带 `userText` 的系统行
 * —— `buildMessages` 把它当用户说的话发出去，服务端就是新的一轮）。**连着的几条算一刀**：一组
 * 题答完是好几条答题行接着一次请求。
 * ⚠ 号的「上一轮」必须与服务端同一刀：答完题那一轮带的是**问题之前**那半段找到的，切错了就会
 *   带上更早一轮的号，新找到的从那里接着数，和屏幕上的卡撞号。
 */
function startsOperatorTurn(entry: StudioOperatorThreadEntry): boolean {
  return (
    entry.kind === 'user' ||
    (entry.kind === 'system' && Boolean(entry.userText))
  )
}

/**
 * **下一轮带去的「上一轮找到的东西」**（搜索期第三片，附录 I §3.3）：发这一轮时，开这一轮的
 * 那一条（最后一条用户发言 / 答题行）与它前一条之间那几步联网找到的、带编号的图与视频 —— 只要
 * 上一轮的，去重后最多 `maxCarried` 条（`carriedWebFinds`）。
 * ⭐ 「用 #2」「放第二个」跨轮还能落到同一张：服务端把这几条冻进板子、只给模型编号那一行。
 * ⚠ 调用方只在**新的一轮**发：接力那一跳的板子已经带着这一份了。
 */
export function collectOperatorPriorFinds(
  entries: readonly StudioOperatorThreadEntry[],
): AssistantWebFind[] {
  let starts = 0
  let inStart = false
  const steps: StudioOperatorStepEntry[] = []
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]!
    if (startsOperatorTurn(entry)) {
      if (!inStart) starts += 1
      inStart = true
      if (starts === 2) break
      continue
    }
    inStart = false
    if (starts === 1 && entry.kind === 'step') steps.unshift(entry)
  }
  return carriedWebFinds(steps.flatMap(webFindsOfStep))
}

/** 面板上一张找到的卡（图格 / 视频卡）在回复里被 `#n` 指到时要的那几样。 */
export interface OperatorFindRef {
  /** `operatorFindKey(线程条目 id, n)` —— 卡片的 DOM id 与高亮都认它。 */
  key: string
  n: number
  kind: AssistantWebFind['kind']
  /** 读屏念的那一句：标题，没有就域名 / 平台。 */
  label: string | null
}

/** 一张找到的卡的稳定键：同一个号跨轮可能重来，所以带上它所在那一步的线程条目 id。 */
export function operatorFindKey(entryId: string, n: number): string {
  return `${entryId}#${n}`
}

/** 卡片元素的 DOM id（胶囊按它 `getElementById` 再滚过去）。 */
export function operatorFindDomId(key: string): string {
  return `operator-find-${key}`
}

/** 回复正文里点到的号（去重、按出场顺序）。 */
export function webFindNumbersIn(text: string): number[] {
  const numbers: number[] = []
  for (const match of text.matchAll(WEB_FIND_REF_PATTERN)) {
    const n = Number(match[1])
    if (!numbers.includes(n)) numbers.push(n)
  }
  return numbers
}

/**
 * **回复里的 `#n` 认哪张卡**（搜索期第三片，附录 I §3.3 / §四「模型点名」）。
 *
 * ⭐ 一轮 = 一条用户发言（或答题行）到下一条之前（与 `collectOperatorPriorFinds` 同一刀）。这一轮的每段
 *   回复认的号 = 上一轮找到的（与服务端带进这一轮的那份同一个口径：只上一轮、最后
 *   `maxCarried` 条）+ 这一轮找到的；同号以这一轮的为准。认不出的号不在表里 —— 正文里照原样
 *   留着那段字。
 * ⭐ **点名**：每一轮**最后一段说完的回复**里写到的号，对应那几张卡加一圈常驻的黑框。
 *   `lastTurnRunning` = 最后一轮还在跑：那一段未必是最后一段，先不圈。
 */
export function collectOperatorFindRefs(
  entries: readonly StudioOperatorThreadEntry[],
  lastTurnRunning: boolean,
): {
  byMessage: Map<string, ReadonlyMap<number, OperatorFindRef>>
  named: ReadonlySet<string>
} {
  const turns: StudioOperatorThreadEntry[][] = [[]]
  let inStart = false
  for (const entry of entries) {
    const starts = startsOperatorTurn(entry)
    if (starts && !inStart) turns.push([])
    inStart = starts
    turns.at(-1)!.push(entry)
  }
  const byMessage = new Map<string, ReadonlyMap<number, OperatorFindRef>>()
  const named = new Set<string>()
  let previous: OperatorFindRef[] = []
  turns.forEach((turn, turnIndex) => {
    const found = turn.flatMap((entry) =>
      entry.kind === 'step'
        ? webFindsOfStep(entry).map(
            (find): OperatorFindRef => ({
              key: operatorFindKey(entry.id, find.n),
              n: find.n,
              kind: find.kind,
              label:
                (find.kind === 'image'
                  ? (find.title ?? find.domain)
                  : find.title) ?? null,
            }),
          )
        : [],
    )
    // 上一轮的：与 `carriedWebFinds` 同一个口径（按号去重、只留最后 `maxCarried` 条）。
    const carried = [
      ...new Map(previous.map((ref) => [ref.n, ref] as const)).values(),
    ]
      .sort((a, b) => a.n - b.n)
      .slice(-ASSISTANT_WEB_FIND_LIMITS.maxCarried)
    const refs = new Map<number, OperatorFindRef>()
    for (const ref of [...carried, ...found]) refs.set(ref.n, ref)
    const messages = turn.filter(
      (entry): entry is StudioOperatorMessageEntry => entry.kind === 'message',
    )
    if (refs.size > 0)
      for (const message of messages) byMessage.set(message.id, refs)
    const running = lastTurnRunning && turnIndex === turns.length - 1
    const final = messages.findLast(
      (message) => !message.streaming && message.text.trim(),
    )
    if (!running && final)
      for (const n of webFindNumbersIn(final.text)) {
        const ref = refs.get(n)
        if (ref) named.add(ref.key)
      }
    previous = found
  })
  return { byMessage, named }
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
): {
  depth: AssistantResearchDepth
  found: number
  readPages: number
  /** Grok 看了几段 X 上的视频（创作者说了「看看视频」才有，owner 2026-10-15）。 */
  xVideosWatched: number
  /** 有一步的网页那一源改由平台 Serper 搜了（自带联网没走成，owner 2026-10-15 照实说）。 */
  webSearchFallback: boolean
} | null {
  let seen = false
  let depth: AssistantResearchDepth = ASSISTANT_RESEARCH_DEPTHS.quick
  let found = 0
  let readPages = 0
  let xVideosWatched = 0
  let webSearchFallback = false
  for (const { step } of steps) {
    /**
     * ⭐ 跑着的查资料也算（owner 2026-09-30）：服务端一开口就吐 `running`，
     * 这一行要在那一刻就写「查资料中」，⛔ 不是等跑完才出现。
     */
    if (
      step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.running &&
      step.tool === ASSISTANT_OPERATOR_TOOL_IDS.research
    ) {
      seen = true
      if (step.payload.depth === ASSISTANT_RESEARCH_DEPTHS.deep) {
        depth = ASSISTANT_RESEARCH_DEPTHS.deep
      }
      continue
    }
    // ⚠ 先判 `status` 再判 `tool` —— 载荷与结果只挂在跑完那一支上。
    if (step.status !== ASSISTANT_OPERATOR_STEP_STATUS_IDS.done) continue
    if (step.tool === ASSISTANT_OPERATOR_TOOL_IDS.readUrl) {
      readPages += 1
      continue
    }
    if (step.tool !== ASSISTANT_OPERATOR_TOOL_IDS.research) continue
    seen = true
    found += step.result?.evidence?.length ?? 0
    xVideosWatched += step.result?.xVideosWatched ?? 0
    if (step.result?.webSearchFallback) webSearchFallback = true
    readPages += step.payload.readPages
    if (step.payload.depth === ASSISTANT_RESEARCH_DEPTHS.deep) {
      depth = ASSISTANT_RESEARCH_DEPTHS.deep
    }
  }
  return seen
    ? { depth, found, readPages, xVideosWatched, webSearchFallback }
    : null
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
  /** ⚠ 带代码块的不折：反推给的那段就是交付物（拆分与反推 X2 / X3）。 */
  if (text.includes('```')) return false
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

/** 思考摘要里的一步：小标题 + 这段的第一句（展开回执时一行一步）。 */
export interface OperatorThoughtStep {
  title: string
  line: string
}

/**
 * 把思考摘要切成一步一步（owner 2026-10-27 选「足迹」：一步一道短线，展开只列每一步的总结）。
 *
 * ⚠ Gemini 的摘要一段一个加粗小标题（`**Planning the edit**`）：一个小标题 = 一步，正文取第一句。
 * ⚠ 没有小标题的（Claude 的摘要多半是这样）：按空行分段，一段 = 一步，标题取这段的第一句。
 * ⚠ 还在写的最后一段也算一步 —— 想的时候那一行露的就是它的标题。
 */
export function operatorThoughtSteps(raw: string): OperatorThoughtStep[] {
  // 流到一半的小标题（`**Check`，后半个 `**` 还没来）先不算：⛔ 露出半截星号。
  const text = raw.replace(/(?:^|\n)[ \t]*\*\*[^*\n]*$/, '')
  // 独占一行的加粗才是小标题；正文里顺手加粗的词不算。
  const heading = /(?:^|\n)[ \t]*\*\*([^*\n]+?)\*\*[ \t]*(?=\n|$)/g
  const marks = [...text.matchAll(heading)]
  if (marks.length > 0)
    return marks.map((mark, index) => {
      const start = (mark.index ?? 0) + mark[0].length
      const end = marks[index + 1]?.index ?? text.length
      return {
        title: mark[1]!.trim(),
        line: firstOperatorSentence(
          text.slice(start, end).replace(/\*\*/g, ''),
        ),
      }
    })
  return text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => ({ title: firstOperatorSentence(block), line: '' }))
}

/** 连着出现时并成一行的系统行（owner 2026-09-24：「放在一起，没必要一个一个拿出来」）。 */
const MERGEABLE_SYSTEM_CODES: ReadonlySet<string> = new Set([
  'revertField',
  'undoStep',
])

/**
 * 把**紧挨着**的同类系统行并成一行：「你还原了：规格」「你还原了：提示词」→
 * 「你还原了：规格、提示词」。并出来的那一行多一格 `subjects`（按出现顺序），
 * 其余照旧。⚠ 只并紧挨着的：中间隔了别的条目就是两件事。
 * ⚠ 只是**画法**：线程与库里仍是一条一条的，模型读到的也还是逐条。
 */
export function mergeOperatorSystemRuns<
  T extends { kind: string; code?: string; subject?: string },
>(entries: readonly T[]): (T & { subjects?: readonly string[] })[] {
  const out: (T & { subjects?: readonly string[] })[] = []
  for (const entry of entries) {
    const previous = out.at(-1)
    if (
      entry.kind === 'system' &&
      entry.code &&
      MERGEABLE_SYSTEM_CODES.has(entry.code) &&
      entry.subject &&
      previous?.kind === 'system' &&
      previous.code === entry.code &&
      previous.subject
    ) {
      out[out.length - 1] = {
        ...previous,
        subjects: [...(previous.subjects ?? [previous.subject]), entry.subject],
      }
      continue
    }
    out.push(entry)
  }
  return out
}

/** 系统行文案里 `{subject}` 那一格：并过的那一行把几项译完再串起来。 */
export function describeSystemSubjects(
  entry: { subject?: string; subjects?: readonly string[] },
  translate: (subject: string) => string,
  join: (items: string[]) => string,
): string {
  if (entry.subjects?.length) return join(entry.subjects.map(translate))
  return entry.subject ? translate(entry.subject) : ''
}
