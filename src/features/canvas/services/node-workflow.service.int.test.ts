/**
 * L2a 真库：画布项目的读写——空覆盖闸、版本判别、保存冲突保护、最近项目。
 * 核的是库里那一行最后长什么样（`logger` 是边界，替掉看有没有报那一声）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const loggerErrorMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: loggerErrorMock,
  },
}))

import {
  NODE_MEDIA_KIND_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
  NODE_V4_TEXT_SUBTYPE_IDS,
} from '@/constants/node-types'
import { NODE_STUDIO_PROJECTS } from '@/constants/node-studio'
import {
  getNodeWorkflowProject,
  listNodeWorkflowProjectsForUser,
  listRecentNodeWorkflowProjectsForUser,
  NodeWorkflowProjectConflictError,
  NodeWorkflowStateCorruptError,
  touchNodeWorkflowProject,
  updateNodeWorkflowProject,
} from '@/features/canvas/services/node-workflow.service'
import { db } from '@/lib/db'
import type { Prisma } from '@/lib/generated/prisma/client'
import { NodeWorkflowStateV4Schema } from '@/types/node-workflow'
import { createTestUser, resetDatabase } from '@/test/int/db'

const A_NODE = {
  id: 'node-1',
  type: NODE_TYPE_IDS.shotText,
  position: { x: 0, y: 0 },
  data: { prompt: 'Keep me', status: NODE_STATUS_IDS.idle },
}

const V4_STATE = NodeWorkflowStateV4Schema.parse({
  version: 4,
  nodes: [
    {
      id: 'n_script',
      position: { x: 0, y: 0 },
      data: {
        kind: NODE_MEDIA_KIND_IDS.text,
        subtype: NODE_V4_TEXT_SUBTYPE_IDS.script,
        name: 'S01·剧本',
        body: '# 开场',
        createdAt: '2026-09-08T00:00:00.000Z',
      },
    },
  ],
  edges: [],
})
const EMPTY_V4 = { version: 4, nodes: [], edges: [] } as const

const BASE = new Date('2026-08-25T00:00:00.000Z')

let clerkId: string
let userId: string

async function seedProject(
  state: unknown,
  patch: { name?: string; userId?: string; lastActiveAt?: Date } = {},
) {
  return db.nodeWorkflowProject.create({
    data: {
      userId: patch.userId ?? userId,
      name: patch.name ?? 'Server project',
      state: (state ?? null) as Prisma.InputJsonValue,
      lastActiveAt: patch.lastActiveAt ?? BASE,
      createdAt: BASE,
      updatedAt: BASE,
    },
  })
}

/** 绕过 Prisma 的 `@updatedAt`，把版本号拨回固定时刻（像别的标签页在这之前保存过）。 */
async function pinUpdatedAt(id: string, at: Date = BASE) {
  await db.$executeRaw`UPDATE "NodeWorkflowProject" SET "updatedAt" = ${at} WHERE "id" = ${id}`
}

const rowOf = (id: string) =>
  db.nodeWorkflowProject.findUniqueOrThrow({ where: { id } })

beforeEach(async () => {
  await resetDatabase()
  loggerErrorMock.mockReset()
  const user = await createTestUser()
  clerkId = user.clerkId
  userId = user.id
})

describe('listRecentNodeWorkflowProjectsForUser（角色页「放进画布」）', () => {
  it('按最近打开排、只取几块；回名字 + 节点数 + 时间，⛔ 不回 state；别人的、删了的不算', async () => {
    const older = await seedProject(null, {
      name: 'older',
      lastActiveAt: new Date('2026-08-20T00:00:00.000Z'),
    })
    const newest = await seedProject(V4_STATE, { name: 'newest' })
    const stranger = await createTestUser()
    await seedProject(V4_STATE, { userId: stranger.id, name: 'theirs' })
    const gone = await seedProject(V4_STATE, { name: 'gone' })
    await db.nodeWorkflowProject.update({
      where: { id: gone.id },
      data: { isDeleted: true },
    })
    for (let i = 0; i < NODE_STUDIO_PROJECTS.recentLimit; i++)
      await seedProject(null, {
        name: `filler-${i}`,
        lastActiveAt: new Date('2026-08-01T00:00:00.000Z'),
      })

    const recent = await listRecentNodeWorkflowProjectsForUser(clerkId)

    expect(recent).toHaveLength(NODE_STUDIO_PROJECTS.recentLimit)
    expect(recent[0]).toEqual({
      id: newest.id,
      name: 'newest',
      createdAt: BASE.toISOString(),
      updatedAt: BASE.toISOString(),
      nodeCount: 1,
    })
    expect(recent[1]).toMatchObject({ id: older.id, nodeCount: 0 })
    expect(recent[0]).not.toHaveProperty('state')
    expect(recent.map((project) => project.name)).not.toContain('theirs')
    expect(recent.map((project) => project.name)).not.toContain('gone')
  })
})

