// @vitest-environment node
/**
 * 助手实跑评测（见 `live-eval.ts`）。⚠ 打真模型、花真钱：没设 `ASSISTANT_EVAL_DIR` 就整组跳过。
 *
 *   ASSISTANT_EVAL_DIR=/mnt/project-files/assistant-eval npm run test:eval
 *   可选：ASSISTANT_EVAL_ONLY=<id,id>  ASSISTANT_EVAL_SHARD=1/4  ASSISTANT_EVAL_LABEL=<名字>
 *
 * 跑的是真的那一整条：路由 `POST` → v3 环 → 真模型（库里那把 key，真解密）。换掉的只有库
 * （`../assistant-replay/fake-db.ts`：用户、key、人设之外的表读回空——查素材库查不到东西）
 * 和 Clerk / 限流。题目与 key 都在运行时从库里只读取出，⛔ 不打印 key。
 */
import { afterAll, beforeAll, describe, it, vi } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  ASSISTANT_OPERATOR_EVENTS,
  ASSISTANT_OPERATOR_STOP_REASONS,
} from '@/constants/assistant-operator'
import { readAssistantOperatorStream } from '@/lib/api-client/assistant-operator'
import { decryptApiKey } from '@/lib/crypto'
import {
  createPOST,
  mockAuthenticated,
  mockRateLimitAllowed,
} from '@/test/api-helpers'
import { assistantKey } from '@/test/assistant-route-fixture'
import type { AssistantOperatorRequest } from '@/types/assistant-operator'
import type { AssistantV3Transcript } from '@/types/assistant-v3'

import { settleAfterTasks } from '../assistant-replay/after-tasks'
import { REPLAY_CLERK_ID, replayDb } from '../assistant-replay/fake-db'
import {
  createMeteredFetch,
  judgeTurn,
  loadEvalCases,
  loadTurnRecord,
  measureTranscript,
  readCaseResults,
  recordUserId,
  requestFromRecord,
  runDir,
  usageCost,
  writeCaseResult,
  writeReport,
  type CaseResult,
} from './live-eval'

vi.mock('@/lib/db', async () => {
  const fake = await import('../assistant-replay/fake-db')
  return {
    db: fake.replayDb.db,
    isUniqueConstraintError: fake.isUniqueConstraintError,
  }
})
vi.mock('next/server', async (importOriginal) => {
  const { collectAfterTask } = await import('../assistant-replay/after-tasks')
  return {
    ...(await importOriginal<typeof import('next/server')>()),
    after: collectAfterTask,
  }
})

import { POST } from '@/app/api/studio/assistant-operator/route'

const ROUTE_PATH = '/api/studio/assistant-operator'
const ROUTE_MODEL = 'claude-sonnet-5-5'
/** 时间用完会接力（新设计里所有台都自动接）；再多就当它卡住了。 */
const MAX_HOPS = 4
const dir = process.env.ASSISTANT_EVAL_DIR ?? ''
const realFetch = globalThis.fetch

/** 只读：这位创作者那把 Anthropic key 的密文（Neon 的 SQL over HTTP）。 */
async function fetchEncryptedKey(userId: string): Promise<string> {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is required')
  const response = await realFetch(`https://${new URL(url).host}/sql`, {
    method: 'POST',
    headers: { 'Neon-Connection-String': url },
    body: JSON.stringify({
      query: `select "encryptedKey" from "UserApiKey" where "userId" = $1 and "adapterType" = 'anthropic' and "isActive" order by "createdAt" desc limit 1`,
      params: [userId],
    }),
  })
  const { rows } = (await response.json()) as {
    rows: { encryptedKey: string }[]
  }
  if (!rows[0]) throw new Error('no active anthropic key for this creator')
  return rows[0].encryptedKey
}

