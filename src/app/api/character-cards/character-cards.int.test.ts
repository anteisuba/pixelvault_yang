/**
 * L2a 真库：角色卡接口（列 / 建 / 读 / 改 / 删）。只假 Clerk 登录；服务与库全真。
 * 删是软删（删了列不到、读不到），别人的卡读不到也改不动。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const uploaded = vi.hoisted(() => [] as string[])
vi.mock('@/services/storage/r2', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/storage/r2')>()),
  uploadToR2: vi.fn(async ({ key }: { key: string }) => {
    uploaded.push(key)
    return `https://cdn.test/${key}`
  }),
}))

import {
  createDELETE,
  createGET,
  createPOST,
  createPUT,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import { GET as LIST, POST } from '@/app/api/character-cards/route'
import { DELETE, GET, PUT } from '@/app/api/character-cards/[id]/route'
import { POST as IMPORT_CHUB } from '@/app/api/character-cards/chub/import/route'
import { TAVERN_CARD } from '@/constants/cards/tavern-card'
import { db } from '@/lib/db'
import { createTestUser, resetDatabase } from '@/test/int/db'

type Envelope<T> = { success: boolean; data?: T; error?: string }
type Card = { id: string; name: string }

const params = (id: string) => ({ params: Promise.resolve({ id }) })

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  uploaded.length = 0
  vi.unstubAllGlobals()
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
  mockAuthenticated(me.clerkId)
})

async function create(name: string): Promise<Card> {
  const body = await parseJSON<Envelope<Card>>(
    await POST(createPOST('/api/character-cards', { name })),
  )
  expect(body.success, body.error).toBe(true)
  return body.data!
}

async function names(): Promise<string[]> {
  const body = await parseJSON<Envelope<Card[]>>(
    await LIST(createGET('/api/character-cards')),
  )
  return (body.data ?? []).map((card) => card.name).sort()
}

describe('角色卡接口（真库）', () => {
  it('没登录 401，不读不写', async () => {
    mockUnauthenticated()
    expect((await LIST(createGET('/api/character-cards'))).status).toBe(401)
    expect(
      (await POST(createPOST('/api/character-cards', { name: 'Mira' }))).status,
    ).toBe(401)
    expect(await db.characterCard.count()).toBe(0)
  })

  it('建一张属于我；空名字 400 不落库；列表只列我的', async () => {
    const card = await create('Mira')
    expect(
      (await db.characterCard.findUniqueOrThrow({ where: { id: card.id } }))
        .userId,
    ).toBe(me.id)
    expect(
      (await POST(createPOST('/api/character-cards', { name: '' }))).status,
    ).toBe(400)

    mockAuthenticated(other.clerkId)
    await create('别人的')
    mockAuthenticated(me.clerkId)
    expect(await names()).toEqual(['Mira'])
  })

  it('读 / 改我的；改名落库；空名字 400；别人的读不到改不动', async () => {
    const card = await create('Mira')
    const got = await parseJSON<Envelope<Card>>(
      await GET(createGET(`/api/character-cards/${card.id}`), params(card.id)),
    )
    expect(got.data?.name).toBe('Mira')

    const put = (body: unknown) =>
      PUT(createPUT(`/api/character-cards/${card.id}`, body), params(card.id))
    expect((await put({ name: 'Mira Prime' })).status).toBe(200)
    expect((await put({ name: '' })).status).toBe(400)
    expect(
      (await db.characterCard.findUniqueOrThrow({ where: { id: card.id } }))
        .name,
    ).toBe('Mira Prime')

    mockAuthenticated(other.clerkId)
    expect(
      (await GET(createGET(`/api/character-cards/${card.id}`), params(card.id)))
        .status,
    ).toBe(404)
    expect((await put({ name: '偷改' })).status).toBe(404)
    expect(
      (await db.characterCard.findUniqueOrThrow({ where: { id: card.id } }))
        .name,
    ).toBe('Mira Prime')
  })

  it('删：别人删不掉；我删了列不到、读不到，再删 404', async () => {
    const card = await create('要删的')
    const del = () =>
      DELETE(createDELETE(`/api/character-cards/${card.id}`), params(card.id))

    mockAuthenticated(other.clerkId)
    expect((await del()).status).toBe(404)
    mockAuthenticated(me.clerkId)
    expect(await names()).toEqual(['要删的'])

    expect((await del()).status).toBe(200)
    expect(await names()).toEqual([])
    expect(
      (await GET(createGET(`/api/character-cards/${card.id}`), params(card.id)))
        .status,
    ).toBe(404)
    expect((await del()).status).toBe(404)
  })
})

describe('从 Chub 导入（真库；只假 Chub 的图片那一跳和 R2）', () => {
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsItjJrMbxgi+hcEKLNP1WgQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQELgteuuE8uE1jwAAAAABJRU5ErkJggg==',
    'base64',
  )
  const definition = {
    name: 'Rei',
    personality: '{{char}} runs a tea shop.',
    tavern_personality: 'calm, dry',
    scenario: 'A rainy night',
    first_message: 'Welcome.',
    example_dialogs: '',
    description: 'My favourite shopkeeper.',
    system_prompt: '',
    post_history_instructions: '',
    alternate_greetings: ['Back again?'],
    embedded_lorebook: { entries: [] },
  }
  const NODE = {
    name: 'Rei',
    topics: ['ROOT', 'Original'],
    max_res_url: 'https://avatars.charhub.io/avatars/maker/rei/a.png',
    definition,
  }
  const importChub = (body: unknown) =>
    IMPORT_CHUB(createPOST('/api/character-cards/chub/import', body))

  it('导入成一张我的卡：名字、人设落库，卡图上了 R2 挂成主图', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(PNG, { headers: { 'content-type': 'image/png' } }),
      ),
    )
    const res = await importChub({
      fullPath: 'maker/rei',
      node: {
        ...NODE,
        definition: { ...definition, scenario: 7, extra: 'drop me' },
      },
    })
    const body = await parseJSON<Envelope<Card>>(res)
    expect(body.success, body.error).toBe(true)

    const card = await db.characterCard.findUniqueOrThrow({
      where: { id: body.data!.id },
      include: { looks: true },
    })
    expect(card).toMatchObject({ userId: me.id, name: 'Rei' })
    expect(JSON.stringify(card.persona)).toContain('runs a tea shop')
    expect(uploaded).toHaveLength(1)
    expect(JSON.stringify(card.looks[0].referenceSlots)).toContain(uploaded[0])
  })

  it('卡图拿不到照样建卡，只是没图', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    )
    const body = await parseJSON<Envelope<Card>>(
      await importChub({ fullPath: 'maker/rei', node: NODE }),
    )
    expect(body.success, body.error).toBe(true)
    expect(uploaded).toEqual([])
    expect(await db.characterCard.count({ where: { userId: me.id } })).toBe(1)
  })

  it('没登录、路径不对、形状不对、超长：都不建卡', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    )
    mockUnauthenticated()
    expect(
      (await importChub({ fullPath: 'maker/rei', node: NODE })).status,
    ).toBe(401)
    mockAuthenticated(me.clerkId)

    for (const fullPath of ['rei', 'maker/rei/extra', 'maker/re i', 'a/b?x']) {
      expect((await importChub({ fullPath, node: NODE })).status).toBe(400)
    }
    for (const node of [undefined, null, 'card', { name: 'Rei' }]) {
      expect((await importChub({ fullPath: 'maker/rei', node })).status).toBe(
        400,
      )
    }
    const half = 'x'.repeat(TAVERN_CARD.MAX_FILE_BYTES / 2 + 1)
    for (const node of [
      {
        ...NODE,
        definition: {
          ...definition,
          system_prompt: 'x'.repeat(TAVERN_CARD.MAX_FILE_BYTES + 1),
        },
      },
      {
        ...NODE,
        definition: { ...definition, personality: half, scenario: half },
      },
      { ...NODE, name: 'x'.repeat(1000) },
      {
        ...NODE,
        max_res_url: `https://avatars.charhub.io/${'x'.repeat(5000)}`,
      },
    ]) {
      expect((await importChub({ fullPath: 'maker/rei', node })).status).toBe(
        400,
      )
    }
    expect(await db.characterCard.count()).toBe(0)
  })
})
