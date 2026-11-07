import { describe, expect, it } from 'vitest'

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'
import { applyCanvasBatchV4 } from '@/lib/node-canvas-batch-v4'
import { planShotPull } from '@/lib/shot-pull-plan'
import {
  planShotReadBatches,
  planShotReadFill,
  shotReadEdgePercent,
  toShotReadShots,
  type ShotReadTarget,
} from '@/lib/shot-read-plan'
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

const RANGES = [
  { startSec: 0, endSec: 3 },
  { startSec: 3, endSec: 7.5 },
  { startSec: 7.5, endSec: 11 },
]

/** 一张参考片拉成三镜草稿 → 读镜要的 targets（和宿主同一种对法：plan.refs → createdRefs）。 */
function pulled() {
  const clip = apply(EMPTY, [
    {
      op: ids.addNode,
      kind: NODE_MEDIA_KIND_IDS.video,
      subtype: NODE_V4_VIDEO_SUBTYPE_IDS.clip,
      ref: 'clip',
    },
  ])
  const clipId = clip.createdRefs.clip
  if (!clipId) throw new Error('clip not created')
  const plan = planShotPull({
    nodes: clip.state.nodes,
    clipNodeId: clipId,
    ranges: RANGES,
  })
  const batch = apply(clip.state, plan.ops)
  const targets: ShotReadTarget[] = plan.added.flatMap((range, index) => {
    const nodeId = batch.createdRefs[plan.refs[index] ?? '']
    return nodeId ? [{ nodeId, ...range }] : []
  })
  return { state: batch.state, targets }
}

function shot(state: NodeWorkflowStateV4, nodeId: string) {
  const node = listShotTableNodes(state.nodes).find((n) => n.id === nodeId)
  if (!node) throw new Error(`shot ${nodeId} missing`)
  return {
    shotNo: node.data.shotNo,
    size: node.data.shot?.size,
    move: node.data.shot?.move,
    look: node.data.shot?.look,
    draft: node.data.shot?.draft,
    prompt: node.data.prompt,
  }
}

describe('planShotReadBatches', () => {
  it('按落表顺序每 N 镜一批，流水号跨批连续', () => {
    const targets = Array.from({ length: 10 }, (_, i) => ({
      nodeId: `n${i}`,
      startSec: i,
      endSec: i + 1,
    }))
    const batches = planShotReadBatches(targets, 4)
    expect(batches.map((b) => b.map((e) => e.number))).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8],
      [9, 10],
    ])
    expect(toShotReadShots(batches[2] ?? [])).toEqual([
      { number: 9, startSec: 8, endSec: 9 },
      { number: 10, startSec: 9, endSec: 10 },
    ])
  })

  it('没有镜就没有批', () => {
    expect(planShotReadBatches([])).toEqual([])
  })
})

describe('shotReadEdgePercent', () => {
  const edge = (
    doneShots: number,
    totalShots: number,
    batchShots: number,
    batchElapsedSeconds: number,
    reducedMotion = false,
  ) =>
    shotReadEdgePercent({
      doneShots,
      totalShots,
      batchShots,
      batchElapsedSeconds,
      reducedMotion,
    })

  it('只有 1 批：开读时在 0，等着就往前爬，等多久都到不了头', () => {
    expect(edge(0, 5, 5, 0)).toBe(0)
    const at10 = edge(0, 5, 5, 10)
    const at60 = edge(0, 5, 5, 60)
    expect(at10).toBeGreaterThan(0)
    expect(at60).toBeGreaterThan(at10)
    expect(edge(0, 5, 5, 10_000)).toBeLessThan(100)
  })

  it('多批：只在在读这一批的那一份里爬，⛔ 不越过这批的终点', () => {
    // 20 镜、第二批（8–15 镜）在读：底 = 40，这一份 = 40。
    expect(edge(8, 20, 8, 0)).toBe(40)
    expect(edge(8, 20, 8, 10_000)).toBeLessThan(80)
    // 最后一批只剩 4 镜：份额按剩下的镜数算，照样到不了头。
    expect(edge(16, 20, 4, 10_000)).toBeLessThan(100)
    expect(edge(16, 20, 8, 30)).toBe(edge(16, 20, 4, 30))
  })

  it('这批回来：底抬到这批终点，比这批爬到的任何位置都靠前（线只往前走）', () => {
    const crawledLongest = edge(0, 20, 8, 10_000)
    expect(edge(8, 20, 8, 0)).toBeGreaterThan(crawledLongest)
  })

  it('减弱动态：不连续爬，开读就停在这一份的一半', () => {
    expect(edge(0, 4, 4, 0, true)).toBe(50)
    expect(edge(0, 4, 4, 30, true)).toBe(50)
  })

  it('没有镜 = 0', () => {
    expect(edge(0, 0, 0, 30)).toBe(0)
  })
})

