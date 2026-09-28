import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NODE_V4_CARD } from '@/constants/node-studio'
import { currentUrlOf } from '@/lib/edit-project'
import { NodeWorkflowStateV4Schema } from '@/types/node-workflow'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockFindUser = vi.fn()
vi.mock('@/lib/db', () => ({
  db: { user: { findUnique: (...args: unknown[]) => mockFindUser(...args) } },
}))

const mockGetProject = vi.fn()
const mockUpdateProject = vi.fn()
const { ConflictError } = vi.hoisted(() => ({
  ConflictError: class extends Error {},
}))
vi.mock('@/services/node/node-workflow.service', () => ({
  getNodeWorkflowProject: (...args: unknown[]) => mockGetProject(...args),
  updateNodeWorkflowProject: (...args: unknown[]) => mockUpdateProject(...args),
  NodeWorkflowProjectConflictError: ConflictError,
}))

const { buildRenderLanding, landRenderOnCanvas } =
  await import('@/services/video/render-landing.service')

const NOW = '2026-09-28T00:00:00.000Z'

function video(id: string, x: number, y: number) {
  return {
    id,
    position: { x, y },
    data: {
      kind: 'video',
      subtype: 'shot',
      name: id,
      label: id,
      status: 'done',
      createdAt: NOW,
      url: `https://cdn.test/${id}.mp4`,
    },
  }
}

const STATE = NodeWorkflowStateV4Schema.parse({
  version: 4,
  nodes: [video('v1', 0, 40), video('v2', 600, 120)],
  edges: [],
})

const INPUT = {
  sourceNodeIds: ['v1', 'v2', 'v1', 'gone'],
  name: '我的成片',
  sourceLabel: '来自剪辑台 · 我的成片',
  generation: {
    id: 'gen_9',
    url: 'https://cdn.test/renders/p/job.mp4',
    thumbnailUrl: 'https://cdn.test/renders/p/job.jpg',
  },
}

describe('buildRenderLanding', () => {
  it('一张 video.shot，带成片地址与「来源」，落在最右那张来源卡右边', () => {
    const landed = buildRenderLanding(STATE, INPUT, { now: NOW })
    expect(landed).not.toBeNull()
    const node = landed!.state.nodes.find((n) => n.id === landed!.nodeId)
    expect(node?.data.kind).toBe('video')
    expect(node?.data.subtype).toBe('shot')
    expect(node?.data.name).toBe('我的成片')
    expect(currentUrlOf(node)).toBe('https://cdn.test/renders/p/job.mp4')
    const data = node!.data as {
      status: string
      source?: { kind: string; label: string }
    }
    expect(data.status).toBe('done')
    expect(data.source).toEqual({
      kind: 'render',
      label: '来自剪辑台 · 我的成片',
    })
    expect(node?.position).toEqual({
      x: 600 + NODE_V4_CARD.shotCollapsedWidth + 80,
      y: 120,
    })
  })

  it('每张还在的来源卡连一条 reference（重复的只连一次，不在了的跳过）', () => {
    const landed = buildRenderLanding(STATE, INPUT, { now: NOW })!
    const edges = landed.state.edges.filter((e) => e.target === landed.nodeId)
    expect(edges.map((e) => e.source).sort()).toEqual(['v1', 'v2'])
    expect(edges.every((e) => e.slot === 'reference')).toBe(true)
  })

  it('落出来的整份仍是合法的 v4', () => {
    const landed = buildRenderLanding(STATE, INPUT, { now: NOW })!
    expect(NodeWorkflowStateV4Schema.safeParse(landed.state).success).toBe(true)
  })
})

describe('landRenderOnCanvas', () => {
  const input = { ...INPUT, userId: 'user_1', canvasProjectId: 'canvas_1' }

  beforeEach(() => {
    vi.clearAllMocks()
    mockFindUser.mockResolvedValue({ clerkId: 'clerk_1' })
    mockGetProject.mockResolvedValue({ state: STATE, updatedAt: 'v1' })
    mockUpdateProject.mockResolvedValue({})
  })

  it('按归属取项目、带版本号写回', async () => {
    const nodeId = await landRenderOnCanvas(input)
    expect(nodeId).toBeTruthy()
    expect(mockGetProject).toHaveBeenCalledWith('clerk_1', 'canvas_1')
    expect(mockUpdateProject).toHaveBeenCalledWith(
      'clerk_1',
      'canvas_1',
      expect.objectContaining({ baseUpdatedAt: 'v1' }),
    )
  })

  it('版本号撞车 → 在最新那份上重来', async () => {
    mockGetProject
      .mockResolvedValueOnce({ state: STATE, updatedAt: 'v1' })
      .mockResolvedValueOnce({ state: STATE, updatedAt: 'v2' })
    mockUpdateProject.mockRejectedValueOnce(new ConflictError())
    expect(await landRenderOnCanvas(input)).toBeTruthy()
    expect(mockUpdateProject).toHaveBeenLastCalledWith(
      'clerk_1',
      'canvas_1',
      expect.objectContaining({ baseUpdatedAt: 'v2' }),
    )
  })

  it('连撞三次 → 放弃（null），⛔ 不无限重来', async () => {
    mockUpdateProject.mockRejectedValue(new ConflictError())
    expect(await landRenderOnCanvas(input)).toBeNull()
    expect(mockUpdateProject).toHaveBeenCalledTimes(3)
  })

  it('项目不在（或不是这个人的）→ null', async () => {
    mockGetProject.mockResolvedValue(null)
    expect(await landRenderOnCanvas(input)).toBeNull()
    expect(mockUpdateProject).not.toHaveBeenCalled()
  })
})
