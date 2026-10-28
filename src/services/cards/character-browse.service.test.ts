import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  cardFind: vi.fn(),
  cardUpdate: vi.fn(),
  cardFindMany: vi.fn(),
  findingCount: vi.fn(),
  findingFindMany: vi.fn(),
  findingCreateMany: vi.fn(),
  route: vi.fn(),
  complete: vi.fn(),
  bilibili: vi.fn(),
  danbooru: vi.fn(),
  civitai: vi.fn(),
  nativeSearch: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  db: {
    characterCard: {
      findFirst: mocks.cardFind,
      update: mocks.cardUpdate,
      findMany: mocks.cardFindMany,
    },
    characterFinding: {
      count: mocks.findingCount,
      findMany: mocks.findingFindMany,
      createMany: mocks.findingCreateMany,
    },
  },
}))
vi.mock('@/services/kernel/assistant-route.service', () => ({
  resolveAssistantRoute: mocks.route,
}))
vi.mock('@/services/kernel/assistant-completion.service', () => ({
  completeAssistantTextWithContextRetry: mocks.complete,
}))
vi.mock('@/services/research/bilibili.connector', () => ({
  fetchBilibiliEvidence: mocks.bilibili,
}))
vi.mock('@/services/research/danbooru.connector', () => ({
  fetchDanbooruEvidence: mocks.danbooru,
}))
vi.mock('@/services/civitai-lora-library.service', () => ({
  listCivitaiLoras: mocks.civitai,
}))
vi.mock('@/services/llm-text.service', () => ({
  llmNativeWebSearch: mocks.nativeSearch,
  supportsNativeWebSearch: () => true,
}))

import {
  browseCharacter,
  runDailyCharacterBrowse,
} from './character-browse.service'

const updatedAt = new Date('2026-10-01T00:00:00.000Z')

function video(n: number) {
  return {
    kind: 'video',
    id: `v${n}`,
    sourceId: 'bilibili',
    sourceTier: 'community',
    retrievedAt: '2026-10-28T00:00:00.000Z',
    title: `视频 ${n}`,
    videoUrl: `https://www.bilibili.com/video/BV${n}`,
    thumbnailUrl: `https://i0.hdslb.com/${n}.jpg`,
    site: 'bilibili',
  }
}

describe('browseCharacter（她出门逛一次）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.cardFind.mockResolvedValue({
      id: 'card-1',
      name: 'Denia',
      tags: ['猫娘'],
      persona: { identity: '喜欢水彩和猫的画师' },
      browseDailyLimit: 3,
      updatedAt,
    })
    mocks.findingCount.mockResolvedValue(0)
    mocks.findingFindMany
      .mockResolvedValueOnce([{ title: '旧的' }])
      .mockResolvedValueOnce([{ url: 'https://www.bilibili.com/video/BV1' }])
    mocks.route.mockResolvedValue({
      route: { adapterType: 'gemini', apiKey: 'k', providerConfig: {} },
      modelId: 'gemini-3.8-flash',
    })
    mocks.complete
      .mockResolvedValueOnce(
        JSON.stringify({
          queries: [{ source: 'bilibili', query: '水彩 猫' }],
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          notes: [
            { n: 1, note: '这只猫的晕染好软，想学' },
            { n: 2, note: null },
            { n: 3, note: '配色好甜' },
          ],
        }),
      )
    mocks.bilibili.mockResolvedValue({
      items: [video(1), video(2), video(3), video(4)],
    })
    mocks.findingCreateMany.mockResolvedValue({ count: 2 })
  })

  it('先记时间（不顶到列表最前），按额度看没看过的，没意思的不记', async () => {
    const result = await browseCharacter({ userId: 'u', cardId: 'card-1' })

    expect(mocks.cardUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { browsedAt: expect.any(Date), updatedAt },
      }),
    )
    // 看过的 BV1 去掉，额度 3 → 看 BV2、BV3、BV4
    const viewed = mocks.complete.mock.calls[1]?.[0] as {
      buildUserPrompt: () => string
      imageData: string[]
    }
    expect(viewed.buildUserPrompt()).toContain('视频 2')
    expect(viewed.buildUserPrompt()).not.toContain('视频 1')
    expect(viewed.imageData).toHaveLength(3)
    expect(mocks.findingCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: 'u',
          characterCardId: 'card-1',
          source: 'bilibili',
          url: 'https://www.bilibili.com/video/BV2',
          note: '这只猫的晕染好软，想学',
        }),
        expect.objectContaining({
          url: 'https://www.bilibili.com/video/BV4',
          note: '配色好甜',
        }),
      ],
      skipDuplicates: true,
    })
    expect(result).toEqual({ seen: 3, kept: 2 })
  })

  it('一批里有图取不到：去掉图只看标题再写，照样记下', async () => {
    mocks.complete.mockReset()
    mocks.complete
      .mockResolvedValueOnce(
        JSON.stringify({ queries: [{ source: 'bilibili', query: '水彩 猫' }] }),
      )
      .mockRejectedValueOnce(new Error('reference_image_unreachable'))
      .mockResolvedValueOnce(
        JSON.stringify({ notes: [{ n: 1, note: '标题就很可爱' }] }),
      )
    mocks.findingCreateMany.mockResolvedValue({ count: 1 })

    const result = await browseCharacter({ userId: 'u', cardId: 'card-1' })

    const retry = mocks.complete.mock.calls[2]?.[0] as { imageData?: string[] }
    expect(retry.imageData).toBeUndefined()
    expect(result.kept).toBe(1)
  })

  it('今天的额度用完就不出门', async () => {
    mocks.findingCount.mockResolvedValue(3)
    expect(await browseCharacter({ userId: 'u', cardId: 'card-1' })).toEqual({
      seen: 0,
      kept: 0,
    })
    expect(mocks.route).not.toHaveBeenCalled()
  })

  it('不是自己的卡、删了的卡什么都不做', async () => {
    mocks.cardFind.mockResolvedValue(null)
    expect(await browseCharacter({ userId: 'u', cardId: 'x' })).toEqual({
      seen: 0,
      kept: 0,
    })
    expect(mocks.cardUpdate).not.toHaveBeenCalled()
  })

  it('一个来源挂了不拖垮整趟', async () => {
    mocks.bilibili.mockRejectedValue(new Error('412'))
    expect(await browseCharacter({ userId: 'u', cardId: 'card-1' })).toEqual({
      seen: 0,
      kept: 0,
    })
  })
})

describe('runDailyCharacterBrowse（每天那一趟）', () => {
  it('只挑开着开关、今天没逛过、最近有来往的卡；一张出错照样往下走', async () => {
    vi.clearAllMocks()
    mocks.cardFindMany.mockResolvedValue([
      { id: 'a', userId: 'u1' },
      { id: 'b', userId: 'u2' },
    ])
    mocks.cardFind.mockRejectedValueOnce(new Error('boom'))
    mocks.cardFind.mockResolvedValueOnce(null)

    expect(await runDailyCharacterBrowse()).toEqual({
      cards: 2,
      kept: 0,
      left: 0,
    })
    const where = mocks.cardFindMany.mock.calls[0]?.[0]?.where
    expect(where).toMatchObject({ browseEnabled: true, isDeleted: false })
  })
})
