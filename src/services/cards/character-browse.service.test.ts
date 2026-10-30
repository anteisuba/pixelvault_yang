import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'

import { LLM_TEXT_MODEL_IDS } from '@/constants/config'

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
  stickerFindFirst: vi.fn(),
  stickerFindMany: vi.fn(),
  stickerDeleteMany: vi.fn(),
  comments: vi.fn(),
  route: vi.fn(),
  complete: vi.fn(),
  bilibili: vi.fn(),
  danbooru: vi.fn(),
  civitai: vi.fn(),
  nativeSearch: vi.fn(),
  findingUpsert: vi.fn(),
  videoInfo: vi.fn(),
  bilibiliComments: vi.fn(),
  downloadVideo: vi.fn(),
  framePicture: vi.fn(),
  oembed: vi.fn(),
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
      findFirst: mocks.stickerFindFirst,
      findMany: mocks.stickerFindMany,
      deleteMany: mocks.stickerDeleteMany,
    },
    characterFinding: {
      count: mocks.findingCount,
      findMany: mocks.findingFindMany,
      createManyAndReturn: mocks.findingCreateMany,
      deleteMany: mocks.findingDeleteMany,
      upsert: mocks.findingUpsert,
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
  fetchBilibiliVideoInfo: mocks.videoInfo,
  fetchBilibiliComments: mocks.bilibiliComments,
}))
vi.mock('./character-outing-video.service', async () => {
  const actual = await vi.importActual<
    typeof import('./character-outing-video.service')
  >('./character-outing-video.service')
  return {
    ...actual,
    downloadBilibiliVideo: mocks.downloadVideo,
    bilibiliFramePicture: mocks.framePicture,
    youtubeOembed: mocks.oembed,
  }
})
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
  browseRound,
  estimateCallTokens,
  nextInterests,
  normalizeOutingSite,
  OutingBudgetExhausted,
  OutingMeter,
  watchPinnedVideos,
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

/** 按卡（`mocks.cardFind`）和型号（`mocks.route`）逛一轮；额度默认够用。 */
async function browseCharacter(
  input: { userId: string; cardId: string },
  meter = new OutingMeter(10_000_000),
  sources: string[] = ['bilibili', 'danbooru', 'civitai', 'web'],
  watch: string[] = [],
) {
  const card = await mocks.cardFind()
  const route = await mocks.route(input.userId, {
    routeModel: card.browseModel,
  })
  const result = await browseRound({
    userId: input.userId,
    card: { extensions: null, ...card },
    route: { ...route, meter },
    sources,
    watch: new Set(watch),
    askInterests: true,
    onNow: async () => {},
  })
  return { seen: result.seen, kept: result.kept }
}

/** 前一个测试没用完的 once 队列会串过来：看视频这几个测试重新排一遍。 */
function freshFindings() {
  mocks.findingFindMany
    .mockReset()
    .mockResolvedValue([])
    .mockResolvedValueOnce([{ title: '旧的' }])
    .mockResolvedValueOnce([{ url: `https://www.bilibili.com/video/${bv(1)}` }])
}