describe('updateNodeWorkflowProject — 空覆盖闸', () => {
  it('非空项目被一份空 state 覆盖：拒写 state、报一声', async () => {
    const project = await seedProject({ nodes: [A_NODE], edges: [] })

    await updateNodeWorkflowProject(clerkId, project.id, { state: EMPTY_V4 })

    expect((await rowOf(project.id)).state).toEqual({
      nodes: [A_NODE],
      edges: [],
    })
    expect(loggerErrorMock).toHaveBeenCalledWith(
      '[node-workflow] refused an empty-state overwrite',
      expect.objectContaining({
        projectId: project.id,
        existingNodeCount: 1,
        incomingNodeCount: 0,
      }),
    )
  })

  it('客户端担保是她一个个删空的：照写', async () => {
    const project = await seedProject({ nodes: [A_NODE], edges: [] })

    await updateNodeWorkflowProject(clerkId, project.id, {
      state: EMPTY_V4,
      allowEmptyState: true,
    })

    expect((await rowOf(project.id)).state).toEqual(EMPTY_V4)
    expect(loggerErrorMock).not.toHaveBeenCalled()
  })

  it('state 被拒时改名照样生效', async () => {
    const project = await seedProject({ nodes: [A_NODE], edges: [] })

    await updateNodeWorkflowProject(clerkId, project.id, {
      name: 'Renamed',
      state: EMPTY_V4,
    })

    const row = await rowOf(project.id)
    expect(row.name).toBe('Renamed')
    expect(row.state).toEqual({ nodes: [A_NODE], edges: [] })
    expect(row.lastActiveAt.getTime()).toBeGreaterThan(BASE.getTime())
  })

  it('非空 state 正常写；本来就空的项目写空也放行', async () => {
    const empty = await seedProject({ nodes: [], edges: [] })
    await updateNodeWorkflowProject(clerkId, empty.id, { state: EMPTY_V4 })
    expect((await rowOf(empty.id)).state).toEqual(EMPTY_V4)

    await updateNodeWorkflowProject(clerkId, empty.id, { state: V4_STATE })
    expect((await rowOf(empty.id)).state).toEqual(V4_STATE)
    expect(loggerErrorMock).not.toHaveBeenCalled()
  })

  it('写 v4 时空覆盖闸照常按节点数判断', async () => {
    const project = await seedProject(V4_STATE)

    await updateNodeWorkflowProject(clerkId, project.id, { state: EMPTY_V4 })

    expect((await rowOf(project.id)).state).toEqual(V4_STATE)
    expect(loggerErrorMock).toHaveBeenCalledWith(
      '[node-workflow] refused an empty-state overwrite',
      expect.objectContaining({ existingNodeCount: 1, incomingNodeCount: 0 }),
    )
  })

  it('别人的项目：查不到，抛错，库里不动', async () => {
    const stranger = await createTestUser()
    const theirs = await seedProject(
      { nodes: [A_NODE], edges: [] },
      { userId: stranger.id },
    )

    await expect(
      updateNodeWorkflowProject(clerkId, theirs.id, { state: V4_STATE }),
    ).rejects.toThrow(theirs.id)
    expect((await rowOf(theirs.id)).state).toEqual({
      nodes: [A_NODE],
      edges: [],
    })
  })
})

