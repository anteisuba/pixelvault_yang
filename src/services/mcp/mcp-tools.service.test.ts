import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetProject = vi.fn()
const mockUpdateProject = vi.fn()
const { MockConflictError } = vi.hoisted(() => ({
  MockConflictError: class MockConflictError extends Error {},
}))
vi.mock('@/services/node/node-workflow.service', () => ({
  getNodeWorkflowProject: (...args: unknown[]) => mockGetProject(...args),
  updateNodeWorkflowProject: (...args: unknown[]) => mockUpdateProject(...args),
  NodeWorkflowStateCorruptError: class NodeWorkflowStateCorruptError extends Error {},
  NodeWorkflowProjectConflictError: MockConflictError,
}))

const mockFindMany = vi.fn()
vi.mock('@/lib/db', () => ({
  db: {
    nodeWorkflowProject: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}))

import {
  applyOpsForMcp,
  listProjectsForMcp,
  lookAtForMcp,
  McpToolError,
  readProjectForMcp,
} from '@/services/mcp/mcp-tools.service'
import { NodeWorkflowStateV4Schema } from '@/types/node-workflow'

const CDN = 'https://cdn.test.com'
const OWNER = { tokenId: 'tok_1', userId: 'db_user_1', clerkId: 'clerk_1' }
const NOW = '2026-09-28T00:00:00.000Z'
const VERSION = '2026-09-28T03:00:00.000Z'

function mediaNode(
  id: string,
  kind: 'video' | 'image',
  url: string,
  shotNo?: number,
) {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      kind,
      subtype: kind === 'video' ? 'shot' : 'result',
      name: `${id}·name`,
      label: `${id}·name`,
      createdAt: NOW,
      ...(shotNo !== undefined ? { shotNo } : {}),
      outputs: { versions: [{ id: `${id}_v1`, url, createdAt: NOW }], cur: 0 },
    },
  }
}

const STATE = NodeWorkflowStateV4Schema.parse({
  version: 4,
  nodes: [
    mediaNode('v1', 'video', `${CDN}/shots/v1.mp4`, 1),
    mediaNode('v2', 'video', 'https://fal.media/v2.mp4', 2),
    mediaNode('i1', 'image', `${CDN}/images/i1.png`, 1),
  ],
  edges: [],
  edit: {
    name: '成片',
    tracks: {
      video: [
        { id: 'c1', sourceNodeId: 'v1', in: 2, out: 6 },
        { id: 'c2', sourceNodeId: 'v2', in: 0, out: 3 },
      ],
      audio: [],
      music: [{ id: 'm1', sourceNodeId: 'a1', in: 0, out: 7 }],
      text: [],
    },
    settings: {},
  },
})

function record(state: unknown = STATE) {
  return { id: 'p1', name: '短片', state, updatedAt: VERSION }
}

const mockFetch = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEXT_PUBLIC_STORAGE_BASE_URL', CDN)
  vi.stubGlobal('fetch', mockFetch)
  mockGetProject.mockResolvedValue(record())
  mockFetch.mockImplementation(
    async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'content-type': 'image/jpeg' },
      }),
  )
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

function fetchedUrls(): string[] {
  return mockFetch.mock.calls.map((call) => String(call[0]))
}

describe('listProjectsForMcp', () => {
  it('summarises every project without failing on a broken one', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'p1', name: '短片', state: STATE, updatedAt: new Date(VERSION) },
      {
        id: 'p2',
        name: '旧项目',
        state: { nodes: [{}, {}] },
        updatedAt: new Date(VERSION),
      },
      {
        id: 'p3',
        name: '坏的',
        state: 'garbage',
        updatedAt: new Date(VERSION),
      },
    ])

    const list = await listProjectsForMcp(OWNER)

    expect(list[0]).toEqual({
      projectId: 'p1',
      name: '短片',
      updatedAt: VERSION,
      nodeCount: 3,
      timeline: { clipCount: 3, durationSec: 7 },
    })
    expect(list[1]).toMatchObject({ nodeCount: 2, needsUpgrade: true })
    expect(list[1]).not.toHaveProperty('timeline')
    expect(list[2]).toMatchObject({ nodeCount: 0, needsUpgrade: true })
    expect(mockFindMany.mock.calls[0]![0].where).toEqual({
      userId: OWNER.userId,
      isDeleted: false,
    })
  })
})

describe('readProjectForMcp', () => {
  it('reads through the owner-checked service with the Clerk id', async () => {
    const view = await readProjectForMcp(OWNER, { projectId: 'p1' })

    expect(mockGetProject).toHaveBeenCalledWith(OWNER.clerkId, 'p1')
    expect(view.version).toBe(VERSION)
    expect(view.timeline?.clips.map((clip) => clip.clipId)).toEqual([
      'c1',
      'c2',
      'm1',
    ])
    expect(view.canvas.shots.length).toBeGreaterThan(0)
  })

  it('says where to look when the project is not the caller’s', async () => {
    mockGetProject.mockResolvedValue(null)

    await expect(
      readProjectForMcp(OWNER, { projectId: 'nope' }),
    ).rejects.toThrow(/list_projects/)
  })

  it('refuses a project that is not v4 yet instead of upgrading it', async () => {
    mockGetProject.mockResolvedValue(record({ nodes: [], edges: [] }))

    await expect(
      readProjectForMcp(OWNER, { projectId: 'p1' }),
    ).rejects.toBeInstanceOf(McpToolError)
  })
})

