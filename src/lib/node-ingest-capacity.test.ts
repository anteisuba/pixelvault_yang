/**
 * 落槽容量闸（契约 `references/pages/canvas-slot-rack.md` §4.5）。
 *
 * 这里守的三件事，每一件都对应一个此前的真实缺口：
 * 1. **音频 / 视频也会满** —— 旧的 `previewIngestCapacity` 先用
 *    `isImageContributingNode` 过滤，注释写着「voice/videoReference 没有已知
 *    的 per-target 上限」，于是那两类**从来没被拦过**。契约里它们一直是 3。
 * 2. **跨模态总额** —— 旧路径用 `getMaxReferenceImages`（单一上限），不知道
 *    「≤12 个文件」这类总额，图片区的实际余量算不对。
 * 3. **拒绝要说对是哪条限制** —— 分项满与总额尽对用户的下一步不同。
 */
import { describe, expect, it } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { NODE_IMAGE_ROLE_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'

import {
  resolveIngestCapacity,
  resolveNodeSlotZone,
} from './node-ingest-capacity'

/** Seedance 2.0 参考档：图 9 · 视频 3 · 音频 3 · 跨模态总额 12。 */
const VIDEO = {
  id: 'vid',
  type: NODE_TYPE_IDS.seedance,
  position: { x: 0, y: 0 },
  data: {
    prompt: '',
    status: 'idle',
    model: {
      modelId: AI_MODELS.SEEDANCE_20_REFERENCE,
      adapterType: AI_ADAPTER_TYPES.FAL,
    },
  },
} as unknown as NodeWorkflowNode

function image(id: string): NodeWorkflowNode {
  return {
    id,
    type: NODE_TYPE_IDS.image,
    position: { x: 0, y: 0 },
    data: {
      prompt: '',
      status: 'idle',
      role: NODE_IMAGE_ROLE_IDS.shot,
      mediaUrl: `https://cdn/${id}.png`,
    },
  } as unknown as NodeWorkflowNode
}

function voice(id: string): NodeWorkflowNode {
  return {
    id,
    type: NODE_TYPE_IDS.voice,
    position: { x: 0, y: 0 },
    data: {
      prompt: '',
      status: 'idle',
      voiceReferenceAudioUrl: `https://cdn/${id}.mp3`,
    },
  } as unknown as NodeWorkflowNode
}

function refVideo(id: string): NodeWorkflowNode {
  return {
    id,
    type: NODE_TYPE_IDS.videoReference,
    position: { x: 0, y: 0 },
    data: {
      prompt: '',
      status: 'idle',
      mediaUrl: `https://cdn/${id}.mp4`,
    },
  } as unknown as NodeWorkflowNode
}

/** 把这些节点全连到视频节点上。 */
function wire(sources: readonly NodeWorkflowNode[]): NodeWorkflowEdge[] {
  return sources.map(
    (node) =>
      ({
        id: `e-${node.id}`,
        source: node.id,
        target: 'vid',
      }) as NodeWorkflowEdge,
  )
}

describe('resolveNodeSlotZone · 与收割侧对齐', () => {
  it.each([
    ['图片', image('a'), 'images'],
    ['音色', voice('v'), 'audio'],
    ['参考视频', refVideo('m'), 'videos'],
  ])('%s → %s 区', (_label, node, zone) => {
    expect(resolveNodeSlotZone(node as NodeWorkflowNode)).toBe(zone)
  })

  it('结构类节点不占素材位', () => {
    const shotText = {
      id: 't1',
      type: NODE_TYPE_IDS.shotText,
      position: { x: 0, y: 0 },
      data: { prompt: '', status: 'idle' },
    } as unknown as NodeWorkflowNode
    expect(resolveNodeSlotZone(shotText)).toBeNull()
  })
})

describe('resolveIngestCapacity · 三个区都会满', () => {
  it('图片满 9 时第 10 张被判满', () => {
    const existing = Array.from({ length: 9 }, (_, i) => image(`i${i}`))
    const check = resolveIngestCapacity({
      source: image('extra'),
      target: VIDEO,
      edges: wire(existing),
      nodes: [VIDEO, ...existing],
    })
    expect(check).toMatchObject({ zone: 'images', current: 9, limit: 9 })
    expect(check?.full).toBe(true)
  })

  it('图片 8 张时第 9 张还塞得下', () => {
    const existing = Array.from({ length: 8 }, (_, i) => image(`i${i}`))
    const check = resolveIngestCapacity({
      source: image('extra'),
      target: VIDEO,
      edges: wire(existing),
      nodes: [VIDEO, ...existing],
    })
    expect(check?.full).toBe(false)
  })

  it('⚠ 缺口回归：音频满 3 条时也会被拦（旧路径对音频从不报满）', () => {
    const existing = [voice('v0'), voice('v1'), voice('v2')]
    const check = resolveIngestCapacity({
      source: voice('v3'),
      target: VIDEO,
      edges: wire(existing),
      nodes: [VIDEO, ...existing],
    })
    expect(check).toMatchObject({ zone: 'audio', current: 3, limit: 3 })
    expect(check?.full).toBe(true)
  })

  it('⚠ 缺口回归：参考视频满 3 条时也会被拦', () => {
    const existing = [refVideo('m0'), refVideo('m1'), refVideo('m2')]
    const check = resolveIngestCapacity({
      source: refVideo('m3'),
      target: VIDEO,
      edges: wire(existing),
      nodes: [VIDEO, ...existing],
    })
    expect(check).toMatchObject({ zone: 'videos', current: 3, limit: 3 })
    expect(check?.full).toBe(true)
  })
})

describe('resolveIngestCapacity · 说对是哪条限制', () => {
  it('图片没到 9 但跨模态总额被吃光 → limitedByTotal', () => {
    // 3 视频 + 3 音频 = 6，总额 12 只剩 6 个图片位 —— 图片自己的上限是 9，
    // 所以第 7 张图被拦时，该说的是「去减视频/音频」而不是「换模型」。
    const existing = [
      refVideo('m0'),
      refVideo('m1'),
      refVideo('m2'),
      voice('v0'),
      voice('v1'),
      voice('v2'),
      ...Array.from({ length: 6 }, (_, i) => image(`i${i}`)),
    ]
    const check = resolveIngestCapacity({
      source: image('extra'),
      target: VIDEO,
      edges: wire(existing),
      nodes: [VIDEO, ...existing],
    })
    expect(check).toMatchObject({ zone: 'images', current: 6, limit: 6 })
    expect(check?.full).toBe(true)
    expect(check?.limitedByTotal).toBe(true)
  })

  it('图片自己到顶（没有别的模态占额）→ 不是总额问题', () => {
    const existing = Array.from({ length: 9 }, (_, i) => image(`i${i}`))
    const check = resolveIngestCapacity({
      source: image('extra'),
      target: VIDEO,
      edges: wire(existing),
      nodes: [VIDEO, ...existing],
    })
    expect(check?.limitedByTotal).toBe(false)
  })
})

describe('resolveIngestCapacity · 无从判断时诚实沉默', () => {
  it('目标还没选模型 → null（没有契约就没有上限，不硬造）', () => {
    const noModel = {
      ...VIDEO,
      data: { prompt: '', status: 'idle' },
    } as unknown as NodeWorkflowNode
    expect(
      resolveIngestCapacity({
        source: image('a'),
        target: noModel,
        edges: [],
        nodes: [noModel],
      }),
    ).toBeNull()
  })

  it('目标不是视频节点 → null', () => {
    const shot = image('shot-target')
    expect(
      resolveIngestCapacity({
        source: image('a'),
        target: shot,
        edges: [],
        nodes: [shot],
      }),
    ).toBeNull()
  })
})
