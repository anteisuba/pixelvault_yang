// @vitest-environment node
/**
 * 长对话（P2 第三片，设计方案 §2.2「历史压缩」）：同一段会话连着跑 32 轮（真的路由、真的 v3 环，
 * 只换网络与库），量每一轮第一步发给模型的字数，看三件事：
 *  ① 每步的输入**不随轮数线性涨**：对白按字数封顶（`ASSISTANT_V3_HISTORY.maxChars`）；
 *  ② 窗口**按块滑**：起点只落在 8 的整数倍上，两次滑动之间这一轮的请求逐字以上一轮的
 *     「工具 + 系统提示 + 对白」开头（缓存吃得到）；
 *  ③ 第 2 轮定下的事**活到第 30 轮**：那一句早滑出了窗口，靠的是后台写的摘要（系统提示里那一段）；
 *     而且每一轮它都看得见（在窗口里，或在摘要里）—— 缺口那一轮多留一轮，⛔ 丢。
 * 外加：写摘要那一跳用的是这一轮的那一家、那个型号、那把 key（⛔ 不借别家）。
 *
 * ⚠ 摘要存在哪：真的那一份在会话那一行的 `historySummary`（`assistant-v3-history-store.service.ts`），
 *   这里换成一份内存里的。写摘要的「模型」也是假的（`summarize`）：照原料里「定了：」那几句记下决定、
 *   原样接着上一份 —— 这一题量的是窗口与摘要的管道，⛔ 不是哪家模型写得好不好。
 * `REPLAY_BUDGET=print` 打每一轮的数（取 `maxChars` 时比过 12k / 16k / 20k / 24k，见
 * `docs/references/assistant-v3.md`）。
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { ASSISTANT_OPERATOR_EVENTS } from '@/constants/assistant-operator'
import { ASSISTANT_V3_HISTORY } from '@/constants/assistant-v3'
import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { ASSISTANT_V3_HISTORY_SUMMARY_HEADING } from '@/lib/assistant-v3-history'
import { mockAuthenticated, mockRateLimitAllowed } from '@/test/api-helpers'
import type { AssistantOperatorRequest } from '@/types/assistant-operator'
import {
  AssistantV3TranscriptSchema,
  type AssistantV3HistorySummary,
} from '@/types/assistant-v3'
import type { AssistantV3HistoryKey } from '@/services/kernel/assistant-v3-history-store.service'

import {
  commonPrefixLength,
  freshChars,
  measureTurn,
  PrefixCache,
  promptSections,
  canonicalPrompt,
} from './context-budget'
import {
  loadReplayBoard,
  loadReplayCases,
  ReplayCaseSchema,
  type ReplayCase,
  type ReplayRoute,
} from './fixture'
import { REPLAY_CLERK_ID, replayDb } from './fake-db'
import { createReplayNetwork, type RecordedModelCall } from './fake-network'
import { runReplayTurn } from './runner'
import type { ProviderRequest } from './wire'

const stored = vi.hoisted(() => new Map<string, AssistantV3HistorySummary[]>())

vi.mock('@/lib/db', async () => {
  const fake = await import('./fake-db')
  return {
    db: fake.replayDb.db,
    isUniqueConstraintError: fake.isUniqueConstraintError,
  }
})
vi.mock('next/server', async (importOriginal) => {
  const { collectAfterTask } = await import('./after-tasks')
  return {
    ...(await importOriginal<typeof import('next/server')>()),
    after: collectAfterTask,
  }
})
vi.mock('@/lib/crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/crypto')>()),
  decryptApiKey: (encrypted: string) => `plain:${encrypted}`,
}))
/** 与会话那一列同一个样子：按会话存最近几份。 */
vi.mock('@/services/kernel/assistant-v3-history-store.service', () => ({
  assistantV3HistoryStore: {
    persists: true,
    load: async (key: AssistantV3HistoryKey) =>
      stored.get(key.conversationId) ?? [],
    update: async (
      key: AssistantV3HistoryKey,
      apply: (
        current: AssistantV3HistorySummary[],
      ) => AssistantV3HistorySummary[],
    ) => {
      stored.set(
        key.conversationId,
        apply(stored.get(key.conversationId) ?? []),
      )
    },
  },
}))

