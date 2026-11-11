/**
 * L2a 真库：首页作品墙取数（homepage-showcase.service）。作品走真库；
 * 置顶 / 黑名单是常量里的空数组，测试里临时往里放 id、用完清空（不假模块）。
 * 核返回的墙：门槛、竖图、置顶顺序、补齐、库挂了兜底。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  HOME_V4_SHOWCASE,
  HOME_V4_SHOWCASE_BLOCKLIST,
  HOME_V4_SHOWCASE_PINNED,
  HOME_V4_STRIP,
  HOME_V4_STRIP_SPARES,
} from '@/constants/homepage-v4'
import { db } from '@/lib/db'
import { getHomeV4ShowcaseShots } from '@/services/homepage-showcase.service'
import { createTestUser, resetDatabase } from '@/test/int/db'
import { seedGeneration } from '@/test/int/seed-generation'

const MIN_TOTAL = HOME_V4_SHOWCASE.CELL_COUNT + HOME_V4_SHOWCASE.SPARE_COUNT
const STATIC_SRCS = [
  ...HOME_V4_STRIP.map((shot) => shot.src),
  ...HOME_V4_STRIP_SPARES,
]
const pinned = HOME_V4_SHOWCASE_PINNED as string[]
const blocklist = HOME_V4_SHOWCASE_BLOCKLIST as string[]

let me: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
})
afterEach(() => {
  pinned.length = 0
  blocklist.length = 0
})

const thumb = (id: string) => `https://cdn.test/${id}-thumb.webp`

let minute = 0
/** 一张合格的公开竖图；`createdAt` 逐张往后，后种的更新。 */
async function seedShot(
  extra: Parameters<typeof seedGeneration>[1] = {},
): Promise<string> {
  minute += 1
  const gen = await seedGeneration(me.id, {
    isPublic: true,
    outputType: 'IMAGE',
    status: 'COMPLETED',
    width: 768,
    height: 1024,
    createdAt: new Date(Date.UTC(2026, 10, 1, 0, minute)),
    ...extra,
  })
  await db.generation.update({
    where: { id: gen.id },
    data: { thumbnailUrl: thumb(gen.id) },
  })
  return gen.id
}

/** 种 n 张，返回从新到旧的 id。 */
async function seedShots(n: number): Promise<string[]> {
  const ids: string[] = []
  for (let i = 0; i < n; i++) ids.push(await seedShot())
  return ids.reverse()
}

describe('getHomeV4ShowcaseShots（真库）', () => {
  it('最新的公开作品在前，用缩略图；不公开 / 没完成 / 不是图 / 没缩略图的不上墙', async () => {
    const [newest] = await seedShots(MIN_TOTAL)
    const hidden = [
      await seedShot({ isPublic: false }),
      await seedShot({ status: 'FAILED' }),
      await seedShot({ outputType: 'VIDEO' }),
    ]
    const noThumb = await seedGeneration(me.id, {
      isPublic: true,
      createdAt: new Date(Date.UTC(2027, 0, 1)),
    })

    const shots = await getHomeV4ShowcaseShots()
    expect(shots).toHaveLength(MIN_TOTAL)
    expect(shots[0]).toMatchObject({ id: newest, src: thumb(newest) })
    expect(shots[0]?.w).toBeGreaterThan(0)
    expect(shots[0]?.h).toBeGreaterThan(0)
    const ids = shots.map((shot) => shot.id)
    for (const id of [...hidden, noThumb.id]) expect(ids).not.toContain(id)
  })

  it('横图不上墙，方图算竖图', async () => {
    const wide = await seedShot({ width: 1920, height: 1080 })
    const square = await seedShot({ width: 1024, height: 1024 })
    const ids = (await getHomeV4ShowcaseShots()).map((shot) => shot.id)
    expect(ids).not.toContain(wide)
    expect(ids).toContain(square)
  })

  it('黑名单的不上墙；黑名单压过置顶', async () => {
    const ids = await seedShots(MIN_TOTAL)
    blocklist.push(ids[1])
    pinned.push(ids[1])
    const shown = (await getHomeV4ShowcaseShots()).map((shot) => shot.id)
    expect(shown).not.toContain(ids[1])
    expect(shown[0]).toBe(ids[0])
  })

  it('置顶按常量里的顺序排最前，横图也照上；不公开的置顶上不去', async () => {
    const a = await seedShot({ createdAt: new Date(Date.UTC(2020, 0, 1)) })
    const b = await seedShot({ createdAt: new Date(Date.UTC(2020, 0, 2)) })
    const wide = await seedShot({
      width: 1920,
      height: 1080,
      createdAt: new Date(Date.UTC(2020, 0, 3)),
    })
    const secret = await seedShot({ isPublic: false })
    await seedShots(MIN_TOTAL)
    pinned.push(b, wide, secret, a)

    const shown = (await getHomeV4ShowcaseShots()).map((shot) => shot.id)
    expect(shown.slice(0, 3)).toEqual([b, wide, a])
    expect(shown).not.toContain(secret)
    expect(shown.filter((id) => id === a)).toHaveLength(1)
  })

  it('库里作品不够：先放真作品，后面用自带素材补满', async () => {
    const ids = await seedShots(3)
    const shots = await getHomeV4ShowcaseShots()
    expect(shots.length).toBeGreaterThanOrEqual(MIN_TOTAL)
    expect(shots.slice(0, 3).map((shot) => shot.id)).toEqual(ids)
    for (const shot of shots.slice(3)) expect(STATIC_SRCS).toContain(shot.src)
  })

  it('作品很多：最多下发 POOL_LIMIT 张', async () => {
    await seedShots(HOME_V4_SHOWCASE.POOL_LIMIT + 4)
    expect(await getHomeV4ShowcaseShots()).toHaveLength(
      HOME_V4_SHOWCASE.POOL_LIMIT,
    )
  })

  it('库挂了：整面墙用自带素材，不抛', async () => {
    vi.spyOn(db.generation, 'findMany').mockRejectedValueOnce(
      new Error('ECONNREFUSED'),
    )
    const shots = await getHomeV4ShowcaseShots()
    expect(shots.map((shot) => shot.src)).toEqual(STATIC_SRCS)
  })
})
