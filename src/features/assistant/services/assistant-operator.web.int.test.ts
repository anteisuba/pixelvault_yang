/**
 * 旧内核上网的那几条（`planTool`）：找图、查证快读、找视频。真库（L2a）；真连接器、真归并、
 * 真来源名单；只假模型那一跳（`fake-llm-text.ts`）与网络（`fetch`：Serper / 维基 / Danbooru /
 * B 站 / Jina 按主机回包）。⛔ 一个真请求都不发。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: vi.fn(),
}))
vi.mock('@/services/llm-text.service', async (importOriginal) =>
  (await import('@/test/int/fake-llm-text')).fakeLlmTextModule(
    await importOriginal(),
  ),
)

import {
  ASSISTANT_OPERATOR_LIMITS,
  ASSISTANT_OPERATOR_REJECT_REASON_IDS,
  ASSISTANT_OPERATOR_TOOL_IDS,
  ASSISTANT_RESEARCH_LIMITS,
  ASSISTANT_WEB_FIND_LIMITS,
} from '@/constants/assistant-operator'
import { RESEARCH_SOURCE_IDS } from '@/constants/research'
import type { AssistantOperatorRequest } from '@/types/assistant-operator'
import { resetReadHostBlocks } from '@/lib/read-url-blocks'
import {
  planTool,
  prepareOperatorTurn,
} from '@/features/assistant/services/assistant-operator.service'
import { addProjectRule } from '@/services/project-rule.service'
import { resetResearchBreakers } from '@/services/research/connector-runtime'
import { resetDanbooruCatalogCache } from '@/services/research/danbooru.connector'
import {
  canvasProject,
  LORA_SNAPSHOT,
  operatorRequest,
  operatorUser,
  type OperatorUser,
} from '@/test/assistant-bench/operator-plan'
import { resetDatabase } from '@/test/int/db'
import { fakeLlm } from '@/test/int/fake-llm-text'
import {
  bilibiliResponse,
  danbooruResponse,
  emptyBilibiliWorld,
  emptyDanbooruWorld,
  type BilibiliWorld,
  type FakeBilibiliVideo,
} from '@/test/int/fake-research-web'

// ─── 假的外网 ─────────────────────────────────────────────────────

interface SerperImage {
  imageUrl: string
  thumbnailUrl?: string
  link?: string
  domain?: string
}

interface SerperVideo {
  link: string
  title: string
  channel?: string
  duration?: string
  imageUrl?: string
}

const web = {
  images: [] as SerperImage[],
  organic: [] as { title: string; link: string; snippet: string }[],
  videos: [] as SerperVideo[],
  bilibili: emptyBilibiliWorld() as BilibiliWorld,
  /** Jina 读到的正文（按页地址）。 */
  pages: (() => null) as (url: string) => string | null,
  /** 发出去的每个请求（完整 URL）。 */
  requests: [] as string[],
}

const hostsHit = () => web.requests.map((url) => new URL(url).host)

function wikiResponse(url: string): Response {
  const action = new URL(url).searchParams.get('action')
  const search = new URL(url).searchParams.get('search') ?? ''
  return Response.json(
    action === 'opensearch' ? [search, [], [], []] : { query: { pages: [] } },
  )
}

async function fakeFetch(input: string | URL | Request): Promise<Response> {
  const url = input instanceof Request ? input.url : String(input)
  web.requests.push(url)
  const { host, pathname } = new URL(url)
  if (host === 'google.serper.dev') {
    if (pathname === '/images') return Response.json({ images: web.images })
    if (pathname === '/videos') return Response.json({ videos: web.videos })
    return Response.json({ organic: web.organic })
  }
  if (host === 'r.jina.ai') {
    const body = web.pages(url.slice('https://r.jina.ai/'.length))
    return body
      ? new Response(`Title: page\n\nMarkdown Content:\n${body}`)
      : new Response('not found', { status: 404 })
  }
  if (
    host.endsWith('moegirl.org.cn') ||
    host.endsWith('wikipedia.org') ||
    host.endsWith('fandom.com')
  )
    return wikiResponse(url)
  if (host === 'danbooru.donmai.us')
    return danbooruResponse(emptyDanbooruWorld(), url)
  if (host === 'api.bilibili.com') return bilibiliResponse(web.bilibili, url)
  return new Response('forbidden', { status: 403 })
}

let user: OperatorUser

beforeEach(async () => {
  await resetDatabase()
  fakeLlm.reset()
  resetResearchBreakers(Object.values(RESEARCH_SOURCE_IDS))
  resetDanbooruCatalogCache()
  resetReadHostBlocks()
  web.images = []
  web.organic = []
  web.videos = []
  web.bilibili = emptyBilibiliWorld()
  web.pages = () => null
  web.requests = []
  vi.stubEnv('SERPER_API_KEY', 'serper-test-key')
  vi.stubGlobal('fetch', vi.fn(fakeFetch))
  user = await operatorUser()
})

