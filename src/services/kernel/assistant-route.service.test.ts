import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const keyStore = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
  personaFindUnique: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    userApiKey: {
      findFirst: keyStore.findFirst,
      findMany: keyStore.findMany,
    },
    assistantPersona: { findUnique: keyStore.personaFindUnique },
  },
}))

vi.mock('@/lib/crypto', () => ({
  decryptApiKey: (encrypted: string) => {
    // 坏掉的那把 key：解不开就抛（真 `decryptApiKey` 的行为）。
    if (encrypted === 'broken') throw new Error('cannot decrypt')
    return `plain:${encrypted}`
  },
}))

import { ASSISTANT_PROVIDER_ORDER } from '@/constants/assistant'
import {
  ASSISTANT_ROUTE_MODEL_AUTO,
  pickAutoAssistantRouteModel,
} from '@/constants/assistant-persona'
import {
  ASSISTANT_MODEL_CANNOT_SEE_CODE,
  ASSISTANT_OPERATOR_MODEL_KEY_MISSING_CODE,
} from '@/constants/assistant-operator'
import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  ApiKeyError,
  AssistantModelCannotSeeError,
  AssistantModelKeyMissingError,
} from '@/lib/errors'
import {
  assertAssistantRouteSeesImages,
  resolveAssistantRoute,
  resolveKeyOrAssistantRoute,
} from '@/services/kernel/assistant-route.service'
import {
  assistantKey,
  seedAssistantRoute,
} from '@/test/assistant-route-fixture'
import {
  expectSelectedProviderOnly,
  keyLookupUsesOf,
} from '@/test/selected-provider-only'

/**
 * 「助手那一家」的唯一答案（owner 2026-10-15「全跟助手」·「会自动扣其他模型的token，
 * 用户还不知道」）。⚠ 真的解析器 + 真的 `resolveLlmTextRoute`，只桩库。
 */
