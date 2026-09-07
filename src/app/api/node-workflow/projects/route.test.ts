import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  createGET,
  createPOST,
  mockAuthenticated,
  parseJSON,
} from '@/test/api-helpers'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
  NODE_V4_TEXT_SUBTYPE_IDS,
} from '@/constants/node-types'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockCreate = vi.fn()
const mockList = vi.fn()

const FakeStateCorruptError = vi.hoisted(
  () =>
    class NodeWorkflowStateCorruptError extends Error {
      constructor() {
        super('Node workflow project p1 has an unreadable state')
        this.name = 'NodeWorkflowStateCorruptError'
      }
    },
)

vi.mock('@/services/node/node-workflow.service', () => ({
  createNodeWorkflowProject: (...args: unknown[]) => mockCreate(...args),
  listNodeWorkflowProjectsForUser: (...args: unknown[]) => mockList(...args),
  NodeWorkflowProjectLimitError: class extends Error {},
  NodeWorkflowStateCorruptError: FakeStateCorruptError,
}))

import { GET, POST } from '@/app/api/node-workflow/projects/route'

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

const V4_STATE = {
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
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthenticated()
  mockCreate.mockImplementation((_clerkId: string, data: unknown) =>
    Promise.resolve({ id: 'p1', ...(data as object) }),
  )
  mockList.mockResolvedValue([])
})

describe('POST /api/node-workflow/projects — 写端判据', () => {
  it('接受 v3 状态（③c 翻转前的迁移顺序，不是长期兼容层）', async () => {
    const res = await POST(
      createPOST('/api/node-workflow/projects', {
        name: 'P',
        state: V3_STATE,
      }),
    )

    expect(res.status).toBe(200)
    expect(mockCreate).toHaveBeenCalledWith(
      'clerk_test_user',
      expect.objectContaining({
        state: expect.objectContaining({ nodes: expect.any(Array) }),
      }),
    )
  })

  it('接受 v4 状态并且 version 不被剥掉', async () => {
    const res = await POST(
      createPOST('/api/node-workflow/projects', {
        name: 'P',
        state: V4_STATE,
      }),
    )

    expect(res.status).toBe(200)
    const passed = mockCreate.mock.calls[0]?.[1] as {
      state: { version?: number }
    }
    expect(passed.state.version).toBe(4)
  })

  it('坏掉的 v4 是 400，⛔ 不降级成 v3、不兜空', async () => {
    const res = await POST(
      createPOST('/api/node-workflow/projects', {
        name: 'P',
        state: { version: 4, nodes: [{ id: 'broken' }], edges: [] },
      }),
    )

    expect(res.status).toBe(400)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('坏掉的 v3 也是 400', async () => {
    const res = await POST(
      createPOST('/api/node-workflow/projects', {
        name: 'P',
        state: { nodes: 'nope', edges: [] },
      }),
    )

    expect(res.status).toBe(400)
    expect(mockCreate).not.toHaveBeenCalled()
  })
})

describe('GET /api/node-workflow/projects — 读端坏数据', () => {
  it('把坏数据报成 422 带 code，⛔ 不返回空列表/空图', async () => {
    mockList.mockRejectedValue(new FakeStateCorruptError())

    const res = await GET(createGET('/api/node-workflow/projects'))
    const body = await parseJSON<{ errorCode?: string }>(res)

    expect(res.status).toBe(422)
    expect(body.errorCode).toBe('NODE_WORKFLOW_STATE_CORRUPT')
  })

  it('正常读列表返回 200', async () => {
    const res = await GET(createGET('/api/node-workflow/projects'))

    expect(res.status).toBe(200)
  })
})