describe('browseRound（她出门逛一轮）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.cardFind.mockResolvedValue({
      id: 'card-1',
      name: 'Denia',
      tags: ['猫娘'],
      persona: { identity: '喜欢水彩和猫的画师' },
      browseModel: LLM_TEXT_MODEL_IDS.GEMINI_3_8_FLASH,
      updatedAt,
    })
    mocks.findingCount.mockResolvedValue(0)
    mocks.danmaku.mockResolvedValue(['好可爱', 'kksk'])
    mocks.comments.mockResolvedValue([])
    mocks.videoInfo.mockImplementation(async (bvid: string) => ({
      bvid,
      aid: 1,
      cid: 2,
      duration: 120,
      title: bvid,
      cover: null,
      desc: '',
    }))
    mocks.bilibiliComments.mockResolvedValue(['UP 主画得真好'])
    mocks.downloadVideo.mockResolvedValue('data:video/mp4;base64,AAAA')
    mocks.framePicture.mockResolvedValue('data:image/jpeg;base64,BBBB')
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

  it('她在意的东西照着找，回来自己加一样（记进人设）', async () => {
    mocks.cardFind.mockResolvedValueOnce({
      id: 'card-1',
      name: 'Denia',
      tags: [],
      persona: { identity: '画师', interests: ['水彩'] },
      extensions: null,
      browseModel: LLM_TEXT_MODEL_IDS.GEMINI_3_8_FLASH,
      updatedAt,
    })
    mocks.complete.mockReset()
    mocks.complete
      .mockResolvedValueOnce(
        JSON.stringify({
          queries: [{ source: 'bilibili', query: '水彩 猫' }],
          interests: { add: ['猫咖'], drop: [] },
        }),
      )
      .mockResolvedValue(JSON.stringify({ notes: [] }))

    await browseCharacter({ userId: 'u', cardId: 'card-1' })

    const plan = mocks.complete.mock.calls[0]?.[0] as {
      buildUserPrompt(): string
      systemPrompt: string
    }
    expect(plan.buildUserPrompt()).toContain('- 水彩')
    expect(plan.systemPrompt).toContain('"interests"')
    expect(mocks.cardUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          persona: expect.objectContaining({ interests: ['水彩', '猫咖'] }),
          updatedAt,
        }),
      }),
    )
  })

  it('钉住了：不问她加减，也不改', async () => {
    mocks.cardFind.mockResolvedValueOnce({
      id: 'card-1',
      name: 'Denia',
      tags: [],
      persona: { interests: ['水彩'] },
      extensions: { 'pv.pinnedFields': ['interests'] },
      browseModel: LLM_TEXT_MODEL_IDS.GEMINI_3_8_FLASH,
      updatedAt,
    })
    mocks.complete.mockReset()
    mocks.complete
      .mockResolvedValueOnce(
        JSON.stringify({
          queries: [{ source: 'bilibili', query: '水彩' }],
          interests: { add: ['猫咖'], drop: ['水彩'] },
        }),
      )
      .mockResolvedValue(JSON.stringify({ notes: [] }))

    await browseCharacter({ userId: 'u', cardId: 'card-1' })

    const plan = mocks.complete.mock.calls[0]?.[0] as { systemPrompt: string }
    expect(plan.systemPrompt).not.toContain('"interests"')
    expect(
      mocks.cardUpdate.mock.calls.some(
        ([arg]) =>
          (arg as { data: object }).data &&
          'persona' in (arg as { data: object }).data,
      ),
    ).toBe(false)
  })

  it('看没看过的，没意思的不记；每次调模型都记进额度表', async () => {
    const meter = new OutingMeter(10_000_000)
    const result = await browseCharacter(
      { userId: 'u', cardId: 'card-1' },
      meter,
    )

    expect(meter.calls).toBe(2)
    expect(meter.usedTokens).toBeGreaterThan(0)
    // 看过的 BV1、搜索结果页去掉 → 看 BV2、BV3、BV4
    const viewed = mocks.complete.mock.calls[1]?.[0] as {
      buildUserPrompt: () => string
      imageData: string[]
    }
    expect(viewed.buildUserPrompt()).toContain('视频 2')
    expect(viewed.buildUserPrompt()).not.toContain('视频 1')
    expect(viewed.imageData).toHaveLength(3)
    // 细看时带上最热的弹幕（只喂模型）。
    // 关着「看视频」= 只看评论区：热评 + 弹幕（只喂模型）。
    expect(viewed.buildUserPrompt()).toContain(
      'What people say: UP 主画得真好 / 好可爱 / kksk',
    )
    expect(mocks.downloadVideo).not.toHaveBeenCalled()
    expect(mocks.framePicture).not.toHaveBeenCalled()
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

  it('额度不够再调一次：一次都不调，直接收工（⛔ 超）', async () => {
    await expect(
      browseCharacter({ userId: 'u', cardId: 'card-1' }, new OutingMeter(100)),
    ).rejects.toBeInstanceOf(OutingBudgetExhausted)
    expect(mocks.complete).not.toHaveBeenCalled()
  })

  it('provider 报了 token 就按报的扣', async () => {
    mocks.complete.mockReset()
    mocks.complete.mockImplementation(
      async (options: { onUsage?(usage: object): void }) => {
        options.onUsage?.({ inputTokens: 1000, outputTokens: 200 })
        return JSON.stringify({ queries: [] })
      },
    )
    const meter = new OutingMeter(10_000_000)
    await browseCharacter({ userId: 'u', cardId: 'card-1' }, meter)
    expect(meter.usedTokens).toBe(1200)
    expect(meter.calls).toBe(1)
  })

  it('一个来源挂了不拖垮整趟', async () => {
    mocks.bilibili.mockRejectedValue(new Error('412'))
    expect(await browseCharacter({ userId: 'u', cardId: 'card-1' })).toEqual({
      seen: 0,
      kept: 0,
    })
  })

  it('开着看视频（Gemini）：B 站下 360P 真看，一轮最多 2 个，剩下的照常一批看', async () => {
    freshFindings()
    mocks.complete.mockReset()
    mocks.complete
      .mockResolvedValueOnce(
        JSON.stringify({ queries: [{ source: 'bilibili', query: '水彩 猫' }] }),
      )
      .mockResolvedValueOnce(JSON.stringify({ note: '笔刷声好治愈' }))
      .mockResolvedValueOnce(JSON.stringify({ note: null }))
      .mockResolvedValueOnce(
        JSON.stringify({ notes: [{ n: 1, note: '配色好甜' }] }),
      )
    const meter = new OutingMeter(10_000_000)

    await browseCharacter(
      { userId: 'u', cardId: 'card-1' },
      meter,
      ['bilibili'],
      ['bilibili'],
    )

    const watched = mocks.complete.mock.calls[1]?.[0] as {
      videoData: string
      videoAnalysis: object
      buildUserPrompt(): string
    }
    expect(watched.videoData).toBe('data:video/mp4;base64,AAAA')
    expect(watched.videoAnalysis).toEqual({
      fps: 0.5,
      startOffset: 0,
      endOffset: 120,
    })
    expect(watched.buildUserPrompt()).toContain('UP 主画得真好')
    expect(mocks.downloadVideo).toHaveBeenCalledTimes(2)
    const batch = mocks.complete.mock.calls[3]?.[0] as {
      buildUserPrompt(): string
    }
    expect(batch.buildUserPrompt()).toContain('视频 4')
    expect(batch.buildUserPrompt()).not.toContain('视频 2')
    // 视频那份按秒估进额度表：120 s ×（0.5 帧 × 258 + 32）。
    expect(meter.usedTokens).toBeGreaterThan(2 * 120 * 161)
    expect(mocks.findingCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          url: `https://www.bilibili.com/video/${bv(2)}`,
          note: '笔刷声好治愈',
        }),
        expect.objectContaining({
          url: `https://www.bilibili.com/video/${bv(4)}`,
          note: '配色好甜',
        }),
      ],
      skipDuplicates: true,
      select: expect.any(Object),
    })
  })

  it('额度不够看完一个视频：逛到的不看了，退回只看评论（⛔ 超）', async () => {
    freshFindings()
    mocks.complete.mockReset()
    mocks.complete
      .mockResolvedValueOnce(
        JSON.stringify({ queries: [{ source: 'bilibili', query: '水彩 猫' }] }),
      )
      .mockResolvedValue(JSON.stringify({ notes: [] }))

    await browseCharacter(
      { userId: 'u', cardId: 'card-1' },
      new OutingMeter(15_000),
      ['bilibili'],
      ['bilibili'],
    )

    expect(mocks.downloadVideo).not.toHaveBeenCalled()
    expect(
      mocks.complete.mock.calls.some(
        ([arg]) => (arg as { videoData?: string }).videoData,
      ),
    ).toBe(false)
  })

  it('网页里搜到 YouTube 视频：按 YouTube 的开关交给 Gemini 看', async () => {
    freshFindings()
    mocks.nativeSearch.mockResolvedValue({
      status: 'ok',
      answer: '',
      queries: [],
      sources: [
        {
          url: 'https://youtu.be/dQw4w9WgXcQ',
          title: '水彩教程',
          excerpt: '',
        },
      ],
    })
    mocks.complete.mockReset()
    mocks.complete
      .mockResolvedValueOnce(
        JSON.stringify({ queries: [{ source: 'web', query: '水彩' }] }),
      )
      .mockResolvedValueOnce(JSON.stringify({ note: '学到了' }))
      .mockResolvedValue(JSON.stringify({ notes: [] }))

    await browseCharacter(
      { userId: 'u', cardId: 'card-1' },
      new OutingMeter(10_000_000),
      ['web'],
      ['youtube'],
    )

    const watched = mocks.complete.mock.calls[1]?.[0] as { videoData: string }
    expect(watched.videoData).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    )
  })

  it('别家看得了图的模型：B 站换成分帧拼图细看', async () => {
    freshFindings()
    mocks.route.mockResolvedValue({
      route: { adapterType: 'openai', apiKey: 'k', providerConfig: {} },
      modelId: undefined,
    })
    mocks.complete.mockReset()
    mocks.complete
      .mockResolvedValueOnce(
        JSON.stringify({ queries: [{ source: 'bilibili', query: '水彩 猫' }] }),
      )
      .mockResolvedValue(JSON.stringify({ notes: [] }))

    await browseCharacter(
      { userId: 'u', cardId: 'card-1' },
      new OutingMeter(10_000_000),
      ['bilibili'],
      ['bilibili'],
    )

    expect(mocks.downloadVideo).not.toHaveBeenCalled()
    expect(mocks.framePicture).toHaveBeenCalledWith(bv(2), expect.any(Object))
    const batch = mocks.complete.mock.calls[1]?.[0] as {
      buildUserPrompt(): string
    }
    expect(batch.buildUserPrompt()).toContain('(video frames attached)')
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
    mocks.stickerFindFirst.mockResolvedValue(null)
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

  it('同一张图换个地址也认得出：已经有了就不收，刚传上去的删掉', async () => {
    setup()
    mocks.stickerFindFirst.mockResolvedValue({ id: 'old' })
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
            { n: 1, note: null, sticker: null },
            { n: 2, note: null, sticker: '被夸的时候发' },
          ],
        }),
      )

    await browseCharacter({ userId: 'u', cardId: 'card-1' })

    expect(mocks.upload).toHaveBeenCalledTimes(1)
    expect(mocks.stickerCreate).not.toHaveBeenCalled()
    expect(mocks.deleteR2).toHaveBeenCalledWith(
      (mocks.upload.mock.calls[0]?.[0] as { key: string }).key,
    )
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

