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
const mockUpdate = vi.fn()
vi.mock('@/lib/db', () => ({
  db: {
    nodeWorkflowProject: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}))

import { NODE_STATUS_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import { updateNodeWorkflowProject } from '@/services/node/node-workflow.service'

const CLERK_ID = 'user_clerk_1'
const DB_USER = { id: 'db_user_1', clerkId: CLERK_ID }
const PROJECT_ID = 'srv_project_1'

const A_NODE = {
  id: 'node-1',
  type: NODE_TYPE_IDS.shotText,
  position: { x: 0, y: 0 },
  data: { prompt: 'Keep me', status: NODE_STATUS_IDS.idle },
}

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
    Promise.resolve(projectRow(data.state ?? { nodes: [A_NODE], edges: [] })),
  )
})

describe('updateNodeWorkflowProject — empty-state overwrite guard', () => {
  it('refuses an empty state that would wipe a non-empty project', async () => {
    mockFindFirst.mockResolvedValue(projectRow({ nodes: [A_NODE], edges: [] }))

    await updateNodeWorkflowProject(CLERK_ID, PROJECT_ID, {
      state: { nodes: [], edges: [] },
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
      state: { nodes: [], edges: [] },
      allowEmptyState: true,
    })

    // 画布没有一键清空入口，用户是一个个删空的 —— 这是合法操作，不能被闸挡住。
    expect(updateData().state).toEqual({ nodes: [], edges: [] })
    expect(loggerErrorMock).not.toHaveBeenCalled()
  })

  it('still applies the name when the state write is refused', async () => {
    mockFindFirst.mockResolvedValue(projectRow({ nodes: [A_NODE], edges: [] }))

    await updateNodeWorkflowProject(CLERK_ID, PROJECT_ID, {
      name: 'Renamed',
      state: { nodes: [], edges: [] },
    })

    const data = updateData()
    expect(data.name).toBe('Renamed')
    expect(data).not.toHaveProperty('state')
    expect(data.lastActiveAt).toBeInstanceOf(Date)
  })

  it('writes a non-empty state normally', async () => {
    mockFindFirst.mockResolvedValue(projectRow({ nodes: [], edges: [] }))

    await updateNodeWorkflowProject(CLERK_ID, PROJECT_ID, {
      state: { nodes: [A_NODE], edges: [] },
    })

    expect(updateData().state).toEqual({ nodes: [A_NODE], edges: [] })
    expect(loggerErrorMock).not.toHaveBeenCalled()
  })

  it('lets an empty state through when the stored project is already empty', async () => {
    mockFindFirst.mockResolvedValue(projectRow({ nodes: [], edges: [] }))

    await updateNodeWorkflowProject(CLERK_ID, PROJECT_ID, {
      state: { nodes: [], edges: [] },
    })

    // 没有东西会被抹掉，就没有理由拦 —— 这条闸只管「非空 → 空」。
    expect(updateData().state).toEqual({ nodes: [], edges: [] })
    expect(loggerErrorMock).not.toHaveBeenCalled()
  })

  it('keeps looking the row up under the signed-in user', async () => {
    mockFindFirst.mockResolvedValue(projectRow({ nodes: [A_NODE], edges: [] }))

    await updateNodeWorkflowProject(CLERK_ID, PROJECT_ID, {
      state: { nodes: [], edges: [] },
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
        state: { nodes: [], edges: [] },
      }),
    ).rejects.toThrow(PROJECT_ID)
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
