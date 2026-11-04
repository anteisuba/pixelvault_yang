import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

/** 提炼那一次模型调用只在边界上假（`llmTextCompletion`）；信号、人设、记忆都是真库（L2a）。 */
const mockLlm = vi.fn()
vi.mock('@/services/llm-text.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/llm-text.service')>()),
  llmTextCompletion: (...args: unknown[]) => mockLlm(...args),
}))

import { ASSISTANT_TASTE_DISTILL } from '@/constants/assistant-memory'
import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { db } from '@/lib/db'
import { createTestUser, resetDatabase } from '@/test/int/db'
import { createTestGeneration } from '@/test/int/generations'

import { maybeDistillTaste } from './assistant-taste.service'

const seeing = {
  route: {
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    apiKey: 'k',
    providerConfig: { label: 'Gemini', baseUrl: '' },
  },
  modelId: LLM_TEXT_MODEL_IDS.GEMINI_3_8_FLASH,
} as unknown as Parameters<typeof maybeDistillTaste>[0]['assistant']

/** DeepSeek V4 Pro 看不了图。 */
const blind = {
  ...seeing,
  route: { ...seeing.route, adapterType: AI_ADAPTER_TYPES.DEEPSEEK },
  modelId: LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_PRO,
} as unknown as Parameters<typeof maybeDistillTaste>[0]['assistant']

let userId = ''

/** 攒信号：审核过的图（留下 / 否掉带理由）+ 点过赞的图。 */
async function seedSignals(count: number) {
  await createTestGeneration(userId, {
    url: 'https://cdn/x.png',
    prompt: 'soft backlight girl',
    snapshot: { reviewState: 'approved' },
    createdAt: new Date(Date.now() - 2_000),
  })
  await createTestGeneration(userId, {
    url: 'https://cdn/y.png',
    prompt: 'glossy 3d render',
    snapshot: { reviewState: 'blocked', reviewReason: '塑料皮肤' },
    createdAt: new Date(Date.now() - 1_000),
  })
  for (let index = 2; index < count; index += 1) {
    const liked = await createTestGeneration(userId, {
      prompt: `liked ${index}`,
    })
    await db.userLike.create({ data: { userId, generationId: liked.id } })
  }
}

async function memories() {
  return db.assistantMemory.findMany({ where: { userId } })
}

describe('maybeDistillTaste（口味提炼，真库）', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await resetDatabase()
    userId = (await createTestUser()).id
    await db.assistantConversation.create({
      data: {
        userId,
        surface: 'IMAGE_STUDIO',
        title: '逆光的猫',
        messages: [
          { kind: 'user', id: 'u1', text: '发色还是没变浅', attachments: [] },
          { kind: 'message', id: 'm1', text: '这次把参考图强度降了一档' },
        ],
      },
    })
    mockLlm.mockResolvedValue(
      JSON.stringify({
        memories: [{ kind: 'preference', text: '偏好柔和逆光，不要塑料皮肤' }],
        forget: [],
      }),
    )
  })

  it('看不了图的型号不跑：不调模型、不记时间', async () => {
    await seedSignals(ASSISTANT_TASTE_DISTILL.minNewSignals)
    expect(await maybeDistillTaste({ userId, assistant: blind })).toBe(false)
    expect(mockLlm).not.toHaveBeenCalled()
    expect(await db.assistantPersona.findUnique({ where: { userId } })).toBe(
      null,
    )
  })

  it('离上次不到一天不跑', async () => {
    await seedSignals(ASSISTANT_TASTE_DISTILL.minNewSignals)
    await db.assistantPersona.create({
      data: { userId, tasteDistilledAt: new Date(Date.now() - 60_000) },
    })
    expect(await maybeDistillTaste({ userId, assistant: seeing })).toBe(false)
    expect(mockLlm).not.toHaveBeenCalled()
  })

  it('新信号不够不跑，也不记时间', async () => {
    await seedSignals(ASSISTANT_TASTE_DISTILL.minNewSignals - 1)
    expect(await maybeDistillTaste({ userId, assistant: seeing })).toBe(false)
    expect(mockLlm).not.toHaveBeenCalled()
    expect(await db.assistantPersona.findUnique({ where: { userId } })).toBe(
      null,
    )
  })

  it('攒够了：记下时间，看留下 / 否掉的图，写进「关于你」', async () => {
    await seedSignals(ASSISTANT_TASTE_DISTILL.minNewSignals)

    expect(await maybeDistillTaste({ userId, assistant: seeing })).toBe(true)

    const persona = await db.assistantPersona.findUniqueOrThrow({
      where: { userId },
    })
    expect(persona.tasteDistilledAt).toBeInstanceOf(Date)
    const call = mockLlm.mock.calls[0]?.[0] as {
      imageData: string[]
      imageLabels: string[]
      userPrompt: string
    }
    expect(call.imageData).toContain('https://cdn/x.png')
    expect(call.imageData).toContain('https://cdn/y.png')
    const rejected = call.imageData.indexOf('https://cdn/y.png')
    expect(call.imageLabels[rejected]).toContain('塑料皮肤')
    // 复盘：最近对话的结尾跟着一起给模型。
    expect(call.userPrompt).toContain('发色还是没变浅')
    expect(call.userPrompt).toContain('这次把参考图强度降了一档')
    expect((await memories()).map((memory) => memory.text)).toEqual([
      '偏好柔和逆光，不要塑料皮肤',
    ])
  })

  it('刚跑过一次，紧接着再来一轮不会再跑一份', async () => {
    await seedSignals(ASSISTANT_TASTE_DISTILL.minNewSignals)
    expect(await maybeDistillTaste({ userId, assistant: seeing })).toBe(true)
    expect(await maybeDistillTaste({ userId, assistant: seeing })).toBe(false)
    expect(mockLlm).toHaveBeenCalledTimes(1)
  })
})
