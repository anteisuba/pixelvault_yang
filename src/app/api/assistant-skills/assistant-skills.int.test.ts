/**
 * L2a 真库：「你的技能」接口（列 / 建 / 改 / 删 / 内置开关）。只假 Clerk 登录；服务与库全真。
 * 核库里的行：只读写本人的，名字撞了 / 改别人的说人话。
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
import { GET, POST } from '@/app/api/assistant-skills/route'
import { DELETE, PATCH } from '@/app/api/assistant-skills/[id]/route'
import { POST as POST_BUILTIN } from '@/app/api/assistant-skills/builtin/route'
import { BUILTIN_SKILLS } from '@/features/assistant/skills'
import { db } from '@/lib/db'
import { createTestUser, resetDatabase } from '@/test/int/db'

const PATH = '/api/assistant-skills'
type Skill = {
  id: string
  slug: string
  name: string
  origin: string
  enabled: boolean
}
type Envelope<T> = { success: boolean; data?: T; i18nKey?: string }

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const builtin = BUILTIN_SKILLS[0]!

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
  mockAuthenticated(me.clerkId)
})

async function seedSkill(userId: string, name: string) {
  return db.assistantSkill.create({
    data: { userId, name, description: 'd', body: 'b' },
  })
}

describe('/api/assistant-skills（真库）', () => {
  it('未登录 401，不读不写', async () => {
    mockUnauthenticated()
    expect((await GET(createGET(PATH))).status).toBe(401)
    expect(
      (await POST(createPOST(PATH, { name: 'x', description: 'x', body: 'y' })))
        .status,
    ).toBe(401)
    expect(await db.assistantSkill.count()).toBe(0)
  })

  it('读本人那一整套：内置的 + 我写的，别人的不在里面', async () => {
    await seedSkill(me.id, '我的技能')
    await seedSkill(other.id, '别人的技能')
    const body = await parseJSON<Envelope<Skill[]>>(await GET(createGET(PATH)))
    const names = body.data!.map((s) => s.name)
    expect(names).toContain('我的技能')
    expect(names).toContain(builtin.name)
    expect(names).not.toContain('别人的技能')
  })

  it('新建：名字去空格落库；名字里带 / 400 不落库', async () => {
    const bad = await POST(
      createPOST(PATH, { name: 'a/b', description: 'x', body: 'y' }),
    )
    expect(bad.status).toBe(400)

    const ok = await POST(
      createPOST(PATH, {
        name: ' 冬装三视图 ',
        description: '冬装角色出三视图',
        body: '三视图一律白底。',
      }),
    )
    expect(ok.status).toBe(200)
    expect(
      await db.assistantSkill.findMany({
        where: { userId: me.id },
        select: { name: true, description: true, body: true },
      }),
    ).toEqual([
      {
        name: '冬装三视图',
        description: '冬装角色出三视图',
        body: '三视图一律白底。',
      },
    ])
  })

  it('名字撞了自己的或内置的 409，带 i18n 键，不多建', async () => {
    await seedSkill(me.id, '参考图分工')
    for (const name of ['参考图分工', builtin.name]) {
      const res = await POST(
        createPOST(PATH, { name, description: 'x', body: 'y' }),
      )
      expect(res.status).toBe(409)
      expect(await parseJSON(res)).toMatchObject({
        i18nKey: 'errors.assistantSkill.nameTaken',
      })
    }
    expect(await db.assistantSkill.count({ where: { userId: me.id } })).toBe(1)
  })

  it('改 / 删我自己的落库', async () => {
    const mine = await seedSkill(me.id, '我的技能')
    const res = await PATCH(
      createPATCH(`${PATH}/${mine.id}`, { enabled: false }),
      params(mine.id),
    )
    expect(res.status).toBe(200)
    expect(
      (await db.assistantSkill.findUniqueOrThrow({ where: { id: mine.id } }))
        .enabled,
    ).toBe(false)

    expect(
      (await DELETE(createDELETE(`${PATH}/${mine.id}`), params(mine.id)))
        .status,
    ).toBe(200)
    expect(await db.assistantSkill.count({ where: { id: mine.id } })).toBe(0)
  })

  it('改 / 删别人的 404，别人的行不动', async () => {
    const theirs = await seedSkill(other.id, '别人的技能')
    expect(
      (
        await PATCH(
          createPATCH(`${PATH}/${theirs.id}`, { enabled: false }),
          params(theirs.id),
        )
      ).status,
    ).toBe(404)
    expect(
      (await DELETE(createDELETE(`${PATH}/${theirs.id}`), params(theirs.id)))
        .status,
    ).toBe(404)
    expect(
      await db.assistantSkill.findUniqueOrThrow({ where: { id: theirs.id } }),
    ).toMatchObject({ enabled: true })
  })

  it('内置：关掉落一行我的；什么都不给 400；不认识的 slug 404', async () => {
    expect(
      (
        await POST_BUILTIN(
          createPOST(`${PATH}/builtin`, { slug: builtin.slug }),
        )
      ).status,
    ).toBe(400)

    const res = await POST_BUILTIN(
      createPOST(`${PATH}/builtin`, { slug: builtin.slug, enabled: false }),
    )
    expect(res.status).toBe(200)
    const listed = (await parseJSON<Envelope<Skill[]>>(res)).data!
    expect(listed.find((s) => s.slug === builtin.slug)?.enabled).toBe(false)
    expect(
      await db.assistantSkill.findMany({
        where: { userId: me.id },
        select: { builtinSlug: true, enabled: true },
      }),
    ).toEqual([{ builtinSlug: builtin.slug, enabled: false }])

    const unknown = await POST_BUILTIN(
      createPOST(`${PATH}/builtin`, { slug: 'no-such-skill', enabled: false }),
    )
    expect(unknown.status).toBe(404)
    expect(await parseJSON(unknown)).toMatchObject({
      i18nKey: 'errors.assistantSkill.unknownBuiltin',
    })
  })
})
