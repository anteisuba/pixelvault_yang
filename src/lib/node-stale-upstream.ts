/**
 * 「已变」（卡名旁那颗小点，`NodeCardShell` 的 `changed`）：上游的产物版本或上游
 * 文本在**本卡上次生成之后**变过 → 本卡的结果已经不是按现在的上游出的。
 *
 * ── 派生状态，不落库（owner 2026-11-18）─────────────────────────────────
 * 两条判据，都只读现有数据：
 * ① **持久判据**（刷新后仍成立）：上游媒体卡当前那一版的 `createdAt` 晚于本卡最近
 *    一次**生成**出来的那一版 —— 上游重出 / 重传过，本卡还没跟着重出。
 * ② **会话判据**：本卡这次会话里生成成功时，记下当时每张上游卡交付的东西（媒体 =
 *    当前 url，文本 = 正文）；之后同一张上游卡交付的东西变了（改了正文、切了版本）
 *    → 已变。⚠ 这份快照只在内存里（`NodeWorkbenchV4` 持有），刷新即没 —— 文本没有
 *    改动时间可比，刷新后只剩判据 ①。
 * 本卡重新生成后：① 的基准时间跟着前移、② 的快照换成新的，两条都自然清掉。
 *
 * ⛔ 纯函数：不碰 DOM / store / 时钟。
 */

import { getNodeV4Ports } from '@/constants/node-slots'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { isTextNoteNode } from '@/lib/node-slot-binding'
import { readNodeUrl, readSlotSources } from '@/lib/node-slot-payload'
import { readOutputIndex, readOutputVersions } from '@/lib/node-output-versions'
import type { NodeV4, NodeWorkflowEdgeV4 } from '@/types/node-workflow'

/** 上游卡 id → 它这一刻交付的东西（媒体 url / 文本正文）。 */
export type UpstreamFingerprint = Readonly<Record<string, string>>

function upstreamSources(
  node: NodeV4,
  edges: readonly NodeWorkflowEdgeV4[],
  nodes: readonly NodeV4[],
): NodeV4[] {
  const ports = getNodeV4Ports(node.data.kind, node.data.subtype)
  if (!ports) return []
  const seen = new Map<string, NodeV4>()
  for (const spec of ports.inputs) {
    for (const source of readSlotSources(node, spec.slot, edges, nodes)) {
      // 备注不发送，改了也不影响本卡的结果。
      if (isTextNoteNode(source.node.data)) continue
      seen.set(source.node.id, source.node)
    }
  }
  return [...seen.values()]
}

function deliveredBy(node: NodeV4): string {
  return node.data.kind === NODE_MEDIA_KIND_IDS.text
    ? node.data.body.trim()
    : (readNodeUrl(node.data) ?? '')
}

/** 本卡发送那一刻每张上游卡交付了什么（会话判据 ② 的快照）。 */
export function readUpstreamFingerprint(
  nodeId: string,
  edges: readonly NodeWorkflowEdgeV4[],
  nodes: readonly NodeV4[],
): UpstreamFingerprint {
  const node = nodes.find((candidate) => candidate.id === nodeId)
  if (!node) return {}
  return Object.fromEntries(
    upstreamSources(node, edges, nodes).map((source) => [
      source.id,
      deliveredBy(source),
    ]),
  )
}

/** 本卡最近一次**生成**出来的那一版的时间（上传 / 素材库落进来的不算）。 */
function lastGeneratedAt(node: NodeV4): number | undefined {
  let latest: number | undefined
  for (const version of readOutputVersions(node.data)) {
    if (version.source || !version.generationId) continue
    const at = Date.parse(version.createdAt)
    if (Number.isFinite(at) && (latest === undefined || at > latest)) {
      latest = at
    }
  }
  return latest
}

function currentVersionAt(node: NodeV4): number | undefined {
  const version = readOutputVersions(node.data)[readOutputIndex(node.data)]
  if (!version) return undefined
  const at = Date.parse(version.createdAt)
  return Number.isFinite(at) ? at : undefined
}

/** 哪些卡的上游自它上次生成之后变过。 */
export function listStaleNodeIds(
  nodes: readonly NodeV4[],
  edges: readonly NodeWorkflowEdgeV4[],
  snapshots: ReadonlyMap<string, UpstreamFingerprint>,
): string[] {
  const stale: string[] = []
  for (const node of nodes) {
    if (node.data.kind === NODE_MEDIA_KIND_IDS.text) continue
    const sources = upstreamSources(node, edges, nodes)
    if (sources.length === 0) continue
    const snapshot = snapshots.get(node.id)
    const generatedAt = lastGeneratedAt(node)
    const changed = sources.some((source) => {
      // 有本会话的快照就只信快照（它记的是真正发出去的那一份）。
      if (snapshot && source.id in snapshot) {
        return snapshot[source.id] !== deliveredBy(source)
      }
      if (generatedAt === undefined) return false
      const upstreamAt = currentVersionAt(source)
      return upstreamAt !== undefined && upstreamAt > generatedAt
    })
    if (changed) stale.push(node.id)
  }
  return stale
}
