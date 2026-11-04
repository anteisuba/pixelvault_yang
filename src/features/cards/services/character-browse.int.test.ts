/**
 * 角色出门逛一轮（`browseRound`）与看你贴的视频（`watchPinnedVideos`）。
 * 真库（L2a）：卡、见闻、表情包都是库里的行；B 站 / Civitai 索引 / Danbooru / Serper 搜图 /
 * YouTube oEmbed / 语义索引都替在 `fetch` 上（回包格式见 `fake-research-web.ts`），
 * 图片与视频的下载替在 R2 那一层（`fake-r2.ts`）。模型只假 `llm-text.service`（按系统提示认是哪一步）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: vi.fn(),
}))
vi.mock('@/services/storage/r2', async (importOriginal) =>
  (await import('@/test/int/fake-r2')).fakeR2Module(await importOriginal()),
)

type Step = 'plan' | 'screen' | 'notes' | 'watch'
type Call = {
  step: Step
  systemPrompt: string
  userPrompt: string
  imageData?: string[]
  videoData?: string
  videoAnalysis?: { fps: number; startOffset: number; endOffset: number }
}
const llm = vi.hoisted(() => ({
  queues: { plan: [], screen: [], notes: [], watch: [] } as Record<
    string,
    unknown[]
  >,
  calls: [] as Call[],
  /** 每次调用报的 token（`null` = 不报，按估的扣）。 */
  usage: null as null | { inputTokens: number; outputTokens: number },
  native: null as unknown,
}))
vi.mock('@/services/llm-text.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/llm-text.service')>()),
  llmNativeWebSearch: async () => llm.native,
  llmTextCompletion: async (
    input: Omit<Call, 'step'> & {
      onUsage?: (usage: { inputTokens: number; outputTokens: number }) => void
    },
  ) => {
    const prompt = input.systemPrompt
    const step: Step = prompt.includes('Today you have some free time online')
      ? 'plan'
      : prompt.includes('scrolling through what turned up')
        ? 'screen'
        : prompt.includes('watch this video') ||
            prompt.includes('watched this video')
          ? 'watch'
          : 'notes'
    llm.calls.push({ ...input, step })
    if (llm.usage) input.onUsage?.(llm.usage)
    const next = llm.queues[step]!.shift()
    if (next instanceof Error) throw next
    if (typeof next === 'string') return next
    if (next) return JSON.stringify(next)
    return JSON.stringify(
      step === 'plan'
        ? { queries: [] }
        : step === 'screen'
          ? { pick: [] }
          : step === 'watch'
            ? { note: null }
            : { notes: [] },
    )
  },
}))

import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { NODE_STUDIO_ASSISTANT_ROUTE_MODELS } from '@/constants/node-studio'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { db } from '@/lib/db'
import { createCanvas, encodeJpeg } from '@/lib/image-pixels'
import { resolveAssistantRoute } from '@/services/kernel/assistant-route.service'
import { resetResearchBreakers } from '@/services/research/connector-runtime'
import { resetDanbooruCatalogCache } from '@/services/research/danbooru.connector'
import { fetchAsBuffer } from '@/services/storage/r2'
import { seedAssistantKeys } from '@/test/int/assistant-keys'
import { createTestCard } from '@/test/int/cards'
import { createTestUser, resetDatabase } from '@/test/int/db'
import { FAKE_CDN, fakeBucket } from '@/test/int/fake-r2'
import {
  bilibiliBvid,
  bilibiliResponse,
  bilibiliVideo,
  danbooruResponse,
  emptyBilibiliWorld,
  emptyDanbooruWorld,
  type BilibiliWorld,
  type DanbooruWorld,
} from '@/test/int/fake-research-web'
import { RESEARCH_SOURCE_IDS } from '@/constants/research'

import {
  browseRound,
  OutingBudgetExhausted,
  OutingMeter,
  watchPinnedVideos,
} from './character-browse.service'

const GEMINI = LLM_TEXT_MODEL_IDS.GEMINI_3_8_FLASH
const OPENAI = NODE_STUDIO_ASSISTANT_ROUTE_MODELS[0].modelId
const SEMANTIC = 'https://semantic.test'
const YOUTUBE = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'

