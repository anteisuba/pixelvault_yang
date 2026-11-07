import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'
import type { ShotDetectRange } from '@/lib/shot-detect/scenes'
import { listShotNos } from '@/lib/node-shot-layout'
import { listShotTableNodes } from '@/lib/shot-table-rows'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type { NodeV4, NodeV4ShotRef } from '@/types/node-workflow'

/**
 * 拉片（H4a）落表、合并、切开 —— 三个动作各算出**一批** op，调用方一次
 * `dispatchBatch` 落下去 = 一步撤销（画布禁改 1：op 表是唯一的语义写入口）。
 *
 * 纯函数：只读节点，不碰图引擎。落点坐标由调用方用 `graph.placeBeside` 算好传进来。
 *
 * 镜号的规矩：表按 `shotNo` 排、显示的也是 `shotNo`，所以三个动作都不留空号 ——
 * 要去掉的镜先 `reorder_shot` 挪到最后（`reorderShots` 会顺手把镜号压成连续），
 * 再 `delete`；要插在中间的镜先建在末尾，再 `reorder_shot` 挪进来。
 */

const PULL_REF_PREFIX = 'pull-'
const SPLIT_REF = 'split'

type ShotNode = ReturnType<typeof listShotTableNodes>[number]

/**
 * 能拉的片：画布上一张有片子的片段卡（`video.clip`）。镜头卡（`video.shot`）是我们自己要出的片，
 * ⛔ 不当参考片拉。
 */
export function isPullSourceNode(node: NodeV4 | undefined): boolean {
  return Boolean(
    node &&
    node.data.kind === NODE_MEDIA_KIND_IDS.video &&
    node.data.subtype === NODE_V4_VIDEO_SUBTYPE_IDS.clip &&
    node.data.url,
  )
}

/** 参考片（`clipRole: 'reference'`）有没有已经落进表里的行：有 = 实线，没有 = 虚线（mock ①）。 */
export function isReferenceClip(node: NodeV4 | undefined): boolean {
  return Boolean(
    node &&
    node.data.kind === NODE_MEDIA_KIND_IDS.video &&
    node.data.subtype === NODE_V4_VIDEO_SUBTYPE_IDS.clip &&
    node.data.clipRole === 'reference',
  )
}

/** 参考时长换成卡上的时长：整秒、至少 1 秒。发送时再按所选模型的档位取整（`snapVideoDuration`）。 */
export function referenceDurationToParam(seconds: number): string {
  return String(Math.max(1, Math.round(seconds)))
}

function durationOps(target: string, ref: NodeV4ShotRef): NodeAssistantOpV4 {
  return {
    op: NODE_ASSISTANT_OP_V4_IDS.setParams,
    target,
    params: { duration: referenceDurationToParam(ref.endSec - ref.startSec) },
  }
}

/** 一段时间有多少被另一段盖住（0–1，按前一段的长度算）。 */
function overlapRatio(a: ShotDetectRange, b: ShotDetectRange): number {
  const span = a.endSec - a.startSec
  if (span <= 0) return 0
  const overlap =
    Math.min(a.endSec, b.endSec) - Math.max(a.startSec, b.startSec)
  return Math.max(0, overlap) / span
}

/**
 * 把第 `shotNo` 镜挪到最后再删掉它的镜头卡。⚠ 调用方要按镜号**从大到小**依次调：
 * 挪大的不影响小的号。
 */
function removeShotOps(
  node: ShotNode,
  lastShotNo: number,
): NodeAssistantOpV4[] {
  const shotNo = node.data.shotNo ?? 0
  return [
    ...(shotNo !== lastShotNo
      ? [
          {
            op: NODE_ASSISTANT_OP_V4_IDS.reorderShot,
            from: shotNo,
            to: lastShotNo,
          } as const,
        ]
      : []),
    { op: NODE_ASSISTANT_OP_V4_IDS.delete, target: node.id },
  ]
}

export interface ShotPullPlanInput {
  readonly nodes: readonly NodeV4[]
  /** 参考片（`video.clip`）的节点 id。 */
  readonly clipNodeId: string
  readonly ranges: readonly ShotDetectRange[]
  /** 新镜头卡的落点，与「真正要建的那几镜」一一对应；不够就让引擎自己找位置。 */
  readonly positionFor?: (index: number) => { x: number; y: number } | undefined
}

