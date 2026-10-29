import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'

import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { ApiKeyError } from '@/lib/errors'

const mocks = vi.hoisted(() => ({
  cardFind: vi.fn(),
  cardUpdate: vi.fn(),
  cardFindMany: vi.fn(),
  findingCount: vi.fn(),
  findingFindMany: vi.fn(),
  findingCreateMany: vi.fn(),
  indexFindings: vi.fn(),
  forgetFindings: vi.fn(),
  findingDeleteMany: vi.fn(),
  danmaku: vi.fn(),
  imageSearch: vi.fn(),
  upload: vi.fn(),
  deleteR2: vi.fn(),
  stickerCreate: vi.fn(),
  stickerFindMany: vi.fn(),
  stickerDeleteMany: vi.fn(),
  comments: vi.fn(),
  route: vi.fn(),
  complete: vi.fn(),
  bilibili: vi.fn(),
  danbooru: vi.fn(),
  civitai: vi.fn(),
  nativeSearch: vi.fn(),
  fetchPicture: vi.fn<
    (
      url: string,
      options?: object,
    ) => Promise<{ buffer: Buffer; mimeType: string }>
  >(async () => ({
    buffer: Buffer.from('png'),
    mimeType: 'image/png',
  })),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  db: {
    characterCard: {
      findFirst: mocks.cardFind,
      update: mocks.cardUpdate,
      findMany: mocks.cardFindMany,
    },
    characterSticker: {
      create: mocks.stickerCreate,
      findMany: mocks.stickerFindMany,
      deleteMany: mocks.stickerDeleteMany,
    },
    characterFinding: {
      count: mocks.findingCount,
      findMany: mocks.findingFindMany,
      createManyAndReturn: mocks.findingCreateMany,
      deleteMany: mocks.findingDeleteMany,
    },
  },
}))
vi.mock('@/services/cards/character-findings.service', () => ({
  indexFindings: mocks.indexFindings,
  forgetFindings: mocks.forgetFindings,
}))
vi.mock('@/services/web-research.service', () => ({
  webImageSearch: mocks.imageSearch,
}))
vi.mock('@/services/storage/r2', () => ({
  uploadVerifiedHttpToR2: mocks.upload,
  deleteFromR2: mocks.deleteR2,
  fetchAsBuffer: mocks.fetchPicture,
}))
vi.mock('@/services/kernel/assistant-route.service', () => ({
  resolveAssistantRoute: mocks.route,
}))
vi.mock('@/services/kernel/assistant-completion.service', () => ({
  completeAssistantTextWithContextRetry: mocks.complete,
}))
vi.mock('@/services/research/bilibili.connector', () => ({
  fetchBilibiliEvidence: mocks.bilibili,
  fetchBilibiliDanmaku: mocks.danmaku,
}))
vi.mock('@/services/research/danbooru.connector', () => ({
  fetchDanbooruEvidence: mocks.danbooru,
  fetchDanbooruComments: mocks.comments,
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

/** 真实长度的 BV 号（BV + 10 位）。 */
function bv(n: number) {
  return `BV1aaaaaaaa${n}`
}

function video(n: number) {
  return {
    kind: 'video',
    id: `v${n}`,
    sourceId: 'bilibili',
    sourceTier: 'community',
    retrievedAt: '2026-10-28T00:00:00.000Z',
    title: `bilibili（经网搜）· 视频 ${n}`,
    videoUrl: `https://www.bilibili.com/video/${bv(n)}`,
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
      browseModel: LLM_TEXT_MODEL_IDS.GEMINI_3_8_FLASH,
      updatedAt,
    })
    mocks.findingCount.mockResolvedValue(0)
    mocks.danmaku.mockResolvedValue(['好可爱', 'kksk'])
    mocks.comments.mockResolvedValue([])
    mocks.findingFindMany
      .mockResolvedValue([])
      .mockResolvedValueOnce([{ title: '旧的' }])
      .mockResolvedValueOnce([
        { url: `https://www.bilibili.com/video/${bv(1)}` },
      ])
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
            // 写长了的那条截断收下，⛔ 整份丢掉。
            { n: 1, note: '这只猫的晕染好软，想学' + '。'.repeat(300) },
            { n: 2, note: null },
            { n: 3, note: '配色好甜' },
          ],
        }),
      )
    mocks.bilibili.mockResolvedValue({
      items: [
        video(1),
        video(2),
        // 网搜退路回来的搜索结果页：不是具体视频，不要。
        {
          ...video(9),
          videoUrl: 'https://search.bilibili.com/all?keyword=%E7%8C%AB',
        },
        video(3),
        video(4),
      ],
    })
    mocks.findingCreateMany.mockImplementation(({ data }) =>
      Promise.resolve(
        data.map((row: object, n: number) => ({ id: `f${n}`, ...row })),
      ),
    )
  })

  it('先记时间（不顶到列表最前），按额度看没看过的，没意思的不记', async () => {
    const result = await browseCharacter({ userId: 'u', cardId: 'card-1' })

    expect(mocks.cardUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          browsedAt: expect.any(Date),
          browsePausedReason: null,
          updatedAt,
        },
      }),
    )
    // 用她自己选的型号，⛔ 跟着助手变。
    expect(mocks.route).toHaveBeenCalledWith('u', {
      routeModel: LLM_TEXT_MODEL_IDS.GEMINI_3_8_FLASH,
    })
    // 看过的 BV1 去掉，额度 3 → 看 BV2、BV3、BV4
    const viewed = mocks.complete.mock.calls[1]?.[0] as {
      buildUserPrompt: () => string
      imageData: string[]
    }
    expect(viewed.buildUserPrompt()).toContain('视频 2')
    expect(viewed.buildUserPrompt()).not.toContain('视频 1')
    expect(viewed.imageData).toHaveLength(3)
    // 细看时带上最热的弹幕（只喂模型）。
    expect(viewed.buildUserPrompt()).toContain('What people say: 好可爱 / kksk')
    expect(mocks.findingCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: 'u',
          characterCardId: 'card-1',
          source: 'bilibili',
          url: `https://www.bilibili.com/video/${bv(2)}`,
          note: expect.stringMatching(/^这只猫的晕染好软，想学。+$/),
        }),
        expect.objectContaining({
          url: `https://www.bilibili.com/video/${bv(4)}`,
          title: '视频 4',
          note: '配色好甜',
        }),
      ],
      skipDuplicates: true,
      select: { id: true, title: true, note: true, source: true },
    })
    // 4c：写下的两条存进她自己那一区的索引。
    expect(mocks.indexFindings).toHaveBeenCalledWith(
      'card-1',
      expect.arrayContaining([expect.objectContaining({ id: 'f0' })]),
    )
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
    mocks.findingCreateMany.mockImplementation(({ data }) =>
      Promise.resolve(
        data.map((row: object, n: number) => ({ id: `f${n}`, ...row })),
      ),
    )

    const result = await browseCharacter({ userId: 'u', cardId: 'card-1' })

    const retry = mocks.complete.mock.calls[2]?.[0] as { imageData?: string[] }
    expect(retry.imageData).toBeUndefined()
    expect(result.kept).toBe(1)
  })

  it('取不到的那张图单独去掉，别的照样带图看；B 站封面带上 Referer', async () => {
    const reachable = mocks.fetchPicture.getMockImplementation()
    mocks.fetchPicture.mockImplementation(async (url: string) => {
      if (url.endsWith('/3.jpg')) throw new Error('Failed to fetch image (403)')
      return { buffer: Buffer.from('png'), mimeType: 'image/png' }
    })
    onTestFinished(() => {
      mocks.fetchPicture.mockImplementation(reachable!)
    })

    await browseCharacter({ userId: 'u', cardId: 'card-1' })

    const viewed = mocks.complete.mock.calls[1]?.[0] as {
      buildUserPrompt: () => string
      imageData: string[]
    }
    expect(viewed.imageData).toHaveLength(2)
    expect(viewed.imageData[0]).toMatch(/^data:image\/png;base64,/)
    expect(viewed.buildUserPrompt()).toMatch(/视频 2 \(picture attached\)/)
    expect(viewed.buildUserPrompt()).not.toMatch(/视频 3 \(picture attached\)/)
    expect(mocks.fetchPicture).toHaveBeenCalledWith(
      'https://i0.hdslb.com/2.jpg',
      expect.objectContaining({
        headers: { Referer: expect.any(String) },
      }),
    )
  })

  it.each([
    ['没选型号', { browseModel: null }, 'no_model'],
    ['型号已下架', { browseModel: 'retired-model-1' }, 'model_unavailable'],
  ])('%s：不出门，记下原因', async (_, patch, reason) => {
    mocks.cardFind.mockResolvedValue({
      ...(await mocks.cardFind()),
      ...patch,
    })
    expect(await browseCharacter({ userId: 'u', cardId: 'card-1' })).toEqual({
      seen: 0,
      kept: 0,
    })
    expect(mocks.cardUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ browsePausedReason: reason }),
      }),
    )
    expect(mocks.route).not.toHaveBeenCalled()
  })

  it('那一家的 key 没了：不出门、⛔ 换别家，记下 missing_key', async () => {
    mocks.route.mockRejectedValue(new ApiKeyError('missing'))
    expect(await browseCharacter({ userId: 'u', cardId: 'card-1' })).toEqual({
      seen: 0,
      kept: 0,
    })
    expect(mocks.cardUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ browsePausedReason: 'missing_key' }),
      }),
    )
    expect(mocks.complete).not.toHaveBeenCalled()
  })

  it('今天的额度用完就不出门', async () => {
    mocks.findingCount.mockResolvedValue(3)
    expect(await browseCharacter({ userId: 'u', cardId: 'card-1' })).toEqual({
      seen: 0,
      kept: 0,
    })
    expect(mocks.complete).not.toHaveBeenCalled()
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

describe('三级漏斗', () => {
  it('候选多时先用文字初筛挑 8 样，同一来源最多 3 样，最多记 5 条', async () => {
    vi.clearAllMocks()
    // 前面几条用不完的排队回答别串过来。
    mocks.complete.mockReset()
    mocks.cardFind.mockResolvedValue({
      id: 'card-1',
      name: 'Denia',
      tags: [],
      persona: {},
      browseDailyLimit: 20,
      browseModel: LLM_TEXT_MODEL_IDS.GEMINI_3_8_FLASH,
      updatedAt,
    })
    mocks.findingCount.mockResolvedValue(0)
    mocks.findingFindMany.mockResolvedValue([])
    mocks.route.mockResolvedValue({
      route: { adapterType: 'gemini', apiKey: 'k', providerConfig: {} },
      modelId: 'gemini-3.8-flash',
    })
    mocks.danmaku.mockResolvedValue([])
    mocks.bilibili.mockResolvedValue({
      items: Array.from({ length: 8 }, (_, n) => video(n + 1)),
    })
    mocks.civitai.mockResolvedValue({
      items: Array.from({ length: 8 }, (_, n) => ({
        name: `风格 ${n + 1}`,
        modelPageUrl: `https://civitai.com/models/${n + 1}`,
        thumbImageUrl: `https://image.civitai.com/${n + 1}.jpg`,
        coverImageUrlOriginal: null,
        tags: ['anime'],
      })),
    })
    mocks.complete
      .mockResolvedValueOnce(
        JSON.stringify({
          queries: [
            { source: 'bilibili', query: '猫' },
            { source: 'civitai', query: '水彩' },
          ],
        }),
      )
      // 初筛：挑了 5 个 B 站的、3 个 Civitai 的 —— B 站超了 3 个的部分由别的补上。
      .mockResolvedValueOnce(
        JSON.stringify({ pick: [1, 2, 3, 4, 5, 9, 10, 11] }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          notes: Array.from({ length: 8 }, (_, n) => ({
            n: n + 1,
            note: `第 ${n + 1} 条`,
          })),
        }),
      )
    mocks.findingCreateMany.mockImplementation(({ data }) =>
      Promise.resolve(
        data.map((row: object, n: number) => ({ id: `f${n}`, ...row })),
      ),
    )

    const result = await browseCharacter({ userId: 'u', cardId: 'card-1' })

    const screen = mocks.complete.mock.calls[1]?.[0] as {
      callLog: { purpose: string }
      imageData?: string[]
    }
    expect(screen.callLog.purpose).toBe('characterBrowseScreen')
    expect(screen.imageData).toBeUndefined()
    const viewed = mocks.complete.mock.calls[2]?.[0] as { imageData: string[] }
    expect(viewed.imageData).toHaveLength(6)
    expect(result).toEqual({ seen: 6, kept: 5 })
  })
})

describe('表情包（4d）', () => {
  function setup() {
    vi.clearAllMocks()
    // 前面几条排队没用完的回答别串过来。
    mocks.complete.mockReset()
    mocks.findingFindMany.mockReset()
    mocks.findingCreateMany.mockReset()
    mocks.cardFind.mockResolvedValue({
      id: 'card-1',
      name: 'Denia',
      tags: [],
      persona: {},
      browseDailyLimit: 20,
      browseModel: LLM_TEXT_MODEL_IDS.GEMINI_3_8_FLASH,
      updatedAt,
    })
    mocks.findingCount.mockResolvedValue(0)
    mocks.findingFindMany.mockResolvedValue([])
    mocks.route.mockResolvedValue({
      route: { adapterType: 'gemini', apiKey: 'k', providerConfig: {} },
      modelId: 'gemini-3.8-flash',
    })
    mocks.danmaku.mockResolvedValue([])
    mocks.bilibili.mockResolvedValue({ items: [video(1)] })
    mocks.findingCreateMany.mockResolvedValue([])
    mocks.upload.mockResolvedValue({
      publicUrl: 'https://cdn.example/s.png',
      mimeType: 'image/png',
      sizeBytes: 100,
    })
    mocks.stickerFindMany.mockResolvedValue([])
    mocks.imageSearch.mockResolvedValue([
      {
        imageUrl: 'https://img.example/haoye.png',
        thumbnailUrl: 'https://thumb.example/haoye.jpg',
        title: '猫猫 好耶',
      },
    ])
  }

  it('专门搜表情包：她把关收下的那张，下原图存进 R2 独立路径和表情包表', async () => {
    setup()
    mocks.complete
      .mockResolvedValueOnce(
        JSON.stringify({
          queries: [{ source: 'bilibili', query: '猫' }],
          sticker: '猫猫',
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          notes: [
            { n: 1, note: '笑死', sticker: null },
            { n: 2, note: null, sticker: '被夸的时候发' },
          ],
        }),
      )

    await browseCharacter({ userId: 'u', cardId: 'card-1' })

    // 搜词自动补上「表情包」。
    expect(mocks.imageSearch).toHaveBeenCalledWith('猫猫 表情包', {
      num: 10,
    })
    const upload = mocks.upload.mock.calls[0]?.[0] as {
      key: string
      sourceUrl: string
    }
    expect(upload.sourceUrl).toBe('https://img.example/haoye.png')
    expect(upload.key).toMatch(/^characters\/u\/card-1\/stickers\/.+\.png$/)
    expect(mocks.stickerCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u',
        characterCardId: 'card-1',
        url: 'https://cdn.example/s.png',
        whenToUse: '被夸的时候发',
      }),
    })
  })

  it('普通的图（视频封面）就算她标了也不收；表情包候选不写成见闻', async () => {
    setup()
    mocks.complete
      .mockResolvedValueOnce(
        JSON.stringify({
          queries: [{ source: 'bilibili', query: '猫' }],
          sticker: '猫猫 表情包',
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          notes: [
            { n: 1, note: '笑死', sticker: '想发' },
            { n: 2, note: '这张也好笑', sticker: null },
          ],
        }),
      )
    mocks.findingCreateMany.mockImplementation(({ data }) =>
      Promise.resolve(
        data.map((row: object, n: number) => ({ id: `f${n}`, ...row })),
      ),
    )

    await browseCharacter({ userId: 'u', cardId: 'card-1' })

    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.stickerCreate).not.toHaveBeenCalled()
    const written = mocks.findingCreateMany.mock.calls[0]?.[0] as {
      data: { note: string }[]
    }
    expect(written.data.map((row) => row.note)).toEqual(['笑死'])
  })
})

