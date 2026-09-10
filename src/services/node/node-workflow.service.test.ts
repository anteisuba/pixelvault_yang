import { beforeEach, describe, expect, it, vi } from 'vitest'

const loggerErrorMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: loggerErrorMock,
  },
}))

const mockEnsureUser = vi.fn()
vi.mock('@/services/user.service', () => ({
  ensureUser: (...args: unknown[]) => mockEnsureUser(...args),
}))

const mockFindFirst = vi.fn()
const mockFindMany = vi.fn()
const mockUpdate = vi.fn()
vi.mock('@/lib/db', () => ({
  db: {
    nodeWorkflowProject: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}))

import {
  NODE_MEDIA_KIND_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
  NODE_V4_TEXT_SUBTYPE_IDS,
} from '@/constants/node-types'
import {
  getNodeWorkflowProject,
  listNodeWorkflowProjectsForUser,
  NodeWorkflowStateCorruptError,
  updateNodeWorkflowProject,
} from '@/services/node/node-workflow.service'
import { NodeWorkflowStateV4Schema } from '@/types/node-workflow'

const CLERK_ID = 'user_clerk_1'
const DB_USER = { id: 'db_user_1', clerkId: CLERK_ID }
const PROJECT_ID = 'srv_project_1'

const A_NODE = {
  id: 'node-1',
  type: NODE_TYPE_IDS.shotText,
  position: { x: 0, y: 0 },
  data: { prompt: 'Keep me', status: NODE_STATUS_IDS.idle },
}

const V4_NODE = {
  id: 'n_script',
  position: { x: 0, y: 0 },
  data: {
    kind: NODE_MEDIA_KIND_IDS.text,
    subtype: NODE_V4_TEXT_SUBTYPE_IDS.script,
    name: 'S01·剧本',
    body: '# 开场',
    createdAt: '2026-09-08T00:00:00.000Z',
  },
}

// 过一遍 schema：既给出正确的静态类型，也保证这份 fixture 真的是合法 v4。
const V4_STATE = NodeWorkflowStateV4Schema.parse({
  version: 4,
  nodes: [V4_NODE],
  edges: [],
})

function projectRow(state: unknown) {
  return {
    id: PROJECT_ID,
    userId: DB_USER.id,
    name: 'Server project',
    state,
    isDeleted: false,
    lastActiveAt: new Date('2026-08-25T00:00:00.000Z'),
    createdAt: new Date('2026-08-25T00:00:00.000Z'),
    updatedAt: new Date('2026-08-25T00:00:00.000Z'),
  }
}

/** What actually reached `data:` on the Prisma update. */
function updateData(): Record<string, unknown> {
  const call = mockUpdate.mock.calls[0]?.[0] as
    | { data: Record<string, unknown> }
    | undefined
  expect(call).toBeDefined()
  return call?.data ?? {}
}

beforeEach(() => {
  vi.clearAllMocks()
  mockEnsureUser.mockResolvedValue(DB_USER)
  mockUpdate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve(projectRow(data.state ?? V4_STATE)),
  )
})

describe('updateNodeWorkflowProject — empty-state overwrite guard', () => {
  it('refuses an empty state that would wipe a non-empty project', async () => {
    mockFindFirst.mockResolvedValue(projectRow({ nodes: [A_NODE], edges: [] }))

    await updateNodeWorkflowProject(CLERK_ID, PROJECT_ID, {
      state: { version: 4, nodes: [], edges: [] },
    })

    // `state` 整体替换是这条链的杀伤面 —— 它必须**根本没进 data**。
    expect(updateData()).not.toHaveProperty('state')
    expect(loggerErrorMock).toHaveBeenCalledWith(
      '[node-workflow] refused an empty-state overwrite',
      expect.objectContaining({
        projectId: PROJECT_ID,
        existingNodeCount: 1,
        incomingNodeCount: 0,
      }),
    )
  })

  it('lets the user really clear a canvas when the client vouches for it', async () => {
    mockFindFirst.mockResolvedValue(projectRow({ nodes: [A_NODE], edges: [] }))

    await updateNodeWorkflowProject(CLERK_ID, PROJECT_ID, {
      state: { version: 4, nodes: [], edges: [] },
      allowEmptyState: true,
    })

    // 画布没有一键清空入口，用户是一个个删空的 —— 这是合法操作，不能被闸挡住。
    expect(updateData().state).toEqual({ version: 4, nodes: [], edges: [] })
    expect(loggerErrorMock).not.toHaveBeenCalled()
  })

  it('still applies the name when the state write is refused', async () => {
    mockFindFirst.mockResolvedValue(projectRow({ nodes: [A_NODE], edges: [] }))

    await updateNodeWorkflowProject(CLERK_ID, PROJECT_ID, {
      name: 'Renamed',
      state: { version: 4, nodes: [], edges: [] },
    })

    const data = updateData()
    expect(data.name).toBe('Renamed')
    expect(data).not.toHaveProperty('state')
    expect(data.lastActiveAt).toBeInstanceOf(Date)
  })

  it('writes a non-empty state normally', async () => {
    mockFindFirst.mockResolvedValue(projectRow({ nodes: [], edges: [] }))

    await updateNodeWorkflowProject(CLERK_ID, PROJECT_ID, { state: V4_STATE })

    expect(updateData().state).toEqual(V4_STATE)
    expect(loggerErrorMock).not.toHaveBeenCalled()
  })

  it('lets an empty state through when the stored project is already empty', async () => {
    mockFindFirst.mockResolvedValue(projectRow({ nodes: [], edges: [] }))

    await updateNodeWorkflowProject(CLERK_ID, PROJECT_ID, {
      state: { version: 4, nodes: [], edges: [] },
    })

    // 没有东西会被抹掉，就没有理由拦 —— 这条闸只管「非空 → 空」。
    expect(updateData().state).toEqual({ version: 4, nodes: [], edges: [] })
    expect(loggerErrorMock).not.toHaveBeenCalled()
  })

  it('keeps looking the row up under the signed-in user', async () => {
    mockFindFirst.mockResolvedValue(projectRow({ nodes: [A_NODE], edges: [] }))

    await updateNodeWorkflowProject(CLERK_ID, PROJECT_ID, {
      state: { version: 4, nodes: [], edges: [] },
    })

    // 账号隔离：闸只决定 state 写不写，它读的那一行仍然是按 userId 圈出来的，
    // 别人的项目连查都查不到（查不到就是 NotFound，见下一条）。
    expect(mockEnsureUser).toHaveBeenCalledWith(CLERK_ID)
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { id: PROJECT_ID, userId: DB_USER.id, isDeleted: false },
    })
  })

  it('throws before the guard when the project is not this user’s', async () => {
    mockFindFirst.mockResolvedValue(null)

    await expect(
      updateNodeWorkflowProject(CLERK_ID, PROJECT_ID, {
        state: { version: 4, nodes: [], edges: [] },
      }),
    ).rejects.toThrow(PROJECT_ID)
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})

