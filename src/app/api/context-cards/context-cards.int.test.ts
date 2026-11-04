/**
 * L2a 真库：素材卡那套接口（列 / 建 / 改 / 删 / 挂图 / 摘图）。只假边界：Clerk 登录、R2。
 * 核的是库里的行与 R2 上真的写了 / 删了什么；越权的一律不动别人的。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const r2 = vi.hoisted(() => ({
  uploaded: [] as string[],
  deleted: [] as string[],
}))
vi.mock('@/services/storage/r2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/storage/r2')>()
  return {
    ...actual,
    uploadToR2: vi.fn(async ({ key }: { key: string }) => {
      r2.uploaded.push(key)
      return `${process.env.NEXT_PUBLIC_STORAGE_BASE_URL ?? 'https://cdn.test'}/${key}`
    }),
    deleteFromR2: vi.fn(async (key: string) => {
      r2.deleted.push(key)
    }),
  }
})

import {
  createDELETE,
  createGET,
  createPATCH,
  createPOST,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import { CONTEXT_CARD_LIMITS } from '@/constants/context-cards'
import { GET, POST } from '@/app/api/context-cards/route'
import { DELETE, PATCH } from '@/app/api/context-cards/[id]/route'
import {
  DELETE as REMOVE_IMAGE,
  POST as ADD_IMAGE,
} from '@/app/api/context-cards/[id]/images/route'
import { db } from '@/lib/db'
import { createTestUser, resetDatabase } from '@/test/int/db'

type Envelope<T> = {
  success: boolean
  data?: T
  error?: string
  errorCode?: string
  i18nKey?: string
}
type Card = {
  id: string
  name: string
  images: Array<{ url: string; role: string }>
  pinnedScopes: string[]
}

/** 64×64 的真 PNG（服务端按文件头认格式）。 */
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsItjJrMbxgi+hcEKLNP1WgQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQELgteuuE8uE1jwAAAAABJRU5ErkJggg=='

const params = (id: string) => ({ params: Promise.resolve({ id }) })

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  r2.uploaded.length = 0
  r2.deleted.length = 0
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
  mockAuthenticated(me.clerkId)
})

async function create(body: Record<string, unknown>) {
  const res = await POST(createPOST('/api/context-cards', body))
  return { status: res.status, body: await parseJSON<Envelope<Card>>(res) }
}

async function seedCard(userId: string, name: string) {
  return db.contextCard.create({
    data: { userId, kind: 'CHARACTER', name, summary: '', body: '' },
  })
}

