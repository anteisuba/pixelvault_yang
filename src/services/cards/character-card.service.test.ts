import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockEnsureUser = vi.fn()
vi.mock('@/services/user.service', () => ({
  ensureUser: (...a: unknown[]) => mockEnsureUser(...a),
}))

/**
 * ⭐ 联网取材与合并属性那两跳的路由是**真的**（`resolveKeyOrAssistantRoute`），只桩库与补全
 * （owner 2026-10-15「全跟助手」）：没点名 key 时它们此前走旧的自动兜底。
 */
const keyStore = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
  personaFindUnique: vi.fn(),
}))
vi.mock('@/lib/crypto', () => ({
  decryptApiKey: (encrypted: string) => `plain:${encrypted}`,
}))
const mockLlmCompletion = vi.fn()
vi.mock('@/services/llm-text.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/llm-text.service')>()),
  llmTextCompletion: (...a: unknown[]) => mockLlmCompletion(...a),
}))

vi.mock('@/services/storage/r2', () => ({
  generateStorageKey: vi.fn().mockReturnValue('key/abc'),
  uploadToR2: vi.fn().mockResolvedValue('https://r2.example.com/abc.jpg'),
}))

/**
 * 切片 2 收编：`extractCharacterAttributes` 改为调 Vision Analyzer 的
 * `character_identity` 任务，本文件只验「返回形状不变 + 映射无损 + 不写卡」。
 */
const mockAnalyzeVisual = vi.fn()
vi.mock('@/services/vision/vision-analyzer.service', () => ({
  analyzeVisual: (...a: unknown[]) => mockAnalyzeVisual(...a),
}))

const mockFindMany = vi.fn()
const mockFindUnique = vi.fn()
const mockUpdate = vi.fn()
const mockCount = vi.fn()
const mockCardCreate = vi.fn()
const mockGenerationFindFirst = vi.fn()

vi.mock('@/services/cards/card-handle.service', () => ({
  allocateHandleForNewCard: vi.fn().mockResolvedValue('时夜'),
}))

vi.mock('@/lib/db', () => ({
  db: {
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        characterCard: { create: (...a: unknown[]) => mockCardCreate(...a) },
      }),
    characterCard: {
      findMany: (...a: unknown[]) => mockFindMany(...a),
      findUnique: (...a: unknown[]) => mockFindUnique(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
      count: (...a: unknown[]) => mockCount(...a),
      create: (...a: unknown[]) => mockCardCreate(...a),
    },
    generation: {
      findFirst: (...a: unknown[]) => mockGenerationFindFirst(...a),
    },
    userApiKey: { findFirst: keyStore.findFirst, findMany: keyStore.findMany },
    assistantPersona: { findUnique: keyStore.personaFindUnique },
  },
}))

import { uploadToR2 } from '@/services/storage/r2'
import {
  buildPromptFromAttributes,
  createCharacterCard,
  createImportedCharacterCard,
  extractCharacterAttributes,
  listCharacterCards,
  getCharacterCard,
  deleteCharacterCard,
  updateCharacterCard,
} from '@/services/cards/character-card.service'
import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { VISION_TASKS } from '@/constants/vision'
import { ASSISTANT_SURFACE_IDS } from '@/types/assistant-conversation'
import type { CharacterAttributes } from '@/types'
import {
  assistantKey,
  seedAssistantRoute,
} from '@/test/assistant-route-fixture'
import {
  expectSelectedProviderOnly,
  keyLookupUsesOf,
  providerUsesOf,
} from '@/test/selected-provider-only'

const FAKE_USER = { id: 'db_user_1', clerkId: 'clerk_1' }
const FAKE_CARD = {
  id: 'card_1',
  userId: 'db_user_1',
  name: 'Rei',
  description: null,
  sourceImageUrl: 'https://example.com/rei.png',
  sourceStorageKey: '',
  sourceImages: [],
  sourceImageEntries: [],
  characterPrompt: 'blue hair anime girl',
  modelPrompts: null,
  attributes: {},
  tags: [],
  status: 'DRAFT',
  parentId: null,
  variantLabel: null,
  stabilityScore: null,
  isDeleted: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  loras: null,
  referenceImages: null,
  variants: [],
}

describe('buildPromptFromAttributes', () => {
  it('assembles known fields into a comma-separated prompt', () => {
    const attrs: CharacterAttributes = {
      hairColor: 'blue',
      hairStyle: 'long',
      eyeColor: 'violet',
      artStyle: 'anime',
    }

    const result = buildPromptFromAttributes(attrs)

    expect(result).toContain('blue long hair')
    expect(result).toContain('violet eyes')
    expect(result).toContain('anime')
  })

  it('falls back to freeformDescription when all other fields are empty', () => {
    const attrs: CharacterAttributes = {
      freeformDescription: 'a mysterious hooded figure',
    }

    const result = buildPromptFromAttributes(attrs)

    expect(result).toBe('a mysterious hooded figure')
  })
})