function prepare(request: AssistantOperatorRequest) {
  return prepareOperatorTurn(
    user.clerkId,
    request,
    new AbortController().signal,
  )
}

async function readTool(
  prepared: Awaited<ReturnType<typeof prepare>>,
  tool: (typeof ASSISTANT_OPERATOR_TOOL_IDS)[keyof typeof ASSISTANT_OPERATOR_TOOL_IDS],
  args: Record<string, unknown>,
) {
  const plan = await planTool(
    prepared.run,
    tool as never,
    args as never,
    prepared.user.id,
  )
  if (plan.kind !== 'read') throw new Error(`expected read, got ${plan.kind}`)
  return plan
}

// ─── 找图 ─────────────────────────────────────────────────────────

const CARDS_SNAPSHOT = {
  prompt: '',
  availableModels: [],
  cards: {
    total: 1,
    characters: [
      {
        id: 'denia',
        name: 'Denia',
        work: '鸣潮',
        imageCount: 1,
        hasProfile: false,
      },
    ],
    open: {
      id: 'denia',
      name: 'Denia',
      work: '鸣潮',
      imageCount: 1,
      hasProfile: false,
      look: '',
      identity: '',
      behavior: '',
      speech: '',
      backstory: '',
      boundaries: '',
      catchphrases: '',
      scenario: '',
      opening: '',
      examples: '',
      tags: [],
      otherLooks: [],
      imagesOnCard: 1,
      primaryImageUrl: 'https://cdn.example.test/main.png',
    },
  },
}

describe('search_web_images', () => {
  /**
   * ⭐ v3（`mainModelLooks`）：缩略图交给主模型自己看，这一跳**只搜、只列**：⛔ 不起看缩略图的
   * 子调用（不取缩略图、不问模型）、⛔ 观察里不说看没看过、⛔ 不按判词静默丢掉要交的图。
   */
  it('⭐ v3 角色页：搜图不起看图子调用、不写判词，交图按编号、一张都不悄悄丢', async () => {
    web.images = [
      {
        imageUrl: 'https://cdn.example.test/denia.jpg',
        thumbnailUrl: 'https://encrypted-tbn0.gstatic.test/d.jpg',
        link: 'https://example.test/denia',
        domain: 'example.test',
      },
      {
        imageUrl: 'https://cdn.example.test/other.jpg',
        thumbnailUrl: 'https://encrypted-tbn0.gstatic.test/o.jpg',
        link: 'https://example.test/other',
        domain: 'example.test',
      },
    ]
    const prepared = await prepare(
      operatorRequest({ domain: 'cards', snapshot: CARDS_SNAPSHOT }),
    )
    prepared.run.mainModelLooks = true
    fakeLlm.calls = []

    const search = await readTool(
      prepared,
      ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages,
      { query: 'denia' },
    )
    const { observation } = await search.run()

    expect(fakeLlm.calls).toEqual([])
    expect(hostsHit()).not.toContain('encrypted-tbn0.gstatic.test')
    expect(observation).toContain('#2 · example.test · usable as reference')
    expect(observation).toContain('propose them by number ("#2")')
    expect(observation).not.toContain('https://')
    for (const verdictWord of [
      'LOOKED',
      'NOT VIEWED',
      'could NOT look',
      'seen:',
    ])
      expect(observation).not.toContain(verdictWord)
    expect(prepared.run.webImageVision.size).toBe(0)
  })

  describe('观察只指够得着的路（画布与 v3 的 LoRA 台没有 import_url）', () => {
    beforeEach(() => {
      web.images = [
        { imageUrl: 'https://cdn.example.test/a.jpg', domain: 'example.test' },
      ]
    })

    async function observe(request: AssistantOperatorRequest, v3 = false) {
      const prepared = await prepare(request)
      if (v3) prepared.run.mainModelLooks = true
      const plan = await readTool(
        prepared,
        ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages,
        { query: 'wet asphalt' },
      )
      return (await plan.run()).observation
    }

    it('图片台照旧：两条路（「选用」或 import_user_url）', async () => {
      expect(await observe(operatorRequest())).toContain('import_user_url')
    })

    it('画布：⛔ 不提 import_user_url，只说「选用」', async () => {
      const projectId = await canvasProject(user.id)
      const observation = await observe(
        operatorRequest(
          {
            domain: 'canvas',
            snapshot: {
              prompt: '',
              availableModels: [],
              canvas: { currentShotNo: null, selectedNodeIds: [], shots: [] },
            },
          },
          projectId,
        ),
      )
      expect(observation).not.toContain('import_user_url')
      expect(observation).toContain('"use this"')
    })

    it('v3 的 LoRA 台：⛔ 不提 import_user_url', async () => {
      const observation = await observe(
        operatorRequest({ domain: 'lora', snapshot: LORA_SNAPSHOT }),
        true,
      )
      expect(observation).not.toContain('import_user_url')
      expect(observation).toContain('"use this"')
    })
  })
})