export interface ShotPullPlan {
  readonly ops: NodeAssistantOpV4[]
  /** 真正新建的段（被改过的行盖住的段已跳过）。 */
  readonly added: readonly ShotDetectRange[]
  /**
   * 与 `added` 一一对应的批内别名：`dispatchBatch` 回来的 `createdRefs[refs[i]]` 就是第 i 段的
   * 镜头卡 id（读镜 H4b 按卡 id 回填）。
   */
  readonly refs: readonly string[]
  /** 被替换掉的旧草稿行数。 */
  readonly replaced: number
}

/**
 * 落到表里 · 追加到表尾（owner 2026-11-07：H4a 只做追加）。
 *
 * - 同一张参考片的**旧草稿行**（没人改过的）先拿掉 —— 重拉 = 换一版结果；
 * - 改过的行留着不动；新结果里被它盖住一半以上的段不再重复建；
 * - 片段卡顺手标成「参考」（同一批，撤销一起退）。
 */
export function planShotPull(input: ShotPullPlanInput): ShotPullPlan {
  const shots = listShotTableNodes(input.nodes)
  const fromClip = shots.filter(
    (node) => node.data.shot?.ref?.nodeId === input.clipNodeId,
  )
  const staleDrafts = fromClip.filter((node) => node.data.shot?.draft === true)
  const kept = fromClip
    .filter((node) => node.data.shot?.draft !== true)
    .map((node) => node.data.shot?.ref)
    .filter((ref): ref is NodeV4ShotRef => Boolean(ref))

  const ops: NodeAssistantOpV4[] = []
  const clip = input.nodes.find((node) => node.id === input.clipNodeId)
  if (
    clip &&
    clip.data.kind === NODE_MEDIA_KIND_IDS.video &&
    clip.data.subtype === NODE_V4_VIDEO_SUBTYPE_IDS.clip &&
    clip.data.clipRole !== 'reference'
  ) {
    ops.push({
      op: NODE_ASSISTANT_OP_V4_IDS.setField,
      target: clip.id,
      field: 'clipRole',
      value: 'reference',
    })
  }

  let lastShotNo = listShotNos(input.nodes).at(-1) ?? 0
  const removing = [...staleDrafts].sort(
    (a, b) => (b.data.shotNo ?? 0) - (a.data.shotNo ?? 0),
  )
  for (const node of removing) {
    ops.push(...removeShotOps(node, lastShotNo))
    // 删掉的那一镜若是它所在镜号上唯一的卡，镜号就少一个
    const bandMates = input.nodes.filter(
      (other) => other.id !== node.id && other.data.shotNo === node.data.shotNo,
    )
    if (bandMates.length === 0) lastShotNo -= 1
  }

  const added = input.ranges.filter(
    (range) => !kept.some((ref) => overlapRatio(range, ref) >= 0.5),
  )
  const refs = added.map((_, index) => `${PULL_REF_PREFIX}${index + 1}`)
  added.forEach((range, index) => {
    const alias = refs[index] ?? `${PULL_REF_PREFIX}${index + 1}`
    const ref: NodeV4ShotRef = {
      nodeId: input.clipNodeId,
      startSec: range.startSec,
      endSec: range.endSec,
    }
    const position = input.positionFor?.(index)
    ops.push(
      {
        op: NODE_ASSISTANT_OP_V4_IDS.addNode,
        kind: NODE_MEDIA_KIND_IDS.video,
        subtype: NODE_V4_VIDEO_SUBTYPE_IDS.shot,
        ref: alias,
        shotNo: lastShotNo + index + 1,
        ...(position ? { position } : {}),
      },
      {
        op: NODE_ASSISTANT_OP_V4_IDS.setShotSpec,
        target: alias,
        spec: { ref, draft: true },
      },
      durationOps(alias, ref),
    )
  })

  return { ops, added, refs, replaced: staleDrafts.length }
}