import { POST } from '@/app/api/studio/assistant-operator/route'

const TURNS = 32
const CONVERSATION_ID = '5f0c2a9e-3b1d-4c7a-9e21-7d4b8a6c0f13'
/** 第 2 轮创作者定下的事（`summarize` 认「定了：」）。 */
const DECISION_SAID =
  '定了：整部片子统一 16:9 横版，主角叫林遥，片子里不要出现任何文字水印。'
const DECISION = '整部片子统一 16:9 横版'

const PHRASES = [
  '雨夜的石廊再暗一点，壁灯只留尽头那一盏',
  '镜头从背后跟拍，走到窗边再慢慢绕到侧面',
  '袍子的下摆要被风带起来，但别遮住手里的魔杖',
  '这一段节奏放慢，给他停下来回头的那半秒',
  '远处的钟声压在画面最后一秒，别抢对白',
  '光从左上打下来，脸的另一半留在阴影里',
  '换成低机位仰拍，让走廊的拱顶占满上半个画面',
  '雨水顺着玻璃往下淌，焦点从雨滴拉到他的眼睛',
  '第三个镜头太满了，把背景里的人群去掉',
  '色调往青灰走，只有烛光是暖的',
]
/** 每轮的字数（创作者 / 助手）：助手平均一千出头，隔几轮来一段长的（分镜表、整段提示词）。 */
const USER_CHARS = [120, 80, 200, 150, 90, 180]
const REPLY_CHARS = [600, 900, 1_200, 2_400, 700, 1_000, 500, 1_500]

function filler(seed: number, chars: number): string {
  let out = ''
  for (let index = seed; out.length < chars; index += 1)
    out += `${PHRASES[index % PHRASES.length]}；`
  return out.slice(0, chars)
}

function say(turn: number): string {
  return turn === 2
    ? DECISION_SAID
    : `第${turn}轮：${filler(turn, USER_CHARS[turn % USER_CHARS.length]!)}`
}

function reply(turn: number): string {
  return `好的（第${turn}轮）。${filler(turn * 7, REPLY_CHARS[turn % REPLY_CHARS.length]!)}`
}

/**
 * 这一轮先改一张卡（P01 那一笔写词）、画布接力一跳再回话：接力那一跳的对白与摘要要逐字照开轮那一跳
 * （板子上冻的那一份），⛔ 现算。
 */
const RELAY_TURN = 30
const RELAY_WRITE = loadReplayCases().find((one) => one.id === 'P01')!
  .replies[0]!

function caseFor(
  turn: number,
  history: AssistantOperatorRequest['messages'],
  route: ReplayRoute,
): ReplayCase {
  const answer = { text: reply(turn), calls: [] }
  return ReplayCaseSchema.parse({
    id: 'H01',
    title: '长对话：按字数封顶、按块滑、滑出去的有摘要',
    source: 'P2 第三片（设计方案 §2.2）',
    board: 'malfoy',
    routes: [route],
    turn: { say: say(turn), history },
    replies: turn === RELAY_TURN ? [RELAY_WRITE, answer] : [answer],
    expect: { end: 'done' },
  })
}

/** 请求体里第一段以 `prefix` 开头的字（各家把用户那段放的位置不同）。 */
function findText(value: unknown, prefix: string): string | null {
  if (typeof value === 'string') return value.startsWith(prefix) ? value : null
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findText(item, prefix)
      if (found) return found
    }
    return null
  }
  if (typeof value === 'object' && value !== null)
    return findText(Object.values(value), prefix)
  return null
}

/**
 * 假的「写摘要的模型」：上一份的决定原样接着，再记下原料里「定了：」那几句。
 * 不是写摘要那一跳（抽记忆之类）就交回 `undefined`，照题目的 `textReplies` 答。
 */
function summarize(request: ProviderRequest): string | undefined {
  const material = findText(request.body, 'PREVIOUS NOTES\n')
  if (!material) return undefined
  const [notes = '', turns = ''] = material
    .slice('PREVIOUS NOTES\n'.length)
    .split('\n\nTURNS LEAVING VIEW')
  const previous =
    notes.trim() === '(none)'
      ? { decisions: [] as string[] }
      : (JSON.parse(notes) as { decisions: string[] })
  const decisions = [
    ...previous.decisions,
    ...[...turns.matchAll(/定了：([^\n]+)/g)].map((match) => match[1]!),
  ]
  return JSON.stringify({
    decisions,
    preferences: [],
    openItems: [],
    names: [],
  })
}

