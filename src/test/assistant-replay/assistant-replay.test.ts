// @vitest-environment node
/**
 * 助手回放基线（附录M 五.6）：`fixtures/cases/*.json` 每道题按它列的每条路由跑一遍。
 *
 * 跑的是真的那一整条：路由 `POST` → `runAssistantV3` → 执行器 / 规划器 → 系统提示 →
 * `resolveAssistantRoute`（库里配的 key + 人设）→ AI SDK 的五家厂商。换掉的只有最外圈：
 * `fetch`（录好的模型回复、现做的图）、库（`fake-db.ts`）、Clerk 与限流、解密 key。
 *
 * `npm run test:replay` 只跑这一套；`npx vitest run` 也会带上它（push 前的闸门）。
 * 加一道题见 `docs/references/testing.md`「助手回放基线」。
 */
import { afterEach, beforeAll, describe, it, vi } from 'vitest'

import { mockAuthenticated, mockRateLimitAllowed } from '@/test/api-helpers'

import { loadReplayBoard, loadReplayCases } from './fixture'
import { REPLAY_CLERK_ID, replayDb } from './fake-db'
import { createReplayNetwork } from './fake-network'
import { gradeReplay, gradeTurnRecord, printReplay } from './graders'
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

const cases = loadReplayCases()

beforeAll(() => {
  // 网关 / 代理一律不走：请求直达五家的官方地址，回放才认得出是哪一家。
  vi.stubEnv('CLOUDFLARE_AI_GATEWAY_URL', '')
  vi.stubEnv('EXECUTION_WORKER_BASE_URL', '')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('assistant replay baseline', () => {
  for (const testCase of cases) {
    for (const route of testCase.routes) {
      const who = route.expect
        ? `${route.expect.adapterType} ${route.expect.modelId}`
        : `${route.routeModel} · no model call`
      const name = `${testCase.id} · ${who} · ${testCase.title}`
      const body = async () => {
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
        if (process.env.REPLAY_DEBUG) printReplay(name, run, network)
        gradeReplay({
          testCase,
          route,
          run,
          network,
          writes: replayDb.state.writes,
          keyLookups: replayDb.keyStore.findFirst,
        })
        await gradeTurnRecord({
          testCase,
          route,
          run,
          board,
          rows: replayDb.state.turnRecords,
        })
      }
      // 回放揭出来的真 bug：照跑，标「已知失败」—— 修好那天它变红，提醒把 `knownBug` 删掉。
      if (testCase.knownBug) it.fails(name, body)
      else it(name, body)
    }
  }
})
