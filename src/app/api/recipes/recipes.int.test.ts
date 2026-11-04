/**
 * L2a 真库：提示词模板（配方）那套接口——存 / 列 / 读 / 改 / 删 / 收藏 / 记使用 / 从一张图存。
 * 只假 Clerk 登录；服务与库全真。越权的一律 404 且不动别人的行。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  createDELETE,
  createGET,
  createPATCH,
  createPOST,
  createPUT,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import { GET as LIST, POST } from '@/app/api/recipes/route'
import { DELETE, GET, PATCH } from '@/app/api/recipes/[id]/route'
import { PUT as FAVORITE } from '@/app/api/recipes/[id]/favorite/route'
import { POST as USE } from '@/app/api/recipes/[id]/use/route'
import { POST as FROM_GENERATION } from '@/app/api/recipes/from-generation/route'
import { db } from '@/lib/db'
import { createTestUser, resetDatabase } from '@/test/int/db'

type Envelope<T> = { success: boolean; data?: T; error?: string }
type Recipe = { id: string; name: string; compiledPrompt: string }

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const BODY = {
  name: '雪地狐狸',
  compiledPrompt: 'a red fox in snow, cinematic',
  modelId: 'seedream-5.0-lite',
  provider: 'fal',
}

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
  mockAuthenticated(me.clerkId)
})

async function create(body: Record<string, unknown> = BODY): Promise<Recipe> {
  const res = await POST(createPOST('/api/recipes', body))
  const parsed = await parseJSON<Envelope<Recipe>>(res)
  expect(parsed.success, parsed.error).toBe(true)
  return parsed.data!
}

async function asOther<T>(run: () => Promise<T>): Promise<T> {
  mockAuthenticated(other.clerkId)
  try {
    return await run()
  } finally {
    mockAuthenticated(me.clerkId)
  }
}

describe('配方接口（真库）', () => {
  it('没登录 401，不读不写', async () => {
    mockUnauthenticated()
    expect((await POST(createPOST('/api/recipes', BODY))).status).toBe(401)
    expect((await LIST(createGET('/api/recipes'))).status).toBe(401)
    expect(await db.recipe.count()).toBe(0)
  })

  it('存一条属于我；缺提示词或型号 400 不落库', async () => {
    const recipe = await create()
    expect(
      await db.recipe.findUniqueOrThrow({ where: { id: recipe.id } }),
    ).toMatchObject({ userId: me.id, compiledPrompt: BODY.compiledPrompt })

    for (const missing of ['compiledPrompt', 'modelId']) {
      const body: Record<string, unknown> = { ...BODY }
      delete body[missing]
      expect((await POST(createPOST('/api/recipes', body))).status).toBe(400)
    }
    expect(await db.recipe.count()).toBe(1)
  })

  it('列表只列我的、按页切', async () => {
    for (let i = 0; i < 3; i++) await create({ ...BODY, name: `我的 ${i}` })
    await asOther(() => create({ ...BODY, name: '别人的' }))

    const page = await parseJSON<
      Envelope<{ recipes: Recipe[]; total: number }>
    >(await LIST(createGET('/api/recipes', { page: '1', limit: '2' })))
    const items = page.data?.recipes ?? []
    expect(page.data?.total).toBe(3)
    expect(items).toHaveLength(2)
    expect(items.every((item) => item.name.startsWith('我的'))).toBe(true)
  })

  it('读 / 改我的；改了落库；载荷不对 400；别人的读不到改不动', async () => {
    const recipe = await create()
    const path = `/api/recipes/${recipe.id}`

    const got = await parseJSON<Envelope<Recipe>>(
      await GET(createGET(path), params(recipe.id)),
    )
    expect(got.data?.name).toBe(BODY.name)

    const updated = await PATCH(
      createPATCH(path, { ...BODY, name: '改过的' }),
      params(recipe.id),
    )
    expect(updated.status).toBe(200)
    expect(
      (await PATCH(createPATCH(path, { name: 'x' }), params(recipe.id))).status,
    ).toBe(400)
    expect(
      (await db.recipe.findUniqueOrThrow({ where: { id: recipe.id } })).name,
    ).toBe('改过的')

    expect(
      (await asOther(() => GET(createGET(path), params(recipe.id)))).status,
    ).toBe(404)
    expect(
      (
        await asOther(() =>
          PATCH(
            createPATCH(path, { ...BODY, name: '偷改' }),
            params(recipe.id),
          ),
        )
      ).status,
    ).toBe(404)
    expect(
      (await db.recipe.findUniqueOrThrow({ where: { id: recipe.id } })).name,
    ).toBe('改过的')
  })

  it('删：别人删不掉；我删了读不到', async () => {
    const recipe = await create()
    const path = `/api/recipes/${recipe.id}`
    expect(
      (await asOther(() => DELETE(createDELETE(path), params(recipe.id))))
        .status,
    ).toBe(404)
    expect((await GET(createGET(path), params(recipe.id))).status).toBe(200)

    expect((await DELETE(createDELETE(path), params(recipe.id))).status).toBe(
      200,
    )
    expect((await GET(createGET(path), params(recipe.id))).status).toBe(404)
  })

  it('收藏 / 记使用落库；多带字段 400；别人的 404', async () => {
    const recipe = await create()
    const favorite = (body: unknown) =>
      FAVORITE(
        createPUT(`/api/recipes/${recipe.id}/favorite`, body),
        params(recipe.id),
      )
    const use = (body: unknown) =>
      USE(createPUT(`/api/recipes/${recipe.id}/use`, body), params(recipe.id))

    expect((await favorite({ isFavorite: true })).status).toBe(200)
    expect((await use({})).status).toBe(200)
    const row = await db.recipe.findUniqueOrThrow({ where: { id: recipe.id } })
    expect(row.isFavorite).toBe(true)
    expect(row.lastUsedAt).not.toBeNull()

    expect((await favorite({ isFavorite: false, extra: 1 })).status).toBe(400)
    expect((await use({ extra: 1 })).status).toBe(400)

    expect((await asOther(() => favorite({ isFavorite: false }))).status).toBe(
      404,
    )
    expect((await asOther(() => use({}))).status).toBe(404)
    expect(
      (await db.recipe.findUniqueOrThrow({ where: { id: recipe.id } }))
        .isFavorite,
    ).toBe(true)
  })

  it('从我的一张图存成模板：提示词与型号照图上的；别人的图 404；缺 id 400', async () => {
    const generation = await db.generation.create({
      data: {
        userId: me.id,
        url: 'https://cdn.test/a.png',
        storageKey: 'a.png',
        prompt: 'a red fox in snow',
        model: 'seedream-5.0-lite',
        provider: 'fal',
      },
    })
    const theirs = await db.generation.create({
      data: {
        userId: other.id,
        url: 'https://cdn.test/b.png',
        storageKey: 'b.png',
        prompt: 'not mine',
        model: 'seedream-5.0-lite',
        provider: 'fal',
      },
    })
    const save = (body: unknown) =>
      FROM_GENERATION(createPOST('/api/recipes/from-generation', body))

    const saved = await parseJSON<Envelope<Recipe>>(
      await save({ generationId: generation.id, name: 'Hero prompt' }),
    )
    expect(saved.success, saved.error).toBe(true)
    expect(
      await db.recipe.findUniqueOrThrow({ where: { id: saved.data!.id } }),
    ).toMatchObject({
      userId: me.id,
      name: 'Hero prompt',
      compiledPrompt: 'a red fox in snow',
      modelId: 'seedream-5.0-lite',
    })

    expect((await save({ generationId: theirs.id })).status).toBe(404)
    expect((await save({})).status).toBe(400)
    expect(await db.recipe.count()).toBe(1)
  })
})