describe('读端 · 版本判别', () => {
  it('v4 原样读出来，⛔ 不被 v3 schema 兜成空图', async () => {
    const project = await seedProject(V4_STATE)

    const record = await getNodeWorkflowProject(clerkId, project.id)

    expect(record?.state).toMatchObject({ version: 4 })
    expect(record?.state.nodes[0]?.id).toBe('n_script')
  })

  it('v3 原样透传（连不认识的顶层字段都留着），升级归客户端', async () => {
    const v3State = { nodes: [A_NODE], edges: [], someLegacyField: 'keep me' }
    const project = await seedProject(v3State)

    expect((await getNodeWorkflowProject(clerkId, project.id))?.state).toEqual(
      v3State,
    )
  })

  it.each([
    ['坏掉的 v4', { version: 4, nodes: [{ id: 'broken' }], edges: [] }],
    ['坏掉的 v3', { nodes: 'not-an-array' }],
  ])('%s 抛错，⛔ 不兜空', async (_, state) => {
    const project = await seedProject(state)

    await expect(
      getNodeWorkflowProject(clerkId, project.id),
    ).rejects.toBeInstanceOf(NodeWorkflowStateCorruptError)
    expect(loggerErrorMock).toHaveBeenCalled()
  })

  it('只有 state 为空（未初始化）才给空图', async () => {
    const project = await seedProject(null)

    expect((await getNodeWorkflowProject(clerkId, project.id))?.state).toEqual(
      EMPTY_V4,
    )
    expect(loggerErrorMock).not.toHaveBeenCalled()
  })

  it('list 同一套判据：正常读 v4；一份坏数据抛错而不是整列表兜空', async () => {
    await seedProject(V4_STATE)
    expect(
      (await listNodeWorkflowProjectsForUser(clerkId))[0]?.state,
    ).toMatchObject({ version: 4 })

    await seedProject({ version: 4, nodes: [{ id: 'broken' }], edges: [] })
    await expect(
      listNodeWorkflowProjectsForUser(clerkId),
    ).rejects.toBeInstanceOf(NodeWorkflowStateCorruptError)
  })
})

// `updatedAt` = 画布内容的版本号：只在写 state 时变，改名 / 打开项目保持原值。
describe('updateNodeWorkflowProject — 版本号（保存冲突保护）', () => {
  it('带的版本号对得上：写进去，版本号往前走', async () => {
    const project = await seedProject({ nodes: [A_NODE], edges: [] })
    await pinUpdatedAt(project.id)

    await updateNodeWorkflowProject(clerkId, project.id, {
      state: V4_STATE,
      baseUpdatedAt: BASE.toISOString(),
    })

    const row = await rowOf(project.id)
    expect(row.state).toEqual(V4_STATE)
    expect(row.updatedAt.getTime()).toBeGreaterThan(BASE.getTime())
  })

  it('版本号对不上（别处已保存过）：抛冲突，⛔ 不静默覆盖', async () => {
    const project = await seedProject({ nodes: [A_NODE], edges: [] })
    await pinUpdatedAt(project.id)

    await expect(
      updateNodeWorkflowProject(clerkId, project.id, {
        state: V4_STATE,
        baseUpdatedAt: '2026-08-24T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(NodeWorkflowProjectConflictError)
    expect((await rowOf(project.id)).state).toEqual({
      nodes: [A_NODE],
      edges: [],
    })
  })

  it('没带版本号（旧客户端）：照旧整份覆盖', async () => {
    const project = await seedProject({ nodes: [A_NODE], edges: [] })

    await updateNodeWorkflowProject(clerkId, project.id, { state: V4_STATE })

    expect((await rowOf(project.id)).state).toEqual(V4_STATE)
  })

  it('只改名：版本号不变（别让别的标签页下一次保存被判冲突）', async () => {
    const project = await seedProject({ nodes: [A_NODE], edges: [] })
    await pinUpdatedAt(project.id)

    await updateNodeWorkflowProject(clerkId, project.id, {
      name: 'Renamed',
      baseUpdatedAt: '2026-08-24T00:00:00.000Z',
    })

    const row = await rowOf(project.id)
    expect(row.name).toBe('Renamed')
    expect(row.updatedAt).toEqual(BASE)
  })

  it('打开项目（touch）：只动 lastActiveAt，版本号不变', async () => {
    const project = await seedProject({ nodes: [A_NODE], edges: [] })
    await pinUpdatedAt(project.id)

    await touchNodeWorkflowProject(clerkId, project.id)

    const row = await rowOf(project.id)
    expect(row.updatedAt).toEqual(BASE)
    expect(row.lastActiveAt.getTime()).toBeGreaterThan(BASE.getTime())
  })
})
