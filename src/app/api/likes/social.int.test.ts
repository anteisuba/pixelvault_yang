/**
 * L2a 真库：点赞（/api/likes）与关注（/api/follows）。只假 Clerk 登录；服务与库全真。
 * 核库里的行与回的计数；连点两下 = 取消。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  createGET,
  createPOST,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import { GET as GET_LIKES, POST as TOGGLE_LIKE } from '@/app/api/likes/route'
import { POST as TOGGLE_FOLLOW } from '@/app/api/follows/route'
import { db } from '@/lib/db'
import { createTestUser, resetDatabase } from '@/test/int/db'
import { seedGeneration } from '@/test/int/seed-generation'

type Envelope<T> = {
  success: boolean
  data?: T
  error?: string
  i18nKey?: string
}

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
  mockAuthenticated(me.clerkId)
})

describe('/api/likes（真库）', () => {
  const like = async (generationId: string) => {
    const res = await TOGGLE_LIKE(createPOST('/api/likes', { generationId }))
    return {
      status: res.status,
      body: await parseJSON<Envelope<{ liked: boolean; likeCount: number }>>(
        res,
      ),
    }
  }

  it('没登录 401，不读不写', async () => {
    const gen = await seedGeneration(other.id, { isPublic: true })
    mockUnauthenticated()
    expect(
      (await GET_LIKES(createGET('/api/likes', { ids: gen.id }))).status,
    ).toBe(401)
    expect((await like(gen.id)).status).toBe(401)
    expect(await db.userLike.count()).toBe(0)
  })

  it('点一下赞、再点取消；计数跟着库走', async () => {
    const gen = await seedGeneration(other.id, { isPublic: true })
    await db.userLike.create({
      data: { userId: other.id, generationId: gen.id },
    })

    expect((await like(gen.id)).body.data).toEqual({
      liked: true,
      likeCount: 2,
    })
    expect(await db.userLike.count({ where: { userId: me.id } })).toBe(1)
    expect((await like(gen.id)).body.data).toEqual({
      liked: false,
      likeCount: 1,
    })
    expect(await db.userLike.count({ where: { userId: me.id } })).toBe(0)
  })

  it('缺 generationId 400；别人私有的点不了，不落行', async () => {
    expect((await TOGGLE_LIKE(createPOST('/api/likes', {}))).status).toBe(400)
    const priv = await seedGeneration(other.id)
    expect((await like(priv.id)).status).toBe(500)
    expect(await db.userLike.count()).toBe(0)
  })

  it('GET 只回我赞过的那些 id；缺 ids 400', async () => {
    const a = await seedGeneration(other.id, { isPublic: true })
    const b = await seedGeneration(other.id, { isPublic: true })
    await db.userLike.create({ data: { userId: me.id, generationId: a.id } })
    await db.userLike.create({ data: { userId: other.id, generationId: b.id } })

    const res = await GET_LIKES(
      createGET('/api/likes', { ids: `${a.id},${b.id}` }),
    )
    expect(await parseJSON(res)).toEqual({
      success: true,
      data: { likedIds: [a.id] },
    })
    expect((await GET_LIKES(createGET('/api/likes'))).status).toBe(400)
  })
})

describe('/api/follows（真库）', () => {
  const follow = async (targetUserId: unknown) => {
    const res = await TOGGLE_FOLLOW(
      createPOST('/api/follows', { targetUserId }),
    )
    return {
      status: res.status,
      body: await parseJSON<
        Envelope<{ following: boolean; followerCount: number }>
      >(res),
    }
  }

  it('没登录 401；缺 targetUserId 400；都不落行', async () => {
    expect((await TOGGLE_FOLLOW(createPOST('/api/follows', {}))).status).toBe(
      400,
    )
    mockUnauthenticated()
    expect((await follow(other.id)).status).toBe(401)
    expect(await db.userFollow.count()).toBe(0)
  })

  it('关注一下、再点取消；粉丝数跟着库走', async () => {
    expect((await follow(other.id)).body.data).toEqual({
      following: true,
      followerCount: 1,
    })
    expect(
      await db.userFollow.findMany({
        select: { followerId: true, followingId: true },
      }),
    ).toEqual([{ followerId: me.id, followingId: other.id }])
    expect((await follow(other.id)).body.data).toEqual({
      following: false,
      followerCount: 0,
    })
    expect(await db.userFollow.count()).toBe(0)
  })

  it('关注自己 / 不存在的人：400 带 i18n 键，不落行', async () => {
    for (const target of [me.id, 'no-such-user']) {
      const res = await follow(target)
      expect(res.status).toBe(400)
      expect(res.body).toMatchObject({ i18nKey: 'errors.follow.invalid' })
    }
    expect(await db.userFollow.count()).toBe(0)
  })
})
