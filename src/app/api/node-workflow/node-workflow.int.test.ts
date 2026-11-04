/**
 * L2a 真库：画布项目接口（/api/node-workflow/projects 与 /[id]）。只假 Clerk 登录；服务与库全真。
 * 写端只收 v4（v3 / 坏的一律 400 不落库）；库里坏数据读出来是 422 带 code，⛔ 不兜成空图；
 * 带版本号保存、版本对不上是 409，库里那份不被覆盖。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  createDELETE,
  createGET,
  createPOST,
  createPUT,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
  NODE_V4_TEXT_SUBTYPE_IDS,
} from '@/constants/node-types'
import { GET as LIST, POST } from '@/app/api/node-workflow/projects/route'
import { DELETE, GET, PUT } from '@/app/api/node-workflow/projects/[id]/route'
import { db } from '@/lib/db'
import { createTestUser, resetDatabase } from '@/test/int/db'

type Envelope<T> = { success: boolean; data?: T; errorCode?: string }
type ProjectRecord = {
  id: string
  name: string
  updatedAt: string
  state: { version?: number; nodes: Array<{ id: string }> }
}

const PATH = '/api/node-workflow/projects'
const params = (id: string) => ({ params: Promise.resolve({ id }) })

const V3_STATE = {
  nodes: [
    {
      id: 'n1',
      type: NODE_TYPE_IDS.shotText,
      position: { x: 0, y: 0 },
      data: { prompt: 'hi', status: NODE_STATUS_IDS.idle },
    },
  ],
  edges: [],
}

function v4State(nodeId = 'n_script', body = '# 开场') {
  return {
    version: 4,
    nodes: [
      {
        id: nodeId,
        position: { x: 0, y: 0 },
        data: {
          kind: NODE_MEDIA_KIND_IDS.text,
          subtype: NODE_V4_TEXT_SUBTYPE_IDS.script,
          name: 'S01·剧本',
          body,
          createdAt: '2026-09-08T00:00:00.000Z',
        },
      },
    ],
    edges: [],
  }
}

/** 库里一份读不出来的 v4（节点缺字段）。 */
const CORRUPT_V4 = { version: 4, nodes: [{ id: 'broken' }], edges: [] }

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
  mockAuthenticated(me.clerkId)
})

async function create(body: unknown) {
  const res = await POST(createPOST(PATH, body))
  return {
    status: res.status,
    body: await parseJSON<Envelope<ProjectRecord>>(res),
  }
}

describe('POST /api/node-workflow/projects（真库）', () => {
  it('v4 落库，version 不被剥掉', async () => {
    const res = await create({ name: 'P', state: v4State() })
    expect(res.status).toBe(200)
    const row = await db.nodeWorkflowProject.findUniqueOrThrow({
      where: { id: res.body.data!.id },
    })
    expect(row).toMatchObject({ userId: me.id, name: 'P' })
    expect(row.state).toMatchObject({ version: 4, nodes: [{ id: 'n_script' }] })
  })

  it('v3 / 坏掉的 v4 / 坏掉的 v3 一律 400，不落库', async () => {
    for (const state of [V3_STATE, CORRUPT_V4, { nodes: 'nope', edges: [] }]) {
      expect((await create({ name: 'P', state })).status).toBe(400)
    }
    expect(await db.nodeWorkflowProject.count()).toBe(0)
  })

  it('没登录 401', async () => {
    mockUnauthenticated()
    expect((await create({ name: 'P', state: v4State() })).status).toBe(401)
    expect(await db.nodeWorkflowProject.count()).toBe(0)
  })
})

describe('GET /api/node-workflow/projects（真库）', () => {
  it('只列我的；view=recent 只回摘要（带节点数、不带 state）', async () => {
    await create({ name: 'mine', state: v4State() })
    await db.nodeWorkflowProject.create({
      data: { userId: other.id, name: 'theirs', state: v4State() },
    })

    const list = await parseJSON<Envelope<ProjectRecord[]>>(
      await LIST(createGET(PATH)),
    )
    expect(list.data!.map((p) => p.name)).toEqual(['mine'])

    const recent = await parseJSON<Envelope<Array<Record<string, unknown>>>>(
      await LIST(createGET(PATH, { view: 'recent' })),
    )
    expect(recent.data).toEqual([
      expect.objectContaining({ name: 'mine', nodeCount: 1 }),
    ])
    expect(recent.data![0]).not.toHaveProperty('state')
  })

  it('库里有一份坏的：422 带 code，⛔ 不回空列表', async () => {
    await db.nodeWorkflowProject.create({
      data: { userId: me.id, name: 'bad', state: CORRUPT_V4 },
    })
    const res = await LIST(createGET(PATH))
    expect(res.status).toBe(422)
    expect((await parseJSON<Envelope<unknown>>(res)).errorCode).toBe(
      'NODE_WORKFLOW_STATE_CORRUPT',
    )
  })
})

