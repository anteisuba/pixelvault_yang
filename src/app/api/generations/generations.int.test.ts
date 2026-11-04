/**
 * L2a 真库：作品那几条接口——读 / 删一张（/api/generations/[id]）、公开开关（visibility）、
 * 审核态（review）、音频封面（cover）、画廊列表（/api/images）、对比出图选优胜（/api/studio/select-winner）。
 * 只假边界：Clerk 登录、R2。服务与库全真；越权的一律 404 且不动别人的行。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const r2 = vi.hoisted(() => ({ deleted: [] as string[], fail: false }))
vi.mock('@/services/storage/r2', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/storage/r2')>()),
  deleteManyFromR2: vi.fn(async (keys: string[]) => {
    if (r2.fail) throw new Error('R2 down')
    r2.deleted.push(...keys)
  }),
}))

import {
  createDELETE,
  createGET,
  createPATCH,
  createPOST,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import { DELETE, GET } from '@/app/api/generations/[id]/route'
import { PATCH as PATCH_VISIBILITY } from '@/app/api/generations/[id]/visibility/route'
import { PATCH as PATCH_REVIEW } from '@/app/api/generations/[id]/review/route'
import { PATCH as PATCH_COVER } from '@/app/api/generations/[id]/cover/route'
import { GET as LIST_IMAGES } from '@/app/api/images/route'
import { POST as SELECT_WINNER } from '@/app/api/studio/select-winner/route'
import { MODEL_OPTIONS } from '@/constants/models'
import { db } from '@/lib/db'
import { createTestUser, resetDatabase } from '@/test/int/db'
import { seedGeneration } from '@/test/int/seed-generation'

type Envelope<T> = {
  success: boolean
  data?: T
  error?: string
  errorCode?: string
  i18nKey?: string
}

/** 画廊按模型筛只认目录里的 id（不认识的直接丢掉），所以用两个真 id。 */
const [MODEL_A, MODEL_B] = MODEL_OPTIONS.filter(
  (m) => m.outputType === 'IMAGE',
).map((m) => m.id)

const params = (id: string) => ({ params: Promise.resolve({ id }) })

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  r2.deleted.length = 0
  r2.fail = false
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
  mockAuthenticated(me.clerkId)
})

describe('/api/generations/[id]（真库）', () => {
  it('没登录 401，不删', async () => {
    const gen = await seedGeneration(me.id)
    mockUnauthenticated()
    expect(
      (await DELETE(createDELETE(`/api/generations/${gen.id}`), params(gen.id)))
        .status,
    ).toBe(401)
    expect(await db.generation.count()).toBe(1)
  })

  it('读我的一张带快照；别人的 404', async () => {
    const mine = await seedGeneration(me.id, { snapshot: { preset: 'x' } })
    const theirs = await seedGeneration(other.id)
    const res = await GET(
      createGET(`/api/generations/${mine.id}`),
      params(mine.id),
    )
    expect(
      (await parseJSON<Envelope<{ id: string; snapshot: unknown }>>(res)).data,
    ).toMatchObject({ id: mine.id, snapshot: { preset: 'x' } })
    expect(
      (await GET(createGET(`/api/generations/${theirs.id}`), params(theirs.id)))
        .status,
    ).toBe(404)
  })

  it('删我的：行没了，R2 上原图 / 缩略图 / 预览一起清', async () => {
    const gen = await seedGeneration(me.id, {
      storageKey: 'g/a.png',
      thumbnailStorageKey: 'g/a.thumb.webp',
      previewStorageKey: 'g/a.preview.webp',
    })
    const res = await DELETE(
      createDELETE(`/api/generations/${gen.id}`),
      params(gen.id),
    )
    expect(res.status).toBe(200)
    expect(await db.generation.count()).toBe(0)
    await vi.waitFor(() =>
      expect(r2.deleted.sort()).toEqual([
        'g/a.png',
        'g/a.preview.webp',
        'g/a.thumb.webp',
      ]),
    )
  })

  it('R2 清理失败照样删成功', async () => {
    r2.fail = true
    const gen = await seedGeneration(me.id)
    const res = await DELETE(
      createDELETE(`/api/generations/${gen.id}`),
      params(gen.id),
    )
    expect(res.status).toBe(200)
    expect(await db.generation.count()).toBe(0)
  })

  it('删别人的 404，行还在、R2 不动', async () => {
    const theirs = await seedGeneration(other.id)
    expect(
      (
        await DELETE(
          createDELETE(`/api/generations/${theirs.id}`),
          params(theirs.id),
        )
      ).status,
    ).toBe(404)
    expect(await db.generation.count()).toBe(1)
    expect(r2.deleted).toEqual([])
  })
})