let user: Awaited<ReturnType<typeof createTestUser>>
let cardId = ''
let jpeg: Buffer

const web = {
  bilibili: emptyBilibiliWorld() as BilibiliWorld,
  danbooru: emptyDanbooruWorld() as DanbooruWorld,
  civitai: [] as string[],
  serperImages: [] as Record<string, unknown>[],
  serperQueries: [] as string[],
  /** 语义索引收到的正文。 */
  indexed: [] as string[],
  oembed: null as null | { title: string; author_name: string },
  /** 下不来的图 / 视频地址（结尾对得上就算）。 */
  broken: [] as string[],
}

function civitaiRow(name: string, id: number) {
  return {
    modelId: id,
    versionId: id * 10,
    versionName: 'v1',
    name,
    creator: null,
    creatorImage: null,
    nsfw: false,
    baseModel: 'Illustrious',
    tags: ['anime'],
    trainedWords: [],
    hashAutoV3: null,
    downloadCount: 10,
    thumbsUpCount: 1,
    images: [{ id, url: `https://image.civitai.com/x/${id}.jpeg` }],
    permissions: {
      allowCommercialUse: [],
      allowDerivatives: true,
      allowNoCredit: true,
    },
    createdAt: 0,
  }
}

async function fakeFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const url = input instanceof Request ? input.url : String(input)
  const { host } = new URL(url)
  if (host === 'api.bilibili.com') return bilibiliResponse(web.bilibili, url)
  if (host === 'danbooru.donmai.us') return danbooruResponse(web.danbooru, url)
  if (url.startsWith('https://civitai-index.test/search'))
    return Response.json({
      rows: web.civitai.map((name, n) => civitaiRow(name, n + 1)),
      total: web.civitai.length,
    })
  if (url === 'https://google.serper.dev/images') {
    web.serperQueries.push(
      (JSON.parse(String(init?.body ?? '{}')) as { q: string }).q,
    )
    return Response.json({ images: web.serperImages })
  }
  if (url.startsWith(SEMANTIC)) {
    web.indexed.push(String(init?.body ?? ''))
    return Response.json({ ok: true, stored: 1, results: [] })
  }
  if (url.startsWith('https://www.youtube.com/oembed'))
    return web.oembed
      ? Response.json(web.oembed)
      : new Response('no', { status: 404 })
  if (url.includes('/logs/')) return new Response(null, { status: 204 })
  return new Response('not found', { status: 404 })
}

