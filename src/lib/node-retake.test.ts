import { describe, expect, it } from 'vitest'

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { NODE_EDGE_VIA_IDS, NODE_SLOT_IDS } from '@/constants/node-slots'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_IMAGE_SUBTYPE_IDS,
  NODE_V4_TEXT_SUBTYPE_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'
import { applyCanvasBatchV4 } from '@/lib/node-canvas-batch-v4'
import { buildRetakeOps, shouldRetakeAsNewCard } from '@/lib/node-retake'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import {
  NodeWorkflowStateV4Schema,
  type NodeWorkflowStateV4,
} from '@/types/node-workflow'

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

const op = (value: Record<string, unknown>) => value as NodeAssistantOpV4
const ids = NODE_ASSISTANT_OP_V4_IDS

function apply(state: NodeWorkflowStateV4, ops: readonly NodeAssistantOpV4[]) {
  const batch = applyCanvasBatchV4(state, ops, context())
  expect(batch.failures).toEqual([])
  return batch
}

/** 给卡挂上产物（生成落库那一步不在 op 表里，直接改数据）。 */
function withUrl(state: NodeWorkflowStateV4, nodeId: string, url: string) {
  return {
    ...state,
    nodes: state.nodes.map((node) =>
      node.id === nodeId
        ? ({ ...node, data: { ...node.data, url } } as typeof node)
        : node,
    ),
  }
}

function edgesInto(state: NodeWorkflowStateV4, nodeId: string) {
  return state.edges.filter((edge) => edge.target === nodeId)
}

/** 剧本 → 镜头图（文本槽），参考图 R → 镜头图（参考槽），正文里 `@M` 再落一条。 */
function imageScene() {
  const seeded = apply(EMPTY, [
    op({
      op: ids.addNode,
      kind: NODE_MEDIA_KIND_IDS.text,
      subtype: NODE_V4_TEXT_SUBTYPE_IDS.script,
      ref: 't',
      name: '剧本',
    }),
    op({
      op: ids.addNode,
      kind: NODE_MEDIA_KIND_IDS.image,
      subtype: NODE_V4_IMAGE_SUBTYPE_IDS.reference,
      ref: 'r',
      name: '参考R',
    }),
    op({
      op: ids.addNode,
      kind: NODE_MEDIA_KIND_IDS.image,
      subtype: NODE_V4_IMAGE_SUBTYPE_IDS.reference,
      ref: 'm',
      name: '参考M',
    }),
    op({
      op: ids.addNode,
      kind: NODE_MEDIA_KIND_IDS.image,
      subtype: NODE_V4_IMAGE_SUBTYPE_IDS.shot,
      ref: 's',
      shotNo: 2,
    }),
    op({ op: ids.connect, source: 't', target: 's', slot: NODE_SLOT_IDS.text }),
    op({
      op: ids.connect,
      source: 'r',
      target: 's',
      slot: NODE_SLOT_IDS.reference,
    }),
    op({
      op: ids.setPrompt,
      target: 's',
      prompt: '@参考M 雨夜',
      mode: 'replace',
    }),
  ])
  const refs = seeded.createdRefs
  return {
    state: withUrl(seeded.state, refs.s!, 'https://cdn.test/s.png'),
    refs,
  }
}

describe('shouldRetakeAsNewCard', () => {
  it('只有已经出过产物的图 / 视频卡才长新卡', () => {
    const { state, refs } = imageScene()
    const shot = state.nodes.find((node) => node.id === refs.s)
    const bare = state.nodes.find((node) => node.id === refs.t)
    expect(shouldRetakeAsNewCard(shot)).toBe(true)
    expect(shouldRetakeAsNewCard(bare)).toBe(false)
    expect(shouldRetakeAsNewCard(undefined)).toBe(false)
    const empty = withUrl(state, refs.s!, '').nodes.find(
      (node) => node.id === refs.s,
    )
    expect(shouldRetakeAsNewCard(empty)).toBe(false)
  })
})