describe('素材卡接口（真库）', () => {
  it('没登录 401，不读不写', async () => {
    mockUnauthenticated()
    expect((await GET(createGET('/api/context-cards'))).status).toBe(401)
    expect((await create({ kind: 'character', name: 'x' })).status).toBe(401)
    expect(await db.contextCard.count()).toBe(0)
  })

  it('建一张：摘要正文缺省空串、属于我；空名字和递图 URL 都 400 不落库', async () => {
    const ok = await create({ kind: 'character', name: 'Sigrika' })
    expect(ok.status).toBe(200)
    expect(
      await db.contextCard.findUniqueOrThrow({
        where: { id: ok.body.data!.id },
      }),
    ).toMatchObject({ userId: me.id, name: 'Sigrika', summary: '', body: '' })

    expect((await create({ kind: 'character', name: '   ' })).status).toBe(400)
    expect(
      (
        await create({
          kind: 'character',
          name: 'X',
          images: [{ url: 'https://evil.example.com/x.png', role: 'sheet' }],
        })
      ).status,
    ).toBe(400)
    expect(await db.contextCard.count()).toBe(1)
  })

  it('撞上限 409 带 i18n 键，不多建', async () => {
    await db.contextCard.createMany({
      data: Array.from({ length: CONTEXT_CARD_LIMITS.maxPerUser }, (_, i) => ({
        userId: me.id,
        kind: 'STYLE' as const,
        name: `卡 ${i}`,
        summary: '',
        body: '',
      })),
    })
    const res = await create({ kind: 'style', name: 'one more' })
    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({
      errorCode: 'CONTEXT_CARD_LIMIT_REACHED',
      i18nKey: 'errors.contextCard.limitReached',
    })
    expect(await db.contextCard.count()).toBe(CONTEXT_CARD_LIMITS.maxPerUser)
  })

  it('只列我的；按 kind 过滤；词表外的 kind / status 400', async () => {
    await seedCard(me.id, '我的角色')
    await db.contextCard.create({
      data: {
        userId: me.id,
        kind: 'STYLE',
        name: '我的画风',
        summary: '',
        body: '',
      },
    })
    await seedCard(other.id, '别人的')

    const all = await parseJSON<Envelope<Card[]>>(
      await GET(createGET('/api/context-cards')),
    )
    expect(all.data?.map((card) => card.name).sort()).toEqual([
      '我的画风',
      '我的角色',
    ])

    const styles = await parseJSON<Envelope<Card[]>>(
      await GET(createGET('/api/context-cards', { kind: 'style' })),
    )
    expect(styles.data?.map((card) => card.name)).toEqual(['我的画风'])

    expect(
      (await GET(createGET('/api/context-cards', { kind: 'nope' }))).status,
    ).toBe(400)
    expect(
      (await GET(createGET('/api/context-cards', { status: 'nope' }))).status,
    ).toBe(400)
  })

  it('改名、常挂开关落库；空载荷与 pin + pinnedScopes 同给 400；别人的 404 不动', async () => {
    const card = await seedCard(me.id, '原名')
    const patch = (body: unknown, id = card.id) =>
      PATCH(createPATCH(`/api/context-cards/${id}`, body), params(id))

    expect((await patch({ name: '新名' })).status).toBe(200)
    expect(
      (await patch({ pin: { scope: 'video', pinned: true } })).status,
    ).toBe(200)
    expect(
      await db.contextCard.findUniqueOrThrow({ where: { id: card.id } }),
    ).toMatchObject({
      name: '新名',
      pinnedScopes: ['video'],
    })

    expect((await patch({})).status).toBe(400)
    expect(
      (
        await patch({
          pinnedScopes: ['image'],
          pin: { scope: 'video', pinned: true },
        })
      ).status,
    ).toBe(400)

    const theirs = await seedCard(other.id, '别人的')
    expect((await patch({ name: 'hijack' }, theirs.id)).status).toBe(404)
    expect(
      (await db.contextCard.findUniqueOrThrow({ where: { id: theirs.id } }))
        .name,
    ).toBe('别人的')
  })

  it('挂图：真读文件头、上 R2、落到卡上；摘图按 URL 摘并删 R2；别人的卡 404', async () => {
    const card = await seedCard(me.id, 'Sigrika')
    const added = await parseJSON<Envelope<Card>>(
      await ADD_IMAGE(
        createPATCH(`/api/context-cards/${card.id}/images`, { imageData: PNG }),
        params(card.id),
      ),
    )
    expect(added.success, added.error).toBe(true)
    expect(r2.uploaded).toHaveLength(1)
    const stored = await db.contextCard.findUniqueOrThrow({
      where: { id: card.id },
    })
    const images = stored.images as Card['images']
    expect(images).toHaveLength(1)
    expect(images[0].role).toBe('reference')
    expect(images[0].url).toContain(r2.uploaded[0])

    const gif = await ADD_IMAGE(
      createPATCH(`/api/context-cards/${card.id}/images`, {
        imageData: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
      }),
      params(card.id),
    )
    expect(gif.status).toBe(400)
    expect(await parseJSON(gif)).toMatchObject({
      i18nKey: 'errors.profile.unsupportedImageType',
    })

    const theirs = await seedCard(other.id, '别人的')
    expect(
      (
        await ADD_IMAGE(
          createPATCH(`/api/context-cards/${theirs.id}/images`, {
            imageData: PNG,
          }),
          params(theirs.id),
        )
      ).status,
    ).toBe(404)

    const removed = await REMOVE_IMAGE(
      createPATCH(`/api/context-cards/${card.id}/images`, {
        url: images[0].url,
      }),
      params(card.id),
    )
    expect(removed.status).toBe(200)
    expect(
      (await db.contextCard.findUniqueOrThrow({ where: { id: card.id } }))
        .images,
    ).toEqual([])
    expect(r2.deleted).toContain(r2.uploaded[0])

    const missing = await REMOVE_IMAGE(
      createPATCH(`/api/context-cards/${card.id}/images`, {
        url: images[0].url,
      }),
      params(card.id),
    )
    expect(missing.status).toBe(404)
  })

  it('删卡：别人的 404 不动；删我的之后才清它的图', async () => {
    const card = await seedCard(me.id, '要删的')
    await ADD_IMAGE(
      createPATCH(`/api/context-cards/${card.id}/images`, { imageData: PNG }),
      params(card.id),
    )
    const theirs = await seedCard(other.id, '别人的')

    expect(
      (
        await DELETE(
          createDELETE(`/api/context-cards/${theirs.id}`),
          params(theirs.id),
        )
      ).status,
    ).toBe(404)
    expect(await db.contextCard.count({ where: { id: theirs.id } })).toBe(1)
    expect(r2.deleted).toEqual([])

    expect(
      (
        await DELETE(
          createDELETE(`/api/context-cards/${card.id}`),
          params(card.id),
        )
      ).status,
    ).toBe(200)
    expect(await db.contextCard.count({ where: { id: card.id } })).toBe(0)
    expect(r2.deleted).toEqual(r2.uploaded)
  })
})