describe('resolveAssistantRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function usesOf(route: { adapterType: string; apiKey: string }) {
    return [
      ...keyLookupUsesOf(keyStore.findFirst),
      { via: 'route', adapterType: route.adapterType, apiKey: route.apiKey },
    ]
  }

  it('「自动」= 顺序里第一家配了 key 的那一家的默认档，与 chip 用的是同一个函数', async () => {
    seedAssistantRoute(keyStore, {
      keys: [
        assistantKey(AI_ADAPTER_TYPES.XAI),
        assistantKey(AI_ADAPTER_TYPES.ANTHROPIC),
        assistantKey(AI_ADAPTER_TYPES.DEEPSEEK),
      ],
    })

    const picked = await resolveAssistantRoute('db_user_1')

    expect(picked).toMatchObject({
      apiKeyId: `key_${AI_ADAPTER_TYPES.DEEPSEEK}`,
      modelId: LLM_TEXT_MODEL_IDS.DEEPSEEK_FLASH,
      modelLabel: 'DeepSeek V4.1 Flash',
      auto: true,
    })
    expect(
      pickAutoAssistantRouteModel([
        AI_ADAPTER_TYPES.XAI,
        AI_ADAPTER_TYPES.ANTHROPIC,
        AI_ADAPTER_TYPES.DEEPSEEK,
      ])?.modelId,
    ).toBe(picked.modelId)
    expectSelectedProviderOnly(usesOf(picked.route), {
      adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
      apiKey: `plain:enc_${AI_ADAPTER_TYPES.DEEPSEEK}`,
    })
  })

  it('「自动」是确定的：key 建的先后、库回的顺序都不改答案', async () => {
    const answers = new Set<string>()
    const keys = [
      assistantKey(AI_ADAPTER_TYPES.OPENAI, {
        createdAt: new Date('2026-10-10T00:00:00Z'),
      }),
      assistantKey(AI_ADAPTER_TYPES.ANTHROPIC, {
        createdAt: new Date('2026-10-12T00:00:00Z'),
      }),
      assistantKey(AI_ADAPTER_TYPES.XAI, {
        createdAt: new Date('2026-10-14T00:00:00Z'),
      }),
    ]
    for (const order of [
      keys,
      [...keys].reverse(),
      [keys[1]!, keys[2]!, keys[0]!],
    ]) {
      vi.clearAllMocks()
      seedAssistantRoute(keyStore, { keys: order })
      const picked = await resolveAssistantRoute('db_user_1')
      answers.add(`${picked.route.adapterType}:${picked.modelId}`)
      expectSelectedProviderOnly(usesOf(picked.route), {
        adapterType: AI_ADAPTER_TYPES.OPENAI,
      })
    }
    expect([...answers]).toEqual([
      `${AI_ADAPTER_TYPES.OPENAI}:${LLM_TEXT_MODEL_IDS.OPENAI_GPT_6_1_SOL}`,
    ])
  })

  it('「自动」的问答轮换同一家的快档（OpenAI Sol → Luna），⛔ 不换家；点名的模型不换', async () => {
    seedAssistantRoute(keyStore, {
      keys: [assistantKey(AI_ADAPTER_TYPES.OPENAI)],
    })
    const quick = await resolveAssistantRoute('db_user_1', {
      questionTurn: true,
    })
    expect(quick).toMatchObject({
      modelId: LLM_TEXT_MODEL_IDS.OPENAI_GPT_6_LUNA,
      modelLabel: 'OpenAI GPT-6 Luna',
      auto: true,
    })
    expectSelectedProviderOnly(usesOf(quick.route), {
      adapterType: AI_ADAPTER_TYPES.OPENAI,
    })

    vi.clearAllMocks()
    seedAssistantRoute(keyStore, {
      keys: [assistantKey(AI_ADAPTER_TYPES.DEEPSEEK)],
    })
    const deepseek = await resolveAssistantRoute('db_user_1', {
      questionTurn: true,
    })
    expect(deepseek.modelId).toBe(LLM_TEXT_MODEL_IDS.DEEPSEEK_FLASH)

    vi.clearAllMocks()
    seedAssistantRoute(keyStore, {
      keys: [assistantKey(AI_ADAPTER_TYPES.OPENAI)],
      routeModel: LLM_TEXT_MODEL_IDS.OPENAI_GPT_6_1_SOL,
    })
    const pinned = await resolveAssistantRoute('db_user_1', {
      questionTurn: true,
    })
    expect(pinned).toMatchObject({
      modelId: LLM_TEXT_MODEL_IDS.OPENAI_GPT_6_1_SOL,
      auto: false,
    })
  })

  it('顺序就是 Gemini → DeepSeek → OpenAI → Claude → Grok', () => {
    expect([...ASSISTANT_PROVIDER_ORDER]).toEqual([
      AI_ADAPTER_TYPES.GEMINI,
      AI_ADAPTER_TYPES.DEEPSEEK,
      AI_ADAPTER_TYPES.OPENAI,
      AI_ADAPTER_TYPES.ANTHROPIC,
      AI_ADAPTER_TYPES.XAI,
    ])
  })

  it('选了具体模型：就是它，哪怕顺序更靠前的那一家也有 key', async () => {
    seedAssistantRoute(keyStore, {
      keys: [
        assistantKey(AI_ADAPTER_TYPES.GEMINI),
        assistantKey(AI_ADAPTER_TYPES.ANTHROPIC),
      ],
      routeModel: LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5_5,
    })

    const picked = await resolveAssistantRoute('db_user_1')

    expect(picked).toMatchObject({
      modelId: LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5_5,
      auto: false,
    })
    expectSelectedProviderOnly(usesOf(picked.route), {
      adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
      apiKey: `plain:enc_${AI_ADAPTER_TYPES.ANTHROPIC}`,
    })
  })

  it('⛔ 选了 Claude、只有 Gemini 的 key → 抛带厂商与型号的错，⛔ 不回落「自动」去用 Gemini', async () => {
    seedAssistantRoute(keyStore, {
      keys: [assistantKey(AI_ADAPTER_TYPES.GEMINI)],
      routeModel: LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5_5,
    })

    const failure = await resolveAssistantRoute('db_user_1').catch(
      (error: unknown) => error,
    )

    expect(failure).toBeInstanceOf(AssistantModelKeyMissingError)
    expect(failure).toMatchObject({
      errorCode: ASSISTANT_OPERATOR_MODEL_KEY_MISSING_CODE,
      adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
      modelId: LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5_5,
    })
    // 一把 key 都没解开过：没有任何一家被用上。
    expect(keyStore.findFirst).not.toHaveBeenCalled()
    expectSelectedProviderOnly(keyLookupUsesOf(keyStore.findFirst), {
      adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
    })
  })

  it('「自动」一把 key 都没有 → MISSING_API_KEY（面板就地开 QuickSetupDialog）', async () => {
    seedAssistantRoute(keyStore, { keys: [] })

    await expect(resolveAssistantRoute('db_user_1')).rejects.toBeInstanceOf(
      ApiKeyError,
    )
    await expect(resolveAssistantRoute('db_user_1')).rejects.toMatchObject({
      errorCode: 'MISSING_API_KEY',
    })
    expect(keyStore.findFirst).not.toHaveBeenCalled()
  })

  it('persona 已经读过就不再读那一列（prepareOperatorTurn 传进来的）', async () => {
    seedAssistantRoute(keyStore, {
      keys: [assistantKey(AI_ADAPTER_TYPES.GEMINI)],
    })

    const picked = await resolveAssistantRoute('db_user_1', {
      routeModel: ASSISTANT_ROUTE_MODEL_AUTO,
    })

    expect(keyStore.personaFindUnique).not.toHaveBeenCalled()
    expectSelectedProviderOnly(usesOf(picked.route), {
      adapterType: AI_ADAPTER_TYPES.GEMINI,
    })
  })
})

