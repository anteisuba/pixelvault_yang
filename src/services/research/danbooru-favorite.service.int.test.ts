import { beforeEach, describe, expect, it } from 'vitest'

import { DANBOORU_REQUEST } from '@/constants/research'
import { db } from '@/lib/db'
import { createTestUser, resetDatabase } from '@/test/int/db'
import {
  addDanbooruFavorite,
  DanbooruFavoriteLimitError,
  listDanbooruFavorites,
  removeDanbooruFavorite,
} from '@/services/research/danbooru-favorite.service'

/** 真库（L2a）：本人隔离、重复收藏不多写、满额拒收都看库里的行。 */
const INPUT = {
  kind: 'character' as const,
  name: 'fate_testarossa',
  count: 10000,
  work: 'lyrical_nanoha',
  previews: ['https://cdn.donmai.us/p.jpg'],
}

describe('danbooru-favorite.service（真库）', () => {
  beforeEach(resetDatabase)

  it('收藏存成本人名下的一行快照', async () => {
    const user = await createTestUser()

    const favorite = await addDanbooruFavorite(user.clerkId, INPUT)

    expect(favorite).toMatchObject(INPUT)
    const rows = await db.danbooruFavorite.findMany({
      where: { userId: user.id },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ ...INPUT, id: favorite.id })
  })

  it('同一个再收藏一次：回原来那条，不多写一行', async () => {
    const user = await createTestUser()
    const first = await addDanbooruFavorite(user.clerkId, INPUT)

    const again = await addDanbooruFavorite(user.clerkId, INPUT)

    expect(again.id).toBe(first.id)
    expect(
      await db.danbooruFavorite.count({ where: { userId: user.id } }),
    ).toBe(1)
  })

  // 两个请求都先查到「没有」再各自 create，后到的撞唯一约束 → 接住回先到那一条（11-04 修）。
  it('连点两下（两个请求同时到）只落一行、两下都成功', async () => {
    const user = await createTestUser()

    const results = await Promise.allSettled([
      addDanbooruFavorite(user.clerkId, INPUT),
      addDanbooruFavorite(user.clerkId, INPUT),
    ])

    expect(results.map((result) => result.status)).toEqual([
      'fulfilled',
      'fulfilled',
    ])
    expect(
      await db.danbooruFavorite.count({ where: { userId: user.id } }),
    ).toBe(1)
  })

  it('这一类收满了就拒收，库里不多一行', async () => {
    const user = await createTestUser()
    await db.danbooruFavorite.createMany({
      data: Array.from(
        { length: DANBOORU_REQUEST.favoriteLimitPerKind },
        (_, i) => ({
          userId: user.id,
          kind: 'character',
          name: `tag_${i}`,
          count: 1,
        }),
      ),
    })

    await expect(addDanbooruFavorite(user.clerkId, INPUT)).rejects.toThrow(
      DanbooruFavoriteLimitError,
    )
    expect(
      await db.danbooruFavorite.count({ where: { userId: user.id } }),
    ).toBe(DANBOORU_REQUEST.favoriteLimitPerKind)
  })

  it('列表新的在前、认不得的类别不出现、只列本人的', async () => {
    const me = await createTestUser()
    const other = await createTestUser()
    await db.danbooruFavorite.create({
      data: {
        userId: me.id,
        kind: 'character',
        name: 'old',
        count: 1,
        createdAt: new Date('2026-09-01T00:00:00Z'),
      },
    })
    await db.danbooruFavorite.create({
      data: {
        userId: me.id,
        kind: 'artist',
        name: 'new',
        count: 1,
        createdAt: new Date('2026-09-02T00:00:00Z'),
      },
    })
    await db.danbooruFavorite.create({
      data: { userId: me.id, kind: 'meta', name: 'odd', count: 1 },
    })
    await db.danbooruFavorite.create({
      data: { userId: other.id, kind: 'character', name: 'theirs', count: 1 },
    })

    const favorites = await listDanbooruFavorites(me.clerkId)

    expect(favorites.map((favorite) => favorite.name)).toEqual(['new', 'old'])
  })

  it('只删得掉本人的：删别人的那条回 false、那条还在', async () => {
    const me = await createTestUser()
    const other = await createTestUser()
    const theirs = await addDanbooruFavorite(other.clerkId, INPUT)
    const mine = await addDanbooruFavorite(me.clerkId, INPUT)

    expect(await removeDanbooruFavorite(me.clerkId, theirs.id)).toBe(false)
    expect(await removeDanbooruFavorite(me.clerkId, mine.id)).toBe(true)

    const left = await db.danbooruFavorite.findMany()
    expect(left.map((row) => row.id)).toEqual([theirs.id])
  })
})
