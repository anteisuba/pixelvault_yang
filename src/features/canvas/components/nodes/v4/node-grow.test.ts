import { describe, expect, it } from 'vitest'

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { NODE_SLOT_IDS } from '@/constants/node-slots'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_AUDIO_SUBTYPE_IDS,
  NODE_V4_IMAGE_SUBTYPE_IDS,
  NODE_V4_TEXT_SUBTYPE_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'
import { applyCanvasBatchV4 } from '@/lib/node-canvas-batch-v4'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import {
  NodeWorkflowStateV4Schema,
  type NodeWorkflowStateV4,
} from '@/types/node-workflow'

import { buildGrowOps, growTargetsOf, NODE_GROW_TARGET_IDS } from './node-grow'

const EMPTY = NodeWorkflowStateV4Schema.parse({
  version: 4,
  nodes: [],
  edges: [],
})

let counter = 0
const context = () => ({
  mintId: (prefix: string) => {
    counter += 1
    return `${prefix}${counter}`
  },
})

function apply(state: NodeWorkflowStateV4, ops: readonly NodeAssistantOpV4[]) {
  const batch = applyCanvasBatchV4(state, ops, context())
  expect(batch.failures).toEqual([])
  return batch
}

function seed(
  kind: string,
  subtype: string,
  extra: Record<string, unknown> = {},
) {
  const batch = apply(EMPTY, [
    {
      op: NODE_ASSISTANT_OP_V4_IDS.addNode,
      kind,
      subtype,
      ref: 'src',
      ...extra,
    } as NodeAssistantOpV4,
  ])
  const id = batch.createdRefs.src!
  return {
    state: batch.state,
    source: batch.state.nodes.find((n) => n.id === id)!,
  }
}

function grownInto(state: NodeWorkflowStateV4, sourceId: string) {
  const edge = state.edges.find((item) => item.source === sourceId)!
  const node = state.nodes.find((item) => item.id === edge.target)!
  return { edge, node }
}

describe('growTargetsOf', () => {
  it('图 / 文本 → 图片 · 视频；音频 → 视频；视频卡自己给续拍', () => {
    const image = seed(
      NODE_MEDIA_KIND_IDS.image,
      NODE_V4_IMAGE_SUBTYPE_IDS.shot,
    ).source
    const text = seed(
      NODE_MEDIA_KIND_IDS.text,
      NODE_V4_TEXT_SUBTYPE_IDS.script,
    ).source
    const audio = seed(
      NODE_MEDIA_KIND_IDS.audio,
      NODE_V4_AUDIO_SUBTYPE_IDS.voice,
    ).source
    const video = seed(
      NODE_MEDIA_KIND_IDS.video,
      NODE_V4_VIDEO_SUBTYPE_IDS.shot,
    ).source
    expect(growTargetsOf(image)).toEqual(['image', 'video'])
    expect(growTargetsOf(text)).toEqual(['image', 'video'])
    expect(growTargetsOf(audio)).toEqual(['video'])
    expect(growTargetsOf(video)).toEqual([])
  })
})

describe('buildGrowOps', () => {
  it('图 → 图：空镜头图，接进参考槽，一批两条', () => {
    const { state, source } = seed(
      NODE_MEDIA_KIND_IDS.image,
      NODE_V4_IMAGE_SUBTYPE_IDS.shot,
      { shotNo: 4 },
    )
    const ops = buildGrowOps(source, NODE_GROW_TARGET_IDS.image)
    expect(ops).toHaveLength(2)
    const { edge, node } = grownInto(apply(state, ops).state, source.id)
    if (node.data.kind !== NODE_MEDIA_KIND_IDS.image)
      throw new Error('not image')
    expect(node.data.subtype).toBe(NODE_V4_IMAGE_SUBTYPE_IDS.shot)
    expect(edge.slot).toBe(NODE_SLOT_IDS.reference)
    expect(node.data.prompt ?? '').toBe('')
  })

  it('图 → 视频：同镜号的镜头卡，接进首帧（与 ⋯「生镜头」同形）', () => {
    const { state, source } = seed(
      NODE_MEDIA_KIND_IDS.image,
      NODE_V4_IMAGE_SUBTYPE_IDS.shot,
      { shotNo: 4 },
    )
    const { edge, node } = grownInto(
      apply(state, buildGrowOps(source, NODE_GROW_TARGET_IDS.video)).state,
      source.id,
    )
    expect(node.data.kind).toBe(NODE_MEDIA_KIND_IDS.video)
    expect(node.data.subtype).toBe(NODE_V4_VIDEO_SUBTYPE_IDS.shot)
    expect(node.data.shotNo).toBe(4)
    expect(edge.slot).toBe(NODE_SLOT_IDS.firstFrame)
  })

  it('音频 → 视频：镜头卡，接进语音槽', () => {
    const { state, source } = seed(
      NODE_MEDIA_KIND_IDS.audio,
      NODE_V4_AUDIO_SUBTYPE_IDS.voice,
    )
    const { edge, node } = grownInto(
      apply(state, buildGrowOps(source, NODE_GROW_TARGET_IDS.video)).state,
      source.id,
    )
    expect(node.data.kind).toBe(NODE_MEDIA_KIND_IDS.video)
    expect(edge.slot).toBe(NODE_SLOT_IDS.voice)
  })

  it('落点给了就带上；不认识的去处什么也不做', () => {
    const { source } = seed(
      NODE_MEDIA_KIND_IDS.image,
      NODE_V4_IMAGE_SUBTYPE_IDS.shot,
    )
    const [add] = buildGrowOps(source, NODE_GROW_TARGET_IDS.image, {
      x: 640,
      y: 80,
    })
    expect(add).toMatchObject({ position: { x: 640, y: 80 } })
    const audio = seed(
      NODE_MEDIA_KIND_IDS.audio,
      NODE_V4_AUDIO_SUBTYPE_IDS.voice,
    ).source
    expect(buildGrowOps(audio, NODE_GROW_TARGET_IDS.image)).toEqual([])
  })
})