describe('assertAssistantRouteSeesImages（做不了就直说，⛔ 不借别家）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('选的 DeepSeek V4 Pro 看不了图 → 翻译过的那句错，即使另有一家能看图的 key', async () => {
    seedAssistantRoute(keyStore, {
      keys: [
        assistantKey(AI_ADAPTER_TYPES.DEEPSEEK),
        assistantKey(AI_ADAPTER_TYPES.GEMINI),
      ],
      routeModel: LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_PRO,
    })

    const picked = await resolveAssistantRoute('db_user_1')
    const failure = (() => {
      try {
        assertAssistantRouteSeesImages(picked)
        return null
      } catch (error) {
        return error
      }
    })()

    expect(failure).toBeInstanceOf(AssistantModelCannotSeeError)
    expect(failure).toMatchObject({
      errorCode: ASSISTANT_MODEL_CANNOT_SEE_CODE,
      i18nKey: 'errors.assistant.modelCannotSee',
    })
    expectSelectedProviderOnly(
      [
        ...keyLookupUsesOf(keyStore.findFirst),
        { via: 'route', adapterType: picked.route.adapterType },
      ],
      { adapterType: AI_ADAPTER_TYPES.DEEPSEEK },
    )
  })

  it('看得了图就放行', async () => {
    seedAssistantRoute(keyStore, {
      keys: [assistantKey(AI_ADAPTER_TYPES.GEMINI)],
    })

    const picked = await resolveAssistantRoute('db_user_1')

    expect(() => assertAssistantRouteSeesImages(picked)).not.toThrow()
    expectSelectedProviderOnly(
      [{ via: 'route', adapterType: picked.route.adapterType }],
      { adapterType: AI_ADAPTER_TYPES.GEMINI },
    )
  })
})

/**
 * 自带 key 选择器的那几样（润色、角色卡、反馈、剧本文档）：点名的 key 照旧，没点名就跟助手
 * （owner 2026-10-15「全跟助手」）。⛔ 不再走旧的「按顺序挑第一家、解不开试下一家」。
 */
describe('resolveKeyOrAssistantRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('没点名 key = 助手那一家、那把 key、那个型号（⛔ 不是顺序里排第一的 Gemini）', async () => {
    seedAssistantRoute(keyStore, {
      keys: [
        assistantKey(AI_ADAPTER_TYPES.GEMINI),
        assistantKey(AI_ADAPTER_TYPES.ANTHROPIC),
      ],
      routeModel: LLM_TEXT_MODEL_IDS.CLAUDE_HAIKU_5_5,
    })

    const picked = await resolveKeyOrAssistantRoute('db_user_1', undefined)

    expect(picked.route.adapterType).toBe(AI_ADAPTER_TYPES.ANTHROPIC)
    expect(picked.modelId).toBe(LLM_TEXT_MODEL_IDS.CLAUDE_HAIKU_5_5)
    expectSelectedProviderOnly(
      [
        ...keyLookupUsesOf(keyStore.findFirst),
        {
          via: 'route',
          adapterType: picked.route.adapterType,
          apiKey: picked.route.apiKey,
        },
      ],
      {
        adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
        apiKey: `plain:enc_${AI_ADAPTER_TYPES.ANTHROPIC}`,
      },
    )
  })

  it('点名了一把 key：就是它，型号留给那一家的默认档（照旧）', async () => {
    seedAssistantRoute(keyStore, {
      keys: [
        assistantKey(AI_ADAPTER_TYPES.GEMINI),
        assistantKey(AI_ADAPTER_TYPES.OPENAI),
      ],
      routeModel: LLM_TEXT_MODEL_IDS.GEMINI_3_8_FLASH,
    })

    const picked = await resolveKeyOrAssistantRoute(
      'db_user_1',
      `key_${AI_ADAPTER_TYPES.OPENAI}`,
    )

    expect(picked).toEqual({
      route: expect.objectContaining({
        adapterType: AI_ADAPTER_TYPES.OPENAI,
        apiKey: `plain:enc_${AI_ADAPTER_TYPES.OPENAI}`,
      }),
    })
    expect(keyStore.personaFindUnique).not.toHaveBeenCalled()
  })

  it('⛔ 助手那一家没 key → 照实抛，⛔ 不拿别家的 key 顶上', async () => {
    seedAssistantRoute(keyStore, {
      keys: [assistantKey(AI_ADAPTER_TYPES.GEMINI)],
      routeModel: LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5_5,
    })

    await expect(
      resolveKeyOrAssistantRoute('db_user_1', undefined),
    ).rejects.toBeInstanceOf(AssistantModelKeyMissingError)
    expect(keyStore.findFirst).not.toHaveBeenCalled()
  })

  it('⛔ 那把 key 解不开 → 照实抛，⛔ 不悄悄试下一家', async () => {
    seedAssistantRoute(keyStore, {
      keys: [
        assistantKey(AI_ADAPTER_TYPES.GEMINI, { encryptedKey: 'broken' }),
        assistantKey(AI_ADAPTER_TYPES.DEEPSEEK),
      ],
    })

    await expect(
      resolveKeyOrAssistantRoute('db_user_1', undefined),
    ).rejects.toThrow('cannot decrypt')
    expectSelectedProviderOnly(keyLookupUsesOf(keyStore.findFirst), {
      adapterType: AI_ADAPTER_TYPES.GEMINI,
    })
  })

  it('要看图、助手选的 DeepSeek V4 Pro 看不了 → 照实抛，⛔ 不借能看图的那一家', async () => {
    seedAssistantRoute(keyStore, {
      keys: [
        assistantKey(AI_ADAPTER_TYPES.DEEPSEEK),
        assistantKey(AI_ADAPTER_TYPES.GEMINI),
      ],
      routeModel: LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_PRO,
    })

    await expect(
      resolveKeyOrAssistantRoute('db_user_1', undefined, { seesImages: true }),
    ).rejects.toBeInstanceOf(AssistantModelCannotSeeError)
  })
})
