import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

/**
 * ⭐ 路由是**真的**（`resolveAssistantRoute` + `resolveLlmTextRoute`），只桩库（owner
 * 2026-10-15「全跟助手」）：看图此前就是在这里悄悄借了别家能看图的 key。
 */
const keyStore = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
  personaFindUnique: vi.fn(),
}))
vi.mock('@/lib/db', () => ({
  db: {
    userApiKey: { findFirst: keyStore.findFirst, findMany: keyStore.findMany },
    assistantPersona: { findUnique: keyStore.personaFindUnique },
  },
}))
vi.mock('@/lib/crypto', () => ({
  decryptApiKey: (encrypted: string) => `plain:${encrypted}`,
}))

import { ASSISTANT_MODEL_CANNOT_SEE_CODE } from '@/constants/assistant-operator'
import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { AssistantModelCannotSeeError } from '@/lib/errors'
import { resolveVisionRoute } from '@/services/vision/vision-route.service'
import {
  assistantKey,
  seedAssistantRoute,
} from '@/test/assistant-route-fixture'
import {
  expectSelectedProviderOnly,
  keyLookupUsesOf,
} from '@/test/selected-provider-only'

function usesOf(route: { adapterType: string; apiKey: string } | null) {
  return [
    ...keyLookupUsesOf(keyStore.findFirst),
    ...(route
      ? [
          {
            via: 'vision',
            adapterType: route.adapterType,
            apiKey: route.apiKey,
          },
        ]
      : []),
  ]
}

describe('resolveVisionRoute —— 只用所选那一家', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([AI_ADAPTER_TYPES.OPENAI, AI_ADAPTER_TYPES.DEEPSEEK])(
    '递了一把能看图的 key：就用它（%s），连型号一起',
    async (adapterType) => {
      seedAssistantRoute(keyStore, {
        keys: [
          assistantKey(AI_ADAPTER_TYPES.GEMINI),
          assistantKey(adapterType),
        ],
      })

      const resolved = await resolveVisionRoute(
        'db_user_1',
        `key_${adapterType}`,
      )

      expect(resolved.route.adapterType).toBe(adapterType)
      expect(resolved.modelId).toBeDefined()
      expectSelectedProviderOnly(usesOf(resolved.route), {
        adapterType,
        apiKey: `plain:enc_${adapterType}`,
      })
    },
  )

  it('递的是 DeepSeek V4 Pro（看不了图）→ 照实报那句错，⛔ 不借另一把能看图的 Gemini', async () => {
    seedAssistantRoute(keyStore, {
      keys: [
        assistantKey(AI_ADAPTER_TYPES.GEMINI),
        assistantKey(AI_ADAPTER_TYPES.DEEPSEEK),
      ],
    })

    const failure = await resolveVisionRoute(
      'db_user_1',
      `key_${AI_ADAPTER_TYPES.DEEPSEEK}`,
      LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_PRO,
    ).catch((error: unknown) => error)

    // ⛔ 最坏的实现是「借不到就用纯文字模型硬跑」—— 会拿到一份格式完整、根本没看过图
    //    的观察；次坏的是悄悄用 Gemini 的 key 跑完，用户不知道扣了谁的钱。
    expect(failure).toBeInstanceOf(AssistantModelCannotSeeError)
    expect(failure).toMatchObject({
      errorCode: ASSISTANT_MODEL_CANNOT_SEE_CODE,
      i18nKey: 'errors.assistant.modelCannotSee',
    })
    expectSelectedProviderOnly(usesOf(null), {
      adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
    })
  })

  it('没递 key：跟助手 ——「自动」挑的那一家与它的默认档', async () => {
    seedAssistantRoute(keyStore, {
      keys: [
        assistantKey(AI_ADAPTER_TYPES.XAI),
        assistantKey(AI_ADAPTER_TYPES.OPENAI),
      ],
    })

    const resolved = await resolveVisionRoute('db_user_1')

    expect(resolved).toMatchObject({
      route: { adapterType: AI_ADAPTER_TYPES.OPENAI },
      modelId: LLM_TEXT_MODEL_IDS.OPENAI_GPT_6_1_SOL,
    })
    expectSelectedProviderOnly(usesOf(resolved.route), {
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      apiKey: `plain:enc_${AI_ADAPTER_TYPES.OPENAI}`,
    })
  })

  it('没递 key、助手选的是 V4 Pro → 看不了图就直说，⛔ 不换成别家', async () => {
    seedAssistantRoute(keyStore, {
      keys: [
        assistantKey(AI_ADAPTER_TYPES.GEMINI),
        assistantKey(AI_ADAPTER_TYPES.DEEPSEEK),
      ],
      routeModel: LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_PRO,
    })

    await expect(resolveVisionRoute('db_user_1')).rejects.toMatchObject({
      errorCode: ASSISTANT_MODEL_CANNOT_SEE_CODE,
    })
    expectSelectedProviderOnly(usesOf(null), {
      adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
    })
  })

  it('选中的那把 key 失效 → 照实抛，⛔ 不悄悄换一把', async () => {
    // 用户选了一把失效的 key。安静换一把跑完，他会奇怪为什么用的不是自己选的模型，
    // 而那把坏 key 永远不会被修。
    seedAssistantRoute(keyStore, {
      keys: [assistantKey(AI_ADAPTER_TYPES.GEMINI)],
    })

    await expect(resolveVisionRoute('db_user_1', 'key_dead')).rejects.toThrow(
      'The selected API key is unavailable.',
    )
    expectSelectedProviderOnly(usesOf(null), {
      adapterType: AI_ADAPTER_TYPES.GEMINI,
    })
  })
})
