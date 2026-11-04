/**
 * L2a 真库：作品的读口 —— 自己的列表、画廊分页 / 搜索 / 提示词看法、详情、计数、素材库分面。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { db } from '@/lib/db'
import {
  countPublicGenerations,
  countUserGenerationsByType,
  getAssetSectionCounts,
  getGenerationByIdForUser,
  getGenerationsByCharacterCard,
  getOwnedGenerationWithSnapshot,
  getPublicGenerationPage,
  getPublicGenerations,
  getUserGenerations,
} from '@/services/generation.service'
import { clearSearchExpansionCache } from '@/services/search-expansion.service'
import { createTestCard } from '@/test/int/cards'
import { createTestUser, resetDatabase } from '@/test/int/db'
import { createTestFolder, createTestGeneration } from '@/test/int/generations'

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

/** 第 n 天出的图（越大越新）。 */
const day = (n: number) => new Date(Date.UTC(2026, 0, n))
const ids = (rows: { id: string }[]) => rows.map((row) => row.id)
const decodeCursor = (cursor: string | null) =>
  JSON.parse(Buffer.from(cursor ?? '', 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >

beforeEach(async () => {
  await resetDatabase()
  clearSearchExpansionCache()
  // 语义检索没配：搜索扩展只走词库。
  vi.stubEnv('SEMANTIC_INDEX_URL', '')
  me = await createTestUser()
  other = await createTestUser()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getUserGenerations', () => {
  it('只看自己的，新的在前按页切；列表口 ⛔ 带 snapshot', async () => {
    for (let n = 1; n <= 25; n += 1) {
      await createTestGeneration(me.id, {
        id: `mine-${String(n).padStart(2, '0')}`,
        createdAt: day(n),
        snapshot: { referenceImages: ['https://example.com/ref.png'] },
      })
    }
    await createTestGeneration(other.id, { createdAt: day(30) })

    const page = await getUserGenerations(me.id, { page: 3, limit: 10 })

    expect(ids(page)).toEqual([
      'mine-05',
      'mine-04',
      'mine-03',
      'mine-02',
      'mine-01',
    ])
    expect(page[0]).not.toHaveProperty('snapshot')
    expect(page[0]!.referenceImages).toBeUndefined()
  })
})

describe('getPublicGenerations · 画廊', () => {
  beforeEach(async () => {
    await createTestGeneration(other.id, {
      id: 'open-cat',
      prompt: 'a cat',
      isPublic: true,
      isPromptPublic: true,
      createdAt: day(3),
    })
    await createTestGeneration(other.id, {
      id: 'secret-cat',
      prompt: 'secret cat',
      negativePrompt: 'negative',
      isPublic: true,
      isPromptPublic: false,
      createdAt: day(2),
    })
    await createTestGeneration(other.id, {
      id: 'private-cat',
      prompt: 'private cat',
      createdAt: day(1),
    })
    await db.userLike.create({
      data: { userId: me.id, generationId: 'secret-cat' },
    })
  })

  it('访客：只见公开的；提示词没公开的抹掉提示词，带作者与点赞', async () => {
    const result = await getPublicGenerations({ viewerUserId: me.id })

    expect(ids(result)).toEqual(['open-cat', 'secret-cat'])
    expect(result[1]).toMatchObject({
      prompt: '',
      negativePrompt: null,
      creator: { username: other.username, displayName: other.displayName },
      likeCount: 1,
      isLiked: true,
    })
    expect(result[0]).toMatchObject({ prompt: 'a cat', isLiked: false })
  })

  it('访客搜索只搜得到公开了提示词的', async () => {
    const result = await getPublicGenerations({
      search: 'CAT',
      viewerUserId: me.id,
    })

    expect(ids(result)).toEqual(['open-cat'])
  })

  it('本人查自己的：私密的也在，提示词原样', async () => {
    const result = await getPublicGenerations({
      userId: other.id,
      search: 'private',
    })

    expect(ids(result)).toEqual(['private-cat'])
    expect(result[0]).toMatchObject({ prompt: 'private cat' })
  })

  it('samePromptAs：同一句提示词的公开作品，谁画的都算', async () => {
    await createTestGeneration(me.id, {
      id: 'my-cat',
      prompt: 'a cat',
      isPublic: true,
      isPromptPublic: true,
    })
    await createTestGeneration(me.id, { prompt: 'a cat' })

    const page = await getPublicGenerationPage({
      samePromptAs: 'open-cat',
      limit: 50,
    })

    expect(ids(page.generations).sort()).toEqual(['my-cat', 'open-cat'])
  })

  it('samePromptAs 的锚点提示词没公开：什么都不给', async () => {
    const page = await getPublicGenerationPage({
      samePromptAs: 'secret-cat',
      limit: 50,
    })

    expect(page.generations).toEqual([])
  })
})

describe('getPublicGenerationPage · 本人搜索的翻译补充', () => {
  beforeEach(async () => {
    await db.danbooruTagName.createMany({
      data: [
        {
          tag: 'rain',
          category: 0,
          count: 100,
          zh: '下雨',
          searchText: '下雨',
        },
        {
          tag: 'cat_ears',
          category: 0,
          count: 50,
          zh: '猫耳',
          searchText: '下雨猫耳',
        },
      ],
    })
  })

  it('字面结果翻完了，再补上翻成英文标签后整词对得上的', async () => {
    await createTestGeneration(me.id, {
      id: 'literal',
      prompt: '下雨的街道',
      createdAt: day(4),
    })
    await createTestGeneration(me.id, {
      id: 'rain',
      prompt: '1girl, rain, street',
      createdAt: day(3),
    })
    await createTestGeneration(me.id, {
      id: 'training',
      prompt: 'training ground',
      createdAt: day(2),
    })
    await createTestGeneration(me.id, {
      id: 'ears',
      prompt: '1girl, cat_ears',
      createdAt: day(1),
    })

    const page = await getPublicGenerationPage({
      userId: me.id,
      search: '下雨',
    })

    expect(ids(page.generations)).toEqual(['literal', 'rain', 'ears'])
    expect(page.total).toBe(3)
    expect(page.hasMore).toBe(false)
  })

  it('字面结果还有下一页：先不补翻译的', async () => {
    for (let n = 1; n <= 3; n += 1) {
      await createTestGeneration(me.id, {
        prompt: `下雨 ${n}`,
        createdAt: day(n),
      })
    }
    await createTestGeneration(me.id, { id: 'rain', prompt: 'rain' })

    const page = await getPublicGenerationPage({
      userId: me.id,
      search: '下雨',
      limit: 2,
    })

    expect(page.hasMore).toBe(true)
    expect(page.generations).toHaveLength(2)
    expect(ids(page.generations)).not.toContain('rain')
  })
})

describe('getPublicGenerationPage · 分页', () => {
  beforeEach(async () => {
    for (let n = 1; n <= 4; n += 1) {
      await createTestGeneration(me.id, {
        id: `gen-${n}`,
        createdAt: day(n),
        isPublic: true,
      })
    }
  })

  it('首页带总数；游标页 ⛔ 再数，接着上一页往下', async () => {
    const first = await getPublicGenerationPage({ userId: me.id, limit: 2 })

    expect(ids(first.generations)).toEqual(['gen-4', 'gen-3'])
    expect(first).toMatchObject({ total: 4, hasMore: true })
    expect(decodeCursor(first.nextCursor).id).toBe('gen-3')

    const second = await getPublicGenerationPage({
      userId: me.id,
      cursor: first.nextCursor!,
      limit: 2,
    })

    expect(ids(second.generations)).toEqual(['gen-2', 'gen-1'])
    expect(second).toMatchObject({
      total: null,
      hasMore: false,
      nextCursor: null,
    })
  })

  it('选图器不要总数：total 为 null', async () => {
    const page = await getPublicGenerationPage({
      userId: me.id,
      includeTotal: false,
      limit: 24,
    })

    expect(page.generations).toHaveLength(4)
    expect(page.total).toBeNull()
  })

  it('最旧的在前', async () => {
    const page = await getPublicGenerationPage({ limit: 2, sort: 'oldest' })

    expect(ids(page.generations)).toEqual(['gen-1', 'gen-2'])
    expect(page.total).toBe(4)
  })
})

describe('getPublicGenerationPage · 提示词看法', () => {
  it('一段提示词一张卡，最新那张当封面并带作品数；下一页按组偏移接着来', async () => {
    const work = (id: string, prompt: string, n: number) =>
      createTestGeneration(other.id, {
        id,
        prompt,
        createdAt: day(n),
        isPublic: true,
        isPromptPublic: true,
      })
    await work('cat-1', 'cat', 1)
    await work('cat-2', 'cat', 2)
    await work('cat-new', 'cat', 5)
    await work('dog-1', 'dog', 4)
    await work('bird-1', 'bird', 2)
    await work('bird-2', 'bird', 3)
    // 提示词没公开的不进这个看法。
    await createTestGeneration(other.id, {
      prompt: 'hidden',
      createdAt: day(9),
      isPublic: true,
    })

    const first = await getPublicGenerationPage({
      promptPublic: true,
      limit: 2,
    })

    expect(first.generations.map((g) => [g.id, g.promptWorkCount])).toEqual([
      ['cat-new', 3],
      ['dog-1', 1],
    ])
    expect(first).toMatchObject({ total: null, hasMore: true })
    expect(decodeCursor(first.nextCursor)).toEqual({ offset: 2 })

    const second = await getPublicGenerationPage({
      promptPublic: true,
      cursor: first.nextCursor!,
      limit: 2,
    })

    expect(second.generations.map((g) => [g.id, g.promptWorkCount])).toEqual([
      ['bird-2', 2],
    ])
    expect(second.hasMore).toBe(false)
  })
})

describe('详情', () => {
  it('getOwnedGenerationWithSnapshot：只给本人；旧快照的参考图补成带角色的记录', async () => {
    await createTestGeneration(me.id, {
      id: 'legacy',
      snapshot: { referenceImages: ['https://example.com/ref.png'] },
    })
    await createTestGeneration(me.id, {
      id: 'assets',
      snapshot: {
        referenceAssets: [
          { url: 'https://example.com/style.png', role: 'style', weight: 0.8 },
        ],
      },
    })
    await createTestGeneration(me.id, {
      id: 'single',
      referenceImageUrl: 'https://example.com/single-ref.png',
    })
    await createTestGeneration(me.id, { id: 'plain' })

    const refs = async (id: string) =>
      (await getOwnedGenerationWithSnapshot(id, me.id))?.referenceImages

    expect(await refs('legacy')).toEqual([
      { url: 'https://example.com/ref.png', role: 'identity' },
    ])
    expect(await refs('assets')).toEqual([
      { url: 'https://example.com/style.png', role: 'style', weight: 0.8 },
    ])
    expect(await refs('single')).toEqual([
      { url: 'https://example.com/single-ref.png', role: 'identity' },
    ])
    expect(await refs('plain')).toEqual([])
    await expect(
      getOwnedGenerationWithSnapshot('legacy', other.id),
    ).resolves.toBeNull()
    await expect(
      getOwnedGenerationWithSnapshot('missing', me.id),
    ).resolves.toBeNull()
  })

  it('getGenerationByIdForUser：带作者、点赞数与自己赞没赞；别人的拿不到', async () => {
    await createTestGeneration(me.id, { id: 'mine' })
    await db.userLike.createMany({
      data: [
        { userId: me.id, generationId: 'mine' },
        { userId: other.id, generationId: 'mine' },
      ],
    })

    expect(await getGenerationByIdForUser('mine', me.id)).toMatchObject({
      id: 'mine',
      creator: {
        username: me.username,
        displayName: me.displayName,
        avatarUrl: null,
      },
      likeCount: 2,
      isLiked: true,
    })
    await expect(getGenerationByIdForUser('mine', other.id)).resolves.toBeNull()
  })
})

describe('计数', () => {
  it('countPublicGenerations：按模型 / 类型 / 谁赞过筛公开作品', async () => {
    const liked = await createTestGeneration(other.id, {
      model: 'sdxl',
      isPublic: true,
    })
    await createTestGeneration(other.id, { model: 'sdxl', isPublic: true })
    await createTestGeneration(other.id, {
      model: 'sdxl',
      isPublic: true,
      outputType: 'VIDEO',
    })
    const privateOne = await createTestGeneration(other.id, { model: 'sdxl' })
    await db.userLike.createMany({
      data: [
        { userId: me.id, generationId: liked.id },
        { userId: me.id, generationId: privateOne.id },
      ],
    })

    await expect(
      countPublicGenerations({ model: ['sdxl'], type: ['image'] }),
    ).resolves.toBe(2)
    await expect(
      countPublicGenerations({
        model: ['sdxl'],
        type: ['image'],
        likedByUserId: me.id,
        published: true,
      }),
    ).resolves.toBe(1)
  })

  it('countUserGenerationsByType：图与视频各几张', async () => {
    for (const outputType of ['IMAGE', 'IMAGE', 'VIDEO', 'AUDIO'] as const) {
      await createTestGeneration(me.id, { outputType })
    }
    await createTestGeneration(other.id)

    await expect(countUserGenerationsByType(me.id)).resolves.toEqual({
      images: 2,
      videos: 1,
    })
  })
})

describe('getAssetSectionCounts · 素材库分面', () => {
  beforeEach(async () => {
    const make = async (
      n: number,
      data: Parameters<typeof createTestGeneration>[1],
    ) => {
      const rows = []
      for (let i = 0; i < n; i += 1)
        rows.push(await createTestGeneration(me.id, data))
      return rows
    }
    const privateImages = await make(4, { model: 'sdxl' })
    const publicImages = await make(3, { model: 'sdxl', isPublic: true })
    const videos = await make(3, {
      model: 'video-model',
      outputType: 'VIDEO',
      isPublic: true,
    })
    await make(2, {
      model: 'audio-model',
      outputType: 'AUDIO',
      isPublic: true,
    })
    await createTestGeneration(other.id, { model: 'sdxl' })

    // 夹 a 放 5 张图，夹 b 放 3 个视频；删掉的夹不算归档。
    await createTestFolder(me.id, 'a', {
      generationIds: [...privateImages, publicImages[0]!].map((g) => g.id),
    })
    await createTestFolder(me.id, 'b', { generationIds: ids(videos) })
    const gone = await createTestFolder(me.id, 'gone', {
      generationIds: [publicImages[1]!.id],
    })
    await db.project.update({
      where: { id: gone.id },
      data: { isDeleted: true },
    })
    // 收藏：两张图一个视频。
    await db.userLike.createMany({
      data: [privateImages[0]!, publicImages[2]!, videos[0]!].map((g) => ({
        userId: me.id,
        generationId: g.id,
      })),
    })
  })

  const folderIdsByName = async () =>
    Object.fromEntries(
      (await db.project.findMany({ where: { userId: me.id } })).map((p) => [
        p.name,
        p.id,
      ]),
    )

  it('不筛类型：各维度合计，夹按成员表数，未归档 = 一个活夹都不在', async () => {
    const folders = await folderIdsByName()

    expect(await getAssetSectionCounts(me.id)).toEqual({
      all: 12,
      favorites: 3,
      published: 8,
      image: 7,
      video: 3,
      audio: 2,
      model_3d: 0,
      unassigned: 4,
      byProject: { [folders.a!]: 5, [folders.b!]: 3 },
      byModel: { sdxl: 7, 'video-model': 3, 'audio-model': 2 },
    })
  })

  it.each([
    {
      types: ['image'],
      all: 7,
      favorites: 2,
      published: 3,
      unassigned: 2,
      folders: ['a'],
      byModel: { sdxl: 7 },
    },
    {
      types: ['image', 'video'],
      all: 10,
      favorites: 3,
      published: 6,
      unassigned: 2,
      folders: ['a', 'b'],
      byModel: { sdxl: 7, 'video-model': 3 },
    },
  ] as const)(
    '筛到 $types：导航计数跟着收窄，各类型总数不变',
    async ({
      types,
      all,
      favorites,
      published,
      unassigned,
      folders,
      byModel,
    }) => {
      const folderIds = await folderIdsByName()
      const counts = { a: 5, b: 3 } as const

      expect(await getAssetSectionCounts(me.id, [...types])).toEqual({
        all,
        favorites,
        published,
        image: 7,
        video: 3,
        audio: 2,
        model_3d: 0,
        unassigned,
        byProject: Object.fromEntries(
          folders.map((name) => [folderIds[name]!, counts[name]]),
        ),
        byModel,
      })
    },
  )

  it('一张都没有：全是 0', async () => {
    const empty = await createTestUser()

    expect(await getAssetSectionCounts(empty.id)).toEqual({
      all: 0,
      favorites: 0,
      published: 0,
      image: 0,
      video: 0,
      audio: 0,
      model_3d: 0,
      unassigned: 0,
      byProject: {},
      byModel: {},
    })
  })
})

describe('getGenerationsByCharacterCard', () => {
  it('首页数总数；游标页 ⛔ 再数，只给挂了这张卡的本人作品', async () => {
    const card = await createTestCard(me.id)
    for (let n = 1; n <= 3; n += 1) {
      const generation = await createTestGeneration(me.id, {
        id: `card-gen-${n}`,
        createdAt: day(n),
      })
      await db.generationCharacterCard.create({
        data: { generationId: generation.id, characterCardId: card.id },
      })
    }
    await createTestGeneration(me.id, { createdAt: day(9) })

    const first = await getGenerationsByCharacterCard(card.id, me.id, {
      limit: 2,
    })
    expect(ids(first.generations)).toEqual(['card-gen-3', 'card-gen-2'])
    expect(first).toMatchObject({ total: 3, hasMore: true })

    const second = await getGenerationsByCharacterCard(card.id, me.id, {
      cursor: first.nextCursor!,
      limit: 2,
    })
    expect(second).toMatchObject({
      generations: [expect.objectContaining({ id: 'card-gen-1' })],
      total: null,
      hasMore: false,
      nextCursor: null,
    })
  })
})