describe('watchPinnedVideos（你贴的视频，第 ⑥ 步）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findingUpsert.mockImplementation(async ({ create }) => ({
      id: 'f1',
      title: create.title,
      note: create.note,
      source: create.source,
    }))
    mocks.findingFindMany.mockResolvedValue([])
    mocks.oembed.mockResolvedValue({ title: '水彩教程', author: 'Ann' })
  })

  it('YouTube 交给 Gemini 只看那一段，一定写一句，记成见闻', async () => {
    mocks.complete.mockResolvedValueOnce(
      JSON.stringify({ note: '原来要先湿画' }),
    )
    const onNow = vi.fn(async () => {})
    const kept = await watchPinnedVideos({
      userId: 'u',
      card: { id: 'card-1', name: 'Denia', persona: {} },
      route: {
        route: {
          adapterType: 'gemini',
          apiKey: 'k',
          providerConfig: {},
        } as never,
        modelId: 'gemini-3.8-flash',
        meter: new OutingMeter(10_000_000),
      },
      links: [
        {
          platform: 'youtube',
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          start: 180,
          end: 300,
        },
      ],
      onNow,
    })

    expect(kept).toBe(1)
    expect(onNow).toHaveBeenCalledWith('youtube', '水彩教程')
    const call = mocks.complete.mock.calls[0]?.[0] as {
      videoData: string
      videoAnalysis: object
      systemPrompt: string
    }
    expect(call.videoData).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(call.videoAnalysis).toEqual({
      fps: 1,
      startOffset: 180,
      endOffset: 300,
    })
    expect(call.systemPrompt).toContain('Always write the line')
    expect(mocks.findingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          source: 'youtube',
          note: '原来要先湿画',
        }),
        update: expect.objectContaining({ note: '原来要先湿画' }),
      }),
    )
  })

  it('额度不够看完：截短到够的那么长再看', async () => {
    mocks.complete.mockResolvedValueOnce(JSON.stringify({ note: '只看了开头' }))
    await watchPinnedVideos({
      userId: 'u',
      card: { id: 'card-1', name: 'Denia', persona: {} },
      route: {
        route: {
          adapterType: 'gemini',
          apiKey: 'k',
          providerConfig: {},
        } as never,
        modelId: 'gemini-3.8-flash',
        meter: new OutingMeter(30_000),
      },
      links: [
        {
          platform: 'youtube',
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        },
      ],
      onNow: async () => {},
    })
    const call = mocks.complete.mock.calls[0]?.[0] as {
      videoAnalysis: { startOffset: number; endOffset: number }
    }
    // 30k 里扣掉提示词和回答那份，按每秒 290 token 算，看不满 30 分钟。
    expect(call.videoAnalysis.startOffset).toBe(0)
    expect(call.videoAnalysis.endOffset).toBeGreaterThan(20)
    expect(call.videoAnalysis.endOffset).toBeLessThan(100)
  })
})