describe('extractCharacterAttributes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
  })

  function observations(overrides: Record<string, unknown> = {}) {
    return {
      task: VISION_TASKS.characterIdentity,
      identity: {
        hairColor: { label: 'hair colour', text: 'blue', basis: 'observation' },
        hairStyle: { label: 'hair style', text: 'long', basis: 'observation' },
        eyeColor: { label: 'eye colour', text: 'violet', basis: 'observation' },
        colorPalette: {
          label: 'palette',
          text: 'blue, white',
          basis: 'observation',
        },
        distinguishingFeatures: {
          label: 'marks',
          text: 'scar across the left cheek',
          basis: 'observation',
        },
      },
      variableLayer: {
        outfit: { label: 'outfit', text: 'plugsuit', basis: 'observation' },
        pose: { label: 'pose', text: 'standing', basis: 'observation' },
      },
      artStyle: { label: 'art style', text: 'anime', basis: 'inference' },
      summary: { label: 'summary', text: 'a calm pilot', basis: 'inference' },
      uncertainties: [],
      ...overrides,
    }
  }

  it('returns the unchanged CharacterAttributes shape from the vision task', async () => {
    mockAnalyzeVisual.mockResolvedValue({
      runId: 'run_1',
      task: VISION_TASKS.characterIdentity,
      grounded: false,
      observations: observations(),
      conclusions: [],
      model: 'gemini',
    })

    const attrs = await extractCharacterAttributes(
      'clerk_1',
      'https://example.com/rei.png',
      'key_1',
    )

    // 调用方与返回形状不变 —— 13 个具名字段，一个都没换名字。
    expect(attrs).toEqual({
      hairColor: 'blue',
      hairStyle: 'long',
      eyeColor: 'violet',
      colorPalette: 'blue, white',
      distinguishingFeatures: 'scar across the left cheek',
      outfit: 'plugsuit',
      pose: 'standing',
      artStyle: 'anime',
      freeformDescription: 'a calm pilot',
      skinTone: undefined,
      bodyType: undefined,
      accessories: undefined,
      expression: undefined,
    })

    expect(mockAnalyzeVisual).toHaveBeenCalledWith({
      userId: 'db_user_1',
      surface: ASSISTANT_SURFACE_IDS.imageStudio,
      task: VISION_TASKS.characterIdentity,
      mediaUrls: ['https://example.com/rei.png'],
      routeHint: 'key_1',
    })
    // ⛔ 边界 13：抽属性不建卡。
    expect(mockCardCreate).not.toHaveBeenCalled()
  })

  it('drops "unknown" slots instead of letting a guess reach the prompt', async () => {
    mockAnalyzeVisual.mockResolvedValue({
      runId: 'run_1',
      task: VISION_TASKS.characterIdentity,
      grounded: false,
      observations: observations({
        identity: {
          hairColor: {
            label: 'hair colour',
            text: 'blue',
            basis: 'observation',
          },
          skinTone: { label: 'skin', text: 'fair', basis: 'unknown' },
        },
      }),
      conclusions: [],
      model: 'gemini',
    })

    const attrs = await extractCharacterAttributes(
      'clerk_1',
      'https://example.com/rei.png',
    )

    // 属性会被 buildPromptFromAttributes 直接拼进生成提示词。
    // 「我不知道她的肤色」拼进去就变成一句关于肤色的胡话。
    expect(attrs.skinTone).toBeUndefined()
    expect(attrs.hairColor).toBe('blue')
  })

  it('propagates a vision failure instead of returning a mushy freeform blob', async () => {
    // 收编前：解析失败 → `{ freeformDescription: 原文 }` → 建出一张字段全空的卡。
    mockAnalyzeVisual.mockRejectedValue(
      Object.assign(new Error('unusable analysis'), {
        errorCode: 'VISION_INVALID_OUTPUT',
      }),
    )

    await expect(
      extractCharacterAttributes('clerk_1', 'https://example.com/rei.png'),
    ).rejects.toThrow('unusable analysis')
  })
})

describe('listCharacterCards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
  })

  it('returns a list of cards for the user', async () => {
    mockFindMany.mockResolvedValue([FAKE_CARD])

    const result = await listCharacterCards('clerk_1')

    expect(result).toHaveLength(1)
    expect(result[0]?.name).toBe('Rei')
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'db_user_1', isDeleted: false, parentId: null },
      }),
    )
  })
})

describe('getCharacterCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
  })

  it('returns null when card belongs to another user', async () => {
    mockFindUnique.mockResolvedValue({
      ...FAKE_CARD,
      userId: 'other',
      variants: [],
    })

    const result = await getCharacterCard('clerk_1', 'card_1')

    expect(result).toBeNull()
  })
})