describe('PATCH /api/generations/[id]/visibility（真库）', () => {
  const patch = (id: string, body: unknown) =>
    PATCH_VISIBILITY(
      createPATCH(`/api/generations/${id}/visibility`, body),
      params(id),
    )
  const row = (id: string) =>
    db.generation.findUniqueOrThrow({
      where: { id },
      select: { isPublic: true, isPromptPublic: true, isFeatured: true },
    })

  it('不给字段 = 翻公开；给 field / value 按给的落', async () => {
    const gen = await seedGeneration(me.id)
    const res = await patch(gen.id, {})
    expect(
      (await parseJSON<Envelope<{ isPublic: boolean }>>(res)).data,
    ).toMatchObject({
      isPublic: true,
    })
    expect(await row(gen.id)).toMatchObject({ isPublic: true })

    await patch(gen.id, { field: 'isPromptPublic' })
    expect(await row(gen.id)).toMatchObject({ isPromptPublic: true })

    await patch(gen.id, { field: 'isPublic', value: true })
    expect(await row(gen.id)).toMatchObject({ isPublic: true })
    await patch(gen.id, { field: 'isPublic', value: false })
    expect(await row(gen.id)).toMatchObject({ isPublic: false })
  })

  it('values 一次设多格', async () => {
    const gen = await seedGeneration(me.id, { isPromptPublic: true })
    expect(
      (
        await patch(gen.id, {
          values: { isPublic: true, isPromptPublic: false },
        })
      ).status,
    ).toBe(200)
    expect(await row(gen.id)).toEqual({
      isPublic: true,
      isPromptPublic: false,
      isFeatured: false,
    })
  })

  it('提示词过不了公开闸：422 带原因码，不公开', async () => {
    const gen = await seedGeneration(me.id, { prompt: 'nude child' })
    const res = await patch(gen.id, { field: 'isPublic', value: true })
    expect(res.status).toBe(422)
    expect(await parseJSON(res)).toMatchObject({
      errorCode: 'CONTENT_NOT_PUBLISHABLE',
      i18nKey: 'errors.generation.publish_blocked',
    })
    expect(await row(gen.id)).toMatchObject({ isPublic: false })
  })

  it('别人的 404 不动；词表外的 field 400', async () => {
    const theirs = await seedGeneration(other.id)
    expect((await patch(theirs.id, {})).status).toBe(404)
    expect(await row(theirs.id)).toMatchObject({ isPublic: false })
    const mine = await seedGeneration(me.id)
    expect((await patch(mine.id, { field: 'somethingElse' })).status).toBe(400)
  })
})