interface TurnRow {
  readonly turn: number
  /** 这一轮第一步的总字数（工具 + 系统提示 + 消息）。 */
  readonly firstStep: number
  readonly system: string
  readonly messages: string
  /** 窗口从第几轮起（0 起数；本轮之前一共 `turn - 1` 轮）。 */
  readonly start: number
  readonly summaryTurns: number
  /** 窗口里对白的原字数。 */
  readonly historyChars: number
  /** 第一步的「工具 + 系统提示」字数。 */
  readonly toolsAndSystem: number
  readonly prompt: string
  /** 按厂商缓存规则这一轮要重算的字数。 */
  readonly fresh: number
  readonly steps: readonly RecordedModelCall[]
  readonly aux: readonly RecordedModelCall[]
}

async function runConversation(route: ReplayRoute): Promise<TurnRow[]> {
  stored.clear()
  const board = loadReplayBoard('malfoy')
  const cache = new PrefixCache()
  const rows: TurnRow[] = []
  let history: AssistantOperatorRequest['messages'] = []
  for (let turn = 1; turn <= TURNS; turn += 1) {
    const testCase = caseFor(turn, history, route)
    replayDb.reset({
      keys: route.keys,
      routeModel: route.routeModel,
      projectId: board.projectId,
      conversationId: CONVERSATION_ID,
    })
    const network = createReplayNetwork({
      replies: testCase.replies,
      textReplies: [],
      search: [],
      assetHost: board.assetHost,
      answerText: summarize,
    })
    vi.stubGlobal('fetch', network.fetch)
    mockAuthenticated(REPLAY_CLERK_ID)
    mockRateLimitAllowed()
    const run = await runReplayTurn(testCase, board, POST, {
      conversationId: CONVERSATION_ID,
    })
    vi.unstubAllGlobals()
    expect(run.httpError, `turn ${turn}`).toBeNull()
    expect(network.unexpected, `turn ${turn}`).toEqual([])

    const steps = network.modelCalls.filter((call) => call.purpose === 'step')
    const aux = network.modelCalls.filter((call) => call.purpose !== 'step')
    const budget = measureTurn(network.modelCalls, cache)
    const sections = promptSections(steps[0]!)
    // 开轮板子上冻的那一份（一步就答完的轮次不发 `transcript` 帧：从这一轮的过程记录里取）。
    await vi.waitFor(() =>
      expect(replayDb.state.turnRecords, `turn ${turn}`).toHaveLength(1),
    )
    const opening = AssistantV3TranscriptSchema.parse(
      replayDb.state.turnRecords[0]!.transcript,
    )[0]
    if (opening?.type !== 'board' || !opening.history)
      throw new Error(`turn ${turn}: no history on the board`)
    const start = turn - 1 - opening.history.turns
    rows.push({
      turn,
      firstStep: budget.steps[0]!.total,
      system: sections.system,
      messages: sections.messages,
      start,
      summaryTurns: opening.history.summary?.turns ?? 0,
      historyChars: history
        .slice(start * 2)
        .reduce((sum, message) => sum + message.content.length, 0),
      toolsAndSystem: sections.tools.length + sections.system.length,
      prompt: canonicalPrompt(sections),
      fresh: freshChars(budget),
      steps,
      aux,
    })

    // ⚠ 前端那份对话在这一轮里接上了助手的回复（`runReplayTurn` 原地 push）：只取到创作者这一句。
    const opened = run.requests[0]!.messages.slice(0, history.length + 1)
    const replies = run.events
      .flat()
      .flatMap((event) =>
        event.type === ASSISTANT_OPERATOR_EVENTS.message && event.text.trim()
          ? [{ role: 'assistant' as const, content: event.text }]
          : [],
      )
    expect(replies, `turn ${turn}: one reply`).toHaveLength(1)
    history = [...opened, ...replies]
  }
  return rows
}

