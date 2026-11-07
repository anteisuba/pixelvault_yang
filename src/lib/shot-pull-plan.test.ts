import { describe, expect, it } from 'vitest'

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'
import { applyCanvasBatchV4 } from '@/lib/node-canvas-batch-v4'
import {
  canMergeWithPrevious,
  planShotMerge,
  planShotPull,
  planShotSplit,
  referenceDurationToParam,
} from '@/lib/shot-pull-plan'
import { listShotTableNodes } from '@/lib/shot-table-rows'
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

const ids = NODE_ASSISTANT_OP_V4_IDS

function apply(state: NodeWorkflowStateV4, ops: readonly NodeAssistantOpV4[]) {
  const batch = applyCanvasBatchV4(state, ops, context())
  expect(batch.failures).toEqual([])
  return batch
}

/** 一张参考片 + 表里已有的两镜（手写的）。 */
function scene() {
  const batch = apply(EMPTY, [
    {
      op: ids.addNode,
      kind: NODE_MEDIA_KIND_IDS.video,
      subtype: NODE_V4_VIDEO_SUBTYPE_IDS.clip,
      ref: 'clip',
      name: '城市日常',
    },
    {
      op: ids.addNode,
      kind: NODE_MEDIA_KIND_IDS.video,
      subtype: NODE_V4_VIDEO_SUBTYPE_IDS.shot,
      shotNo: 1,
    },
    {
      op: ids.addNode,
      kind: NODE_MEDIA_KIND_IDS.video,
      subtype: NODE_V4_VIDEO_SUBTYPE_IDS.shot,
      shotNo: 2,
    },
  ])
  const clipId = batch.createdRefs.clip
  if (!clipId) throw new Error('clip not created')
  return { state: batch.state, clipId }
}

const RANGES = [
  { startSec: 0, endSec: 3.04 },
  { startSec: 3.04, endSec: 7.5 },
  { startSec: 7.5, endSec: 11.54 },
]

function rows(state: NodeWorkflowStateV4) {
  return listShotTableNodes(state.nodes).map((node) => ({
    shotNo: node.data.shotNo,
    ref: node.data.shot?.ref,
    draft: node.data.shot?.draft,
    duration: node.data.params?.duration,
  }))
}

describe('planShotPull', () => {
  it('追加到表尾：镜号接在最后一镜后面，每行带参考段、是草稿、时长取整', () => {
    const { state, clipId } = scene()
    const plan = planShotPull({
      nodes: state.nodes,
      clipNodeId: clipId,
      ranges: RANGES,
    })
    const next = apply(state, plan.ops).state
    expect(rows(next)).toEqual([
      { shotNo: 1, ref: undefined, draft: undefined, duration: undefined },
      { shotNo: 2, ref: undefined, draft: undefined, duration: undefined },
      {
        shotNo: 3,
        ref: { nodeId: clipId, startSec: 0, endSec: 3.04 },
        draft: true,
        duration: '3',
      },
      {
        shotNo: 4,
        ref: { nodeId: clipId, startSec: 3.04, endSec: 7.5 },
        draft: true,
        duration: '4',
      },
      {
        shotNo: 5,
        ref: { nodeId: clipId, startSec: 7.5, endSec: 11.54 },
        draft: true,
        duration: '4',
      },
    ])
    expect(plan.added).toHaveLength(3)
    expect(plan.replaced).toBe(0)
  })

  it('片段卡同一批标成「参考」，撤销一起退', () => {
    const { state, clipId } = scene()
    const batch = apply(
      state,
      planShotPull({ nodes: state.nodes, clipNodeId: clipId, ranges: RANGES })
        .ops,
    )
    const clip = batch.state.nodes.find((node) => node.id === clipId)
    expect(clip?.data.kind === 'video' && clip.data.clipRole).toBe('reference')
    expect(batch.inverse).not.toBeNull()
  })

  it('重拉同一段：没改过的草稿被替换，改过的行留着，新结果不重复建被它盖住的段', () => {
    const { state, clipId } = scene()
    const first = apply(
      state,
      planShotPull({ nodes: state.nodes, clipNodeId: clipId, ranges: RANGES })
        .ops,
    ).state
    // 用户改了第 4 镜（拉出来的第二行）：草稿标记去掉
    const edited = listShotTableNodes(first.nodes).find(
      (node) => node.data.shotNo === 4,
    )
    if (!edited) throw new Error('row missing')
    const touched = apply(first, [
      {
        op: ids.setShotSpec,
        target: edited.id,
        spec: { size: 'close', draft: null },
      },
    ]).state

    const again = planShotPull({
      nodes: touched.nodes,
      clipNodeId: clipId,
      ranges: [
        { startSec: 0, endSec: 2 },
        { startSec: 2, endSec: 7.5 },
        { startSec: 7.5, endSec: 11.54 },
      ],
    })
    expect(again.replaced).toBe(2)
    // 2–7.5 被改过的 3.04–7.5 盖住了大半 → 不重复建
    expect(again.added).toEqual([
      { startSec: 0, endSec: 2 },
      { startSec: 7.5, endSec: 11.54 },
    ])
    const next = apply(touched, again.ops).state
    expect(
      rows(next).map((row) => [row.shotNo, row.ref?.startSec, row.draft]),
    ).toEqual([
      [1, undefined, undefined],
      [2, undefined, undefined],
      [3, 3.04, undefined],
      [4, 0, true],
      [5, 7.5, true],
    ])
  })

  it('落点按序号传给新卡', () => {
    const { state, clipId } = scene()
    const plan = planShotPull({
      nodes: state.nodes,
      clipNodeId: clipId,
      ranges: RANGES.slice(0, 2),
      positionFor: (index) => ({ x: 1000 + index * 500, y: 40 }),
    })
    const next = apply(state, plan.ops).state
    const pulled = listShotTableNodes(next.nodes).filter(
      (node) => node.data.shot?.ref,
    )
    expect(pulled.map((node) => node.position)).toEqual([
      { x: 1000, y: 40 },
      { x: 1500, y: 40 },
    ])
  })
})

