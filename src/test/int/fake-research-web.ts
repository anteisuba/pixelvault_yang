/**
 * 调研 / 角色出门那几个外站的假回包（L2a，替在 `fetch` 上）：Danbooru、B 站。
 * 回包按各站真接口的格式造，连接器照真的解。⛔ 不出网。
 *
 * 用法：测试自己的 `fetch` 假件里按主机分给这里：
 * ```ts
 * if (host === 'danbooru.donmai.us') return danbooruResponse(web.danbooru, url)
 * if (host === 'api.bilibili.com') return bilibiliResponse(web.bilibili, url)
 * ```
 */

const param = (url: string, name: string) => new URL(url).searchParams.get(name)

// ─── Danbooru ─────────────────────────────────────────────────────

export interface DanbooruWorld {
  /** 别名（中日文名）→ tag。 */
  aliases: Record<string, string>
  /** tag → 分类（4 = 角色）。 */
  categories: Record<string, number>
  /** 「a b」两个 tag 同时出现过。 */
  together: string[]
  /** tag → 每张样图上的一般标签。 */
  posts: Record<string, string[]>
  /** 整个站挂了（回 403，不重试）。 */
  down: boolean
}

export function emptyDanbooruWorld(): DanbooruWorld {
  return { aliases: {}, categories: {}, together: [], posts: {}, down: false }
}

export function danbooruResponse(world: DanbooruWorld, url: string): Response {
  if (world.down) return new Response('forbidden', { status: 403 })
  const path = new URL(url).pathname
  if (path === '/wiki_pages.json') {
    const alias = param(url, 'search[other_names_match]')
    if (alias !== null) {
      const tag = world.aliases[alias]
      return Response.json(tag ? [{ title: tag, other_names: [alias] }] : [])
    }
    const title = param(url, 'search[title]')
    return Response.json(
      title && Object.values(world.aliases).includes(title)
        ? [{ title, other_names: [], body: '' }]
        : [],
    )
  }
  if (path === '/tags.json') {
    const name = param(url, 'search[name]')
    return Response.json(
      name && world.categories[name] !== undefined
        ? [{ name, category: world.categories[name], post_count: 100 }]
        : [],
    )
  }
  if (path === '/posts.json') {
    const tags = param(url, 'tags') ?? ''
    if (tags.includes(' '))
      return Response.json(world.together.includes(tags) ? [{ id: 1 }] : [])
    return Response.json(
      (world.posts[tags] ?? []).map((general, id) => ({
        id,
        tag_string_general: general,
      })),
    )
  }
  return Response.json([])
}

// ─── B 站 ─────────────────────────────────────────────────────────

export interface FakeBilibiliVideo {
  bvid: string
  aid: number
  cid: number
  title: string
  /** 秒。 */
  duration: number
  /** 封面（B 站给的是 `//i0.hdslb.com/…` 这种）。 */
  pic?: string
  desc?: string
  /** 弹幕（同一句出现几次就写几次）。 */
  danmaku?: string[]
  /** 热评。 */
  comments?: string[]
  /** `playurl` 给的那条 mp4 地址；不给 = 没有能下的流。 */
  mp4?: string
  /** `videoshot` 的雪碧图：图地址、几列几行、每格秒数。 */
  frames?: { images: string[]; columns: number; rows: number; times: number[] }
}

/** 搜索结果里不是具体稿件的那种（只有 `arcurl`）。 */
export interface FakeBilibiliSearchPage {
  title: string
  arcurl: string
}

export interface BilibiliWorld {
  videos: FakeBilibiliVideo[]
  /** 搜这个词回哪几条（按顺序）。 */
  search: (keyword: string) => (FakeBilibiliVideo | FakeBilibiliSearchPage)[]
  /** 搜索入口被风控（412）。 */
  searchDown: boolean
}

export function emptyBilibiliWorld(): BilibiliWorld {
  return { videos: [], search: () => [], searchDown: false }
}

/** 真实长度的 BV 号（BV + 10 位）。 */
export const bilibiliBvid = (n: number) => `BV1aaaaaaaa${n}`

/** 第 n 个假稿件：aid = n，cid = 100 + n，封面 `//i0.hdslb.com/<n>.jpg`。 */
export function bilibiliVideo(
  n: number,
  patch: Partial<FakeBilibiliVideo> = {},
): FakeBilibiliVideo {
  return {
    bvid: bilibiliBvid(n),
    aid: n,
    cid: 100 + n,
    title: `视频 ${n}`,
    duration: 120,
    pic: `//i0.hdslb.com/${n}.jpg`,
    ...patch,
  }
}

const ok = (data: unknown) => Response.json({ code: 0, message: '0', data })

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function bilibiliResponse(world: BilibiliWorld, url: string): Response {
  const path = new URL(url).pathname
  const byBvid = () =>
    world.videos.find((video) => video.bvid === param(url, 'bvid'))
  if (path === '/x/web-interface/search/type') {
    if (world.searchDown) return new Response('risk control', { status: 412 })
    return ok({
      result: world.search(param(url, 'keyword') ?? '').map((entry) =>
        'arcurl' in entry
          ? { title: entry.title, arcurl: entry.arcurl }
          : {
              bvid: entry.bvid,
              title: `<em class="keyword">${entry.title}</em>`,
              author: 'UP',
              duration: `${Math.floor(entry.duration / 60)}:${String(entry.duration % 60).padStart(2, '0')}`,
              ...(entry.pic ? { pic: entry.pic } : {}),
            },
      ),
    })
  }
  if (path === '/x/web-interface/view') {
    const video = byBvid()
    return video
      ? ok({
          bvid: video.bvid,
          aid: video.aid,
          cid: video.cid,
          title: video.title,
          duration: video.duration,
          desc: video.desc ?? '',
          ...(video.pic ? { pic: video.pic } : {}),
        })
      : Response.json({ code: -404, message: '啥都木有' })
  }
  if (path === '/x/v1/dm/list.so') {
    const video = world.videos.find(
      (entry) => String(entry.cid) === param(url, 'oid'),
    )
    const lines = (video?.danmaku ?? [])
      .map((text, n) => `<d p="${n},1,25,16777215">${escapeXml(text)}</d>`)
      .join('')
    return new Response(`<?xml version="1.0"?><i>${lines}</i>`)
  }
  if (path === '/x/v2/reply') {
    const video = world.videos.find(
      (entry) => String(entry.aid) === param(url, 'oid'),
    )
    return ok({
      replies: (video?.comments ?? []).map((message) => ({
        content: { message },
      })),
    })
  }
  if (path === '/x/player/playurl') {
    const video = byBvid()
    return ok({
      durl: video?.mp4 ? [{ url: video.mp4, size: 1024 }] : [],
    })
  }
  if (path === '/x/player/videoshot') {
    const frames = byBvid()?.frames
    return ok(
      frames
        ? {
            img_x_len: frames.columns,
            img_y_len: frames.rows,
            img_x_size: 160,
            img_y_size: 90,
            image: frames.images,
            index: [0, ...frames.times],
          }
        : {},
    )
  }
  return Response.json({ code: -400, message: `no fake for ${path}` })
}
