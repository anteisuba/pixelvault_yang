import 'server-only'

import { db } from '@/lib/db'
import type { Prisma } from '@/lib/generated/prisma/client'
import { logger } from '@/lib/logger'
import { CACHE_TAGS, cacheableFn } from '@/lib/cache-tags'
import {
  HOME_V4_SHOWCASE,
  HOME_V4_SHOWCASE_BLOCKLIST,
  HOME_V4_SHOWCASE_PINNED,
  HOME_V4_STRIP,
  HOME_V4_STRIP_SPARES,
  type HomeV4ShowcaseShot,
} from '@/constants/homepage-v4'

/**
 * 兜底墙：`HOME_V4_STRIP` 的十格 + 两张备胎，正好铺满一面墙。
 * 库里取不到数或数量不足时用它补齐，所以这两组常量不能删。
 */
const STATIC_SHOTS: readonly HomeV4ShowcaseShot[] = [
  ...HOME_V4_STRIP.map((shot) => ({ id: shot.id, src: shot.src })),
  ...HOME_V4_STRIP_SPARES.map((src, index) => ({
    id: `static-spare-${index}`,
    src,
  })),
]

/** 墙至少要这么多张：铺满格子，再留够轮换的备胎。 */
const MIN_TOTAL = HOME_V4_SHOWCASE.CELL_COUNT + HOME_V4_SHOWCASE.SPARE_COUNT

/**
 * 上墙的最低门槛，自动选片与人工置顶都要过：公开、图片、已完成、有缩略图。
 * 这四条是**公开性/可渲染性**，不是审美 —— 所以置顶也绕不过去。
 */
const SHOWCASE_WHERE = {
  isPublic: true,
  outputType: 'IMAGE',
  status: 'COMPLETED',
  thumbnailUrl: { not: null },
} satisfies Prisma.GenerationWhereInput

const SHOWCASE_SELECT = {
  id: true,
  thumbnailUrl: true,
  width: true,
  height: true,
} satisfies Prisma.GenerationSelect

type ShowcaseRow = {
  id: string
  thumbnailUrl: string | null
  width: number
  height: number
}

/**
 * 墙上的格子是 3:4 竖版 `cover` 裁切：横图塞进去两侧被切掉大半，
 * 所以自动选片只收「高 ≥ 宽」的作品。人工置顶不走这条。
 */
function isPortrait(row: ShowcaseRow): boolean {
  return row.height >= row.width
}

function toShot(row: ShowcaseRow): HomeV4ShowcaseShot | null {
  if (!row.thumbnailUrl) return null
  return { id: row.id, src: row.thumbnailUrl }
}

/**
 * 按 id 数组给出的顺序排序 —— 置顶列表的书写顺序就是它在墙上的顺序，
 * 而 `findMany({ id: { in } })` 不保证顺序。
 */
function orderByIds<T extends { id: string }>(
  rows: readonly T[],
  ids: readonly string[],
): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]))
  return ids.flatMap((id) => {
    const row = byId.get(id)
    return row ? [row] : []
  })
}

async function fetchShowcaseShots(): Promise<HomeV4ShowcaseShot[]> {
  const blocked = new Set(HOME_V4_SHOWCASE_BLOCKLIST)

  /* 置顶单独查：被 pin 的作品可能早已滑出「最新 N 条」的窗口，
     从最新一批里筛是筛不到的。默认空数组时这一路完全不查库。 */
  const pinnedIds = HOME_V4_SHOWCASE_PINNED.filter((id) => !blocked.has(id))

  const [pinnedRows, latestRows] = await Promise.all([
    pinnedIds.length > 0
      ? db.generation.findMany({
          where: { ...SHOWCASE_WHERE, id: { in: pinnedIds } },
          select: SHOWCASE_SELECT,
        })
      : Promise.resolve([]),
    db.generation.findMany({
      where: SHOWCASE_WHERE,
      select: SHOWCASE_SELECT,
      orderBy: { createdAt: 'desc' },
      take: HOME_V4_SHOWCASE.QUERY_LIMIT,
    }),
  ])

  const pinned = orderByIds(pinnedRows, pinnedIds)
    .map(toShot)
    .filter((shot): shot is HomeV4ShowcaseShot => shot !== null)

  const pinnedSrc = new Set(pinned.map((shot) => shot.src))
  const latest = latestRows
    .filter((row) => !blocked.has(row.id) && isPortrait(row))
    .map(toShot)
    .filter((shot): shot is HomeV4ShowcaseShot => shot !== null)
    .filter((shot) => !pinnedSrc.has(shot.src))

  return [...pinned, ...latest].slice(0, HOME_V4_SHOWCASE.POOL_LIMIT)
}

/**
 * 用静态兜底图把墙补满。库里合格作品不足十张时（新库、或公开作品大多是横图）
 * 首屏依然是满的，只是后几格是自带素材。
 */
function padWithStatics(shots: HomeV4ShowcaseShot[]): HomeV4ShowcaseShot[] {
  if (shots.length >= MIN_TOTAL) return shots

  const seen = new Set(shots.map((shot) => shot.src))
  const padded = [...shots]
  for (const fallback of STATIC_SHOTS) {
    if (padded.length >= MIN_TOTAL) break
    if (seen.has(fallback.src)) continue
    seen.add(fallback.src)
    padded.push(fallback)
  }
  return padded
}

const cachedShowcaseShots = cacheableFn(
  fetchShowcaseShots,
  ['home:showcase:v1'],
  { tags: [CACHE_TAGS.galleryPublic], revalidate: 300 },
)

/**
 * 首页开场作品墙的图源 —— 公开画廊里最新的公开图片，叠一层人工白名单。
 *
 * 口径：`isPublic` + `IMAGE` + `COMPLETED` + 有缩略图，按 `createdAt desc`
 * （走 `@@index([outputType, isPublic, createdAt desc])`），服务端筛掉横图，
 * 再按 `HOME_V4_SHOWCASE_PINNED` 置顶、`HOME_V4_SHOWCASE_BLOCKLIST` 剔除。
 * 返回的前 `CELL_COUNT` 张铺格子，其余进轮换备胎池。
 *
 * ⚠ 首页有 `generateStaticParams`，这个函数会在**构建期**被调用：库连不上、
 * 查询超时、合格作品不足，都必须还给调用方一面完整的墙而不是抛错。所以整条
 * 链路包在 try/catch 里，兜底与补齐都收在这一层 —— `HomeV4Opening` 只负责
 * 演出，不认识「取数失败」这件事。
 */
export async function getHomeV4ShowcaseShots(): Promise<HomeV4ShowcaseShot[]> {
  try {
    return padWithStatics(await cachedShowcaseShots())
  } catch (error) {
    logger.warn('Home showcase query failed, falling back to static strip', {
      error: error instanceof Error ? error.message : String(error),
    })
    return [...STATIC_SHOTS]
  }
}