function print(label: string, rows: readonly TurnRow[]) {
  if (process.env.REPLAY_BUDGET !== 'print') return
  const lines = rows.map(
    (row) =>
      `${row.turn} | start ${row.start} | summary ${row.summaryTurns} | history ${row.historyChars} | 1st step ${row.firstStep} | fresh ${row.fresh} | aux ${row.aux.length}`,
  )
  const fresh = rows.reduce((sum, row) => sum + row.fresh, 0)
  const sent = rows.reduce((sum, row) => sum + row.firstStep, 0)
  const aux = rows.flatMap((row) => row.aux)
  const auxChars = aux.reduce(
    (sum, call) => sum + canonicalPrompt(promptSections(call)).length,
    0,
  )
  const slides = rows.filter(
    (row, index) => index > 0 && row.start !== rows[index - 1]!.start,
  ).length
  const shown =
    rows.reduce((sum, row) => sum + row.historyChars, 0) / rows.length
  process.stderr.write(
    `\n${label} (maxChars ${ASSISTANT_V3_HISTORY.maxChars}, block ${ASSISTANT_V3_HISTORY.blockTurns}) — sent ${sent}, fresh ${fresh}, summaries ${aux.length}/${auxChars} chars, slides ${slides}, avg history ${Math.round(shown)}, max 1st step ${Math.max(...rows.map((row) => row.firstStep))}\n${lines.join('\n')}\n`,
  )
}

const { DEEPSEEK_FLASH, CLAUDE_SONNET_5_5 } = LLM_TEXT_MODEL_IDS
const { ANTHROPIC, DEEPSEEK, GEMINI } = AI_ADAPTER_TYPES
/** 多配一家 Gemini 当诱饵：写摘要那一跳要是借了别家的 key，这里看得见。 */
const ROUTES: ReplayRoute[] = [
  {
    // owner 的主模型。
    routeModel: DEEPSEEK_FLASH,
    keys: [DEEPSEEK, GEMINI],
    expect: { adapterType: DEEPSEEK, modelId: DEEPSEEK_FLASH },
  },
  {
    routeModel: CLAUDE_SONNET_5_5,
    keys: [ANTHROPIC, GEMINI],
    expect: { adapterType: ANTHROPIC, modelId: CLAUDE_SONNET_5_5 },
  },
]

