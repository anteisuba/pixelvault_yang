import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSISTANT_PERSONA_DEFAULTS } from '@/constants/assistant-persona'

const { queryRaw, findMany, keys, cards, loraGroups, loras, recipes } =
  vi.hoisted(() => ({
    queryRaw: vi.fn(),
    findMany: vi.fn(),
    keys: vi.fn(),
    cards: vi.fn(),
    loraGroups: vi.fn(),
    loras: vi.fn(),
    recipes: vi.fn(),
  }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  db: {
    $queryRaw: queryRaw,
    generation: { findMany },
    userApiKey: { findMany: keys },
  },
}))
vi.mock('@/services/assistant-skill.service', async () => {
  const { BUILTIN_SKILLS } = await import('@/features/assistant/skills')
  return { loadAssistantSkills: async () => BUILTIN_SKILLS }
})
vi.mock('@/services/cards/character-card.service', () => ({
  listCharacterCards: cards,
}))
vi.mock('@/services/cards/character-lora.service', () => ({
  listCharacterLoraGroups: loraGroups,
}))
vi.mock('@/services/lora-asset.service', () => ({
  listLoraAssetsForUser: loras,
  findLoraAssetsByUrls: vi.fn(async () => [
    { loraUrl: 'https://lora.test/malfoid.safetensors', name: 'malfoid' },
  ]),
}))
vi.mock('@/services/assistant-persona.service', () => ({
  getAssistantPersona: vi.fn(async () => ({
    ...ASSISTANT_PERSONA_DEFAULTS,
    verbosity: 'concise',
    character: null,
  })),
}))
vi.mock('@/services/project-rule.service', () => ({
  listProjectSourceRules: vi.fn(async () => [
    { id: 'r1', text: 'pinterest.com', kind: 'sourceDeny', scope: null },
  ]),
}))
vi.mock('@/services/prompts/recipe.service', () => ({
  listRecipeSummaries: recipes,
}))

import {
  benchAliases,
  findInWorkspace,
  openWorkspaceHandle,
  parseWorkspaceHandle,
} from './workspace.service'

const owner = { userId: 'user-1', clerkId: 'clerk-1', incognito: false }