describe('PATCH /api/generations/[id]/review（真库）', () => {
  const patch = (id: string, body: unknown) =>
    PATCH_REVIEW(createPATCH(`/api/generations/${id}/review`, body), params(id))
  const snapshotOf = async (id: string) =>
    (await db.generation.findUniqueOrThrow({ where: { id } })).snapshot

  it('标 blocked 落进快照、回上一次的态（撤销用）；再标不给理由就清掉理由', async () => {
    const gen = await seedGeneration(me.id, { snapshot: { preset: 'keep' } })
    const res = await patch(gen.id, { state: 'blocked', reason: ' 手指糊了 ' })
    expect((await parseJSON(res)).data).toEqual({
      id: gen.id,
      state: 'blocked',
      previous: 'pending',
    })
    expect(await snapshotOf(gen.id)).toEqual({
      preset: 'keep',
      reviewState: 'blocked',
      reviewReason: '手指糊了',
    })

    const again = await patch(gen.id, { state: 'approved' })
    expect((await parseJSON(again)).data).toMatchObject({ previous: 'blocked' })
    expect(await snapshotOf(gen.id)).toMatchObject({
      reviewState: 'approved',
      reviewReason: null,
    })
  })

  it('别人的 404 不动；词表外的态 / 超长理由 400', async () => {
    const theirs = await seedGeneration(other.id)
    expect((await patch(theirs.id, { state: 'blocked' })).status).toBe(404)
    expect(await snapshotOf(theirs.id)).toBeNull()

    const mine = await seedGeneration(me.id)
    expect((await patch(mine.id, { state: 'rejected' })).status).toBe(400)
    expect(
      (await patch(mine.id, { state: 'blocked', reason: 'x'.repeat(500) }))
        .status,
    ).toBe(400)
    expect(await snapshotOf(mine.id)).toBeNull()
  })

  it('没登录 401', async () => {
    const gen = await seedGeneration(me.id)
    mockUnauthenticated()
    expect((await patch(gen.id, { state: 'blocked' })).status).toBe(401)
  })
})

describe('PATCH /api/generations/[id]/cover（真库）', () => {
  const patch = (id: string, body: unknown) =>
    PATCH_COVER(createPATCH(`/api/generations/${id}/cover`, body), params(id))

  it('音频设封面：落进 previewUrl、清掉配对的对象键', async () => {
    const audio = await seedGeneration(me.id, {
      outputType: 'AUDIO',
      previewStorageKey: 'old/key.webp',
    })
    const res = await patch(audio.id, {
      coverImageUrl: 'https://cdn.test/cover.png',
    })
    expect((await parseJSON(res)).data).toEqual({
      id: audio.id,
      previewUrl: 'https://cdn.test/cover.png',
    })
    expect(
      await db.generation.findUniqueOrThrow({
        where: { id: audio.id },
        select: { previewUrl: true, previewStorageKey: true },
      }),
    ).toEqual({
      previewUrl: 'https://cdn.test/cover.png',
      previewStorageKey: null,
    })
  })

  it('不是音频 / 不是我的 404；地址不合法 400', async () => {
    const image = await seedGeneration(me.id)
    const theirs = await seedGeneration(other.id, { outputType: 'AUDIO' })
    const body = { coverImageUrl: 'https://cdn.test/cover.png' }
    expect((await patch(image.id, body)).status).toBe(404)
    expect((await patch(theirs.id, body)).status).toBe(404)
    expect((await patch(image.id, { coverImageUrl: 'not-a-url' })).status).toBe(
      400,
    )
    expect(
      await db.generation.count({ where: { previewUrl: { not: null } } }),
    ).toBe(0)
  })

  it('没登录 401', async () => {
    const audio = await seedGeneration(me.id, { outputType: 'AUDIO' })
    mockUnauthenticated()
    expect(
      (await patch(audio.id, { coverImageUrl: 'https://cdn.test/c.png' }))
        .status,
    ).toBe(401)
  })
})

