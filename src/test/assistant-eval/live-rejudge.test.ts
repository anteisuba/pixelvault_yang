// @vitest-environment node
/**
 * 助手评测只重判、不重跑（见 `live-eval.ts`）：评委改了口径之后，拿一轮已跑完的结果（线上那份
 * 和重跑那份 transcript）再判一遍，看分数是评委的问题还是助手的问题。⚠ 打真模型、花真钱
 * （只有判分，约 $1）：没设 `ASSISTANT_EVAL_REJUDGE` 就整组跳过。
 *
 *   ASSISTANT_EVAL_DIR=/mnt/project-files/assistant-eval ASSISTANT_EVAL_REJUDGE=autonomy-final \
 *     npx vitest run src/test/assistant-eval/live-rejudge.test.ts
 *
 * 结果写到 `runs/<那一轮>-rejudged/`（`ASSISTANT_EVAL_LABEL` 可改名）。⛔ 不打印 key。
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, it } from 'vitest'

import { decryptApiKey } from '@/lib/crypto'

import {
  judgeTurn,
  loadEvalCases,
  loadTurnRecord,
  measureTranscript,
  readCaseResults,
  recordUserId,
  requestFromRecord,
  runDir,
  writeCaseResult,
  writeReport,
  type CaseResult,
} from './live-eval'
import { fetchEncryptedKey } from './eval-key'

const dir = process.env.ASSISTANT_EVAL_DIR ?? ''
const source = process.env.ASSISTANT_EVAL_REJUDGE ?? ''

describe.skipIf(!dir || !source)('assistant eval rejudge', () => {
  if (!process.env.ASSISTANT_EVAL_LABEL)
    process.env.ASSISTANT_EVAL_LABEL = `${source}-rejudged`
  const cases = dir && source ? loadEvalCases(dir) : []
  const out = dir && source ? runDir(dir) : ''
  let apiKey = ''

  beforeAll(async () => {
    apiKey = decryptApiKey(
      await fetchEncryptedKey(recordUserId(dir, cases[0]!.id)),
    )
  })

  afterAll(() => {
    const all = loadEvalCases(dir, true).map((item) => item.id)
    writeReport(out, readCaseResults(out, all))
  })

  for (const testCase of cases) {
    it(`${testCase.category} · ${testCase.id.slice(0, 8)}`, async () => {
      const file = join(dir, 'runs', source, 'cases', `${testCase.id}.json`)
      if (!existsSync(file)) return
      const before = JSON.parse(readFileSync(file, 'utf8')) as CaseResult
      const record = loadTurnRecord(dir, testCase.id)
      const request = requestFromRecord(record)
      const priorPrompt = record.snapshot?.prompt ?? ''
      const transcript = before.rerun.transcript ?? []
      const [productionJudge, rerunJudge] = await Promise.all([
        judgeTurn({
          apiKey,
          fetch: globalThis.fetch,
          request,
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
          fetch: globalThis.fetch,
          request,
          transcript,
          finalText: before.rerun.finalText,
          end: before.rerun.end,
        }),
      ])
      writeCaseResult(out, {
        ...before,
        production: {
          ...before.production,
          metrics: measureTranscript(record.transcript, priorPrompt),
          judge: productionJudge,
        },
        rerun: {
          ...before.rerun,
          metrics: measureTranscript(transcript, priorPrompt),
          judge: rerunJudge,
        },
      })
    }, 300_000)
  }
})