/** 这一行能不能和上一行合并：两行都拉自同一张参考片，且时间段首尾相接。 */
export function canMergeWithPrevious(
  previous: NodeV4 | undefined,
  current: NodeV4,
): boolean {
  if (
    previous?.data.kind !== NODE_MEDIA_KIND_IDS.video ||
    current.data.kind !== NODE_MEDIA_KIND_IDS.video ||
    previous.data.subtype !== NODE_V4_VIDEO_SUBTYPE_IDS.shot ||
    current.data.subtype !== NODE_V4_VIDEO_SUBTYPE_IDS.shot
  ) {
    return false
  }
  const upper = previous.data.shot?.ref
  const lower = current.data.shot?.ref
  return Boolean(
    upper &&
    lower &&
    upper.nodeId === lower.nodeId &&
    Math.abs(upper.endSec - lower.startSec) < 0.05,
  )
}

/**
 * 和上一镜合并（⑧）：上一镜的参考段延到下一镜的终点，下一镜的卡删掉。时长没被
 * 人锁过才跟着参考段重算。
 */
export function planShotMerge(
  nodes: readonly NodeV4[],
  upperId: string,
  lowerId: string,
): NodeAssistantOpV4[] {
  const shots = listShotTableNodes(nodes)
  const upper = shots.find((node) => node.id === upperId)
  const lower = shots.find((node) => node.id === lowerId)
  if (!upper || !lower || !canMergeWithPrevious(upper, lower)) return []
  const upperRef = upper.data.shot?.ref
  const lowerRef = lower.data.shot?.ref
  if (!upperRef || !lowerRef) return []

  const ref: NodeV4ShotRef = { ...upperRef, endSec: lowerRef.endSec }
  const lastShotNo = listShotNos(nodes).at(-1) ?? 0
  return [
    {
      op: NODE_ASSISTANT_OP_V4_IDS.setShotSpec,
      target: upper.id,
      spec: { ref },
    },
    ...(upper.data.shot?.durationLocked ? [] : [durationOps(upper.id, ref)]),
    ...removeShotOps(lower, lastShotNo),
  ]
}

/**
 * 在参考片的某一刻切开（⑧）：这一镜的参考段截到切点，切点之后另起一镜（草稿），
 * 紧跟在它后面。切点离两头太近（< 0.2 秒）不切。
 */
export function planShotSplit(
  nodes: readonly NodeV4[],
  shotId: string,
  atSec: number,
  position?: { x: number; y: number },
): NodeAssistantOpV4[] {
  const shot = listShotTableNodes(nodes).find((node) => node.id === shotId)
  const ref = shot?.data.shot?.ref
  if (!shot || !ref) return []
  const at = Math.round(atSec * 1000) / 1000
  if (at - ref.startSec < SHOT_SPLIT_MIN_SEC) return []
  if (ref.endSec - at < SHOT_SPLIT_MIN_SEC) return []

  const head: NodeV4ShotRef = { ...ref, endSec: at }
  const tail: NodeV4ShotRef = { ...ref, startSec: at }
  const shotNos = listShotNos(nodes)
  const lastShotNo = shotNos.at(-1) ?? 0
  const shotNo = shot.data.shotNo ?? 0
  const following = shotNos.find((value) => value > shotNo)
  return [
    {
      op: NODE_ASSISTANT_OP_V4_IDS.setShotSpec,
      target: shot.id,
      spec: { ref: head },
    },
    ...(shot.data.shot?.durationLocked ? [] : [durationOps(shot.id, head)]),
    {
      op: NODE_ASSISTANT_OP_V4_IDS.addNode,
      kind: NODE_MEDIA_KIND_IDS.video,
      subtype: NODE_V4_VIDEO_SUBTYPE_IDS.shot,
      ref: SPLIT_REF,
      shotNo: lastShotNo + 1,
      ...(position ? { position } : {}),
    },
    {
      op: NODE_ASSISTANT_OP_V4_IDS.setShotSpec,
      target: SPLIT_REF,
      spec: { ref: tail, draft: true },
    },
    durationOps(SPLIT_REF, tail),
    ...(following === undefined
      ? []
      : [
          {
            op: NODE_ASSISTANT_OP_V4_IDS.reorderShot,
            from: lastShotNo + 1,
            to: following,
          } as const,
        ]),
  ]
}

/** 切点离这一镜两头至少多远（秒）。 */
export const SHOT_SPLIT_MIN_SEC = 0.2
