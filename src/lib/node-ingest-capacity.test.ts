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
  resolveSpawnCapacity,
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
      voiceClipUrl: `https://cdn/${id}.mp3`,
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

/**
 * 阶段 3「参考图落散图节点 + 自动连线」：新节点还没建出来时的同一道闸。
 *
 * ⚠ 这一族守的是一个**此前完全敞开**的口子 —— `handleSpawnReference` 直接调
 * `workflow.onConnect`，从不经过 `handleIngestConnect` 的容量检查。阶段 3 把
 * 上传 / 素材库 / 粘贴全改成走它之后，那就是主路无闸。
 */
describe('resolveSpawnCapacity · 落地前问，问出来必须和落地时同一个数', () => {
  it('图片满 9 时，再上传一张被拒（节点不该建出来）', () => {
    const existing = Array.from({ length: 9 }, (_, i) => image(`i${i}`))
    const check = resolveSpawnCapacity({
      nodeType: NODE_TYPE_IDS.image,
      target: VIDEO,
      edges: wire(existing),
      nodes: [VIDEO, ...existing],
    })
    expect(check).toMatchObject({ zone: 'images', current: 9, limit: 9 })
    expect(check?.full).toBe(true)
  })

  it('与「源节点已在图上」的问法结果一致 —— 两条落点不许各算各的', () => {
    const existing = Array.from({ length: 8 }, (_, i) => image(`i${i}`))
    const args = { edges: wire(existing), nodes: [VIDEO, ...existing] }
    expect(
      resolveSpawnCapacity({
        nodeType: NODE_TYPE_IDS.image,
        target: VIDEO,
        ...args,
      }),
    ).toEqual(
      resolveIngestCapacity({ source: image('extra'), target: VIDEO, ...args }),
    )
  })

  it('音色 / 参考视频同样按各自的区判 —— 不是只有图片有闸', () => {
    const voices = Array.from({ length: 3 }, (_, i) => voice(`v${i}`))
    expect(
      resolveSpawnCapacity({
        nodeType: NODE_TYPE_IDS.voice,
        target: VIDEO,
        edges: wire(voices),
        nodes: [VIDEO, ...voices],
      }),
    ).toMatchObject({ zone: 'audio', limit: 3, full: true })
  })

  it('目标不是视频节点（比如把参考图落到镜头图上）→ null，不硬造上限', () => {
    const shot = image('shot-target')
    expect(
      resolveSpawnCapacity({
        nodeType: NODE_TYPE_IDS.image,
        target: shot,
        edges: [],
        nodes: [shot],
      }),
    ).toBeNull()
  })
})

/**
 * 阶段 5「声音三形态对称」：音频必须问收割函数，不能数直连上游。
 *
 * ⚠ 这一条守的是一个**会静默超发**的口子：`音色 → 角色卡 → 视频` 是两跳，
 * `harvestUpstreamAudioBindings` 照发，而闸原本只数直连上游 —— 于是一张绑了
 * 音色的角色卡在闸这里算 0 条音频。角色卡 + 3 个散件音色 = 实际发 4 条，闸却
 * 以为才 3 条，跨模态总额也跟着少扣。
 */
describe('resolveIngestCapacity · 音频要数到两跳（绑在角色卡上的音色）', () => {
  function character(id: string): NodeWorkflowNode {
    return {
      id,
      type: NODE_TYPE_IDS.characterImage,
      position: { x: 0, y: 0 },
      data: {
        prompt: '',
        status: 'idle',
        characterName: '角色A',
        imageUrl: `https://cdn/${id}.png`,
      },
    } as unknown as NodeWorkflowNode
  }

  it('绑在角色卡上的音色计入音频区 —— 不是「直连才算」', () => {
    const char = character('c1')
    const boundVoice = voice('v-bound')
    const nodes = [VIDEO, char, boundVoice]
    const edges = [
      { id: 'e1', source: char.id, target: 'vid' },
      { id: 'e2', source: boundVoice.id, target: char.id },
    ] as NodeWorkflowEdge[]

    const check = resolveIngestCapacity({
      source: voice('v-new'),
      target: VIDEO,
      edges,
      nodes,
    })
    // 关键：current 是 1 不是 0。旧算法在这里返回 0，于是音频区能被塞到 4 条。
    expect(check).toMatchObject({ zone: 'audio', current: 1, limit: 3 })
  })

  it('两跳 + 直连一起数满 3 条时，第 4 条被拒', () => {
    const char = character('c1')
    const bound = voice('v-bound')
    const direct = [voice('v1'), voice('v2')]
    const nodes = [VIDEO, char, bound, ...direct]
    const edges = [
      { id: 'e1', source: char.id, target: 'vid' },
      { id: 'e2', source: bound.id, target: char.id },
      ...wire(direct),
    ] as NodeWorkflowEdge[]

    const check = resolveIngestCapacity({
      source: voice('v-extra'),
      target: VIDEO,
      edges,
      nodes,
    })
    expect(check).toMatchObject({ zone: 'audio', current: 3, limit: 3 })
    expect(check?.full).toBe(true)
  })
})