describe('runDailyCharacterBrowse（每天那一趟）', () => {
  it('出门超过 7 天、7 天里一条见闻都没被想起：隔天才出门', async () => {
    vi.clearAllMocks()
    mocks.findingFindMany.mockReset().mockResolvedValue([])
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    mocks.cardFindMany.mockResolvedValue([
      { id: 'idle', userId: 'u1', browsedAt: yesterday },
      { id: 'liked', userId: 'u1', browsedAt: yesterday },
      { id: 'new', userId: 'u1', browsedAt: yesterday },
    ])
    mocks.findingFindMany
      .mockResolvedValueOnce([
        { characterCardId: 'idle' },
        { characterCardId: 'liked' },
      ])
      .mockResolvedValueOnce([{ characterCardId: 'liked' }])
    mocks.cardFind.mockResolvedValue(null)

    expect(await runDailyCharacterBrowse()).toEqual({
      cards: 2,
      kept: 0,
      left: 0,
    })
  })

  it('一个人最多带 3 张卡出门', async () => {
    vi.clearAllMocks()
    mocks.cardFindMany.mockResolvedValue([
      { id: 'a1', userId: 'u1' },
      { id: 'a2', userId: 'u1' },
      { id: 'b1', userId: 'u2' },
      { id: 'a3', userId: 'u1' },
      { id: 'a4', userId: 'u1' },
    ])
    mocks.cardFind.mockResolvedValue(null)
    expect(await runDailyCharacterBrowse()).toEqual({
      cards: 4,
      kept: 0,
      left: 0,
    })
  })

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
