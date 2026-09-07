import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  createGET,
  createPUT,
  mockAuthenticated,
  parseJSON,
} from '@/test/api-helpers'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_TEXT_SUBTYPE_IDS,
} from '@/constants/node-types'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const FakeStateCorruptError = vi.hoisted(
  () =>
    class NodeWorkflowStateCorruptError extends Error {
      constructor() {
        super('Node workflow project p1 has an unreadable state')
        this.name = 'NodeWorkflowStateCorruptError'
      }
    },
)

const mockGet = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()

vi.mock('@/services/node/node-workflow.service', () => ({
  getNodeWorkflowProject: (...args: unknown[]) => mockGet(...args),
  updateNodeWorkflowProject: (...args: unknown[]) => mockUpdate(...args),
  deleteNodeWorkflowProject: (...args: unknown[]) => mockDelete(...args),
  NodeWorkflowStateCorruptError: FakeStateCorruptError,
}))

import { GET, PUT } from '@/app/api/node-workflow/projects/[id]/route'

const PROJECT_ID = 'p1'
const params = { params: Promise.resolve({ id: PROJECT_ID }) }

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
  mockGet.mockResolvedValue({ id: PROJECT_ID, state: V4_STATE })
  mockUpdate.mockImplementation((_clerkId: string, id: string, data: unknown) =>
    Promise.resolve({ id, ...(data as object) }),
  )
})

describe('GET /api/node-workflow/projects/[id] — 读端', () => {
  it('v4 状态原样返回', async () => {
    const res = await GET(
      createGET(`/api/node-workflow/projects/${PROJECT_ID}`),
      params,
    )
    const body = await parseJSON<{ data: { state: { version: number } } }>(res)

    expect(res.status).toBe(200)
    expect(body.data.state.version).toBe(4)
  })

  it('坏数据 → 422 带 code，⛔ 不兜成空图', async () => {
    mockGet.mockRejectedValue(new FakeStateCorruptError())

    const res = await GET(
      createGET(`/api/node-workflow/projects/${PROJECT_ID}`),
      params,
    )
    const body = await parseJSON<{ errorCode?: string }>(res)

    expect(res.status).toBe(422)
    expect(body.errorCode).toBe('NODE_WORKFLOW_STATE_CORRUPT')
  })
})

describe('PUT /api/node-workflow/projects/[id] — 写端', () => {
  it('接受 v4 状态', async () => {
    const res = await PUT(
      createPUT(`/api/node-workflow/projects/${PROJECT_ID}`, {
        state: V4_STATE,
      }),
      params,
    )

    expect(res.status).toBe(200)
    const passed = mockUpdate.mock.calls[0]?.[2] as {
      state: { version?: number }
    }
    expect(passed.state.version).toBe(4)
  })

  it('坏掉的 v4 是 400，服务从没被调用', async () => {
    const res = await PUT(
      createPUT(`/api/node-workflow/projects/${PROJECT_ID}`, {
        state: { version: 4, nodes: [{ id: 'broken' }], edges: [] },
      }),
      params,
    )

    expect(res.status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('读端坏数据在写路径上也是 422（未带 state 的重命名读回旧行）', async () => {
    mockUpdate.mockRejectedValue(new FakeStateCorruptError())

    const res = await PUT(
      createPUT(`/api/node-workflow/projects/${PROJECT_ID}`, { name: 'X' }),
      params,
    )
    const body = await parseJSON<{ errorCode?: string }>(res)

    expect(res.status).toBe(422)
    expect(body.errorCode).toBe('NODE_WORKFLOW_STATE_CORRUPT')
  })
})
