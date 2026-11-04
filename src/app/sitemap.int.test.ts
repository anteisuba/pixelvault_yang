/**
 * L2a 真库：`/sitemap.xml` —— 公开作品与公开创作者，三语各一条；分批走表，短批即停，
 * 超过单文件上限截断。读者全真（`getPublicGenerations` / `listPublicCreatorUsernames`）。
 *
 * ⏱ 截断那一例要真建 1.67 万行、走 17 批，约 3 秒（真库就得这么多行才到上限）。
 * 少了旧测试那一例「走到一半某批出错、前面的留着」：真库没法只让第二批失败。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { SITEMAP_MAX_URLS, SITEMAP_QUERY_BATCH_SIZE } from '@/constants/config'
import { db } from '@/lib/db'
import { createTestUser, resetDatabase } from '@/test/int/db'
import sitemap from './sitemap'

const LOCALE_COUNT = 3
const STATIC_ROUTES_PER_LOCALE = 2
const STATIC = LOCALE_COUNT * STATIC_ROUTES_PER_LOCALE

let creator: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  // 作品的主人自己不公开主页：创作者那一栏只数各例自己建的公开用户。
  creator = await createTestUser()
  await db.user.update({ where: { id: creator.id }, data: { isPublic: false } })
})

/** 一条 SQL 批量建作品（1.67 万行用 Prisma 逐批建太慢）。 */
async function seedGenerations(count: number, isPublic = true) {
  await db.$executeRaw`
    INSERT INTO "Generation"
      ("id", "userId", "url", "storageKey", "outputType", "prompt", "model", "provider", "isPublic")
    SELECT gen_random_uuid()::text, ${creator.id}, 'https://cdn.test/' || n || '.png', 'k/' || n,
      'IMAGE', 'p', 'm', 'fal', ${isPublic}
    FROM generate_series(1, ${count}::int) AS n
  `
}

const generationUrls = (entries: Awaited<ReturnType<typeof sitemap>>) =>
  entries.filter((entry) => entry.url.includes('/gallery/'))

describe('sitemap', () => {
  it('emits the static routes for every locale', async () => {
    const entries = await sitemap()
    expect(entries).toHaveLength(STATIC)
  })

  it('lists public generations in every locale, ⛔ never private ones', async () => {
    await seedGenerations(2)
    await seedGenerations(3, false)
    const [mine] = await db.generation.findMany({
      where: { isPublic: true },
      take: 1,
    })

    const entries = await sitemap()

    expect(entries).toHaveLength(STATIC + 2 * LOCALE_COUNT)
    expect(
      generationUrls(entries).filter((entry) => entry.url.endsWith(mine!.id)),
    ).toHaveLength(LOCALE_COUNT)
  })

  it('keeps paging while batches come back full', async () => {
    await seedGenerations(SITEMAP_QUERY_BATCH_SIZE + 1)

    const entries = await sitemap()

    expect(generationUrls(entries)).toHaveLength(
      (SITEMAP_QUERY_BATCH_SIZE + 1) * LOCALE_COUNT,
    )
  })

  it('still emits the static routes when both readers fail', async () => {
    // 真让库出错：两张表暂时改名，两个读者的查询都会报「表不存在」。
    await db.$executeRawUnsafe(
      'ALTER TABLE "Generation" RENAME TO "Generation_off"',
    )
    await db.$executeRawUnsafe('ALTER TABLE "User" RENAME TO "User_off"')
    try {
      const entries = await sitemap()
      expect(entries).toHaveLength(STATIC)
    } finally {
      await db.$executeRawUnsafe('ALTER TABLE "User_off" RENAME TO "User"')
      await db.$executeRawUnsafe(
        'ALTER TABLE "Generation_off" RENAME TO "Generation"',
      )
    }
  })

  it('includes public creator profiles, ⛔ not private or deleted ones', async () => {
    const alice = await createTestUser()
    const bob = await createTestUser()
    const hidden = await createTestUser()
    const gone = await createTestUser()
    await db.user.updateMany({
      where: { id: { in: [alice.id, bob.id, gone.id] } },
      data: { isPublic: true },
    })
    await db.user.update({ where: { id: gone.id }, data: { isDeleted: true } })
    await db.user.update({
      where: { id: hidden.id },
      data: { isPublic: false },
    })

    const entries = await sitemap()
    const creatorUrls = entries.filter((entry) => entry.url.includes('/u/'))

    expect(creatorUrls).toHaveLength(2 * LOCALE_COUNT)
    expect(
      creatorUrls.some((entry) => entry.url.endsWith(`/u/${alice.username}`)),
    ).toBe(true)
    expect(
      creatorUrls.some((entry) => entry.url.endsWith(`/u/${hidden.username}`)),
    ).toBe(false)
  })

  it('truncates at the single-file URL ceiling', async () => {
    // 三语各一条：1.67 万张公开作品就超过 5 万条上限。
    await seedGenerations(Math.ceil(SITEMAP_MAX_URLS / LOCALE_COUNT) + 10)

    const entries = await sitemap()

    expect(entries).toHaveLength(SITEMAP_MAX_URLS)
  }, 30_000)
})