describe('deleteCharacterCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
  })

  it('soft-deletes and returns true', async () => {
    mockFindUnique.mockResolvedValue(FAKE_CARD)
    mockUpdate.mockResolvedValue({})

    const result = await deleteCharacterCard('clerk_1', 'card_1')

    expect(result).toBe(true)
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'card_1' },
      data: { isDeleted: true },
    })
  })

  it('returns false when not found', async () => {
    mockFindUnique.mockResolvedValue(null)

    const result = await deleteCharacterCard('clerk_1', 'missing')

    expect(result).toBe(false)
  })
})

describe('updateCharacterCard · 卡片总线 v3 双写（expand 期）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockUpdate.mockImplementation(async ({ data }) => ({
      ...FAKE_CARD,
      ...data,
      variants: [],
    }))
  })

  it('旧图列表一改，参考槽跟着重算（主图仍是身份槽）', async () => {
    mockFindUnique.mockResolvedValue({ ...FAKE_CARD, referenceRoles: null })
    await updateCharacterCard('clerk_1', 'card_1', {
      sourceImageEntries: [
        { url: 'https://example.com/side.png', viewType: 'side' },
      ],
      referenceRoles: { 'https://example.com/side.png': 'costume' },
    })
    const { data } = mockUpdate.mock.calls[0]![0]
    expect(data.referenceSlots).toEqual([
      expect.objectContaining({
        url: FAKE_CARD.sourceImageUrl,
        role: 'identity',
        isPrimary: true,
      }),
      expect.objectContaining({
        url: 'https://example.com/side.png',
        role: 'costume',
        viewType: 'side',
      }),
    ])
  })

  it('只改名字时不碰参考槽', async () => {
    mockFindUnique.mockResolvedValue(FAKE_CARD)
    await updateCharacterCard('clerk_1', 'card_1', { name: 'Rei 2' })
    expect(mockUpdate.mock.calls[0]![0].data).not.toHaveProperty(
      'referenceSlots',
    )
  })

  it('直接改参考槽：槽为准，旧图片列反向跟上，主图换了取那张图的对象键', async () => {
    mockFindUnique.mockResolvedValue(FAKE_CARD)
    mockGenerationFindFirst.mockResolvedValue({ storageKey: 'r2/new-main.png' })
    await updateCharacterCard('clerk_1', 'card_1', {
      referenceSlots: [
        {
          id: 'slot-2',
          role: 'identity',
          url: 'https://example.com/new-main.png',
          isPrimary: true,
          origin: 'upload',
          generationId: 'gen_9',
        },
        {
          id: 'slot-3',
          role: 'costume',
          url: 'https://example.com/refined.png',
          isPrimary: false,
          origin: 'refine',
        },
      ],
    })
    const { data } = mockUpdate.mock.calls[0]![0]
    expect(data.sourceImageUrl).toBe('https://example.com/new-main.png')
    expect(data.sourceStorageKey).toBe('r2/new-main.png')
    expect(data.sourceImages).toEqual(['https://example.com/new-main.png'])
    expect(data.referenceImages).toEqual(['https://example.com/refined.png'])
    expect(data.referenceRoles).toEqual({
      'https://example.com/refined.png': 'costume',
    })
    expect(data.referenceSlots).toHaveLength(2)
    expect(mockGenerationFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'gen_9', userId: FAKE_USER.id },
      }),
    )
  })

  it('扩展键按键合并：null 删键，⛔ 认不出的键原样保留；简介照写', async () => {
    mockFindUnique.mockResolvedValue({
      ...FAKE_CARD,
      extensions: { 'acme.keep': 1, 'pv.variants': ['a'] },
    })
    await updateCharacterCard('clerk_1', 'card_1', {
      summary: '雨夜里的侦探',
      extensions: { 'pv.variants': null, 'pv.note': 'x' },
    })
    const { data } = mockUpdate.mock.calls[0]![0]
    expect(data.extensions).toEqual({ 'acme.keep': 1, 'pv.note': 'x' })
    expect(data.summary).toBe('雨夜里的侦探')
  })
})

describe('createCharacterCard（角色页「新角色」只给名字）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockCount.mockResolvedValue(0)
    mockCardCreate.mockImplementation(({ data }: { data: object }) =>
      Promise.resolve({ ...FAKE_CARD, ...data, id: 'card_new' }),
    )
  })

  it('没有图 = 建一张空角色：⛔ 不上传、不看图、不联网；读出来没有主图', async () => {
    const card = await createCharacterCard('clerk_1', {
      name: '时夜',
      sourceImages: [],
    })

    expect(uploadToR2).not.toHaveBeenCalled()
    expect(mockAnalyzeVisual).not.toHaveBeenCalled()
    expect(mockCardCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: '时夜',
        handle: '时夜',
        referenceSlots: [],
        sourceImageUrl: '',
      }),
    })
    expect(card.sourceImageUrl).toBeNull()
    expect(card.referenceSlots).toEqual([])
    expect(card.sourceImages).toEqual([])
  })
})