// ─── 查证 ─────────────────────────────────────────────────────────

describe('research（查证快读）', () => {
  /**
   * ⭐ 短版（搜索期第三片）：整段只给紧跟着的那一步；`compact` 一行一条「[n] 标题 · 域名 · 一句话」，
   * 号与整段里的一样，要全文 `read "[n]"`。
   */
  it('⭐ 快搜满载（6 条摘要 + 3 页全文）：短版一行一条，⛔ 不带摘录与地址，长度压到整段的零头', async () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f']
    web.organic = ids.map((id, index) => ({
      title: `来源 ${id} · 时夜的外貌与服饰`,
      link: `https://site-${id}.test/shiye`,
      snippet:
        `第 ${index + 1} 条：${'黑色长发，金色瞳孔，改良中式长衫。'.repeat(20)}`.slice(
          0,
          ASSISTANT_RESEARCH_LIMITS.maxEvidenceSnippetChars,
        ),
    }))
    // 记号放在一句话摘要与结论都截不到的地方（第 325 字之后），只有整段里有它。
    web.pages = (url) =>
      url.includes('site-')
        ? `${'外貌与服饰那一段讲得很细。'.repeat(25)}PAGE-BODY${'外貌与服饰那一段讲得很细。'.repeat(175)}`
        : null

    const prepared = await prepare(operatorRequest())
    const plan = await readTool(
      prepared,
      ASSISTANT_OPERATOR_TOOL_IDS.research,
      {
        goal: '外貌与服饰',
        entities: ['无限大', '时夜'],
      },
    )
    const { observation, compact } = await plan.run()

    // 整段：3 页全文顶掉了前三条的摘要。
    expect(observation.match(/PAGE-BODY/g)).toHaveLength(
      ASSISTANT_RESEARCH_LIMITS.quickReadPages,
    )
    expect(compact).toBeDefined()
    const lines = compact!
      .split('\n')
      .filter((line) => /^ {2}\[\d+\] /.test(line))
    expect(lines).toHaveLength(6)
    for (const id of ids)
      expect(compact).toMatch(
        new RegExp(
          `\\[\\d\\] 来源 ${id} · 时夜的外貌与服饰 · site-${id}\\.test · `,
        ),
      )
    expect(compact).toContain('read "[n]"')
    expect(compact).not.toContain('PAGE-BODY')
    expect(compact).not.toContain('https://')
    for (const line of lines)
      expect(line.length).toBeLessThan(
        ASSISTANT_WEB_FIND_LIMITS.maxLineTitleChars +
          ASSISTANT_RESEARCH_LIMITS.maxCompactGistChars +
          60,
      )
    expect(compact!.length * 4).toBeLessThan(observation.length)
  })
})

// ─── 找视频 ───────────────────────────────────────────────────────

/**
 * 联网找视频（搜索期第二片）：整张卡片进面板（步骤 result），模型只拿每条一行；
 * 召回只走平台那把 Serper key + B站连接器，来源名单照样管。
 */
