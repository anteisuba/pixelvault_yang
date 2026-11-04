/**
 * L2a 真库：提示词内核那一圈接口——润色（/api/prompt/enhance）、翻成标签（/api/prompt/to-tags）、
 * 编译（/api/generation/compile）、出图计划（/api/generation/plan）、看图打分
 * （/api/generation/evaluate）。只假边界：Clerk 登录、限流、LLM 入口（llm-text.service）。
 * 选哪一家、用哪把 key 都走真库：核发给 LLM 的 key 与返回值、库里的评估。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const llm = vi.hoisted(() => ({
  reply: '' as string | Error,
  calls: [] as Array<Record<string, unknown>>,
}))
vi.mock('@/services/llm-text.service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/services/llm-text.service')>()
  return {
    ...actual,
    llmTextCompletion: vi.fn(async (input: Record<string, unknown>) => {
      llm.calls.push(input)
      if (llm.reply instanceof Error) throw llm.reply
      return llm.reply
    }),
  }
})

import {
  createPOST,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import { AI_MODELS } from '@/constants/models/enum'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { POST as ENHANCE } from '@/app/api/prompt/enhance/route'
import { POST as TO_TAGS } from '@/app/api/prompt/to-tags/route'
import { POST as COMPILE } from '@/app/api/generation/compile/route'
import { POST as PLAN } from '@/app/api/generation/plan/route'
import { POST as EVALUATE } from '@/app/api/generation/evaluate/route'
import { db } from '@/lib/db'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'
import { seedGeneration } from '@/test/int/seed-generation'

type Envelope<T> = {
  success: boolean
  data?: T
  error?: string
  errorCode?: string
}

const TEST_KEY = 'sk-test-not-a-real-key'

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
  mockAuthenticated(me.clerkId)
  llm.reply = ''
  llm.calls = []
})

async function post<T>(
  handler: (req: ReturnType<typeof createPOST>) => Promise<Response>,
  path: string,
  body: unknown,
) {
  const res = await handler(createPOST(path, body))
  return { status: res.status, body: await parseJSON<Envelope<T>>(res) }
}

describe('POST /api/prompt/enhance（真库选 key）', () => {
  const enhance = (body: unknown) =>
    post<{ original: string; enhanced: string; style: string }>(
      ENHANCE,
      '/api/prompt/enhance',
      body,
    )

  it('跟助手那一家：拿我存的 key 去润色，回润色后的那段', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.DEEPSEEK)
    llm.reply =
      'A lone lighthouse on a basalt cliff at dusk, low-key lighting with a cool desaturated palette and warm lamp glow.'
    const res = await enhance({ prompt: 'a lighthouse', style: 'detailed' })
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({
      original: 'a lighthouse',
      enhanced: llm.reply,
      style: 'detailed',
    })
    expect(llm.calls).toHaveLength(1)
    expect(llm.calls[0]).toMatchObject({
      purpose: 'prompt-enhance',
      userPrompt: 'a lighthouse',
      adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
      apiKey: TEST_KEY,
    })
  })

  it('点名的 key 是别人的：不用、不调 LLM', async () => {
    const theirs = await seedAssistantKey(other.id, AI_ADAPTER_TYPES.DEEPSEEK)
    const res = await enhance({
      prompt: 'a lighthouse',
      style: 'detailed',
      apiKeyId: theirs.id,
    })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(llm.calls).toHaveLength(0)
  })

  it('模型回的东西用不了：退回原文', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.DEEPSEEK)
    llm.reply = ''
    const res = await enhance({ prompt: 'a lighthouse', style: 'artistic' })
    expect(res.body.data).toMatchObject({
      original: 'a lighthouse',
      enhanced: 'a lighthouse',
    })
  })

  it('一把 key 都没有 400 不调 LLM；空提示词 / 不认识的风格 400；没登录 401', async () => {
    expect(
      (await enhance({ prompt: 'a lighthouse', style: 'detailed' })).status,
    ).toBe(400)
    expect((await enhance({ prompt: '  ', style: 'detailed' })).status).toBe(
      400,
    )
    expect((await enhance({ prompt: 'x', style: 'nope' })).status).toBe(400)
    mockUnauthenticated()
    expect((await enhance({ prompt: 'x', style: 'detailed' })).status).toBe(401)
    expect(llm.calls).toHaveLength(0)
  })
})

describe('POST /api/prompt/to-tags（真库选 key）', () => {
  const toTags = (body: unknown) =>
    post<{ tags: string }>(TO_TAGS, '/api/prompt/to-tags', body)

  it('助手那一家照原意翻成一串标签', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.DEEPSEEK)
    llm.reply = '1girl, solo, long hair, rain, night'
    const res = await toTags({ prompt: '一个长发女孩站在夜雨里' })
    expect(res.status).toBe(200)
    expect(res.body.data!.tags).toContain('1girl')
    expect(res.body.data!.tags).toContain('rain')
    expect(llm.calls[0]).toMatchObject({
      purpose: 'prompt-to-tags',
      apiKey: TEST_KEY,
    })
  })

  it('模型回了一段话不是标签：502 带 code，⛔ 不当成功', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.DEEPSEEK)
    llm.reply =
      'Sure! Here is a description of a girl standing in the rain at night. She has long hair and looks very calm.'
    const res = await toTags({ prompt: '一个长发女孩站在夜雨里' })
    expect(res.status).toBe(502)
    expect(res.body.errorCode).toBe('PROMPT_TAGS_UNUSABLE')
  })

  it('没 key 400；没登录 401', async () => {
    expect((await toTags({ prompt: 'x' })).status).toBe(400)
    mockUnauthenticated()
    expect((await toTags({ prompt: 'x' })).status).toBe(401)
    expect(llm.calls).toHaveLength(0)
  })
})

describe('POST /api/generation/compile 与 /plan（真服务）', () => {
  const intent = { subject: 'a woman', style: 'photorealism' }

  it('compile：按模型把意图编成提示词', async () => {
    const res = await post<{ compiledPrompt: string; negativePrompt?: string }>(
      COMPILE,
      '/api/generation/compile',
      { intent, modelId: AI_MODELS.FLUX_2_PRO },
    )
    expect(res.status).toBe(200)
    expect(res.body.data!.compiledPrompt).toContain('a woman')
  })

  it('compile：主体为空 400；没登录 401', async () => {
    expect(
      (
        await post(COMPILE, '/api/generation/compile', {
          intent: { subject: '' },
          modelId: AI_MODELS.FLUX_2_PRO,
        })
      ).status,
    ).toBe(400)
    mockUnauthenticated()
    expect(
      (
        await post(COMPILE, '/api/generation/compile', {
          intent,
          modelId: AI_MODELS.FLUX_2_PRO,
        })
      ).status,
    ).toBe(401)
  })

  it('plan：原话当主体、推荐模型、提示词草稿与第一名一致，⛔ 不调 LLM', async () => {
    const res = await post<{
      intent: { subject: string }
      recommendedModels: Array<{ modelId: string }>
      promptDraft: string
      estimatedCost: number
      variationCount: number
    }>(PLAN, '/api/generation/plan', {
      naturalLanguage: 'a cinematic portrait of a woman',
    })
    expect(res.status).toBe(200)
    const plan = res.body.data!
    expect(plan.intent.subject).toBe('a cinematic portrait of a woman')
    expect(plan.recommendedModels.length).toBeGreaterThan(0)
    expect(plan.promptDraft).toContain('a cinematic portrait of a woman')
    expect(plan.variationCount).toBe(4)
    expect(typeof plan.estimatedCost).toBe('number')
    expect(llm.calls).toHaveLength(0)
  })

  it('plan：空 / 全空白 400；没登录 401', async () => {
    for (const naturalLanguage of [undefined, '', '   ']) {
      expect(
        (await post(PLAN, '/api/generation/plan', { naturalLanguage })).status,
      ).toBe(400)
    }
    mockUnauthenticated()
    expect(
      (await post(PLAN, '/api/generation/plan', { naturalLanguage: 'x' }))
        .status,
    ).toBe(401)
  })
})

describe('POST /api/generation/evaluate（真库）', () => {
  const evaluation = {
    subjectMatch: 8,
    styleMatch: 7,
    compositionMatch: 7,
    artifactScore: 9,
    promptAdherence: 8,
    overall: 8,
    detectedIssues: ['slightly soft focus'],
    suggestedFixes: ['add "sharp focus"'],
  }
  const evaluate = (generationId: string) =>
    post<{ evaluation: typeof evaluation | null }>(
      EVALUATE,
      '/api/generation/evaluate',
      { generationId },
    )
  const PIXEL = 'data:image/png;base64,iVBORw0KGgo='

  it('看图打分：用助手那一家，把评估写进库', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.GEMINI)
    const gen = await seedGeneration(me.id, { url: PIXEL })
    llm.reply = '```json\n' + JSON.stringify(evaluation) + '\n```'

    const res = await evaluate(gen.id)
    expect(res.status).toBe(200)
    expect(res.body.data!.evaluation).toEqual(evaluation)
    expect(llm.calls[0]).toMatchObject({
      purpose: 'generation-evaluator',
      imageData: PIXEL,
      apiKey: TEST_KEY,
    })
    const row = await db.generation.findUniqueOrThrow({ where: { id: gen.id } })
    expect(row.evaluation).toMatchObject(evaluation)
  })

  it('库里已有评估：直接回，不再调 LLM', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.GEMINI)
    const gen = await seedGeneration(me.id, { url: PIXEL })
    await db.generation.update({ where: { id: gen.id }, data: { evaluation } })
    const res = await evaluate(gen.id)
    expect(res.body.data!.evaluation).toEqual(evaluation)
    expect(llm.calls).toHaveLength(0)
  })

  it('别人的图 403、没有的 404，都不调 LLM；没登录 401', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.GEMINI)
    const theirs = await seedGeneration(other.id, { url: PIXEL })
    expect((await evaluate(theirs.id)).status).toBe(403)
    expect((await evaluate('missing')).status).toBe(404)
    mockUnauthenticated()
    expect((await evaluate(theirs.id)).status).toBe(401)
    expect(llm.calls).toHaveLength(0)
    expect(
      (await db.generation.findUniqueOrThrow({ where: { id: theirs.id } }))
        .evaluation,
    ).toBeNull()
  })
})