beforeEach(async () => {
  await resetDatabase()
  fakeBucket.reset()
  resetResearchBreakers(Object.values(RESEARCH_SOURCE_IDS))
  resetDanbooruCatalogCache()
  llm.queues = { plan: [], screen: [], notes: [], watch: [] }
  llm.calls = []
  llm.usage = null
  llm.native = { status: 'ok', answer: '', queries: [], sources: [] }
  web.bilibili = emptyBilibiliWorld()
  web.danbooru = emptyDanbooruWorld()
  web.civitai = []
  web.serperImages = []
  web.serperQueries = []
  web.indexed = []
  web.oembed = null
  web.broken = []
  jpeg ??= await encodeJpeg(createCanvas(1600, 900, { r: 9, g: 9, b: 9 }), 80)
  vi.stubEnv('CIVITAI_INDEX_URL', 'https://civitai-index.test')
  vi.stubEnv('CIVITAI_INDEX_TOKEN', 'index-token')
  vi.stubEnv('SERPER_API_KEY', 'serper-test-key')
  vi.stubEnv('SEMANTIC_INDEX_URL', SEMANTIC)
  vi.stubEnv('SEMANTIC_INDEX_TOKEN', 'semantic-token')
  vi.stubGlobal('fetch', fakeFetch)
  // 图片 / 视频的下载：mp4 回视频字节，其余回一张真 JPEG；登记成下不来的报 403。
  vi.mocked(fetchAsBuffer).mockClear()
  vi.mocked(fetchAsBuffer).mockImplementation(async (url: string) => {
    if (url.startsWith('data:')) {
      const [, mime, b64] = url.match(/^data:([^;]+);base64,(.*)$/)!
      return { buffer: Buffer.from(b64!, 'base64'), mimeType: mime! }
    }
    if (web.broken.some((tail) => url.endsWith(tail)))
      throw new Error('Failed to fetch image (403)')
    if (url.startsWith(`${FAKE_CDN}/`)) {
      const stored = fakeBucket.objects.get(url.slice(FAKE_CDN.length + 1))
      if (stored) return { buffer: stored, mimeType: 'image/jpeg' }
    }
    if (url.endsWith('.mp4'))
      return { buffer: Buffer.from('mp4-bytes'), mimeType: 'video/mp4' }
    return { buffer: jpeg, mimeType: 'image/jpeg' }
  })
  fakeBucket.verifiedUpload = async ({ key }) => {
    fakeBucket.objects.set(key, jpeg)
    fakeBucket.uploads.push(key)
    return {
      publicUrl: `${FAKE_CDN}/${key}`,
      mimeType: 'image/jpeg',
      sizeBytes: jpeg.length,
    }
  }

  user = await createTestUser()
  await seedAssistantKeys(user.id, {
    keys: [
      { adapterType: AI_ADAPTER_TYPES.GEMINI },
      { adapterType: AI_ADAPTER_TYPES.OPENAI },
    ],
  })
  cardId = (
    await createTestCard(user.id, {
      name: 'Denia',
      tags: ['猫娘'],
      persona: { identity: '喜欢水彩和猫的画师' },
    })
  ).id
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const cardRow = () =>
  db.characterCard.findUniqueOrThrow({
    where: { id: cardId },
    select: {
      id: true,
      name: true,
      tags: true,
      persona: true,
      extensions: true,
      updatedAt: true,
    },
  })

/** 照这张卡、这个型号逛一轮。 */
async function browse(
  options: {
    meter?: OutingMeter
    sources?: string[]
    watch?: string[]
    model?: string
  } = {},
) {
  const route = await resolveAssistantRoute(user.id, {
    routeModel: options.model ?? GEMINI,
  })
  return browseRound({
    userId: user.id,
    card: await cardRow(),
    route: { ...route, meter: options.meter ?? new OutingMeter(10_000_000) },
    sources: options.sources ?? ['bilibili', 'danbooru', 'civitai', 'web'],
    watch: new Set(options.watch ?? []),
    askInterests: true,
    onNow: async () => {},
  })
}

const callsOf = (step: Step) => llm.calls.filter((call) => call.step === step)

const findings = () =>
  db.characterFinding.findMany({
    where: { characterCardId: cardId },
    orderBy: { url: 'asc' },
  })

function seenBefore(url: string, title = '旧的') {
  return db.characterFinding.create({
    data: {
      userId: user.id,
      characterCardId: cardId,
      source: 'bilibili',
      url,
      title,
      note: '看过',
      seenAt: new Date('2026-10-01T00:00:00Z'),
    },
  })
}

const videoUrl = (n: number) =>
  `https://www.bilibili.com/video/${bilibiliBvid(n)}`

/** B 站搜「水彩 猫」回 1–4 号稿件，中间夹一条搜索结果页；1 号以前看过。 */
async function catVideos(patch: Parameters<typeof bilibiliVideo>[1] = {}) {
  const videos = [1, 2, 3, 4].map((n) =>
    bilibiliVideo(n, {
      danmaku: ['好可爱', 'kksk'],
      comments: ['UP 主画得真好'],
      ...patch,
    }),
  )
  web.bilibili.videos = videos
  web.bilibili.search = () => [
    videos[0]!,
    videos[1]!,
    {
      title: '猫 - 搜索结果',
      arcurl: 'https://search.bilibili.com/all?keyword=%E7%8C%AB',
    },
    videos[2]!,
    videos[3]!,
  ]
  await seenBefore(videoUrl(1))
}

describe('browseRound（她出门逛一轮）', () => {
  it('她在意的东西照着找，回来自己加一样（记进人设）', async () => {
    await db.characterCard.update({
      where: { id: cardId },
      data: { persona: { identity: '画师', interests: ['水彩'] } },
    })
    llm.queues.plan!.push({
      queries: [{ source: 'bilibili', query: '水彩 猫' }],
      interests: { add: ['猫咖'], drop: [] },
    })

    await browse()

    const [plan] = callsOf('plan')
    expect(plan!.userPrompt).toContain('- 水彩')
    expect(plan!.systemPrompt).toContain('"interests"')
    const persona = (await cardRow()).persona as { interests: string[] }
    expect(persona.interests).toEqual(['水彩', '猫咖'])
  })

  it('钉住了：不问她加减，也不改', async () => {
    await db.characterCard.update({
      where: { id: cardId },
      data: {
        persona: { interests: ['水彩'] },
        extensions: { 'pv.pinnedFields': ['interests'] },
      },
    })
    llm.queues.plan!.push({
      queries: [{ source: 'bilibili', query: '水彩' }],
      interests: { add: ['猫咖'], drop: ['水彩'] },
    })

    await browse()

    expect(callsOf('plan')[0]!.systemPrompt).not.toContain('"interests"')
    const persona = (await cardRow()).persona as { interests: string[] }
    expect(persona.interests).toEqual(['水彩'])
  })

  it('看没看过的，没意思的不记；每次调模型都记进额度表；记下的进她那一区的索引', async () => {
    await catVideos()
    llm.queues.plan!.push({
      queries: [{ source: 'bilibili', query: '水彩 猫' }],
    })
    llm.queues.notes!.push({
      notes: [
        // 写长了的那条截断收下，⛔ 整份丢掉。
        { n: 1, note: '这只猫的晕染好软，想学' + '。'.repeat(300) },
        { n: 2, note: null },
        { n: 3, note: '配色好甜' },
      ],
    })
    const meter = new OutingMeter(10_000_000)

    const result = await browse({ meter })

    expect(meter.calls).toBe(2)
    expect(meter.usedTokens).toBeGreaterThan(0)
    // 看过的 1 号、搜索结果页去掉 → 看 2、3、4 号。
    const [viewed] = callsOf('notes')
    expect(viewed!.userPrompt).toContain('视频 2')
    expect(viewed!.userPrompt).not.toContain('视频 1')
    expect(viewed!.imageData).toHaveLength(3)
    // 关着「看视频」= 只看评论区：热评 + 弹幕（只喂模型）。
    expect(viewed!.userPrompt).toContain(
      'What people say: UP 主画得真好 / 好可爱 / kksk',
    )
    expect(callsOf('watch')).toEqual([])
    const kept = (await findings()).filter((row) => row.note !== '看过')
    expect(kept).toEqual([
      expect.objectContaining({
        userId: user.id,
        source: 'bilibili',
        url: videoUrl(2),
        note: expect.stringMatching(/^这只猫的晕染好软，想学。+$/),
      }),
      expect.objectContaining({
        url: videoUrl(4),
        title: '视频 4',
        note: '配色好甜',
      }),
    ])
    expect(web.indexed.join('\n')).toContain('配色好甜')
    expect(result).toMatchObject({ seen: 3, kept: 2 })
  })

  it('一批里有图取不到：去掉图只看标题再写，照样记下', async () => {
    await catVideos()
    llm.queues.plan!.push({
      queries: [{ source: 'bilibili', query: '水彩 猫' }],
    })
    llm.queues.notes!.push(new Error('reference_image_unreachable'), {
      notes: [{ n: 1, note: '标题就很可爱' }],
    })

    const result = await browse()

    const notes = callsOf('notes')
    expect(notes).toHaveLength(2)
    expect(notes[1]!.imageData).toBeUndefined()
    expect(result.kept).toBe(1)
  })

  it('取不到的那张图单独去掉，别的照样带图看；B 站封面带上 Referer', async () => {
    await catVideos()
    web.broken = ['/3.jpg']
    llm.queues.plan!.push({
      queries: [{ source: 'bilibili', query: '水彩 猫' }],
    })

    await browse()

    const [viewed] = callsOf('notes')
    expect(viewed!.imageData).toHaveLength(2)
    expect(viewed!.imageData![0]).toMatch(/^data:image\/jpeg;base64,/)
    expect(viewed!.userPrompt).toMatch(/视频 2 —[^\n]*\(picture attached\)/)
    expect(viewed!.userPrompt).not.toMatch(/视频 3 —[^\n]*\(picture attached\)/)
    expect(fetchAsBuffer).toHaveBeenCalledWith(
      'https://i0.hdslb.com/2.jpg',
      expect.objectContaining({ headers: { Referer: expect.any(String) } }),
    )
  })

  it('额度不够再调一次：一次都不调，直接收工（⛔ 超）', async () => {
    await expect(
      browse({ meter: new OutingMeter(100) }),
    ).rejects.toBeInstanceOf(OutingBudgetExhausted)
    expect(llm.calls).toEqual([])
  })

  it('provider 报了 token 就按报的扣', async () => {
    llm.usage = { inputTokens: 1000, outputTokens: 200 }
    const meter = new OutingMeter(10_000_000)

    await browse({ meter })

    expect(meter.usedTokens).toBe(1200)
    expect(meter.calls).toBe(1)
  })

  it('一个来源挂了不拖垮整趟', async () => {
    web.danbooru.down = true
    llm.queues.plan!.push({ queries: [{ source: 'danbooru', query: 'cat' }] })

    expect(await browse()).toMatchObject({ seen: 0, kept: 0 })
  })

  it('开着看视频（Gemini）：B 站下 360P 真看，一轮最多 2 个，剩下的照常一批看', async () => {
    await catVideos({ mp4: 'https://upos.test/v.mp4' })
    llm.queues.plan!.push({
      queries: [{ source: 'bilibili', query: '水彩 猫' }],
    })
    llm.queues.watch!.push({ note: '笔刷声好治愈' }, { note: null })
    llm.queues.notes!.push({ notes: [{ n: 1, note: '配色好甜' }] })
    const meter = new OutingMeter(10_000_000)

    await browse({ meter, sources: ['bilibili'], watch: ['bilibili'] })

    const watched = callsOf('watch')
    expect(watched).toHaveLength(2)
    expect(watched[0]!.videoData).toBe(
      `data:video/mp4;base64,${Buffer.from('mp4-bytes').toString('base64')}`,
    )
    expect(watched[0]!.videoAnalysis).toEqual({
      fps: 0.5,
      startOffset: 0,
      endOffset: 120,
    })
    expect(watched[0]!.userPrompt).toContain('UP 主画得真好')
    const [batch] = callsOf('notes')
    expect(batch!.userPrompt).toContain('视频 4')
    expect(batch!.userPrompt).not.toContain('视频 2')
    // 视频那份按秒估进额度表：120 s ×（0.5 帧 × 258 + 32）。
    expect(meter.usedTokens).toBeGreaterThan(2 * 120 * 161)
    const kept = (await findings()).filter((row) => row.note !== '看过')
    expect(kept.map((row) => [row.url, row.note])).toEqual([
      [videoUrl(2), '笔刷声好治愈'],
      [videoUrl(4), '配色好甜'],
    ])
  })

  it('额度不够看完一个视频：逛到的不看了，退回只看评论（⛔ 超）', async () => {
    await catVideos({ mp4: 'https://upos.test/v.mp4' })
    llm.queues.plan!.push({
      queries: [{ source: 'bilibili', query: '水彩 猫' }],
    })

    await browse({
      meter: new OutingMeter(15_000),
      sources: ['bilibili'],
      watch: ['bilibili'],
    })

    expect(callsOf('watch')).toEqual([])
    expect(fetchAsBuffer).not.toHaveBeenCalledWith(
      'https://upos.test/v.mp4',
      expect.anything(),
    )
  })

  it('网页里搜到 YouTube 视频：按 YouTube 的开关交给 Gemini 看', async () => {
    llm.native = {
      status: 'ok',
      answer: '',
      queries: [],
      sources: [
        { url: 'https://youtu.be/dQw4w9WgXcQ', title: '水彩教程', excerpt: '' },
      ],
    }
    llm.queues.plan!.push({ queries: [{ source: 'web', query: '水彩' }] })
    llm.queues.watch!.push({ note: '学到了' })

    await browse({ sources: ['web'], watch: ['youtube'] })

    expect(callsOf('watch')[0]!.videoData).toBe(YOUTUBE)
  })

  it('别家看得了图的模型：B 站换成分帧拼图细看', async () => {
    await catVideos({
      mp4: 'https://upos.test/v.mp4',
      frames: {
        images: ['//i0.hdslb.com/sheet.jpg'],
        columns: 10,
        rows: 10,
        times: Array.from({ length: 60 }, (_, n) => n * 2),
      },
    })
    llm.queues.plan!.push({
      queries: [{ source: 'bilibili', query: '水彩 猫' }],
    })

    await browse({ model: OPENAI, sources: ['bilibili'], watch: ['bilibili'] })

    expect(callsOf('watch')).toEqual([])
    expect(callsOf('notes')[0]!.userPrompt).toContain('(video frames attached)')
  })
})

describe('三级漏斗', () => {
  it('候选多时先用文字初筛挑几样细看，同一来源最多 3 样，最多记 5 条', async () => {
    const videos = Array.from({ length: 5 }, (_, n) => bilibiliVideo(n + 1))
    web.bilibili.videos = videos
    web.bilibili.search = () => videos
    web.civitai = Array.from({ length: 8 }, (_, n) => `风格 ${n + 1}`)
    llm.queues.plan!.push({
      queries: [
        { source: 'bilibili', query: '猫' },
        { source: 'civitai', query: '水彩' },
      ],
    })
    // 初筛：挑了 5 个 B 站的、3 个 Civitai 的 —— B 站超了 3 个的部分不算。
    llm.queues.screen!.push({ pick: [1, 2, 3, 4, 5, 6, 7, 8] })
    llm.queues.notes!.push({
      notes: Array.from({ length: 8 }, (_, n) => ({
        n: n + 1,
        note: `第 ${n + 1} 条`,
      })),
    })

    const result = await browse()

    const [screen] = callsOf('screen')
    expect(screen!.imageData).toBeUndefined()
    const [viewed] = callsOf('notes')
    const lines = viewed!.userPrompt
      .split('\n')
      .filter((l) => /^\d+\. /.test(l))
    expect(lines.filter((line) => line.includes('[bilibili]'))).toHaveLength(3)
    expect(viewed!.imageData).toHaveLength(lines.length)
    expect(result.kept).toBe(5)
    expect(await findings()).toHaveLength(5)
  })
})

describe('表情包（4d）', () => {
  beforeEach(() => {
    web.bilibili.videos = [bilibiliVideo(1), bilibiliVideo(2)]
    web.bilibili.search = (keyword) =>
      keyword === '狗' ? [web.bilibili.videos[1]!] : [web.bilibili.videos[0]!]
    web.serperImages = [
      {
        imageUrl: 'https://img.example/haoye.png',
        thumbnailUrl: 'https://thumb.example/haoye.jpg',
        title: '猫猫 好耶',
      },
    ]
  })

  const stickers = () =>
    db.characterSticker.findMany({ where: { characterCardId: cardId } })

  it('专门搜表情包：她把关收下的那张，下原图存进 R2 独立路径和表情包表', async () => {
    llm.queues.plan!.push({
      queries: [{ source: 'bilibili', query: '猫' }],
      sticker: '猫猫',
    })
    llm.queues.notes!.push({
      notes: [
        { n: 1, note: '笑死', sticker: null },
        { n: 2, note: null, sticker: '被夸的时候发' },
      ],
    })

    await browse()

    // 搜词自动补上「表情包」。
    expect(web.serperQueries).toEqual(['猫猫 表情包'])
    expect(fakeBucket.uploads).toHaveLength(1)
    expect(fakeBucket.uploads[0]).toMatch(
      new RegExp(`^characters/${user.id}/${cardId}/stickers/.+\\.png$`),
    )
    expect(await stickers()).toEqual([
      expect.objectContaining({
        userId: user.id,
        url: `${FAKE_CDN}/${fakeBucket.uploads[0]}`,
        sourceUrl: 'https://img.example/haoye.png',
        whenToUse: '被夸的时候发',
      }),
    ])
  })

  it('同一张图换个地址也认得出：已经有了就不收，刚传上去的删掉', async () => {
    const keep = {
      notes: [
        { n: 1, note: null, sticker: null },
        { n: 2, note: null, sticker: '被夸的时候发' },
      ],
    }
    llm.queues.plan!.push(
      { queries: [{ source: 'bilibili', query: '猫' }], sticker: '猫猫' },
      { queries: [{ source: 'bilibili', query: '狗' }], sticker: '猫猫' },
    )
    llm.queues.notes!.push(keep, keep)
    await browse()
    web.serperImages = [
      { ...web.serperImages[0], imageUrl: 'https://mirror.example/haoye.png' },
    ]

    await browse()

    expect(fakeBucket.uploads).toHaveLength(2)
    expect(await stickers()).toHaveLength(1)
    expect(fakeBucket.objects.has(fakeBucket.uploads[1]!)).toBe(false)
  })

  it('普通的图（视频封面）就算她标了也不收；表情包候选不写成见闻', async () => {
    llm.queues.plan!.push({
      queries: [{ source: 'bilibili', query: '猫' }],
      sticker: '猫猫 表情包',
    })
    llm.queues.notes!.push({
      notes: [
        { n: 1, note: '笑死', sticker: '想发' },
        { n: 2, note: '这张也好笑', sticker: null },
      ],
    })

    await browse()

    expect(fakeBucket.uploads).toEqual([])
    expect(await stickers()).toEqual([])
    expect((await findings()).map((row) => row.note)).toEqual(['笑死'])
  })
})

describe('watchPinnedVideos（你贴的视频，第 ⑥ 步）', () => {
  async function watchYoutube(
    options: {
      meter?: OutingMeter
      since?: Date
      start?: number
      end?: number
    } = {},
  ) {
    const route = await resolveAssistantRoute(user.id, { routeModel: GEMINI })
    const onNow = vi.fn(async () => {})
    const kept = await watchPinnedVideos({
      userId: user.id,
      card: { id: cardId, name: 'Denia', persona: {} },
      route: { ...route, meter: options.meter ?? new OutingMeter(10_000_000) },
      links: [
        {
          platform: 'youtube',
          url: YOUTUBE,
          ...(options.start !== undefined ? { start: options.start } : {}),
          ...(options.end !== undefined ? { end: options.end } : {}),
        },
      ],
      ...(options.since ? { since: options.since } : {}),
      onNow,
    })
    return { kept, onNow }
  }

  beforeEach(() => {
    web.oembed = { title: '水彩教程', author_name: 'Ann' }
  })

  it('YouTube 交给 Gemini 只看那一段，一定写一句，记成见闻', async () => {
    llm.queues.watch!.push({ note: '原来要先湿画' })

    const { kept, onNow } = await watchYoutube({ start: 180, end: 300 })

    expect(kept).toBe(1)
    expect(onNow).toHaveBeenCalledWith('youtube', '水彩教程')
    const [call] = callsOf('watch')
    expect(call!.videoData).toBe(YOUTUBE)
    expect(call!.videoAnalysis).toEqual({
      fps: 1,
      startOffset: 180,
      endOffset: 300,
    })
    expect(call!.systemPrompt).toContain('Always write the line')
    expect(await findings()).toEqual([
      expect.objectContaining({ source: 'youtube', note: '原来要先湿画' }),
    ])
  })

  it('额度不够看完：截短到够的那么长再看', async () => {
    llm.queues.watch!.push({ note: '只看了开头' })

    await watchYoutube({ meter: new OutingMeter(30_000) })

    const analysis = callsOf('watch')[0]!.videoAnalysis!
    // 30k 里扣掉提示词和回答那份，按每秒 290 token 算，看不满 30 分钟。
    expect(analysis.startOffset).toBe(0)
    expect(analysis.endOffset).toBeGreaterThan(20)
    expect(analysis.endOffset).toBeLessThan(100)
  })

  it('分段接着看：这一趟已经记过的那条跳过，剩下的照看', async () => {
    const since = new Date(Date.now() - 60_000)
    await db.characterFinding.create({
      data: {
        userId: user.id,
        characterCardId: cardId,
        source: 'youtube',
        url: YOUTUBE,
        title: '水彩教程',
        note: '上一段记的',
      },
    })

    const { kept } = await watchYoutube({ since })

    expect(kept).toBe(0)
    expect(llm.calls).toEqual([])
  })

  it('整段没看成（超时）：退回写一句，⛔ 整趟失败', async () => {
    llm.queues.watch!.push(
      new Error('The operation was aborted due to timeout'),
    )
    llm.queues.notes!.push({ notes: [{ n: 1, note: '标题看着就好看' }] })

    const { kept } = await watchYoutube()

    expect(llm.calls).toHaveLength(2)
    expect(kept).toBe(1)
  })
})