describe('nextInterests（她在意的东西加减一次）', () => {
  it('去掉只认原样的、加的去重截短、封顶', () => {
    expect(
      nextInterests(['水彩', '猫'], {
        add: ['猫', '  胶片  '],
        drop: ['水彩'],
      }),
    ).toEqual(['猫', '胶片'])
    expect(nextInterests(['水彩'], { add: ['a', 'b', 'c'], drop: [] })).toEqual(
      ['水彩', 'a', 'b'],
    )
    expect(nextInterests(['水彩'], { add: [], drop: ['不在单上'] })).toBeNull()
    expect(nextInterests(['水彩'], null)).toBeNull()
  })
})

describe('额度表与网址', () => {
  it('估一次调用按字数 + 每张图 + 回答那份', () => {
    expect(
      estimateCallTokens({ systemPrompt: 'abc', userPrompt: 'de', images: 2 }),
    ).toBe(5 + 2 * 1600 + 1500)
  })

  it('估得超了就抛，实扣累加', () => {
    const meter = new OutingMeter(10_000, 9_000)
    expect(() => meter.ensure(1_001)).toThrow(OutingBudgetExhausted)
    meter.ensure(1_000)
    meter.charge(400)
    expect(meter.remaining()).toBe(600)
    expect(meter.calls).toBe(1)
  })

  it('你添加的网址规整成域名，认不出的丢掉', () => {
    expect(normalizeOutingSite('https://www.pixiv.net/ranking')).toBe(
      'pixiv.net',
    )
    expect(normalizeOutingSite('zhihu.com')).toBe('zhihu.com')
    expect(normalizeOutingSite('不是网址')).toBeNull()
    expect(normalizeOutingSite('')).toBeNull()
  })
})