describe('buildRetakeOps', () => {
  it('图片：新卡同子型同镜号，照搬输入线，旧 → 新不连', () => {
    const { state, refs } = imageScene()
    const old = state.nodes.find((node) => node.id === refs.s)!
    const batch = apply(
      state,
      buildRetakeOps({ node: old, edges: state.edges, prompt: '@参考M 雨夜' }),
    )
    const newId = batch.createdNodeIds[0]!
    const created = batch.state.nodes.find((node) => node.id === newId)!
    if (created.data.kind !== NODE_MEDIA_KIND_IDS.image)
      throw new Error('not image')
    expect(created.data.subtype).toBe(NODE_V4_IMAGE_SUBTYPE_IDS.shot)
    expect(created.data.shotNo).toBe(2)
    expect(created.data.prompt).toBe('@参考M 雨夜')

    const into = edgesInto(batch.state, newId)
    const bySource = into.map((edge) => [edge.source, edge.slot]).sort()
    expect(bySource).toEqual(
      [
        [refs.m, NODE_SLOT_IDS.reference],
        [refs.r, NODE_SLOT_IDS.reference],
        [refs.t, NODE_SLOT_IDS.text],
      ].sort(),
    )
    // `@` 落的那条由新卡自己的正文重落，仍记作 mention，且只有一条
    const mention = into.filter((edge) => edge.source === refs.m)
    expect(mention).toHaveLength(1)
    expect(mention[0]?.data?.via).toBe(NODE_EDGE_VIA_IDS.mention)
    // 旧卡 → 新卡没有线；旧卡自己的输入原样不动
    expect(batch.state.edges.some((edge) => edge.source === refs.s)).toBe(false)
    expect(edgesInto(batch.state, refs.s!)).toHaveLength(3)
  })

  it('图片：停用的输入版本不抄', () => {
    const { state, refs } = imageScene()
    const blocked = {
      ...state,
      nodes: state.nodes.map((node) => {
        if (node.id !== refs.s) return node
        const slots = { ...node.data.slots }
        const reference = slots[NODE_SLOT_IDS.reference]!
        slots[NODE_SLOT_IDS.reference] = {
          ...reference,
          versions: reference.versions.map((version) =>
            version.sourceNodeId === refs.r
              ? { ...version, blocked: true }
              : version,
          ),
        }
        return { ...node, data: { ...node.data, slots } } as typeof node
      }),
    }
    const old = blocked.nodes.find((node) => node.id === refs.s)!
    const ops = buildRetakeOps({
      node: old,
      edges: blocked.edges,
      prompt: '雨夜',
    })
    const sources = ops
      .filter((item) => item.op === ids.connect)
      .map((item) => (item as { source: string }).source)
    expect(sources).toEqual([refs.t])
  })

  it('视频镜头：同镜号、名字避开重名、景别运镜跟着走，首帧照接', () => {
    const seeded = apply(EMPTY, [
      op({
        op: ids.addNode,
        kind: NODE_MEDIA_KIND_IDS.image,
        subtype: NODE_V4_IMAGE_SUBTYPE_IDS.reference,
        ref: 'f',
        name: '首帧F',
      }),
      op({
        op: ids.addNode,
        kind: NODE_MEDIA_KIND_IDS.video,
        subtype: NODE_V4_VIDEO_SUBTYPE_IDS.shot,
        ref: 'v',
        shotNo: 3,
        name: 'S03·对视',
      }),
      op({
        op: ids.connect,
        source: 'f',
        target: 'v',
        slot: NODE_SLOT_IDS.firstFrame,
      }),
      op({
        op: ids.setShotSpec,
        target: 'v',
        spec: { size: 'close', move: 'push' },
      }),
    ])
    const refs = seeded.createdRefs
    const state = withUrl(seeded.state, refs.v!, 'https://cdn.test/v.mp4')
    const old = state.nodes.find((node) => node.id === refs.v)!
    const batch = apply(
      state,
      buildRetakeOps({ node: old, edges: state.edges, prompt: '两人对视' }),
    )
    const newId = batch.createdNodeIds[0]!
    const created = batch.state.nodes.find((node) => node.id === newId)!
    if (
      created.data.kind !== NODE_MEDIA_KIND_IDS.video ||
      created.data.subtype !== NODE_V4_VIDEO_SUBTYPE_IDS.shot
    )
      throw new Error('not a video shot')
    if (
      old.data.kind !== NODE_MEDIA_KIND_IDS.video ||
      old.data.subtype !== NODE_V4_VIDEO_SUBTYPE_IDS.shot
    )
      throw new Error('not a video shot')
    expect(created.data.shotNo).toBe(3)
    expect(created.data.label).toBeTruthy()
    expect(created.data.label).not.toBe(old.data.label)
    expect(created.data.shot?.size).toBe(old.data.shot?.size)
    expect(created.data.shot?.move).toBe(old.data.shot?.move)
    expect(created.data.url).toBeFalsy()
    expect(
      edgesInto(batch.state, newId).map((edge) => [edge.source, edge.slot]),
    ).toEqual([[refs.f, NODE_SLOT_IDS.firstFrame]])
    expect(batch.state.edges.some((edge) => edge.source === refs.v)).toBe(false)
  })

  it('不是图 / 视频卡时什么也不做', () => {
    const { state, refs } = imageScene()
    const text = state.nodes.find((node) => node.id === refs.t)!
    expect(
      buildRetakeOps({ node: text, edges: state.edges, prompt: 'x' }),
    ).toEqual([])
  })
})
