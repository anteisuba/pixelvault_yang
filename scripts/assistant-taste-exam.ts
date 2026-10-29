/**
 * 口味考卷（第 2 批「审美」，owner 2026-10-28）：拿创作者自己判过的图考助手 ——
 * 审核「通过」或点过赞的算「留」，审核「否掉」的算「否」。每张图连同助手此刻记得的
 * 口味交给**创作者自己的助手模型**（同一家、同一把 key、同一个型号），让它猜「留 / 否」，
 * 最后算和创作者的一致率。改了提示词、口味记忆跑一阵子之后各跑一次，看数有没有往上走。
 *
 * Usage:
 *   npx tsx --conditions=react-server --tsconfig tsconfig.json \
 *     scripts/assistant-taste-exam.ts --clerk user_xxx [--limit 20]
 *
 * ⚠ 只读库、不写库；但每张图花一次看图调用，用的是创作者的 key —— 跑之前想好张数。
 * ⚠ `--conditions=react-server`：服务顶着 `import 'server-only'`，默认条件下加载即抛。
 * 结果写进 `artifacts/taste-exam/<日期>.json`（不进仓库）。
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { z } from 'zod'

import { GENERATION_REVIEW_STATE_IDS } from '@/constants/assistant-operator'
import { db } from '@/lib/db'
import { listNextAssistantMemoriesForPrompt } from '@/services/assistant-memory.service'
import { completeAssistantTextWithContextRetry } from '@/services/kernel/assistant-completion.service'
import { resolveAssistantRoute } from '@/services/kernel/assistant-route.service'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100
const MEMORIES_IN_PROMPT = 30
const PROMPT_CONTEXT_CHARS = 4_000

/* ── CLI 解析（纯函数，可测）──────────────────────────────────────────── */

export interface CliOptions {
  readonly clerkId: string
  readonly limit: number
}

/** ⛔ 认不出来的参数一律抛：花钱的脚本上「悄悄忽略拼错的 flag」代价太高。 */
export function parseCliArgs(argv: readonly string[]): CliOptions {
  let clerkId: string | undefined
  let limit = DEFAULT_LIMIT
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string
    const value = argv[index + 1]
    if (arg === '--clerk' && value) {
      clerkId = value
      index += 1
    } else if (arg === '--limit' && value) {
      limit = Number(value)
      if (!Number.isInteger(limit) || limit < 2 || limit > MAX_LIMIT)
        throw new Error(`--limit must be an integer between 2 and ${MAX_LIMIT}`)
      index += 1
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  if (!clerkId) throw new Error('--clerk <clerkId> is required')
  return { clerkId, limit }
}

/* ── 出题 ──────────────────────────────────────────────────────────── */

type Verdict = 'keep' | 'reject'

interface Question {
  generationId: string
  url: string
  prompt: string
  truth: Verdict
}

/** 留 / 否各取一半（不够的那边有多少取多少），新的在前。 */
async function pickQuestions(
  userId: string,
  limit: number,
): Promise<Question[]> {
  const half = Math.ceil(limit / 2)
  const reviewed = await db.$queryRaw<
    { id: string; url: string; prompt: string; state: string }[]
  >`SELECT "id", COALESCE("previewUrl", "url") AS "url", "prompt",
       "snapshot"->>'reviewState' AS "state"
    FROM "Generation"
    WHERE "userId" = ${userId} AND "outputType" = 'IMAGE'
      AND "snapshot"->>'reviewState' IN (${GENERATION_REVIEW_STATE_IDS.approved}, ${GENERATION_REVIEW_STATE_IDS.blocked})
    ORDER BY "createdAt" DESC
    LIMIT ${limit * 2}`
  const liked = await db.userLike.findMany({
    where: { userId, generation: { userId, outputType: 'IMAGE' } },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      generation: {
        select: { id: true, url: true, previewUrl: true, prompt: true },
      },
    },
  })
  const keep = new Map<string, Question>()
  const reject: Question[] = []
  for (const row of reviewed) {
    const question = {
      generationId: row.id,
      url: row.url,
      prompt: row.prompt,
    }
    if (row.state === GENERATION_REVIEW_STATE_IDS.blocked)
      reject.push({ ...question, truth: 'reject' })
    else keep.set(row.id, { ...question, truth: 'keep' })
  }
  for (const { generation } of liked)
    if (!keep.has(generation.id))
      keep.set(generation.id, {
        generationId: generation.id,
        url: generation.previewUrl ?? generation.url,
        prompt: generation.prompt,
        truth: 'keep',
      })
  return [...[...keep.values()].slice(0, half), ...reject.slice(0, half)]
}

