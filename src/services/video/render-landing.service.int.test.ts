/**
 * 成片落回画布：拼卡是纯函数（直接测）；落库那一步连真库（L2a），版本号撞车用
 * 「另一个标签页在读写之间保存了一次」来造。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { NODE_V4_CARD } from '@/constants/node-studio'
import { db } from '@/lib/db'
import { currentUrlOf } from '@/lib/edit-project'
import {
  buildRenderLanding,
  landRenderOnCanvas,
} from '@/services/video/render-landing.service'
import { NodeWorkflowStateV4Schema } from '@/types/node-workflow'
import { createTestUser, resetDatabase } from '@/test/int/db'

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

/** 视频卡「裁剪」（node-canvas-v2 §4 shot；owner 2026-11-05「服务器落卡」）。 */
describe('buildRenderLanding · 视频卡裁剪', () => {
  const TRIM_INPUT = {
    sourceNodeIds: ['v1'],
    name: 'v1 · 裁剪',
    sourceLabel: '来自剪辑台 · v1 · 裁剪',
    generation: { id: 'gen_trim', url: 'https://cdn.test/renders/p/trim.mp4' },
  }

  it('落成 video.clip，来源写「裁剪」+ 原卡名字，落在浏览器交上来的位置', () => {
    const landed = buildRenderLanding(
      STATE,
      {
        ...TRIM_INPUT,
        trim: { sourceName: 'v1', position: { x: 520, y: 300 } },
      },
      { now: NOW },
    )
    expect(landed).not.toBeNull()
    const node = landed!.state.nodes.find((n) => n.id === landed!.nodeId)!
    expect(node.data.kind).toBe('video')
    expect(node.data.subtype).toBe('clip')
    expect(node.data.name).toBe('v1 · 裁剪')
    expect(node.position).toEqual({ x: 520, y: 300 })
    expect(currentUrlOf(node)).toBe('https://cdn.test/renders/p/trim.mp4')
    expect((node.data as { source?: unknown }).source).toEqual({
      kind: 'trim',
      label: 'v1',
    })
    // 截出来的一段是素材：⛔ 不占镜号。
    expect('shotNo' in node.data && node.data.shotNo).toBeFalsy()
  })

  it('从原卡连一条 reference 过去，原卡不动，整份仍是合法 v4', () => {
    const landed = buildRenderLanding(
      STATE,
      { ...TRIM_INPUT, trim: { sourceName: 'v1' } },
      { now: NOW },
    )!
    const edges = landed.state.edges.filter((e) => e.target === landed.nodeId)
    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({ source: 'v1', slot: 'reference' })
    const original = landed.state.nodes.find((n) => n.id === 'v1')!
    expect(currentUrlOf(original)).toBe('https://cdn.test/v1.mp4')
    expect(NodeWorkflowStateV4Schema.safeParse(landed.state).success).toBe(true)
  })

  it('没交落点（MCP 之类）= 照旧落在来源卡右侧', () => {
    const landed = buildRenderLanding(
      STATE,
      { ...TRIM_INPUT, trim: { sourceName: 'v1' } },
      { now: NOW },
    )!
    const node = landed.state.nodes.find((n) => n.id === landed.nodeId)!
    expect(node.position).toEqual({
      x: NODE_V4_CARD.shotCollapsedWidth + 80,
      y: 40,
    })
  })
})

describe('landRenderOnCanvas', () => {
  let userId: string
  let projectId: string

  beforeEach(async () => {
    await resetDatabase()
    const user = await createTestUser()
    userId = user.id
    projectId = (
      await db.nodeWorkflowProject.create({
        data: {
          userId,
          name: 'canvas',
          state: JSON.parse(JSON.stringify(STATE)),
        },
      })
    ).id
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const nodesOf = async (id: string) =>
    NodeWorkflowStateV4Schema.parse(
      (await db.nodeWorkflowProject.findUniqueOrThrow({ where: { id } })).state,
    ).nodes

  /** 每次写库之前，另一个标签页抢先保存一次（版本号往前走）。 */
  function anotherTabSavesFirst(times: number) {
    const update = db.nodeWorkflowProject.update.bind(db.nodeWorkflowProject)
    let left = times
    return vi
      .spyOn(db.nodeWorkflowProject, 'update')
      .mockImplementation((async (args: Parameters<typeof update>[0]) => {
        if (left > 0) {
          left -= 1
          await db.$executeRaw`UPDATE "NodeWorkflowProject" SET "updatedAt" = now() + interval '1 second' WHERE "id" = ${projectId}`
        }
        return update(args)
      }) as unknown as typeof update)
  }

  it('按归属取项目、写回那张新卡', async () => {
    const nodeId = await landRenderOnCanvas({
      ...INPUT,
      userId,
      canvasProjectId: projectId,
    })

    expect(nodeId).toBeTruthy()
    const node = (await nodesOf(projectId)).find((n) => n.id === nodeId)
    expect(node?.data.name).toBe('我的成片')
  })

  it('版本号撞车 → 在最新那份上重来，卡照样落下', async () => {
    const update = anotherTabSavesFirst(1)

    const nodeId = await landRenderOnCanvas({
      ...INPUT,
      userId,
      canvasProjectId: projectId,
    })

    expect(nodeId).toBeTruthy()
    expect((await nodesOf(projectId)).some((n) => n.id === nodeId)).toBe(true)
    expect(update).toHaveBeenCalledTimes(2)
  })

  it('连撞三次 → 放弃（null），⛔ 不无限重来，画布不多卡', async () => {
    const update = anotherTabSavesFirst(Number.POSITIVE_INFINITY)

    expect(
      await landRenderOnCanvas({
        ...INPUT,
        userId,
        canvasProjectId: projectId,
      }),
    ).toBeNull()
    expect(update).toHaveBeenCalledTimes(3)
    expect(await nodesOf(projectId)).toHaveLength(STATE.nodes.length)
  })

  it('项目不是这个人的 → null，别人的画布不动', async () => {
    const stranger = await createTestUser()

    expect(
      await landRenderOnCanvas({
        ...INPUT,
        userId: stranger.id,
        canvasProjectId: projectId,
      }),
    ).toBeNull()
    expect(await nodesOf(projectId)).toHaveLength(STATE.nodes.length)
  })
})