describe('合并 / 切开', () => {
  function pulled() {
    const { state, clipId } = scene()
    const next = apply(
      state,
      planShotPull({ nodes: state.nodes, clipNodeId: clipId, ranges: RANGES })
        .ops,
    ).state
    const shots = listShotTableNodes(next.nodes)
    return { state: next, clipId, shots }
  }

  it('只有同一张参考片、首尾相接的两行能合并', () => {
    const { shots } = pulled()
    expect(canMergeWithPrevious(shots[1], shots[2])).toBe(false) // 手写行 → 拉片行
    expect(canMergeWithPrevious(shots[2], shots[3])).toBe(true)
    expect(canMergeWithPrevious(undefined, shots[2])).toBe(false)
  })

  it('和上一镜合并：参考段延长、时长跟着重算、下一镜删掉且镜号不留空', () => {
    const { state, shots } = pulled()
    const upper = shots[2]
    const lower = shots[3]
    if (!upper || !lower) throw new Error('rows missing')
    const next = apply(
      state,
      planShotMerge(state.nodes, upper.id, lower.id),
    ).state
    expect(
      rows(next).map((row) => [row.shotNo, row.ref?.endSec, row.duration]),
    ).toEqual([
      [1, undefined, undefined],
      [2, undefined, undefined],
      [3, 7.5, referenceDurationToParam(7.5)],
      [4, 11.54, '4'],
    ])
  })

  it('时长锁过的行合并时不动时长', () => {
    const { state, shots } = pulled()
    const upper = shots[2]
    const lower = shots[3]
    if (!upper || !lower) throw new Error('rows missing')
    const locked = apply(state, [
      { op: ids.setShotSpec, target: upper.id, spec: { durationLocked: true } },
    ]).state
    const next = apply(
      locked,
      planShotMerge(locked.nodes, upper.id, lower.id),
    ).state
    expect(rows(next)[2]?.duration).toBe('3')
  })

  it('切开：这一镜截到切点，切点之后的新草稿行紧跟在它后面', () => {
    const { state, clipId, shots } = pulled()
    const target = shots[3] // 3.04–7.5，镜号 4
    if (!target) throw new Error('row missing')
    const next = apply(state, planShotSplit(state.nodes, target.id, 5.2)).state
    expect(rows(next).map((row) => [row.shotNo, row.ref, row.draft])).toEqual([
      [1, undefined, undefined],
      [2, undefined, undefined],
      [3, { nodeId: clipId, startSec: 0, endSec: 3.04 }, true],
      [4, { nodeId: clipId, startSec: 3.04, endSec: 5.2 }, true],
      [5, { nodeId: clipId, startSec: 5.2, endSec: 7.5 }, true],
      [6, { nodeId: clipId, startSec: 7.5, endSec: 11.54 }, true],
    ])
  })

  it('切在最后一镜：不用挪镜号', () => {
    const { state, shots } = pulled()
    const last = shots.at(-1)
    if (!last) throw new Error('row missing')
    const ops = planShotSplit(state.nodes, last.id, 9)
    expect(ops.some((op) => op.op === ids.reorderShot)).toBe(false)
    expect(rows(apply(state, ops).state).map((row) => row.shotNo)).toEqual([
      1, 2, 3, 4, 5, 6,
    ])
  })

  it('切点贴着两头不切', () => {
    const { state, shots } = pulled()
    const target = shots[3]
    if (!target) throw new Error('row missing')
    expect(planShotSplit(state.nodes, target.id, 3.1)).toEqual([])
    expect(planShotSplit(state.nodes, target.id, 7.45)).toEqual([])
  })
})