/* ── 答题 ──────────────────────────────────────────────────────────── */

const AnswerSchema = z.object({
  verdict: z.enum(['keep', 'reject']),
  reason: z.string(),
})

function examSystemPrompt(taste: readonly string[]): string {
  return `You judge pictures for one creator in an AI image studio. Decide whether THIS creator would keep the picture or reject it, by their taste and by plain quality (anatomy, hands, composition, muddy rendering).

What you remember about their taste:
${taste.length ? taste.map((line) => `- ${line}`).join('\n') : '(nothing yet)'}

Return ONE JSON object and nothing else: {"verdict":"keep" or "reject","reason":"one short sentence"}.`
}

async function answer(
  route: Awaited<ReturnType<typeof resolveAssistantRoute>>,
  taste: readonly string[],
  question: Question,
): Promise<z.infer<typeof AnswerSchema> | null> {
  const raw = await completeAssistantTextWithContextRetry({
    systemPrompt: examSystemPrompt(taste),
    buildUserPrompt: () =>
      `The picture's prompt (for context only): ${question.prompt.slice(0, 600)}`,
    route: route.route,
    // 题面只有一句提示词，压缩那一支走不到；给个小数只为满足签名。
    contextCompactionTargetLength: PROMPT_CONTEXT_CHARS,
    modelId: route.modelId,
    imageData: [question.url],
    responseFormat: 'json_object',
    callLog: { purpose: 'tasteExam' },
  })
  const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
  try {
    return AnswerSchema.parse(JSON.parse(json))
  } catch {
    return null
  }
}

/* ── 主流程 ────────────────────────────────────────────────────────── */

async function main() {
  const options = parseCliArgs(process.argv.slice(2))
  const user = await db.user.findUnique({
    where: { clerkId: options.clerkId },
    select: { id: true },
  })
  if (!user) throw new Error(`No user for ${options.clerkId}`)

  const questions = await pickQuestions(user.id, options.limit)
  if (questions.length === 0) {
    console.log('No approved, liked or rejected pictures to examine yet.')
    return
  }
  const route = await resolveAssistantRoute(user.id)
  const taste = (
    await listNextAssistantMemoriesForPrompt(user.id, {
      characterCardId: null,
      limit: MEMORIES_IN_PROMPT,
    })
  ).map((memory) => memory.text)

  const results = []
  for (const question of questions) {
    const got = await answer(route, taste, question).catch(() => null)
    results.push({
      ...question,
      guess: got?.verdict ?? null,
      reason: got?.reason ?? null,
    })
    console.log(
      `${got?.verdict === question.truth ? '✓' : got ? '✗' : '?'} ${question.truth.padEnd(6)} ${question.generationId} ${got?.reason ?? '(no readable answer)'}`,
    )
  }

  const answered = results.filter((result) => result.guess !== null)
  const correct = answered.filter((result) => result.guess === result.truth)
  const rate = answered.length ? correct.length / answered.length : 0
  console.log(
    `\n${route.modelLabel}: ${correct.length}/${answered.length} agree (${Math.round(rate * 100)}%), ${results.length - answered.length} unreadable, ${taste.length} taste lines`,
  )

  const out = resolve('artifacts/taste-exam')
  mkdirSync(out, { recursive: true })
  const file = resolve(out, `${new Date().toISOString().slice(0, 10)}.json`)
  writeFileSync(
    file,
    JSON.stringify({ model: route.modelLabel, rate, taste, results }, null, 2),
  )
  console.log(`Saved ${file}`)
}

if (process.argv[1]?.endsWith('assistant-taste-exam.ts')) {
  main()
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error)
      process.exitCode = 1
    })
    .finally(() => db.$disconnect())
}