describe('search_web_videos', () => {
  const YOUTUBE: SerperVideo = {
    link: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'Wuthering Waves — Changli PV',
    channel: 'Wuthering Waves',
    duration: '3:29',
  }
  const CLIP: SerperVideo = {
    link: 'https://example.test/clip',
    title: 'Some clip',
  }
  const SHORT: FakeBilibiliVideo = {
    bvid: 'BV1ji421e7nM',
    aid: 1,
    cid: 101,
    title: '《鸣潮》动画短片 | 今昔',
    duration: 95,
  }

  beforeEach(() => {
    web.videos = [YOUTUBE, CLIP]
    web.bilibili = {
      videos: [SHORT],
      search: () => [SHORT],
      searchDown: false,
    }
  })

  const bilibiliCalls = () =>
    web.requests.filter((url) => new URL(url).host === 'api.bilibili.com')

  it('⭐ 中文查询另问 B站；模型只拿每条一行（#n · 标题 · 频道 · 平台 · 时长），整张卡片进 result', async () => {
    const prepared = await prepare(operatorRequest())
    const plan = await readTool(
      prepared,
      ASSISTANT_OPERATOR_TOOL_IDS.searchWebVideos,
      { query: '鸣潮 长离 PV' },
    )
    expect(plan.payload).toEqual({
      query: '鸣潮 长离 PV',
      limit: ASSISTANT_OPERATOR_LIMITS.maxWebVideoResults,
      bilibili: true,
    })
    const { observation, result } = await plan.run()
    // 两路轮转：Google 视频第一条、B站第一条、Google 视频第二条。
    expect(observation).toContain(
      '#1 · Wuthering Waves — Changli PV · Wuthering Waves · YouTube · 3:29',
    )
    expect(observation).toMatch(/#2 · 《鸣潮》动画短片 \| 今昔 · .*bilibili/)
    expect(observation).toContain('#3 · Some clip · example.test')
    expect(observation).toContain('NOT watched')
    // ⛔ 播放页 / 封面地址一样都不喂给模型。
    expect(observation).not.toContain('https://')
    // 编号进卡片数据（面板据此把回复里的 `#2` 指到那一张），与观察里那一行同号。
    expect(result).toMatchObject({
      totalFound: 3,
      videos: [
        { n: 1, url: YOUTUBE.link, platform: 'youtube', durationSeconds: 209 },
        {
          n: 2,
          url: 'https://www.bilibili.com/video/BV1ji421e7nM',
          platform: 'bilibili',
        },
        { n: 3, url: CLIP.link, platform: 'other', domain: 'example.test' },
      ],
    })
  })

  it('英文查询不问 B站；点名 B站时 B站排前', async () => {
    const prepared = await prepare(operatorRequest())
    const plain = await readTool(
      prepared,
      ASSISTANT_OPERATOR_TOOL_IDS.searchWebVideos,
      { query: 'wuthering waves changli trailer' },
    )
    expect(plain.payload).toMatchObject({ bilibili: false })
    await plain.run()
    expect(bilibiliCalls()).toEqual([])

    const named = await readTool(
      prepared,
      ASSISTANT_OPERATOR_TOOL_IDS.searchWebVideos,
      { query: 'changli bilibili dance' },
    )
    expect(named.payload).toMatchObject({ bilibili: true })
    const { result } = await named.run()
    // 编号接着这一轮前面那次往下排；B站那一路排在最前。
    expect(
      (result as { videos: { platform: string }[] }).videos.map(
        (video) => video.platform,
      ),
    ).toEqual(['bilibili', 'youtube', 'other'])
  })

  it('来源名单：屏蔽了 B站这一组就⛔ 不打它；只许别的源时如实说，一个请求都不发', async () => {
    await addProjectRule(user.id, { text: 'bilibili', kind: 'sourceDeny' })
    const prepared = await prepare(operatorRequest())
    const plan = await readTool(
      prepared,
      ASSISTANT_OPERATOR_TOOL_IDS.searchWebVideos,
      { query: '鸣潮 PV' },
    )
    expect(plan.payload).toMatchObject({ bilibili: false })
    const { result } = await plan.run()
    expect(bilibiliCalls()).toEqual([])
    expect(result).toMatchObject({
      videos: [{ platform: 'youtube' }, { platform: 'other' }],
    })

    await resetDatabase()
    user = await operatorUser()
    await addProjectRule(user.id, { text: 'wiki', kind: 'sourceAllow' })
    web.requests = []
    const blockedRun = await prepare(operatorRequest())
    const blocked = await readTool(
      blockedRun,
      ASSISTANT_OPERATOR_TOOL_IDS.searchWebVideos,
      { query: '鸣潮 PV' },
    )
    const { observation } = await blocked.run()
    expect(observation).toContain('searched NOTHING')
    expect(web.requests).toEqual([])
  })

  it('平台没配 Serper、查询也用不上 B站 → searchUnavailable，⛔ 不借别家的联网', async () => {
    vi.stubEnv('SERPER_API_KEY', '')
    const prepared = await prepare(operatorRequest())
    fakeLlm.calls = []
    const plan = await planTool(
      prepared.run,
      ASSISTANT_OPERATOR_TOOL_IDS.searchWebVideos,
      { query: 'changli trailer' },
      prepared.user.id,
    )
    expect(plan).toMatchObject({
      kind: 'rejected',
      reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.searchUnavailable,
    })
    expect(fakeLlm.calls).toEqual([])
    expect(web.requests).toEqual([])
  })

  it('一条都没找到：叫它换个说法再试一次，⛔ 编链接', async () => {
    web.videos = []
    const prepared = await prepare(operatorRequest())
    const plan = await readTool(
      prepared,
      ASSISTANT_OPERATOR_TOOL_IDS.searchWebVideos,
      { query: 'changli trailer' },
    )
    const { observation, result } = await plan.run()
    expect(result).toEqual({ totalFound: 0, videos: [] })
    expect(observation).toContain('came back empty')
    expect(observation).toContain('Do not invent videos')
  })
})