describe('createCharacterCard（带图：看图、联网取材、合并属性）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockCount.mockResolvedValue(0)
    mockCardCreate.mockImplementation(({ data }: { data: object }) =>
      Promise.resolve({ ...FAKE_CARD, ...data, id: 'card_new' }),
    )
    mockAnalyzeVisual.mockResolvedValue({
      runId: 'run_1',
      task: VISION_TASKS.characterIdentity,
      grounded: false,
      observations: {
        task: VISION_TASKS.characterIdentity,
        identity: {
          hairColor: { label: 'hair', text: 'silver', basis: 'observation' },
        },
        variableLayer: {},
        summary: { label: 'summary', text: 'a pilot', basis: 'inference' },
        uncertainties: [],
      },
      conclusions: [],
      model: 'anthropic',
    })
    mockLlmCompletion.mockResolvedValue(
      JSON.stringify({ hairColor: 'silver', eyeColor: 'red' }),
    )
  })

  it('⭐ 没点名 key：取材与合并都用助手那一家、那个型号（⛔ 不是顺序里排第一的 Gemini）', async () => {
    seedAssistantRoute(keyStore, {
      keys: [
        assistantKey(AI_ADAPTER_TYPES.GEMINI),
        assistantKey(AI_ADAPTER_TYPES.ANTHROPIC),
      ],
      routeModel: LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5_5,
    })

    await createCharacterCard('clerk_1', {
      name: '时夜',
      sourceImages: ['data:image/png;base64,iVBORw0KGgo='],
    })

    // 联网取材（Claude 不支持 grounding → 这一步自己跳过）与合并属性各一次。
    expect(mockLlmCompletion).toHaveBeenCalled()
    for (const [input] of mockLlmCompletion.mock.calls) {
      expect(input).toMatchObject({
        modelId: LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5_5,
      })
    }
    expectSelectedProviderOnly(
      [
        ...keyLookupUsesOf(keyStore.findFirst),
        ...providerUsesOf(mockLlmCompletion, 'character card'),
      ],
      {
        adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
        apiKey: `plain:enc_${AI_ADAPTER_TYPES.ANTHROPIC}`,
      },
    )
  })
})

describe('createImportedCharacterCard（导入的酒馆卡，附录J ⑥）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockCount.mockResolvedValue(0)
    mockCardCreate.mockImplementation(({ data }: { data: object }) =>
      Promise.resolve({ ...FAKE_CARD, ...data, id: 'card_new' }),
    )
  })

  const imported = {
    name: '时夜',
    summary: '雨夜里的店主',
    tags: ['原创'],
    persona: {
      identity: '',
      behavior: '先替别人撑伞',
      speech: '',
      catchphrases: [],
      scenario: '雨夜的小店',
      opening: '欢迎光临。',
      examples: [{ user: '你好', reply: '嗯。' }],
      backstory: '{{char}} 开了一家店。',
    },
    extensions: { 'st.card': { spec: 'chara_card_v2' } },
  }

  it('有图：上 R2 当第一张参考图；设定、标签、扩展原样落库；⛔ 不看图', async () => {
    const card = await createImportedCharacterCard('clerk_1', imported, {
      data: Buffer.from([1, 2, 3]),
      mimeType: 'image/webp',
    })

    expect(uploadToR2).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: 'image/webp' }),
    )
    expect(mockAnalyzeVisual).not.toHaveBeenCalled()
    expect(mockCardCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: '时夜',
        summary: '雨夜里的店主',
        tags: ['原创'],
        sourceImageUrl: 'https://r2.example.com/abc.jpg',
        persona: imported.persona,
        extensions: { 'st.card': { spec: 'chara_card_v2' } },
      }),
    })
    expect(card.referenceSlots).toHaveLength(1)
  })

  it('JSON 卡没有图：不上传，建一张没有主图的角色', async () => {
    const card = await createImportedCharacterCard('clerk_1', imported, null)

    expect(uploadToR2).not.toHaveBeenCalled()
    expect(card.sourceImageUrl).toBeNull()
    expect(card.referenceSlots).toEqual([])
  })

  it('角色数到上限：带 i18nKey 的错，⛔ 不建卡', async () => {
    mockCount.mockResolvedValue(10_000)

    await expect(
      createImportedCharacterCard('clerk_1', imported, null),
    ).rejects.toMatchObject({ i18nKey: 'errors.tavernCard.limitReached' })
    expect(mockCardCreate).not.toHaveBeenCalled()
  })
})
