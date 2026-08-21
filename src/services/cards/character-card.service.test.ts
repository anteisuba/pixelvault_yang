import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockEnsureUser = vi.fn()
vi.mock('@/services/user.service', () => ({
  ensureUser: (...a: unknown[]) => mockEnsureUser(...a),
}))

vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: vi.fn(),
  resolveLlmTextRoute: vi.fn(),
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

vi.mock('@/lib/db', () => ({
  db: {
    characterCard: {
      findMany: (...a: unknown[]) => mockFindMany(...a),
      findUnique: (...a: unknown[]) => mockFindUnique(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
      count: (...a: unknown[]) => mockCount(...a),
      create: (...a: unknown[]) => mockCardCreate(...a),
    },
  },
}))

import {
  buildPromptFromAttributes,
  extractCharacterAttributes,
  listCharacterCards,
  getCharacterCard,
  deleteCharacterCard,
} from '@/services/cards/character-card.service'
import { VISION_TASKS } from '@/constants/vision'
import { ASSISTANT_SURFACE_IDS } from '@/types/assistant-conversation'
import type { CharacterAttributes } from '@/types'

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
      borrowedRoute: false,
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
      borrowedRoute: false,
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
