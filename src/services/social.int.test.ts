/**
 * L2a 真库：关注与点赞服务（follow.service / like.service）。不假任何自有模块，核库里的行与返回值。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { db } from '@/lib/db'
import { toggleFollow } from '@/services/follow.service'
import { batchSetLike, getUserLikes, toggleLike } from '@/services/like.service'
import { createTestUser, resetDatabase } from '@/test/int/db'
import { seedGeneration } from '@/test/int/seed-generation'

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
})

describe('toggleFollow（真库）', () => {
  it('关注再取关：行落库又删掉，粉丝数跟着变', async () => {
    expect(await toggleFollow(me.id, other.id)).toEqual({
      following: true,
      followerCount: 1,
    })
    expect(
      await db.userFollow.count({
        where: { followerId: me.id, followingId: other.id },
      }),
    ).toBe(1)
    expect(await toggleFollow(me.id, other.id)).toEqual({
      following: false,
      followerCount: 0,
    })
    expect(await db.userFollow.count()).toBe(0)
  })

  it('关注自己 / 不存在的人都抛，不落行', async () => {
    await expect(toggleFollow(me.id, me.id)).rejects.toThrow(
      'Cannot follow yourself',
    )
    await expect(toggleFollow(me.id, 'missing')).rejects.toThrow(
      'User not found',
    )
    expect(await db.userFollow.count()).toBe(0)
  })
})

describe('like.service（真库）', () => {
  it('点赞再取消；点赞数数的是所有人的', async () => {
    const gen = await seedGeneration(other.id, { isPublic: true })
    await db.userLike.create({
      data: { userId: other.id, generationId: gen.id },
    })
    expect(await toggleLike(me.id, gen.id)).toEqual({
      liked: true,
      likeCount: 2,
    })
    expect(await getUserLikes(me.id, [gen.id])).toEqual(new Set([gen.id]))
    expect(await toggleLike(me.id, gen.id)).toEqual({
      liked: false,
      likeCount: 1,
    })
    expect(await getUserLikes(me.id, [gen.id])).toEqual(new Set())
  })

  it('别人的私密图不能点；自己的私密图可以；没有的图抛', async () => {
    const theirs = await seedGeneration(other.id, { isPublic: false })
    const mine = await seedGeneration(me.id, { isPublic: false })
    await expect(toggleLike(me.id, theirs.id)).rejects.toThrow(
      'Cannot like a private generation',
    )
    await expect(toggleLike(me.id, 'missing')).rejects.toThrow(
      'Generation not found',
    )
    expect(await toggleLike(me.id, mine.id)).toMatchObject({ liked: true })
    expect(
      await db.userLike.count({ where: { generationId: theirs.id } }),
    ).toBe(0)
  })

  it('批量：只动够得着的，已赞的不重复算；批量取消只删我的', async () => {
    const pub = await seedGeneration(other.id, { isPublic: true })
    const priv = await seedGeneration(other.id, { isPublic: false })
    const mine = await seedGeneration(me.id, { isPublic: false })
    await db.userLike.create({ data: { userId: me.id, generationId: pub.id } })
    await db.userLike.create({
      data: { userId: other.id, generationId: pub.id },
    })

    expect(await batchSetLike(me.id, [pub.id, priv.id, mine.id], true)).toEqual(
      {
        updatedCount: 1,
      },
    )
    expect(await getUserLikes(me.id, [pub.id, priv.id, mine.id])).toEqual(
      new Set([pub.id, mine.id]),
    )

    expect(await batchSetLike(me.id, [pub.id, mine.id], false)).toEqual({
      updatedCount: 2,
    })
    expect(await db.userLike.findMany({ select: { userId: true } })).toEqual([
      { userId: other.id },
    ])
    expect(await batchSetLike(me.id, [], true)).toEqual({ updatedCount: 0 })
  })
})
