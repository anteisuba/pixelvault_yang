/**
 * L2a 真库：用户只配了一家文本 key、没点名 key、要看图的两个功能（「满意」打分、3D 源图检查）。
 * key 真加密入库、路由真选、文本模型真调（只假 provider 网络）、作品与偏好学习走真库；
 * R2 只假「下载源图」那一步。核发给 provider 的型号与图片格式、库里写下的评估。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const source = vi.hoisted(() => ({ png: Buffer.alloc(0) }))
vi.mock('@/services/storage/r2', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/storage/r2')>()),
  fetchAsBuffer: async () => ({ buffer: source.png, mimeType: 'image/png' }),
}))

import sharp from 'sharp'

import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { db } from '@/lib/db'
import { evaluateGeneration } from '@/services/generation-evaluator.service'
import { inspect3DSourceImageQuality } from '@/services/image/image-3d-prep.service'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'
import { seedGeneration } from '@/test/int/seed-generation'

const EVALUATION_JSON = JSON.stringify({
  subjectMatch: 8,
  styleMatch: 8,
  compositionMatch: 8,
  artifactScore: 9,
  promptAdherence: 8,
  overall: 8,
  detectedIssues: [],
  suggestedFixes: [],
})

/**
 * 用户唯一的文本 key 是这几家之一。没点名 key 时这两个功能跟助手走（`resolveAssistantRoute`，
 * owner 2026-10-15）：「自动」落在这一家的默认型号上，它得看得了图。
 */
const ONLY_KEY_CASES = [
  {
    adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
    respond: (text: string) => ({
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
    }),
    imageParts: (body: Record<string, unknown>) =>
      (body.messages as Array<{ content: Array<{ type: string }> }>)[0].content,
    imagePartType: 'image',
    expectedModel: LLM_TEXT_MODEL_IDS.CLAUDE_OPUS_5_5,
  },
  {
    adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
    respond: (text: string) => ({
      choices: [{ message: { content: text }, finish_reason: 'stop' }],
    }),
    imageParts: (body: Record<string, unknown>) =>
      (body.messages as Array<{ content: Array<{ type: string }> }>)[1].content,
    imagePartType: 'image_url',
    expectedModel: LLM_TEXT_MODEL_IDS.DEEPSEEK_FLASH,
  },
] as const

describe.each(ONLY_KEY_CASES)(
  '只有一把 $adapterType 文本 key、没点名、要看图（真库）',
  ({ adapterType, respond, imageParts, imagePartType, expectedModel }) => {
    let me: Awaited<ReturnType<typeof createTestUser>>
    const provider = {
      reply: '',
      bodies: [] as Array<Record<string, unknown>>,
    }

    beforeEach(async () => {
      await resetDatabase()
      me = await createTestUser()
      await seedAssistantKey(me.id, adapterType)
      provider.bodies = []
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
          provider.bodies.push(JSON.parse(String(init?.body)))
          return Response.json(respond(provider.reply))
        }),
      )
    })
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('「满意」打分：图交给那一家的默认型号，评估写进库', async () => {
      const gen = await seedGeneration(me.id, {
        url: 'data:image/png;base64,iVBORw0KGgo=',
        prompt: 'a cat',
      })
      provider.reply = EVALUATION_JSON

      expect((await evaluateGeneration(me.clerkId, gen.id))?.overall).toBe(8)
      expect(provider.bodies).toHaveLength(1)
      expect(provider.bodies[0].model).toBe(expectedModel)
      expect(imageParts(provider.bodies[0])[0].type).toBe(imagePartType)
      expect(
        (await db.generation.findUniqueOrThrow({ where: { id: gen.id } }))
          .evaluation,
      ).toMatchObject({ overall: 8, userSatisfied: true })
    })

    it('3D 源图检查：图交给那一家，读回问题', async () => {
      source.png = await sharp({
        create: {
          width: 1024,
          height: 1024,
          channels: 4,
          background: { r: 1, g: 2, b: 3, alpha: 1 },
        },
      })
        .png()
        .toBuffer()
      provider.reply = '{"issues":["busy_background"]}'

      const report = await inspect3DSourceImageQuality(
        'https://cdn.test/a.png',
        { userId: me.id },
      )
      expect(report.blockingIssues).toEqual(['busy_background'])
      expect(provider.bodies[0].model).toBe(expectedModel)
      expect(imageParts(provider.bodies[0])[0].type).toBe(imagePartType)
    })
  },
)
