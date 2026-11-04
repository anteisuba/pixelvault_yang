/**
 * L2a 真库：素材文件夹接口——改 / 删一个夹（/api/projects/[id]）、放进拿出（items）、
 * 同层拖动排序（order）、工作台历史（history）。只假 Clerk 登录；服务与库全真。
 * 核库里的行：别人的夹一律 404 且不动；删夹不删图。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  createDELETE,
  createGET,
  createPATCH,
  createPUT,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import { DELETE, PUT } from '@/app/api/projects/[id]/route'
import { PATCH as PATCH_ITEMS } from '@/app/api/projects/[id]/items/route'
import { GET as GET_HISTORY } from '@/app/api/projects/[id]/history/route'
import { PUT as PUT_ORDER } from '@/app/api/projects/order/route'
import { db } from '@/lib/db'
import { createTestUser, resetDatabase } from '@/test/int/db'
import { seedGeneration } from '@/test/int/seed-generation'

type Envelope<T> = { success: boolean; data?: T; error?: string }

const params = (id: string) => ({ params: Promise.resolve({ id }) })

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
  mockAuthenticated(me.clerkId)
})

function seedFolder(
  userId: string,
  name: string,
  extra: { parentId?: string; sortOrder?: number } = {},
) {
  return db.project.create({ data: { userId, name, ...extra } })
}

describe('PUT / DELETE /api/projects/[id]（真库）', () => {
  const put = (id: string, body: unknown) =>
    PUT(createPUT(`/api/projects/${id}`, body), params(id))

  it('没登录 401，不改', async () => {
    const folder = await seedFolder(me.id, '旧名')
    mockUnauthenticated()
    expect((await put(folder.id, { name: '新名' })).status).toBe(401)
    expect(
      (
        await DELETE(
          createDELETE(`/api/projects/${folder.id}`),
          params(folder.id),
        )
      ).status,
    ).toBe(401)
    expect(
      await db.project.findUniqueOrThrow({ where: { id: folder.id } }),
    ).toMatchObject({
      name: '旧名',
      isDeleted: false,
    })
  })

  it('改名落库；空名字 400 不改', async () => {
    const folder = await seedFolder(me.id, '旧名')
    expect((await put(folder.id, { name: '' })).status).toBe(400)
    const res = await put(folder.id, { name: '新名' })
    expect(
      (await parseJSON<Envelope<{ name: string }>>(res)).data,
    ).toMatchObject({
      name: '新名',
    })
    expect(
      (await db.project.findUniqueOrThrow({ where: { id: folder.id } })).name,
    ).toBe('新名')
  })

  it('置顶 / 取消置顶落到 pinnedOrder', async () => {
    const folder = await seedFolder(me.id, '夹')
    await put(folder.id, { pinned: true })
    expect(
      (await db.project.findUniqueOrThrow({ where: { id: folder.id } }))
        .pinnedOrder,
    ).not.toBeNull()
    await put(folder.id, { pinned: false })
    expect(
      (await db.project.findUniqueOrThrow({ where: { id: folder.id } }))
        .pinnedOrder,
    ).toBeNull()
  })

  it('别人的夹：改 / 删都 404，不动', async () => {
    const theirs = await seedFolder(other.id, '别人的')
    expect((await put(theirs.id, { name: 'x' })).status).toBe(404)
    expect(
      (
        await DELETE(
          createDELETE(`/api/projects/${theirs.id}`),
          params(theirs.id),
        )
      ).status,
    ).toBe(404)
    expect(
      await db.project.findUniqueOrThrow({ where: { id: theirs.id } }),
    ).toMatchObject({
      name: '别人的',
      isDeleted: false,
    })
  })

  it('删夹：软删、清归属不删图，子夹往上挪一层', async () => {
    const parent = await seedFolder(me.id, '父')
    const child = await seedFolder(me.id, '子', { parentId: parent.id })
    const gen = await seedGeneration(me.id)
    await db.projectItem.create({
      data: { projectId: parent.id, generationId: gen.id },
    })

    const res = await DELETE(
      createDELETE(`/api/projects/${parent.id}`),
      params(parent.id),
    )
    expect(res.status).toBe(200)
    expect(
      await db.project.findUniqueOrThrow({ where: { id: parent.id } }),
    ).toMatchObject({
      isDeleted: true,
    })
    expect(
      (await db.project.findUniqueOrThrow({ where: { id: child.id } }))
        .parentId,
    ).toBeNull()
    expect(await db.projectItem.count()).toBe(0)
    expect(await db.generation.count({ where: { id: gen.id } })).toBe(1)
  })
})

describe('PATCH /api/projects/[id]/items（真库）', () => {
  const patch = (id: string, body: unknown) =>
    PATCH_ITEMS(createPATCH(`/api/projects/${id}/items`, body), params(id))
  const itemsOf = async (projectId: string) =>
    (await db.projectItem.findMany({ where: { projectId } }))
      .map((row) => row.generationId)
      .sort()

  it('放进去：回真的新放进去的那些（原来就在的不算）；再拿出来', async () => {
    const folder = await seedFolder(me.id, '夹')
    const a = await seedGeneration(me.id)
    const b = await seedGeneration(me.id)
    await db.projectItem.create({
      data: { projectId: folder.id, generationId: a.id },
    })

    const res = await patch(folder.id, { add: [a.id, b.id] })
    expect((await parseJSON<Envelope<unknown>>(res)).data).toEqual({
      added: [b.id],
      removed: [],
    })
    expect(await itemsOf(folder.id)).toEqual([a.id, b.id].sort())

    const out = await patch(folder.id, { remove: [a.id] })
    expect((await parseJSON<Envelope<unknown>>(out)).data).toEqual({
      added: [],
      removed: [a.id],
    })
    expect(await itemsOf(folder.id)).toEqual([b.id])
  })

  it('什么都不给 400；别人的夹 404 不落行；没登录 401', async () => {
    const folder = await seedFolder(me.id, '夹')
    const theirs = await seedFolder(other.id, '别人的')
    const gen = await seedGeneration(me.id)
    expect((await patch(folder.id, { add: [], remove: [] })).status).toBe(400)
    expect((await patch(theirs.id, { add: [gen.id] })).status).toBe(404)
    mockUnauthenticated()
    expect((await patch(folder.id, { add: [gen.id] })).status).toBe(401)
    expect(await db.projectItem.count()).toBe(0)
  })
})

describe('PUT /api/projects/order（真库）', () => {
  it('同一层按给的顺序重写 sortOrder', async () => {
    const a = await seedFolder(me.id, 'A', { sortOrder: 0 })
    const b = await seedFolder(me.id, 'B', { sortOrder: 1 })
    const c = await seedFolder(me.id, 'C', { sortOrder: 2 })
    const res = await PUT_ORDER(
      createPUT('/api/projects/order', {
        kind: 'tree',
        parentId: null,
        ids: [c.id, a.id, b.id],
      }),
    )
    expect(res.status).toBe(200)
    const rows = await db.project.findMany({
      orderBy: { sortOrder: 'asc' },
      select: { id: true },
    })
    expect(rows.map((r) => r.id)).toEqual([c.id, a.id, b.id])
  })

  it('不认识的 kind 400；没登录 401', async () => {
    expect(
      (
        await PUT_ORDER(
          createPUT('/api/projects/order', { kind: 'nope', ids: [] }),
        )
      ).status,
    ).toBe(400)
    mockUnauthenticated()
    expect(
      (
        await PUT_ORDER(
          createPUT('/api/projects/order', { kind: 'pins', ids: [] }),
        )
      ).status,
    ).toBe(401)
  })
})

describe('GET /api/projects/[id]/history（真库）', () => {
  type History = {
    generations: Array<{ id: string }>
    total: number
    hasMore: boolean
  }
  const history = async (id: string, query?: Record<string, string>) => {
    const res = await GET_HISTORY(
      createGET(`/api/projects/${id}/history`, query),
      params(id),
    )
    return { status: res.status, body: await parseJSON<Envelope<History>>(res) }
  }

  it('unassigned：只列我的、不在任何夹里的；按类型筛', async () => {
    const folder = await seedFolder(me.id, '夹')
    const loose = await seedGeneration(me.id)
    const video = await seedGeneration(me.id, { outputType: 'VIDEO' })
    const filed = await seedGeneration(me.id)
    await seedGeneration(other.id)
    await db.projectItem.create({
      data: { projectId: folder.id, generationId: filed.id },
    })

    const all = await history('unassigned')
    expect(all.status).toBe(200)
    expect(all.body.data!.generations.map((g) => g.id).sort()).toEqual(
      [loose.id, video.id].sort(),
    )
    const images = await history('unassigned', { type: 'image' })
    expect(images.body.data!.generations.map((g) => g.id)).toEqual([loose.id])

    const inFolder = await history(folder.id)
    expect(inFolder.body.data).toMatchObject({ total: 1, hasMore: false })
    expect(inFolder.body.data!.generations.map((g) => g.id)).toEqual([filed.id])
  })

  it('没登录 401', async () => {
    mockUnauthenticated()
    expect((await history('unassigned')).status).toBe(401)
  })
})
