// @vitest-environment node
/**
 * 上下文预算（设计方案 §2 / P2）：回放题按每条路由跑**两轮** —— 题目那一轮，再接一轮同样的话
 * （历史 = 第一轮的对话），量每一次主步发给模型的字数与相邻两次逐字相同的前缀。
 *
 * - 数字记在 `fixtures/context-budget.json`，这里按「不许变大」查：首步字数、整轮字数、
 *   整轮新字数（不在与上一步相同的前缀里的那部分）、辅助调用次数。变小了照过；想把变小的数
 *   记下来（或有意加了提示词）就 `REPLAY_BUDGET=update npm run test:replay` 重写那份文件，
 *   在提交里说为什么变。
 * - `REPLAY_BUDGET=print` 打一张表（首步三段、整轮、前缀）。
 * 量法见 `context-budget.ts`。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { ASSISTANT_OPERATOR_EVENTS } from '@/constants/assistant-operator'
import { mockAuthenticated, mockRateLimitAllowed } from '@/test/api-helpers'

import {
  commonPrefixLength,
  freshChars,
  measureTurn,
  PrefixCache,
  summarizeTurn,
  type TurnSummary,
} from './context-budget'
import {
  loadReplayBoard,
  loadReplayCases,
  type ReplayCase,
  type ReplayRoute,
} from './fixture'
import { REPLAY_CLERK_ID, replayDb } from './fake-db'
import { createReplayNetwork } from './fake-network'
import { runReplayTurn } from './runner'

vi.mock('@/lib/db', async () => {
  const fake = await import('./fake-db')
  return {
    db: fake.replayDb.db,
    isUniqueConstraintError: fake.isUniqueConstraintError,
  }
})
vi.mock('@/lib/crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/crypto')>()),
  decryptApiKey: (encrypted: string) => `plain:${encrypted}`,
}))

import { POST } from '@/app/api/studio/assistant-operator/route'

const BUDGET_FILE = new URL('./fixtures/context-budget.json', import.meta.url)
const MODE = process.env.REPLAY_BUDGET

interface BudgetRow extends TurnSummary {
  /** 第二轮首步与第一轮首步逐字相同的前缀（跨轮能吃到的缓存）。 */
  readonly acrossTurns: number
  /** 第一轮首步「工具 + 系统提示」那一段的字数。 */
  readonly toolsAndSystem: number
  /** 第二轮真要重算的字数（接着第一轮的缓存，见 `PrefixCache`）。 */
  readonly followUpFresh: number
}

function loadBaseline(): Record<string, BudgetRow> {
  try {
    return JSON.parse(readFileSync(BUDGET_FILE, 'utf8')) as Record<
      string,
      BudgetRow
    >
  } catch {
    return {}
  }
}

async function runTurn(testCase: ReplayCase, route: ReplayRoute) {
  const board = loadReplayBoard(testCase.board)
  replayDb.reset({
    keys: route.keys,
    routeModel: route.routeModel,
    projectId: board.projectId,
  })
  const network = createReplayNetwork({
    replies: testCase.replies,
    textReplies: testCase.textReplies,
    search: testCase.search,
    assetHost: board.assetHost,
  })
  vi.stubGlobal('fetch', network.fetch)
  mockAuthenticated(REPLAY_CLERK_ID)
  mockRateLimitAllowed()
  const run = await runReplayTurn(testCase, board, POST)
  vi.unstubAllGlobals()
  return { run, network }
}

/** 第一轮说过的话（创作者那句 + 助手的每条回复）→ 第二轮的历史。 */
function followUp(
  testCase: ReplayCase,
  run: Awaited<ReturnType<typeof runTurn>>['run'],
): ReplayCase {
  const opened = run.requests[0]?.messages ?? []
  const said = opened.slice(0, testCase.turn.history.length + 1)
  const replies = run.events
    .flat()
    .flatMap((event) =>
      event.type === ASSISTANT_OPERATOR_EVENTS.message && event.text.trim()
        ? [{ role: 'assistant' as const, content: event.text }]
        : [],
    )
  return {
    ...testCase,
    turn: { ...testCase.turn, history: [...said, ...replies] },
  }
}

const cases = loadReplayCases()
const measured: Record<string, BudgetRow> = {}
let baseline: Record<string, BudgetRow> = {}

beforeAll(() => {
  vi.stubEnv('CLOUDFLARE_AI_GATEWAY_URL', '')
  vi.stubEnv('EXECUTION_WORKER_BASE_URL', '')
  baseline = loadBaseline()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

afterAll(() => {
  const keys = Object.keys(measured).sort()
  if (MODE === 'update') {
    const sorted = Object.fromEntries(keys.map((key) => [key, measured[key]]))
    writeFileSync(
      fileURLToPath(BUDGET_FILE),
      `${JSON.stringify(sorted, null, 2)}\n`,
    )
  }
  if (MODE === 'print' || MODE === 'update') {
    const header =
      'case/route | steps | 1st step (tools+system+msgs) | turn total | turn fresh | prefix in turn | across turns/tools+system | follow-up fresh | aux calls/chars'
    const lines = keys.map((key) => {
      const row = measured[key]!
      return `${key} | ${row.steps} | ${row.firstStep} (${row.firstStepTools}+${row.firstStepSystem}+${row.firstStepMessages}) | ${row.turnTotal} | ${row.turnFresh} | ${row.minStablePrefixInTurn ?? '—'} | ${row.acrossTurns}/${row.toolsAndSystem} | ${row.followUpFresh} | ${row.auxCalls}/${row.auxChars}`
    })
    process.stderr.write(`\n${header}\n${lines.join('\n')}\n`)
  }
})

describe('assistant context budget', () => {
  for (const testCase of cases) {
    if (testCase.knownBug) continue
    for (const route of testCase.routes) {
      if (!route.expect) continue
      const key = `${testCase.id} ${route.expect.adapterType}/${route.expect.modelId}`
      it(key, async () => {
        const cache = new PrefixCache()
        const first = await runTurn(testCase, route)
        const turn1 = measureTurn(first.network.modelCalls, cache)
        const second = await runTurn(followUp(testCase, first.run), route)
        const turn2 = measureTurn(second.network.modelCalls, cache)
        expect(turn1.steps.length).toBeGreaterThan(0)
        expect(turn2.steps.length).toBeGreaterThan(0)
        const firstStep = turn1.steps[0]!
        const row: BudgetRow = {
          ...summarizeTurn(turn1),
          acrossTurns: commonPrefixLength(turn1.prompts[0]!, turn2.prompts[0]!),
          toolsAndSystem: firstStep.tools + firstStep.system,
          followUpFresh: freshChars(turn2),
        }
        measured[key] = row
        if (MODE === 'update') return
        const recorded = baseline[key]
        expect(
          recorded,
          `${key}: no budget recorded — REPLAY_BUDGET=update npm run test:replay`,
        ).toBeDefined()
        if (!recorded) return
        expect(row.firstStep, 'first step grew').toBeLessThanOrEqual(
          recorded.firstStep,
        )
        expect(row.turnTotal, 'turn total grew').toBeLessThanOrEqual(
          recorded.turnTotal,
        )
        expect(row.turnFresh, 'fresh chars per turn grew').toBeLessThanOrEqual(
          recorded.turnFresh,
        )
        expect(
          row.followUpFresh,
          'fresh chars in a follow-up turn grew',
        ).toBeLessThanOrEqual(recorded.followUpFresh)
        expect(row.auxCalls, 'more auxiliary calls').toBeLessThanOrEqual(
          recorded.auxCalls,
        )
      })
    }
  }
})