beforeAll(() => {
  vi.stubEnv('CLOUDFLARE_AI_GATEWAY_URL', '')
  vi.stubEnv('EXECUTION_WORKER_BASE_URL', '')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('assistant long conversation (history window + summary)', () => {
  for (const route of ROUTES) {
    const expected = route.expect!
    it(`${TURNS} 轮 · ${expected.adapterType}/${expected.modelId}`, async () => {
      const rows = await runConversation(route)
      print(`${expected.adapterType}/${expected.modelId}`, rows)

      // ── ③ 第 2 轮定下的事活到最后：早滑出了窗口，在摘要里。
      for (const row of rows.slice(2)) {
        const inWindow = row.messages.includes(DECISION)
        const inSummary =
          row.system.includes(ASSISTANT_V3_HISTORY_SUMMARY_HEADING) &&
          row.system.includes(DECISION)
        expect(
          inWindow || inSummary,
          `turn ${row.turn} lost the decision`,
        ).toBe(true)
      }
      for (const row of rows.slice(29)) {
        expect(
          row.start,
          `turn ${row.turn}: turn 2 still shown`,
        ).toBeGreaterThan(1)
        expect(row.messages).not.toContain(DECISION_SAID)
        expect(row.system).toContain(ASSISTANT_V3_HISTORY_SUMMARY_HEADING)
        expect(row.system).toContain(DECISION)
      }

      // ── 写摘要那一跳：这一轮的那一家、那个型号、那把 key；一次只补一份。
      const summaryCalls = rows.flatMap((row) => row.aux)
      expect(summaryCalls.length).toBeGreaterThanOrEqual(2)
      for (const row of rows) {
        const main = row.steps[0]!
        expect(main.adapterType).toBe(expected.adapterType)
        expect(main.modelId).toBe(expected.modelId)
        for (const call of row.aux) {
          expect(call.adapterType).toBe(main.adapterType)
          expect(call.modelId).toBe(main.modelId)
          expect(call.apiKey).toBe(main.apiKey)
        }
        expect(row.aux.length).toBeLessThanOrEqual(1)
      }
      expect(stored.get(CONVERSATION_ID)?.length).toBeGreaterThanOrEqual(2)

      // ── ② 按块滑：起点只落在 8 的整数倍上；两次滑动之间，这一轮逐字以上一轮的前缀开头。
      for (const row of rows)
        expect(
          row.start % ASSISTANT_V3_HISTORY.blockTurns,
          `turn ${row.turn}`,
        ).toBe(0)
      const slides = rows.filter(
        (row, index) => index > 0 && row.start !== rows[index - 1]!.start,
      )
      expect(slides.length).toBeGreaterThanOrEqual(2)
      expect(slides.length).toBeLessThanOrEqual(
        TURNS / ASSISTANT_V3_HISTORY.blockTurns,
      )
      // 与常量无关的一条线：32 轮里对白那一段断缓存（起点或摘要变了）最多 4 次 —— 每轮滑一条的话
      // 这段对白会断 11 次以上（`assistant-v3.md` 第三片那张表）。改了常量让它红，先重量那张表。
      const breaks = rows.filter(
        (row, index) =>
          index > 0 &&
          (row.start !== rows[index - 1]!.start ||
            row.summaryTurns !== rows[index - 1]!.summaryTurns),
      )
      expect(breaks.length).toBeLessThanOrEqual(4)
      for (const [index, row] of rows.entries()) {
        const previous = rows[index - 1]
        if (!previous) continue
        if (
          row.start !== previous.start ||
          row.summaryTurns !== previous.summaryTurns
        )
          continue
        expect(
          commonPrefixLength(previous.prompt, row.prompt),
          `turn ${row.turn}: prefix broke between slides`,
        ).toBeGreaterThanOrEqual(
          previous.toolsAndSystem + previous.historyChars,
        )
      }

      // ── 接力那一跳：系统提示（含摘要）逐字相同，整份请求逐字以第一跳开头（只差收尾那个 `]`）。
      const relayed = rows[RELAY_TURN - 1]!
      expect(relayed.steps).toHaveLength(2)
      expect(relayed.system).toContain(DECISION)
      const [first, second] = relayed.steps.map((call) =>
        canonicalPrompt(promptSections(call)),
      )
      expect(promptSections(relayed.steps[1]!).system).toBe(relayed.system)
      expect(commonPrefixLength(first!, second!)).toBeGreaterThanOrEqual(
        first!.length - 1,
      )

      // ── ① 不随轮数线性涨：窗口里的对白不过上限（多留的那一轮最多再多一轮），每一轮第一步比
      //    第一轮（没有历史）多出来的，封顶在「上限 + 一轮 + 摘要那一段与每条消息的 JSON 外壳」。
      const longestTurn = Math.max(
        ...Array.from(
          { length: TURNS },
          (_, index) => say(index + 1).length + reply(index + 1).length,
        ),
      )
      for (const row of rows)
        expect(row.historyChars, `turn ${row.turn}`).toBeLessThanOrEqual(
          ASSISTANT_V3_HISTORY.maxChars + longestTurn,
        )
      const ceiling =
        rows[0]!.firstStep + ASSISTANT_V3_HISTORY.maxChars + longestTurn + 4_000
      for (const row of rows)
        expect(row.firstStep, `turn ${row.turn}`).toBeLessThanOrEqual(ceiling)
      // 照从前「历史全带」的话，最后一轮光对白就有这么多 —— 早过了上面那条线。
      const everything = Array.from(
        { length: TURNS - 1 },
        (_, index) => say(index + 1).length + reply(index + 1).length,
      ).reduce((sum, chars) => sum + chars, 0)
      expect(rows[0]!.firstStep + everything).toBeGreaterThan(ceiling)
      const late = rows.slice(TURNS / 2)
      const spread =
        Math.max(...late.map((row) => row.firstStep)) -
        Math.min(...late.map((row) => row.firstStep))
      expect(spread).toBeLessThanOrEqual(
        ASSISTANT_V3_HISTORY.maxChars + longestTurn,
      )
    }, 120_000)
  }
})