describe('/api/node-workflow/projects/[id]（真库）', () => {
  const put = async (id: string, body: unknown) => {
    const res = await PUT(createPUT(`${PATH}/${id}`, body), params(id))
    return {
      status: res.status,
      body: await parseJSON<Envelope<ProjectRecord>>(res),
    }
  }
  const stateOf = async (id: string) =>
    (await db.nodeWorkflowProject.findUniqueOrThrow({ where: { id } })).state

  it('读：v4 原样返回；别人的 404；坏数据 422', async () => {
    const mine = (await create({ name: 'P', state: v4State() })).body.data!
    const theirs = await db.nodeWorkflowProject.create({
      data: { userId: other.id, name: 'theirs', state: v4State() },
    })
    const bad = await db.nodeWorkflowProject.create({
      data: { userId: me.id, name: 'bad', state: CORRUPT_V4 },
    })

    const ok = await parseJSON<Envelope<ProjectRecord>>(
      await GET(createGET(`${PATH}/${mine.id}`), params(mine.id)),
    )
    expect(ok.data!.state).toMatchObject({
      version: 4,
      nodes: [{ id: 'n_script' }],
    })
    expect(
      (await GET(createGET(`${PATH}/${theirs.id}`), params(theirs.id))).status,
    ).toBe(404)
    const corrupt = await GET(createGET(`${PATH}/${bad.id}`), params(bad.id))
    expect(corrupt.status).toBe(422)
    expect((await parseJSON<Envelope<unknown>>(corrupt)).errorCode).toBe(
      'NODE_WORKFLOW_STATE_CORRUPT',
    )
  })

  it('写：v4 落库；坏 v4 / v3 一律 400 库里不变', async () => {
    const mine = (await create({ name: 'P', state: v4State() })).body.data!
    expect(
      (await put(mine.id, { state: v4State('n_new', '# 第二版') })).status,
    ).toBe(200)
    expect(await stateOf(mine.id)).toMatchObject({ nodes: [{ id: 'n_new' }] })

    expect((await put(mine.id, { state: CORRUPT_V4 })).status).toBe(400)
    expect((await put(mine.id, { state: V3_STATE })).status).toBe(400)
    expect(await stateOf(mine.id)).toMatchObject({ nodes: [{ id: 'n_new' }] })
  })

  it('库里那份坏了，只改名也是 422（读回旧行时拦下）', async () => {
    const bad = await db.nodeWorkflowProject.create({
      data: { userId: me.id, name: 'bad', state: CORRUPT_V4 },
    })
    const res = await put(bad.id, { name: 'X' })
    expect(res.status).toBe(422)
    expect(res.body.errorCode).toBe('NODE_WORKFLOW_STATE_CORRUPT')
  })

  it('带版本号保存：对得上就写；别处改过（版本对不上）409 带 code，不覆盖', async () => {
    const created = (await create({ name: 'P', state: v4State() })).body.data!
    const saved = await put(created.id, {
      state: v4State('n_tab_a'),
      baseUpdatedAt: created.updatedAt,
    })
    expect(saved.status).toBe(200)

    // 另一个标签页还拿着最早那个版本号
    const stale = await put(created.id, {
      state: v4State('n_tab_b'),
      baseUpdatedAt: created.updatedAt,
    })
    expect(stale.status).toBe(409)
    expect(stale.body.errorCode).toBe('NODE_WORKFLOW_CONFLICT')
    expect(await stateOf(created.id)).toMatchObject({
      nodes: [{ id: 'n_tab_a' }],
    })
  })

  it('删：软删，列表里没了', async () => {
    const mine = (await create({ name: 'P', state: v4State() })).body.data!
    expect(
      (await DELETE(createDELETE(`${PATH}/${mine.id}`), params(mine.id)))
        .status,
    ).toBe(200)
    expect(
      (
        await db.nodeWorkflowProject.findUniqueOrThrow({
          where: { id: mine.id },
        })
      ).isDeleted,
    ).toBe(true)
    const list = await parseJSON<Envelope<ProjectRecord[]>>(
      await LIST(createGET(PATH)),
    )
    expect(list.data).toEqual([])
  })
})