describe('GET /api/images（真库）', () => {
  type Page = {
    generations: Array<{ id: string; prompt: string }>
    page: number
    limit: number
    total: number | null
    hasMore: boolean
    nextCursor: string | null
  }
  const list = async (query?: Record<string, string>) => {
    const res = await LIST_IMAGES(createGET('/api/images', query))
    return { status: res.status, body: await parseJSON<Envelope<Page>>(res) }
  }

  it('匿名：只列公开的，默认分页', async () => {
    const pub = await seedGeneration(other.id, { isPublic: true })
    await seedGeneration(other.id)
    mockUnauthenticated()
    const { status, body } = await list()
    expect(status).toBe(200)
    expect(body.data).toMatchObject({
      page: 1,
      limit: 20,
      total: 1,
      hasMore: false,
      nextCursor: null,
    })
    expect(body.data!.generations.map((g) => g.id)).toEqual([pub.id])
  })

  it('按模型 / 类型 / 排序筛；游标翻页接得上', async () => {
    mockUnauthenticated()
    const a = await seedGeneration(other.id, {
      isPublic: true,
      model: MODEL_A,
      createdAt: new Date('2026-01-01'),
    })
    const b = await seedGeneration(other.id, {
      isPublic: true,
      model: MODEL_A,
      createdAt: new Date('2026-01-02'),
    })
    await seedGeneration(other.id, { isPublic: true, model: MODEL_B })
    await seedGeneration(other.id, {
      isPublic: true,
      model: MODEL_A,
      outputType: 'VIDEO',
    })

    const filtered = await list({
      model: MODEL_A,
      type: 'image',
      sort: 'oldest',
    })
    expect(filtered.body.data!.generations.map((g) => g.id)).toEqual([
      a.id,
      b.id,
    ])

    const first = await list({ model: MODEL_A, type: 'image', limit: '1' })
    expect(first.body.data).toMatchObject({ hasMore: true })
    expect(first.body.data!.generations.map((g) => g.id)).toEqual([b.id])
    const second = await list({
      model: MODEL_A,
      type: 'image',
      limit: '1',
      cursor: first.body.data!.nextCursor!,
    })
    expect(second.body.data!.generations.map((g) => g.id)).toEqual([a.id])
    expect(second.body.data!.total).toBeNull()
  })

  it('mine=1：只列我的（含私有）；published=1 只剩我公开的；includeTotal=0 不数总数', async () => {
    const priv = await seedGeneration(me.id)
    const pub = await seedGeneration(me.id, { isPublic: true })
    await seedGeneration(other.id, { isPublic: true })

    const mine = await list({ mine: '1' })
    expect(mine.body.data!.generations.map((g) => g.id).sort()).toEqual(
      [priv.id, pub.id].sort(),
    )
    const published = await list({ mine: '1', published: '1' })
    expect(published.body.data!.generations.map((g) => g.id)).toEqual([pub.id])
    const noTotal = await list({ mine: '1', includeTotal: '0' })
    expect(noTotal.body.data!.total).toBeNull()
    expect(noTotal.body.data!.generations).toHaveLength(2)
  })

  it('mine=1 没登录 401；页码非法 400', async () => {
    mockUnauthenticated()
    expect(await list({ mine: '1' })).toMatchObject({
      status: 401,
      body: { error: 'Unauthorized' },
    })
    expect(await list({ page: '-1' })).toMatchObject({
      status: 400,
      body: { error: 'Invalid query parameters' },
    })
  })
})

describe('POST /api/studio/select-winner（真库）', () => {
  const select = (body: unknown) =>
    SELECT_WINNER(createPOST('/api/studio/select-winner', body))

  it('同一组里只留一个优胜', async () => {
    const a = await seedGeneration(me.id, {
      runGroupId: 'run-1',
      isWinner: true,
    })
    const b = await seedGeneration(me.id, { runGroupId: 'run-1' })
    const res = await select({ runGroupId: 'run-1', generationId: b.id })
    expect(await parseJSON(res)).toMatchObject({ data: { selected: true } })
    const rows = await db.generation.findMany({
      where: { runGroupId: 'run-1' },
      select: { id: true, isWinner: true },
    })
    expect(Object.fromEntries(rows.map((r) => [r.id, r.isWinner]))).toEqual({
      [a.id]: false,
      [b.id]: true,
    })
  })

  it('别人的 / 不在这组的：500，谁的优胜都不变', async () => {
    const theirs = await seedGeneration(other.id, {
      runGroupId: 'run-1',
      isWinner: true,
    })
    const res = await select({ runGroupId: 'run-1', generationId: theirs.id })
    expect(res.status).toBe(500)
    expect(
      (await db.generation.findUniqueOrThrow({ where: { id: theirs.id } }))
        .isWinner,
    ).toBe(true)
  })

  it('没登录 401；缺字段 400', async () => {
    expect((await select({ runGroupId: 'run-1' })).status).toBe(400)
    mockUnauthenticated()
    expect(
      (await select({ runGroupId: 'run-1', generationId: 'g' })).status,
    ).toBe(401)
  })
})
