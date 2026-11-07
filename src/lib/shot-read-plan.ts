import { SHOT_READ, SHOT_READ_EDGE_CREEP } from '@/constants/shot-reading'
import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { listShotTableNodes } from '@/lib/shot-table-rows'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type { NodeV4, NodeV4ShotSpec } from '@/types/node-workflow'
import type { ShotReadRow, ShotReadShot } from '@/types/shot-reading'

/**
 * 拉片 · 读镜（H4b）的两件纯事：**怎么分批**、**读回来的一批怎么落**。
 *
 * ⭐ 读回来的按**卡 id** 对回，不按镜号：一批要读十几到三十秒，这期间用户可能挪了镜、删了镜、
 *   撤销了落表 —— 镜号早不是送去时那个号了。送去的 `number` 只是这一次读镜里的流水号
 *   （落表顺序 = 参考片时间顺序），回来按它查表找卡。
 *
 * 落法（owner 2026-11-07，mock ⑥）：
 *  - **只填空着的格子**：读镜途中改过的格子不覆盖；
 *  - **整行改过（已不是草稿）就整行跳过**：那一行归用户了；
 *  - 读出来的**仍是草稿**（不去草稿标）—— 改一格才算数；
 *  - 一批 = 一批 op = 一步撤销。
 */

/** 一镜：读哪张镜头卡、它在参考片里的那一段。 */
export interface ShotReadTarget {
  readonly nodeId: string
  readonly startSec: number
  readonly endSec: number
}

/** 一批里的一镜：送去的流水号 + 对回哪张卡。 */
export interface ShotReadBatchEntry extends ShotReadTarget {
  readonly number: number
}

/** 按落表顺序每 `SHOT_READ.batchShots` 镜一批；流水号从 1 数、跨批连续。 */
export function planShotReadBatches(
  targets: readonly ShotReadTarget[],
  size: number = SHOT_READ.batchShots,
): ShotReadBatchEntry[][] {
  const batches: ShotReadBatchEntry[][] = []
  targets.forEach((target, index) => {
    const entry = { ...target, number: index + 1 }
    const last = batches.at(-1)
    if (last && last.length < size) last.push(entry)
    else batches.push([entry])
  })
  return batches
}

/**
 * 读镜时表的卡边走到哪（0–100）：读完的镜数是底；在读这一批的那一份里，按这批已经
 * 等了几秒渐近地往前爬（`SHOT_READ_EDGE_CREEP`）—— ⛔ 不越过这批的终点。
 * 这批回来时底抬到这批终点，比爬到的任何位置都靠前：线只往前走。
 */
export function shotReadEdgePercent(input: {
  readonly doneShots: number
  readonly totalShots: number
  /** 在读这一批有几镜。 */
  readonly batchShots: number
  /** 这一批已经等了几秒。 */
  readonly batchElapsedSeconds: number
  readonly reducedMotion?: boolean
}): number {
  const { doneShots, totalShots, batchShots, batchElapsedSeconds } = input
  if (totalShots <= 0) return 0
  const { capShare, tauSeconds, reducedMotionShare } = SHOT_READ_EDGE_CREEP
  const base = Math.min(1, Math.max(0, doneShots / totalShots))
  const share =
    Math.max(0, Math.min(batchShots, totalShots - doneShots)) / totalShots
  const crept = input.reducedMotion
    ? reducedMotionShare
    : capShare * (1 - Math.exp(-Math.max(0, batchElapsedSeconds) / tauSeconds))
  return (base + share * crept) * 100
}

export function toShotReadShots(
  batch: readonly ShotReadBatchEntry[],
): ShotReadShot[] {
  return batch.map((entry) => ({
    number: entry.number,
    startSec: entry.startSec,
    endSec: entry.endSec,
  }))
}

export interface ShotReadFill {
  readonly ops: NodeAssistantOpV4[]
  /** 这一批真的填进去了几镜（至少填了一格）。 */
  readonly filled: number
}

/** 读回来的一批 → 一批 op。卡没了 / 不再是草稿 / 那格已有内容，一律不动。 */
export function planShotReadFill(input: {
  readonly nodes: readonly NodeV4[]
  readonly batch: readonly ShotReadBatchEntry[]
  readonly rows: readonly ShotReadRow[]
}): ShotReadFill {
  const byNumber = new Map(input.batch.map((entry) => [entry.number, entry]))
  const shots = new Map(
    listShotTableNodes(input.nodes).map((node) => [node.id, node] as const),
  )
  const ops: NodeAssistantOpV4[] = []
  let filled = 0
  for (const row of input.rows) {
    const entry = byNumber.get(row.number)
    const node = entry ? shots.get(entry.nodeId) : undefined
    if (!node || node.data.shot?.draft !== true) continue
    const spec = node.data.shot
    const patch: Partial<NodeV4ShotSpec> = {}
    if (row.size && !spec.size) patch.size = row.size
    if (row.move && !spec.move) patch.move = row.move
    if (row.look && !spec.look) patch.look = row.look
    const before = ops.length
    if (Object.keys(patch).length > 0) {
      ops.push({
        op: NODE_ASSISTANT_OP_V4_IDS.setShotSpec,
        target: node.id,
        spec: patch,
      })
    }
    if (row.description && !node.data.prompt?.trim()) {
      ops.push({
        op: NODE_ASSISTANT_OP_V4_IDS.setPrompt,
        target: node.id,
        prompt: row.description,
        mode: 'replace',
      })
    }
    if (ops.length > before) filled += 1
  }
  return { ops, filled }
}