describe('lookAtForMcp', () => {
  it('maps timeline seconds on a clip into its source trim', async () => {
    // c1 在时间线 0–4 秒，素材入点 2 秒：时间线 1.5 秒 = 素材 3.5 秒。
    const frames = await lookAtForMcp(OWNER, {
      projectId: 'p1',
      clipId: 'c1',
      times: [1.5],
    })

    expect(frames[0]).toMatchObject({ ok: true, mimeType: 'image/jpeg' })
    expect(fetchedUrls()).toEqual([
      `${CDN}/cdn-cgi/media/mode=frame,time=3500ms,fit=scale-down,width=512,format=jpg/${CDN}/shots/v1.mp4`,
    ])
  })

  it('answers each time on its own: outside the clip is a reason, not a fetch', async () => {
    const frames = await lookAtForMcp(OWNER, {
      projectId: 'p1',
      clipId: 'c1',
      times: [1, 9],
    })

    expect(frames[0]?.ok).toBe(true)
    expect(frames[1]).toMatchObject({ ok: false })
    expect(frames[1]?.ok === false && frames[1].reason).toMatch(/outside/)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('never fetches media that is not on our CDN', async () => {
    const frames = await lookAtForMcp(OWNER, {
      projectId: 'p1',
      nodeId: 'v2',
      times: [1],
    })

    expect(frames[0]).toMatchObject({ ok: false })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('shows an image card as one resized JPEG', async () => {
    await lookAtForMcp(OWNER, { projectId: 'p1', nodeId: 'i1' })

    expect(fetchedUrls()).toEqual([
      `${CDN}/cdn-cgi/image/width=512,fit=scale-down,format=jpeg/${CDN}/images/i1.png`,
    ])
  })

  it('refuses an audio clip, which has no picture', async () => {
    await expect(
      lookAtForMcp(OWNER, { projectId: 'p1', clipId: 'm1', times: [1] }),
    ).rejects.toThrow(/audio/)
  })

  it('keeps the other frames when the CDN cannot extract one', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response('nope', { status: 415 }))
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1]), {
          headers: { 'content-type': 'image/jpeg' },
        }),
      )

    const frames = await lookAtForMcp(OWNER, {
      projectId: 'p1',
      nodeId: 'v1',
      times: [100, 1],
    })

    expect(frames.map((frame) => frame.ok)).toEqual([false, true])
  })
})

describe('readProjectForMcp takes', () => {
  it('names the current take of each media card for set_review_state', async () => {
    const view = await readProjectForMcp(OWNER, { projectId: 'p1' })

    expect(view.takes).toEqual([
      { nodeId: 'v1', url: `${CDN}/shots/v1.mp4` },
      { nodeId: 'v2', url: 'https://fal.media/v2.mp4' },
      { nodeId: 'i1', url: `${CDN}/images/i1.png` },
    ])
  })
})

describe('applyOpsForMcp', () => {
  const speedUp = {
    op: 'edit_update_clip' as const,
    track: 'video' as const,
    clipId: 'c1',
    patch: { speed: 2 },
  }

  beforeEach(() => {
    mockUpdateProject.mockImplementation(async (_clerkId, _id, input) => ({
      ...record(input.state),
      updatedAt: '2026-09-28T04:00:00.000Z',
    }))
  })

  it('writes the batch conditioned on the version Claude read', async () => {
    const result = await applyOpsForMcp(OWNER, {
      projectId: 'p1',
      baseVersion: VERSION,
      ops: [speedUp],
    })

    expect(result).toMatchObject({
      version: '2026-09-28T04:00:00.000Z',
      applied: 1,
      skipped: [],
    })
    const [clerkId, projectId, input] = mockUpdateProject.mock.calls[0]!
    expect([clerkId, projectId, input.baseUpdatedAt]).toEqual([
      OWNER.clerkId,
      'p1',
      VERSION,
    ])
    expect(input.state.edit.tracks.video[0].speed).toBe(2)
  })

  it('refuses a stale version without writing anything', async () => {
    await expect(
      applyOpsForMcp(OWNER, {
        projectId: 'p1',
        baseVersion: '2026-01-01T00:00:00.000Z',
        ops: [speedUp],
      }),
    ).rejects.toThrow(/Read it again/)
    expect(mockUpdateProject).not.toHaveBeenCalled()
  })

  it('turns a write that lost the race into the same read-again answer', async () => {
    mockUpdateProject.mockRejectedValue(new MockConflictError())

    await expect(
      applyOpsForMcp(OWNER, {
        projectId: 'p1',
        baseVersion: VERSION,
        ops: [speedUp],
      }),
    ).rejects.toThrow(/Read it again/)
  })

  it('does not write when nothing landed, and says why each op was skipped', async () => {
    const result = await applyOpsForMcp(OWNER, {
      projectId: 'p1',
      baseVersion: VERSION,
      ops: [
        { ...speedUp, clipId: 'nope' },
        { op: 'set_model', target: 'v1', modelId: 'some-model' },
      ],
    })

    expect(mockUpdateProject).not.toHaveBeenCalled()
    expect(result.version).toBe(VERSION)
    expect(result.applied).toBe(0)
    expect(result.skipped.map((skip) => [skip.index, skip.op])).toEqual([
      [0, 'edit_update_clip'],
      [1, 'set_model'],
    ])
    expect(result.skipped[1]?.reason).toMatch(/browser/)
  })

  it('will not empty the canvas', async () => {
    await expect(
      applyOpsForMcp(OWNER, {
        projectId: 'p1',
        baseVersion: VERSION,
        ops: ['v1', 'v2', 'i1'].map((target) => ({
          op: 'delete' as const,
          target,
        })),
      }),
    ).rejects.toThrow(/empty/)
    expect(mockUpdateProject).not.toHaveBeenCalled()
  })
})
