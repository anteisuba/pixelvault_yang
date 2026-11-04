/**
 * L2a 真库：用户（Clerk 首登建号 / 换实例重绑、用户名、资料、头像、创作者主页、注销）。
 * 只假边界：Clerk 后台（`clerkClient`）、R2 的真 I/O。核库里的用户行与返回值。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const clerk = vi.hoisted(() => ({
  users: new Map<string, Record<string, unknown>>(),
  calls: 0,
}))
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: async () => ({
    users: {
      getUser: async (id: string) => {
        clerk.calls += 1
        const user = clerk.users.get(id)
        if (!user) throw new Error(`Clerk user ${id} not found`)
        return user
      },
    },
  }),
}))
vi.mock('@/services/storage/r2', async (importOriginal) =>
  (await import('@/test/int/fake-r2')).fakeR2Module(await importOriginal()),
)

import { db } from '@/lib/db'
import {
  ensureUser,
  getCreatorProfile,
  getUserByClerkId,
  listPublicCreatorUsernames,
  provisionVerifiedClerkUser,
  refreshAvatarFromClerk,
  softDeleteUser,
  updateProfile,
  uploadAvatar,
  validateUsername,
} from '@/services/user.service'
import { createTestUser, resetDatabase } from '@/test/int/db'
import { FAKE_CDN, fakeBucket } from '@/test/int/fake-r2'
import { seedGeneration } from '@/test/int/seed-generation'

function clerkUser(
  id: string,
  overrides: Partial<{
    username: string | null
    fullName: string | null
    imageUrl: string | null
    email: string | null
    verified: boolean
  }> = {},
) {
  const email =
    overrides.email === undefined ? `${id}@example.test` : overrides.email
  clerk.users.set(id, {
    username: overrides.username ?? null,
    fullName: overrides.fullName ?? null,
    firstName: null,
    imageUrl: overrides.imageUrl ?? null,
    primaryEmailAddressId: email ? 'email-primary' : null,
    emailAddresses: email
      ? [
          {
            id: 'email-primary',
            emailAddress: email,
            verification: {
              status: overrides.verified === false ? 'unverified' : 'verified',
            },
          },
        ]
      : [],
  })
}

const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII='

beforeEach(async () => {
  await resetDatabase()
  fakeBucket.reset()
  clerk.users.clear()
  clerk.calls = 0
  vi.stubEnv('VERCEL_ENV', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getUserByClerkId', () => {
  it('按 Clerk id 找到人；没有就 null', async () => {
    const me = await createTestUser()

    expect((await getUserByClerkId(me.clerkId))?.id).toBe(me.id)
    expect(await getUserByClerkId('missing')).toBeNull()
  })
})

describe('ensureUser', () => {
  it('资料齐全的老用户：直接交回，⛔ 去问 Clerk', async () => {
    const me = await createTestUser()

    expect((await ensureUser(me.clerkId)).id).toBe(me.id)
    expect(clerk.calls).toBe(0)
  })

  it('老用户缺资料：从 Clerk 补上名字、头像、用户名', async () => {
    const row = await db.user.create({
      data: { clerkId: 'clerk_old', email: 'old.timer@example.test' },
    })
    clerkUser('clerk_old', {
      fullName: 'Old Timer',
      imageUrl: 'https://img.test/old.png',
    })

    const user = await ensureUser('clerk_old')

    expect(user).toMatchObject({
      id: row.id,
      displayName: 'Old Timer',
      avatarUrl: 'https://img.test/old.png',
      username: 'oldtimer',
    })
  })

  it('首登：按 Clerk 资料建号，用户名取 Clerk 用户名并规整', async () => {
    clerkUser('clerk_new', {
      username: 'New.Creator',
      fullName: 'New Creator',
      imageUrl: 'https://img.test/new.png',
      email: 'New.Creator@Example.test',
    })

    const user = await ensureUser('clerk_new')

    const row = await db.user.findUniqueOrThrow({
      where: { clerkId: 'clerk_new' },
    })
    expect(user.id).toBe(row.id)
    expect(row).toMatchObject({
      email: 'new.creator@example.test',
      displayName: 'New Creator',
      avatarUrl: 'https://img.test/new.png',
      username: 'newcreator',
    })
  })

  it('首登时用户名被占：后面补四位数字', async () => {
    await db.user.create({
      data: { clerkId: 'clerk_a', email: 'a@example.test', username: 'artist' },
    })
    clerkUser('clerk_b', { username: 'artist', fullName: 'B' })

    const user = await ensureUser('clerk_b')

    expect(user.username).toMatch(/^artist\d{4}$/)
  })

  it('正式环境换了 Clerk 实例：按已验证邮箱重绑，内部 id 与资料不变', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    const existing = await db.user.create({
      data: {
        clerkId: 'clerk_old_instance',
        email: 'artist@example.test',
        username: 'artist',
        displayName: 'Artist',
        avatarUrl: 'https://img.test/artist.png',
      },
    })
    clerkUser('clerk_new_instance', {
      username: 'Different',
      fullName: 'Different Name',
      imageUrl: 'https://img.test/different.png',
      email: 'artist@example.test',
    })

    const user = await ensureUser('clerk_new_instance')

    expect(user).toMatchObject({
      id: existing.id,
      clerkId: 'clerk_new_instance',
      username: 'artist',
      displayName: 'Artist',
      avatarUrl: 'https://img.test/artist.png',
    })
    expect(await db.user.count()).toBe(1)
  })

  it('Clerk 那边没有邮箱：报错，⛔ 建号', async () => {
    clerkUser('clerk_no_email', { email: null })

    await expect(ensureUser('clerk_no_email')).rejects.toThrow(
      'No email found for Clerk user',
    )
    expect(await db.user.count()).toBe(0)
  })
})

describe('provisionVerifiedClerkUser', () => {
  it('邮箱没验证：拒，⛔ 写库', async () => {
    await expect(
      provisionVerifiedClerkUser({
        clerkId: 'clerk_x',
        email: 'x@example.test',
        emailVerificationStatus: 'unverified',
      }),
    ).rejects.toThrow('verified primary email')
    expect(await db.user.count()).toBe(0)
  })

  it('邮箱规整成小写去空格；已绑过的 Clerk id 再来一次不改资料', async () => {
    const first = await provisionVerifiedClerkUser({
      clerkId: 'clerk_x',
      email: ' X@Example.test ',
      emailVerificationStatus: 'verified',
      displayName: 'X',
    })
    const again = await provisionVerifiedClerkUser({
      clerkId: 'clerk_x',
      email: 'x@example.test',
      emailVerificationStatus: 'verified',
      displayName: 'Other name',
      avatarUrl: 'https://img.test/x.png',
    })

    expect(first.email).toBe('x@example.test')
    expect(again).toMatchObject({
      id: first.id,
      displayName: 'X',
      // 原来没头像：补上
      avatarUrl: 'https://img.test/x.png',
    })
    expect(await db.user.count()).toBe(1)
  })

  it('本机（没 VERCEL_ENV）开发 key 换了 id：按邮箱重绑到老行', async () => {
    const existing = await createTestUser()

    const user = await provisionVerifiedClerkUser({
      clerkId: 'clerk_local_dev',
      email: existing.email,
      emailVerificationStatus: 'verified',
    })

    expect(user).toMatchObject({ id: existing.id, clerkId: 'clerk_local_dev' })
  })

  it('预览环境：⛔ 抢正式库里已有邮箱的行；新邮箱照常建号', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    const existing = await createTestUser()

    await expect(
      provisionVerifiedClerkUser({
        clerkId: 'clerk_preview',
        email: existing.email,
        emailVerificationStatus: 'verified',
      }),
    ).rejects.toThrow(/only allowed in Production/)
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: existing.id } })).clerkId,
    ).toBe(existing.clerkId)

    const created = await provisionVerifiedClerkUser({
      clerkId: 'clerk_preview',
      email: 'fresh@example.test',
      emailVerificationStatus: 'verified',
    })
    expect(created.clerkId).toBe('clerk_preview')
  })
})

describe('validateUsername / updateProfile', () => {
  it('格式不对、保留字、别人占了都拒；自己现在的名字可以留', async () => {
    const me = await createTestUser()
    const other = await createTestUser()
    await db.user.update({ where: { id: me.id }, data: { username: 'mine' } })
    await db.user.update({
      where: { id: other.id },
      data: { username: 'taken-name' },
    })

    expect(await validateUsername('1bad', me.id)).toMatch(/Username must be/)
    expect(await validateUsername('admin', me.id)).toBe(
      'This username is reserved',
    )
    expect(await validateUsername('Taken-Name', me.id)).toBe(
      'This username is already taken',
    )
    expect(await validateUsername('mine', me.id)).toBeNull()
  })

  it('改资料：用户名转小写后存库', async () => {
    const me = await createTestUser()

    const result = await updateProfile(me.id, {
      username: 'NewName',
      displayName: 'New Name',
      bio: 'Updated bio',
      isPublic: false,
    })

    const expected = {
      username: 'newname',
      displayName: 'New Name',
      bio: 'Updated bio',
      isPublic: false,
    }
    expect(result).toEqual(expected)
    expect(
      await db.user.findUniqueOrThrow({ where: { id: me.id } }),
    ).toMatchObject(expected)
  })

  it('用户名不过关：报错，⛔ 写库', async () => {
    const me = await createTestUser()

    await expect(
      updateProfile(me.id, { username: 'admin', bio: 'x' }),
    ).rejects.toThrow('This username is reserved')
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: me.id } })).bio,
    ).toBeNull()
  })
})

describe('uploadAvatar', () => {
  it('传新头像：进桶、写回用户行，旧的自定义头像从桶里删掉', async () => {
    const me = await createTestUser()

    const first = await uploadAvatar(me.id, PNG_DATA_URL)
    const firstKey = (await db.user.findUniqueOrThrow({ where: { id: me.id } }))
      .avatarStorageKey!
    const second = await uploadAvatar(me.id, PNG_DATA_URL)

    const row = await db.user.findUniqueOrThrow({ where: { id: me.id } })
    expect(row.avatarUrl).toBe(second.url)
    expect(second.url).toBe(`${FAKE_CDN}/${row.avatarStorageKey}`)
    expect(row.avatarStorageKey).toMatch(
      new RegExp(`^profiles/${me.id}/avatar/.+\\.png$`),
    )
    expect(first.url).not.toBe(second.url)
    expect(fakeBucket.objects.has(firstKey)).toBe(false)
    expect(fakeBucket.objects.has(row.avatarStorageKey!)).toBe(true)
  })

  it('不支持的图片类型：拒，⛔ 进桶、⛔ 改用户行', async () => {
    const me = await createTestUser()

    await expect(
      uploadAvatar(me.id, 'data:image/gif;base64,R0lGODlh'),
    ).rejects.toThrow('Unsupported image type. Use JPEG, PNG, or WebP.')
    expect(fakeBucket.uploads).toEqual([])
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: me.id } })).avatarUrl,
    ).toBeNull()
  })
})

describe('getCreatorProfile', () => {
  it('不公开的主页：别人只看到外壳', async () => {
    const owner = await createTestUser()
    await db.user.update({ where: { id: owner.id }, data: { isPublic: false } })
    const viewer = await createTestUser()

    const result = await getCreatorProfile(
      owner.username!.toUpperCase(),
      viewer.id,
    )

    expect(result).toEqual({
      private: true,
      username: owner.username,
      displayName: owner.displayName,
      avatarUrl: null,
    })
    // 本人照常看得到全貌
    expect(await getCreatorProfile(owner.username!, owner.id)).toMatchObject({
      viewerRelation: { isOwnProfile: true },
    })
  })

  it('公开主页：只列公开作品、计数、看的人关没关注、提示词按开关藏', async () => {
    const owner = await createTestUser()
    const viewer = await createTestUser()
    const fan = await createTestUser()
    const shown = await seedGeneration(owner.id, {
      isPublic: true,
      isPromptPublic: false,
      prompt: 'secret prompt',
    })
    await seedGeneration(owner.id, { isPublic: false })
    await db.userLike.createMany({
      data: [
        { userId: viewer.id, generationId: shown.id },
        { userId: fan.id, generationId: shown.id },
      ],
    })
    await db.userFollow.createMany({
      data: [
        { followerId: viewer.id, followingId: owner.id },
        { followerId: fan.id, followingId: owner.id },
        { followerId: owner.id, followingId: fan.id },
      ],
    })

    const result = await getCreatorProfile(owner.username!, viewer.id)

    expect(result).toMatchObject({
      userId: owner.id,
      publicImageCount: 1,
      likeCount: 2,
      followerCount: 2,
      followingCount: 1,
      hasMore: false,
      nextCursor: null,
      viewerRelation: { isFollowing: true, isOwnProfile: false },
    })
    const generations =
      result && 'generations' in result ? result.generations : []
    expect(generations).toHaveLength(1)
    expect(generations[0]).toMatchObject({
      id: shown.id,
      prompt: '',
      likeCount: 2,
      isLiked: true,
      creator: { username: owner.username },
    })
  })

  it('翻页：精选在前、再按时间倒序；用游标接着取不重不漏', async () => {
    const owner = await createTestUser()
    const at = (day: number) => new Date(`2026-02-0${day}T00:00:00.000Z`)
    const old = await seedGeneration(owner.id, {
      isPublic: true,
      createdAt: at(1),
    })
    const featured = await seedGeneration(owner.id, {
      isPublic: true,
      isFeatured: true,
      createdAt: at(2),
    })
    const recent = await seedGeneration(owner.id, {
      isPublic: true,
      createdAt: at(3),
    })

    const ids: string[] = []
    let cursor: string | undefined
    for (let i = 0; i < 3; i++) {
      const page = await getCreatorProfile(owner.username!, null, 1, 1, cursor)
      if (!page || !('generations' in page)) throw new Error('no page')
      ids.push(...page.generations.map((g) => g.id))
      cursor = page.nextCursor ?? undefined
      if (i < 2) expect(page.hasMore).toBe(true)
      else expect(page.nextCursor).toBeNull()
    }

    expect(ids).toEqual([featured.id, recent.id, old.id])
  })

  it('没有这个用户名：null', async () => {
    expect(await getCreatorProfile('nobody', null)).toBeNull()
  })
})

describe('listPublicCreatorUsernames', () => {
  it('只列公开、没注销的用户名，按字母排', async () => {
    const a = await db.user.create({
      data: { clerkId: 'c1', email: '1@e.test', username: 'zed' },
    })
    await db.user.create({
      data: { clerkId: 'c2', email: '2@e.test', username: 'amy' },
    })
    await db.user.create({
      data: {
        clerkId: 'c3',
        email: '3@e.test',
        username: 'hidden',
        isPublic: false,
      },
    })
    await softDeleteUser(a.clerkId)

    expect(await listPublicCreatorUsernames()).toEqual(['amy'])
  })
})

describe('refreshAvatarFromClerk / softDeleteUser', () => {
  it('Clerk 那边换了头像：同步到用户行', async () => {
    const me = await createTestUser()
    clerkUser(me.clerkId, { imageUrl: 'https://img.test/latest.png' })

    const user = await refreshAvatarFromClerk(me.clerkId)

    expect(user?.avatarUrl).toBe('https://img.test/latest.png')
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: me.id } })).avatarUrl,
    ).toBe('https://img.test/latest.png')
    expect(await refreshAvatarFromClerk('missing')).toBeNull()
  })

  it('注销：标记已删并设为不公开；没这个人就跳过', async () => {
    const me = await createTestUser()

    await softDeleteUser(me.clerkId)
    await softDeleteUser('missing-clerk')

    expect(
      await db.user.findUniqueOrThrow({ where: { id: me.id } }),
    ).toMatchObject({ isDeleted: true, isPublic: false })
  })
})
