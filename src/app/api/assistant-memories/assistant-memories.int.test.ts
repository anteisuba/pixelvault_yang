/**
 * L2a 真库：记忆页那套接口（列 / 写 / 改 / 删 / 清空）。只假 Clerk 登录；服务与库全真。
 * 核的是库里的行：谁的、哪一栏、改没改、删没删，越权的一律不动别人的。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  createDELETE,
  createGET,
  createPATCH,
  createPOST,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import { ASSISTANT_MEMORY_LIMITS } from '@/constants/assistant-memory'
import { GET, POST } from '@/app/api/assistant-memories/route'
import { DELETE, PATCH } from '@/app/api/assistant-memories/[id]/route'
import { POST as CLEAR } from '@/app/api/assistant-memories/clear/route'
import { db } from '@/lib/db'
import { createTestUser, resetDatabase } from '@/test/int/db'

type Envelope<T> = {
  success: boolean
  data?: T
  error?: string
  errorCode?: string
  i18nKey?: string
}
type MemoryRow = { id: string; text: string; scope: string; source: string }

const params = (id: string) => ({ params: Promise.resolve({ id }) })

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
  mockAuthenticated(me.clerkId)
})

function seed(
  userId: string,
  text: string,
  extra: Partial<{
    scope: 'IMAGE' | 'GLOBAL'
    source: 'ASSISTANT' | 'CREATOR'
  }> = {},
) {
  return db.assistantMemory.create({
    data: {
      userId,
      text,
      kind: 'PREFERENCE',
      scope: extra.scope ?? 'IMAGE',
      source: extra.source ?? 'ASSISTANT',
    },
  })
}

async function write(body: Record<string, unknown>) {
  const res = await POST(createPOST('/api/assistant-memories', body))
  return { status: res.status, body: await parseJSON<Envelope<MemoryRow>>(res) }
}

describe('记忆接口（真库）', () => {
  it('没登录 401，不给任何人的记忆，也不写', async () => {
    await seed(me.id, '偏冷色调')
    mockUnauthenticated()
    expect((await GET(createGET('/api/assistant-memories'))).status).toBe(401)
    expect((await write({ text: '一句' })).status).toBe(401)
    expect(await db.assistantMemory.count()).toBe(1)
  })

  it('只列我自己的；带 scope 只列那一栏；词表外的 scope 400', async () => {
    await seed(me.id, '图片台：偏冷色调', { scope: 'IMAGE' })
    await seed(me.id, '全局：不要文字', { scope: 'GLOBAL' })
    await seed(other.id, '别人的')

    const all = await parseJSON<Envelope<MemoryRow[]>>(
      await GET(createGET('/api/assistant-memories')),
    )
    expect(all.data?.map((row) => row.text).sort()).toEqual([
      '全局：不要文字',
      '图片台：偏冷色调',
    ])

    const image = await parseJSON<Envelope<MemoryRow[]>>(
      await GET(createGET('/api/assistant-memories', { scope: 'image' })),
    )
    expect(image.data?.map((row) => row.text)).toEqual(['图片台：偏冷色调'])

    const bad = await GET(
      createGET('/api/assistant-memories', { scope: 'nope' }),
    )
    expect(bad.status).toBe(400)
  })

  it('我写一条：去掉首尾空白、默认全局、来源是「我写的」', async () => {
    const res = await write({ text: '  画面里不要出现文字 ' })
    expect(res.status).toBe(200)
    const row = await db.assistantMemory.findFirstOrThrow({
      where: { userId: me.id },
    })
    expect(row).toMatchObject({
      text: '画面里不要出现文字',
      scope: 'GLOBAL',
      source: 'CREATOR',
    })
  })

  it('⛔ 客户端不能自称来源或类别；空串、超长 400；都不落库', async () => {
    for (const body of [
      { text: '一句', source: 'assistant' },
      { text: '一句', kind: 'fact' },
      { text: '   ' },
      { text: 'x'.repeat(ASSISTANT_MEMORY_LIMITS.maxTextChars + 1) },
    ]) {
      expect((await write(body)).status).toBe(400)
    }
    expect(await db.assistantMemory.count()).toBe(0)
  })

  it('我写的满了 409 带 i18n 键，不多写一条', async () => {
    await db.assistantMemory.createMany({
      data: Array.from(
        { length: ASSISTANT_MEMORY_LIMITS.maxCreatorEntries },
        (_, i) => ({
          userId: me.id,
          text: `第 ${i} 条`,
          kind: 'RULE' as const,
          scope: 'GLOBAL' as const,
          source: 'CREATOR' as const,
        }),
      ),
    })
    const res = await write({ text: '再来一条' })
    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({
      errorCode: 'ASSISTANT_MEMORY_LIMIT_REACHED',
      i18nKey: 'errors.assistantMemory.limitReached',
    })
    expect(await db.assistantMemory.count()).toBe(
      ASSISTANT_MEMORY_LIMITS.maxCreatorEntries,
    )
  })

  it('就地改字、改用在哪；改类别 / 来源 / 空载荷 400；别人的 404 且不动', async () => {
    const mine = await seed(me.id, '原来那行')
    const path = `/api/assistant-memories/${mine.id}`

    expect(
      (await PATCH(createPATCH(path, { text: '改过的' }), params(mine.id)))
        .status,
    ).toBe(200)
    expect(
      (await PATCH(createPATCH(path, { scope: 'global' }), params(mine.id)))
        .status,
    ).toBe(200)
    expect(
      await db.assistantMemory.findUniqueOrThrow({ where: { id: mine.id } }),
    ).toMatchObject({
      text: '改过的',
      scope: 'GLOBAL',
    })

    for (const body of [
      { text: '还行', kind: 'fact' },
      { source: 'creator' },
      {},
      { text: '  ' },
    ]) {
      expect(
        (await PATCH(createPATCH(path, body), params(mine.id))).status,
      ).toBe(400)
    }

    const theirs = await seed(other.id, '别人的')
    const stolen = await PATCH(
      createPATCH(`/api/assistant-memories/${theirs.id}`, { text: '偷改' }),
      params(theirs.id),
    )
    expect(stolen.status).toBe(404)
    expect(
      (await db.assistantMemory.findUniqueOrThrow({ where: { id: theirs.id } }))
        .text,
    ).toBe('别人的')
  })

  it('删一条真删；别人的 404 且还在', async () => {
    const mine = await seed(me.id, '要删的')
    const theirs = await seed(other.id, '别人的')

    expect(
      (
        await DELETE(
          createDELETE(`/api/assistant-memories/${mine.id}`),
          params(mine.id),
        )
      ).status,
    ).toBe(200)
    expect(await db.assistantMemory.count({ where: { id: mine.id } })).toBe(0)

    const stolen = await DELETE(
      createDELETE(`/api/assistant-memories/${theirs.id}`),
      params(theirs.id),
    )
    expect(stolen.status).toBe(404)
    expect(await db.assistantMemory.count({ where: { id: theirs.id } })).toBe(1)
  })

  it('清空：没 confirm 400；带来源只清那一栏；只清我的', async () => {
    await seed(me.id, '助手记的 1', { source: 'ASSISTANT' })
    await seed(me.id, '助手记的 2', { source: 'ASSISTANT' })
    await seed(me.id, '我写的', { source: 'CREATOR' })
    await seed(other.id, '别人的')
    const clear = (body: unknown) =>
      CLEAR(createPOST('/api/assistant-memories/clear', body))

    expect((await clear({})).status).toBe(400)
    expect((await clear({ confirm: true, source: 'model' })).status).toBe(400)
    expect(await db.assistantMemory.count()).toBe(4)

    const partial = await parseJSON<Envelope<{ cleared: number }>>(
      await clear({ confirm: true, source: 'assistant' }),
    )
    expect(partial.data?.cleared).toBe(2)
    expect(
      (await db.assistantMemory.findMany({ where: { userId: me.id } })).map(
        (row) => row.text,
      ),
    ).toEqual(['我写的'])

    const rest = await parseJSON<Envelope<{ cleared: number }>>(
      await clear({ confirm: true }),
    )
    expect(rest.data?.cleared).toBe(1)
    expect(
      await db.assistantMemory.count({ where: { userId: other.id } }),
    ).toBe(1)
  })
})