const pictureRow = {
  id: 'gen-1624',
  seq: 1624,
  outputType: 'IMAGE',
  url: 'https://cdn.test/1624.png',
  thumbnailUrl: 'https://cdn.test/1624-thumb.png',
  prompt: '1girl, malfoid, platinum blonde hair, slytherin uniform',
  negativePrompt: 'lowres',
  model: 'anima',
  width: 832,
  height: 1216,
  seed: '42',
  createdAt: new Date('2026-10-21T10:00:00Z'),
  advancedParams: {
    steps: 28,
    guidanceScale: 4.5,
    loras: [{ url: 'https://lora.test/malfoid.safetensors', scale: 0.8 }],
  },
  referenceImages: ['https://cdn.test/1588.png'],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('编号认法', () => {
  it.each([
    ['图_1624', { kind: 'picture', prefix: '图', serial: 1624 }],
    ['@图_012·银发少女', { kind: 'picture', prefix: '图', serial: 12 }],
    ['视频_007', { kind: 'picture', prefix: '视频', serial: 7 }],
    ['角色·马尔福/冬装', { kind: 'character', name: '马尔福', look: '冬装' }],
    ['LoRA·malfoid', { kind: 'lora', name: 'malfoid' }],
    ['提示词·白底立绘', { kind: 'prompt', name: '白底立绘' }],
    ['对话·3F2a91bc', { kind: 'conversation', id: '3f2a91bc' }],
    ['技能·参考图分工', { kind: 'skill', name: '参考图分工' }],
    ['设置', { kind: 'settings' }],
  ])('%s', (raw, expected) => {
    expect(parseWorkspaceHandle(raw)).toEqual(expected)
  })

  it('台上的叫法交给台上那一套', () => {
    expect(parseWorkspaceHandle('ref-1')).toBeNull()
    expect(parseWorkspaceHandle('result-2')).toBeNull()
    expect(parseWorkspaceHandle('sample')).toBeNull()
  })
})

describe('按编号打开', () => {
  it('图：图本身 + 完整配方（LoRA 写名字与权重、参考图写编号）', async () => {
    queryRaw.mockResolvedValueOnce([pictureRow])
    findMany.mockResolvedValueOnce([
      {
        url: 'https://cdn.test/1588.png',
        thumbnailUrl: null,
        seq: 1588,
        outputType: 'IMAGE',
      },
    ])
    const opened = await openWorkspaceHandle(
      owner,
      parseWorkspaceHandle('图_1624')!,
    )
    expect(opened?.pictures).toEqual([
      {
        url: 'https://cdn.test/1624-thumb.png',
        label: '图_1624',
        generationId: 'gen-1624',
      },
    ])
    expect(opened?.text).toContain('1girl, malfoid')
    expect(opened?.text).toContain('Negative prompt: lowres')
    expect(opened?.text).toContain('CFG scale: 4.5')
    expect(opened?.text).toContain('LoRA·malfoid @ 0.8')
    expect(opened?.text).toContain('@Image1 = 图_1588')
  })

  it('她传上来的图：明说没有配方，⛔ 不让模型再翻', async () => {
    queryRaw.mockResolvedValueOnce([
      {
        ...pictureRow,
        seq: 1610,
        prompt: '',
        negativePrompt: null,
        model: 'user-upload',
        advancedParams: null,
        referenceImages: null,
      },
    ])
    const opened = await openWorkspaceHandle(
      owner,
      parseWorkspaceHandle('图_1610')!,
    )
    expect(opened?.text).toContain('Uploaded by the creator')
    expect(opened?.text).toContain('no recipe was recorded')
    expect(findMany).not.toHaveBeenCalled()
  })

  it('不存在的编号回 null（look 说清没找到）', async () => {
    queryRaw.mockResolvedValueOnce([])
    expect(
      await openWorkspaceHandle(owner, parseWorkspaceHandle('图_9999')!),
    ).toBeNull()
  })

  it('设置：只说配了哪些渠道，⛔ 不取密文与掩码', async () => {
    keys.mockResolvedValueOnce([
      {
        adapterType: 'anthropic',
        modelId: '',
        label: 'Claude',
        isActive: true,
      },
    ])
    const opened = await openWorkspaceHandle(owner, { kind: 'settings' })
    expect(opened?.text).toContain('Claude · anthropic')
    expect(opened?.text).toContain('verbosity: concise')
    expect(opened?.text).toContain('block: pinterest.com')
    const select = keys.mock.calls[0]![0].select
    expect(select).not.toHaveProperty('encryptedKey')
    expect(select).not.toHaveProperty('maskedKey')
  })

  it('技能按名字打开全文；没有这份就列出有哪些', async () => {
    const opened = await openWorkspaceHandle(
      owner,
      parseWorkspaceHandle('技能·标签模型写提示词')!,
    )
    expect(opened?.text).toMatch(/^SKILL 技能·标签模型写提示词/)
    expect(opened?.text).toContain('weight::tags::')
    const missing = await openWorkspaceHandle(owner, {
      kind: 'skill',
      name: '不存在',
    })
    expect(missing?.text).toContain('no such skill')
    expect(missing?.text).toContain('技能·参考图分工')
  })

  it('隐身时不打开以前的对话', async () => {
    const opened = await openWorkspaceHandle(
      { ...owner, incognito: true },
      { kind: 'conversation', id: '3f2a91bc' },
    )
    expect(opened?.text).toContain('Incognito')
    expect(queryRaw).not.toHaveBeenCalled()
  })
})

describe('查', () => {
  it('一类一段，带编号；对话标出哪个台、哪天，命中那一句带出来', async () => {
    queryRaw.mockResolvedValueOnce([pictureRow]).mockResolvedValueOnce([
      {
        id: '3f2a91bc-0000-4000-8000-000000000000',
        surface: 'LORA',
        title: '画风尝试',
        updatedAt: new Date('2026-10-21T08:00:00Z'),
        messages: [
          { role: 'user', content: '画风不对，试一下 ominaeshi 的画风' },
        ],
      },
    ])
    cards.mockResolvedValueOnce([
      {
        id: 'card-1',
        name: '马尔福',
        handle: 'malfoy',
        tags: [],
        generationCount: 12,
        looks: [{ label: '冬装', isDefault: true, tags: ['coat'] }],
      },
    ])
    const found = await findInWorkspace(owner, 'malfoid', [
      'pictures',
      'conversations',
    ])
    expect(found.text).toContain('PICTURES\n图_1624 · 2026-10-21 · anima')
    expect(found.text).toContain('对话·3f2a91bc · LoRA bench · 2026-10-21')
    expect(found.pictures[0]?.generationId).toBe('gen-1624')
  })

  it('一类查失败不拖垮其他几类', async () => {
    loras.mockRejectedValueOnce(new Error('db down'))
    recipes.mockResolvedValueOnce([
      {
        name: '白底立绘',
        compiledPrompt: '1girl, white background',
        modelId: 'anima',
      },
    ])
    const found = await findInWorkspace(owner, '白底', ['loras', 'prompts'])
    expect(found.text).toContain('LORAS: could not be searched right now.')
    expect(found.text).toContain('提示词·白底立绘')
  })
})

describe('台上的编号', () => {
  it('ref-N / result-N 各自是哪一张', async () => {
    findMany.mockResolvedValueOnce([
      {
        url: 'https://cdn.test/1588.png',
        thumbnailUrl: null,
        seq: 1588,
        outputType: 'IMAGE',
      },
    ])
    const line = await benchAliases('user-1', {
      references: { items: [{ url: 'https://cdn.test/1588.png' }], limit: 4 },
      results: [{ url: 'https://cdn.test/upload.png' }],
    } as never)
    expect(line).toBe('PICTURE NUMBERS ON THE BENCH: ref-1 = 图_1588')
  })
})