describe.skipIf(!dir)('assistant live eval', () => {
  const cases = dir ? loadEvalCases(dir) : []
  const out = dir ? runDir(dir) : ''
  let encryptedKey = ''

  beforeAll(async () => {
    vi.stubEnv('CLOUDFLARE_AI_GATEWAY_URL', '')
    vi.stubEnv('EXECUTION_WORKER_BASE_URL', '')
    encryptedKey = await fetchEncryptedKey(recordUserId(dir, cases[0]!.id))
  })

  afterAll(() => {
    const all = loadEvalCases(dir, true).map((item) => item.id)
    writeReport(out, readCaseResults(out, all))
  })

  for (const testCase of cases) {
    it(`${testCase.category} · ${testCase.id.slice(0, 8)} · ${testCase.text.slice(0, 30)}`, async () => {
      const record = loadTurnRecord(dir, testCase.id)
      const opening = requestFromRecord(record)
      const priorPrompt = record.snapshot?.prompt ?? ''
      replayDb.reset({
        keys: [],
        keyRows: [assistantKey(AI_ADAPTER_TYPES.ANTHROPIC, { encryptedKey })],
        routeModel: ROUTE_MODEL,
        projectId: record.projectId ?? '',
      })
      const meter = createMeteredFetch(realFetch)
      vi.stubGlobal('fetch', meter.fetch)
      mockAuthenticated(REPLAY_CLERK_ID)
      mockRateLimitAllowed()

      const started = Date.now()
      let transcript: AssistantV3Transcript = []
      let finalText = ''
      let end = 'no_stop_frame'
      let errorEvent: string | null = null
      let hops = 0
      for (; hops < MAX_HOPS; ) {
        hops += 1
        const request: AssistantOperatorRequest =
          hops === 1
            ? opening
            : { ...opening, planApproved: true, v3: { transcript } }
        const response = await POST(createPOST(ROUTE_PATH, request))
        if (!response.ok || !response.body) {
          end = `http_${response.status}`
          errorEvent = JSON.stringify(await response.json().catch(() => null))
          break
        }
        let relay = false
        for await (const event of readAssistantOperatorStream(response.body)) {
          if (event.type === ASSISTANT_OPERATOR_EVENTS.transcript)
            transcript = event.transcript
          if (
            event.type === ASSISTANT_OPERATOR_EVENTS.message &&
            event.text.trim()
          )
            finalText = event.text
          if (event.type === ASSISTANT_OPERATOR_EVENTS.done) end = 'done'
          if (event.type === ASSISTANT_OPERATOR_EVENTS.stopped) {
            end = event.reason
            relay = event.reason === ASSISTANT_OPERATOR_STOP_REASONS.timeBudget
          }
          if (event.type === ASSISTANT_OPERATOR_EVENTS.error) {
            end = 'error'
            errorEvent = `${event.errorCode ?? ''} ${event.detail ?? event.error}`
          }
        }
        if (!relay) break
      }
      await settleAfterTasks()
      await meter.settle()
      // ⭐ 整轮的 transcript 以过程记录那一行为准（流里只在接力时下发）。
      const row = replayDb.state.turnRecords.at(-1)
      if (Array.isArray(row?.transcript))
        transcript = row.transcript as AssistantV3Transcript
      const seconds = (Date.now() - started) / 1000

      const apiKey = decryptApiKey(encryptedKey)
      const [productionJudge, rerunJudge] = await Promise.all([
        judgeTurn({
          apiKey,
          fetch: meter.fetch,
          request: opening,
          transcript: record.transcript,
          finalText:
            record.transcript
              .flatMap((entry) =>
                entry.type === 'assistant' && entry.text ? [entry.text] : [],
              )
              .at(-1) ?? '',
          end: record.outcome,
        }),
        judgeTurn({
          apiKey,
          fetch: meter.fetch,
          request: opening,
          transcript,
          finalText,
          end,
        }),
      ])
      await meter.settle()

      const result: CaseResult = {
        id: testCase.id,
        category: testCase.category,
        domain: testCase.domain,
        text: testCase.text,
        production: {
          modelId: record.modelId,
          outcome: record.outcome,
          metrics: measureTranscript(record.transcript, priorPrompt),
          judge: productionJudge,
        },
        rerun: {
          end,
          hops,
          seconds,
          errorEvent,
          finalText,
          metrics: measureTranscript(transcript, priorPrompt),
          judge: rerunJudge,
          usage: meter.usage,
          cost: usageCost(meter.usage),
        },
      }
      writeCaseResult(out, result)
      vi.unstubAllGlobals()
    }, 900_000)
  }
})