describe('planShotReadFill', () => {
  it('落表的 refs 对得上新卡：三镜都能读', () => {
    const { targets } = pulled()
    expect(targets).toHaveLength(3)
    expect(new Set(targets.map((t) => t.nodeId)).size).toBe(3)
  })

  it('填空格：景别 / 运镜 / 风格进镜头规格，画面说明进提示词；仍是草稿', () => {
    const { state, targets } = pulled()
    const [batch = []] = planShotReadBatches(targets)
    const fill = planShotReadFill({
      nodes: state.nodes,
      batch,
      rows: [
        {
          number: 1,
          size: 'wide',
          move: '缓慢推近',
          description: '雨夜街口，撑伞的人走过',
          look: '冷色调',
        },
        { number: 2, size: 'close' },
      ],
    })
    expect(fill.filled).toBe(2)
    const next = apply(state, fill.ops).state
    const [first, second, third] = targets
    if (!first || !second || !third) throw new Error('targets missing')
    expect(shot(next, first.nodeId)).toMatchObject({
      size: 'wide',
      move: '缓慢推近',
      look: '冷色调',
      draft: true,
      prompt: '雨夜街口，撑伞的人走过',
    })
    expect(shot(next, second.nodeId)).toMatchObject({
      size: 'close',
      draft: true,
    })
    expect(shot(next, third.nodeId).size).toBeUndefined()
  })

  it('读镜途中用户填过的格子不覆盖', () => {
    const { state, targets } = pulled()
    const [first] = targets
    if (!first) throw new Error('targets missing')
    // 在草稿行上写了提示词（ShotTable 改格子会去掉草稿标；这里只写提示词，草稿标仍在）
    const touched = apply(state, [
      {
        op: ids.setPrompt,
        target: first.nodeId,
        prompt: '我自己写的',
        mode: 'replace',
      },
      { op: ids.setShotSpec, target: first.nodeId, spec: { move: '固定' } },
    ]).state
    const [batch = []] = planShotReadBatches(targets)
    const fill = planShotReadFill({
      nodes: touched.nodes,
      batch,
      rows: [
        { number: 1, size: 'medium', move: '横摇', description: '读出来的' },
      ],
    })
    const next = apply(touched, fill.ops).state
    expect(shot(next, first.nodeId)).toMatchObject({
      size: 'medium',
      move: '固定',
      prompt: '我自己写的',
    })
  })

  it('整行改过（不再是草稿）就整行跳过', () => {
    const { state, targets } = pulled()
    const [first] = targets
    if (!first) throw new Error('targets missing')
    const touched = apply(state, [
      { op: ids.setShotSpec, target: first.nodeId, spec: { draft: null } },
    ]).state
    const [batch = []] = planShotReadBatches(targets)
    const fill = planShotReadFill({
      nodes: touched.nodes,
      batch,
      rows: [{ number: 1, size: 'wide', description: '不该进来' }],
    })
    expect(fill).toEqual({ ops: [], filled: 0 })
  })

  it('按卡 id 对回，不按镜号：中间删了一镜，后面的照样填对', () => {
    const { state, targets } = pulled()
    const [first, second, third] = targets
    if (!first || !second || !third) throw new Error('targets missing')
    const removed = apply(state, [
      { op: ids.delete, target: first.nodeId },
    ]).state
    const [batch = []] = planShotReadBatches(targets)
    const fill = planShotReadFill({
      nodes: removed.nodes,
      batch,
      rows: [
        { number: 1, size: 'wide' },
        { number: 3, size: 'extreme_close_up' },
      ],
    })
    expect(fill.filled).toBe(1)
    const next = apply(removed, fill.ops).state
    expect(shot(next, third.nodeId).size).toBe('extreme_close_up')
    expect(shot(next, second.nodeId).size).toBeUndefined()
  })

  it('什么都没读出来 / 编号对不上：不出 op', () => {
    const { state, targets } = pulled()
    const [batch = []] = planShotReadBatches(targets)
    expect(
      planShotReadFill({
        nodes: state.nodes,
        batch,
        rows: [{ number: 1 }, { number: 42, size: 'wide' }],
      }),
    ).toEqual({ ops: [], filled: 0 })
  })
})
