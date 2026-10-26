import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const mockFindFirst = vi.fn()
const mockCompletion = vi.fn()
/**
 * ⭐ 路由是**真的**（`resolveAssistantRoute` + `resolveLlmTextRoute`），只桩库与补全那一跳
 * （owner 2026-10-15「全跟助手」）。
 */
const keyStore = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
  personaFindUnique: vi.fn(),
}))
vi.mock('@/lib/db', () => ({
  db: {
    characterCard: { findFirst: (...a: unknown[]) => mockFindFirst(...a) },
    userApiKey: { findFirst: keyStore.findFirst, findMany: keyStore.findMany },
    assistantPersona: { findUnique: keyStore.personaFindUnique },
  },
}))
vi.mock('@/lib/crypto', () => ({
  decryptApiKey: (encrypted: string) => `plain:${encrypted}`,
}))
vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn().mockResolvedValue({ id: 'u1' }),
}))
vi.mock('@/services/llm-text.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/llm-text.service')>()),
  llmTextCompletion: (...a: unknown[]) => mockCompletion(...a),
}))

import { ASSISTANT_OPERATOR_MODEL_KEY_MISSING_CODE } from '@/constants/assistant-operator'
import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  assistantKey,
  seedAssistantRoute,
} from '@/test/assistant-route-fixture'
import {
  expectSelectedProviderOnly,
  keyLookupUsesOf,
  providerUsesOf,
} from '@/test/selected-provider-only'
import {
  draftCharacterDialogue,
  sampleCharacterLines,
} from './character-sample-lines.service'

describe('sampleCharacterLines（试读）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindFirst.mockResolvedValue({
      name: 'Denia',
      persona: { speech: '叫对方「指挥官」', catchphrases: ['呢'] },
    })
    seedAssistantRoute(keyStore, {
      keys: [assistantKey(AI_ADAPTER_TYPES.GEMINI, { userId: 'u1' })],
    })
  })

  it('把设定写进提示，读回两句', async () => {
    mockCompletion.mockResolvedValue(
      '```json\n{"lines": ["指挥官，看着我呢。", "嘘——秘密。"]}\n```',
    )
    await expect(sampleCharacterLines('clerk', 'card')).resolves.toEqual({
      lines: ['指挥官，看着我呢。', '嘘——秘密。'],
    })
    const [input] = mockCompletion.mock.calls[0]!
    expect(input.userPrompt).toContain('Way of speaking: 叫对方「指挥官」')
    expect(input.userPrompt).toContain('Catchphrases: 呢')
  })

  it('不是本人的卡返回 null；模型没回 JSON 就报错', async () => {
    mockFindFirst.mockResolvedValueOnce(null)
    await expect(sampleCharacterLines('clerk', 'x')).resolves.toBeNull()
    mockCompletion.mockResolvedValue('我不知道')
    await expect(sampleCharacterLines('clerk', 'card')).rejects.toThrow()
  })

  /** 「全跟助手」（owner 2026-10-15）：试读用助手那一家、那个型号，⛔ 不悄悄换一家。 */
  it('「自动」挑的那一家（DeepSeek）连型号一起用', async () => {
    seedAssistantRoute(keyStore, {
      keys: [
        assistantKey(AI_ADAPTER_TYPES.ANTHROPIC, { userId: 'u1' }),
        assistantKey(AI_ADAPTER_TYPES.DEEPSEEK, { userId: 'u1' }),
      ],
    })
    mockCompletion.mockResolvedValue('{"lines": ["指挥官。"]}')

    await sampleCharacterLines('clerk', 'card')

    expect(mockCompletion.mock.calls[0]?.[0]).toMatchObject({
      modelId: LLM_TEXT_MODEL_IDS.DEEPSEEK_FLASH,
    })
    expectSelectedProviderOnly(
      [
        ...keyLookupUsesOf(keyStore.findFirst),
        ...providerUsesOf(mockCompletion, 'sample lines'),
      ],
      {
        adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
        apiKey: `plain:enc_${AI_ADAPTER_TYPES.DEEPSEEK}`,
      },
    )
  })

  it('选了 Claude 却只有 Gemini 的 key → 照实报缺 key，⛔ 一个字都没发给 Gemini', async () => {
    seedAssistantRoute(keyStore, {
      keys: [assistantKey(AI_ADAPTER_TYPES.GEMINI, { userId: 'u1' })],
      routeModel: LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5_5,
    })

    await expect(sampleCharacterLines('clerk', 'card')).rejects.toMatchObject({
      errorCode: ASSISTANT_OPERATOR_MODEL_KEY_MISSING_CODE,
      i18nKey: 'errors.assistant.modelKeyMissing',
    })
    expect(mockCompletion).not.toHaveBeenCalled()
    expectSelectedProviderOnly(
      [
        ...keyLookupUsesOf(keyStore.findFirst),
        ...providerUsesOf(mockCompletion, 'sample lines'),
      ],
      { adapterType: AI_ADAPTER_TYPES.ANTHROPIC },
    )
  })
})

describe('draftCharacterDialogue（起草）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindFirst.mockResolvedValue({
      name: 'Denia',
      persona: { speech: '叫对方「指挥官」', boundaries: '不戴防护面罩' },
    })
    seedAssistantRoute(keyStore, {
      keys: [assistantKey(AI_ADAPTER_TYPES.GEMINI, { userId: 'u1' })],
    })
  })

  it('对话示例：读回几段问答，「不会做的事」也进提示', async () => {
    mockCompletion.mockResolvedValue(
      '{"examples": [{"user": "早", "reply": "指挥官，早呀。"}, {"reply": "才不要。"}]}',
    )
    await expect(
      draftCharacterDialogue('clerk', 'card', 'examples'),
    ).resolves.toEqual({
      examples: [
        { user: '早', reply: '指挥官，早呀。' },
        { user: '', reply: '才不要。' },
      ],
    })
    const [input] = mockCompletion.mock.calls[0]!
    expect(input.userPrompt).toContain(
      "What they won't do, and their flaws: 不戴防护面罩",
    )
  })

  it('开场白：读回一句；不是本人的卡返回 null；没回 JSON 就报错', async () => {
    mockCompletion.mockResolvedValue('{"opening": "嘘……请你不要声张。"}')
    await expect(
      draftCharacterDialogue('clerk', 'card', 'opening'),
    ).resolves.toEqual({ opening: '嘘……请你不要声张。' })
    mockFindFirst.mockResolvedValueOnce(null)
    await expect(
      draftCharacterDialogue('clerk', 'x', 'opening'),
    ).resolves.toBeNull()
    mockCompletion.mockResolvedValue('{"lines": ["x"]}')
    await expect(
      draftCharacterDialogue('clerk', 'card', 'opening'),
    ).rejects.toThrow()
  })
})