// ─── 读端判据（C3c-③a · node-canvas-v2 §14.2 的反转）─────────────────
//
// 旧行为：读写共用 v3 schema，parse 失败兜成空图。v4 节点没有 v3 必填的 `type`，
// 所以客户端一写 v4、服务端没切，下一次读取每个项目都被兜成空——备份门救不了，
// 因为备份的是升级前的 v3，清空发生在升级之后。这一组测试钉死反转后的判据。

describe('读端 · 版本判别', () => {
  it('v4 原样读出来，⛔ 不被 v3 schema 兜成空图', async () => {
    mockFindFirst.mockResolvedValue(projectRow(V4_STATE))

    const record = await getNodeWorkflowProject(CLERK_ID, PROJECT_ID)

    expect(record?.state).toMatchObject({ version: 4 })
    expect(record?.state.nodes).toHaveLength(1)
    expect(record?.state.nodes[0]?.id).toBe('n_script')
  })

  it('v3 原样透传（连 schema 不认识的顶层字段都留着），升级归客户端', async () => {
    const v3State = {
      nodes: [A_NODE],
      edges: [],
      someLegacyField: 'keep me',
    }
    mockFindFirst.mockResolvedValue(projectRow(v3State))

    const record = await getNodeWorkflowProject(CLERK_ID, PROJECT_ID)

    // 服务端不判 v3/v4、不重写字段：`upgradeNodeWorkflowStateToV4` 在客户端做。
    expect(record?.state).toEqual(v3State)
  })

  it('坏掉的 v4 抛错，⛔ 不兜空', async () => {
    mockFindFirst.mockResolvedValue(
      projectRow({ version: 4, nodes: [{ id: 'broken' }], edges: [] }),
    )

    await expect(
      getNodeWorkflowProject(CLERK_ID, PROJECT_ID),
    ).rejects.toBeInstanceOf(NodeWorkflowStateCorruptError)
    expect(loggerErrorMock).toHaveBeenCalled()
  })

  it('坏掉的 v3 也抛错，⛔ 不兜空', async () => {
    mockFindFirst.mockResolvedValue(projectRow({ nodes: 'not-an-array' }))

    await expect(
      getNodeWorkflowProject(CLERK_ID, PROJECT_ID),
    ).rejects.toBeInstanceOf(NodeWorkflowStateCorruptError)
  })

  it('只有 state 为 null（未初始化）才给空图', async () => {
    mockFindFirst.mockResolvedValue(projectRow(null))

    const record = await getNodeWorkflowProject(CLERK_ID, PROJECT_ID)

    // ⚠ C3c-③c 起空图也是 v4：新建项目落库的第一份 state 就带 `version: 4`。
    expect(record?.state).toEqual({ version: 4, nodes: [], edges: [] })
    expect(loggerErrorMock).not.toHaveBeenCalled()
  })

  it('list 同一套判据：一份坏数据抛错而不是把整列表兜成空图', async () => {
    mockFindMany.mockResolvedValue([
      projectRow(V4_STATE),
      projectRow({ version: 4, nodes: [{ id: 'broken' }], edges: [] }),
    ])

    await expect(
      listNodeWorkflowProjectsForUser(CLERK_ID),
    ).rejects.toBeInstanceOf(NodeWorkflowStateCorruptError)
  })

  it('list 正常读 v4', async () => {
    mockFindMany.mockResolvedValue([projectRow(V4_STATE)])

    const records = await listNodeWorkflowProjectsForUser(CLERK_ID)

    expect(records[0]?.state).toMatchObject({ version: 4 })
  })
})

describe('写端 · v4 状态', () => {
  it('写 v4 时空覆盖闸照常按节点数判断（不因版本失灵）', async () => {
    mockFindFirst.mockResolvedValue(projectRow(V4_STATE))

    await updateNodeWorkflowProject(CLERK_ID, PROJECT_ID, {
      state: { version: 4, nodes: [], edges: [] },
    })

    expect(updateData()).not.toHaveProperty('state')
    expect(loggerErrorMock).toHaveBeenCalledWith(
      '[node-workflow] refused an empty-state overwrite',
      expect.objectContaining({ existingNodeCount: 1, incomingNodeCount: 0 }),
    )
  })

  it('非空 v4 正常落库', async () => {
    mockFindFirst.mockResolvedValue(projectRow({ nodes: [], edges: [] }))

    await updateNodeWorkflowProject(CLERK_ID, PROJECT_ID, { state: V4_STATE })

    expect(updateData().state).toEqual(V4_STATE)
  })
})
