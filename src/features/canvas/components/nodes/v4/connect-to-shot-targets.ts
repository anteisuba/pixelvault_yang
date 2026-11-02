/**
 * 「连到镜头」弹层的**列表来源**（spec §1.13，画板 `ConnectToShot.dc.html`）。
 *
 * 三类卡（音频 / 图片 / 文本）共用同一份读法，所以它住在 `nodes/v4/` 根上而不是
 * 某一类卡的目录里 —— ⛔ 不在三处各抄一遍「怎么找画布上的镜头」。
 *
 * 纯读：进来是图（节点 + 边），出去是弹层那一行需要的事实。⛔ 不发 op、不认识 i18n
 * （时长读数由调用方格式化后传回来，`durationLabel` 因此是可空的）。
 */

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { NODE_V4_VIDEO_SUBTYPE_IDS } from '@/constants/node-types'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import type { NodeSlotId } from '@/constants/node-slots'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import { formatShotDisplayName } from '@/lib/node-display-name'
import type { NodeV4, NodeWorkflowEdgeV4 } from '@/types/node-workflow'

import type { ConnectToShotTarget } from './chrome'

export interface BuildConnectToShotTargetsOptions {
  readonly nodes: readonly NodeV4[]
  readonly edges: readonly NodeWorkflowEdgeV4[]
  /** 秒 → 读数（`7s`）。不知道时长的镜头传回 `null`。 */
  formatDuration(seconds: number): string
}

/** 这张镜头能读出多少秒——落库的时长优先，其次是模型参数里那一档。 */
function shotSeconds(node: NodeV4): number {
  const data = node.data
  if (data.kind !== NODE_MEDIA_KIND_IDS.video) return 0
  if (typeof data.durationSec === 'number' && data.durationSec > 0) {
    return data.durationSec
  }
  const fromParams = Number(data.params?.duration)
  return Number.isFinite(fromParams) && fromParams > 0 ? fromParams : 0
}

/**
 * 缩略两级：落库的封面 → 首帧槽那张图。
 *
 * ⚠ ⛔ 不拿成片 url 当缩略：`<img src={视频}>` 什么都画不出来（与视频卡 poster
 * 同一条判据）。
 */
function shotThumbnail(
  node: NodeV4,
  edges: readonly NodeWorkflowEdgeV4[],
  byId: ReadonlyMap<string, NodeV4>,
): string | undefined {
  const data = node.data
  if (data.kind !== NODE_MEDIA_KIND_IDS.video) return undefined
  if (data.videoThumbnailUrl) return data.videoThumbnailUrl
  for (const edge of edges) {
    if (edge.target !== node.id) continue
    const source = byId.get(edge.source)
    if (source?.data.kind !== NODE_MEDIA_KIND_IDS.image) continue
    if (source.data.url) return source.data.url
  }
  return undefined
}

/**
 * 画布上的镜头，**按镜头带顺序**：有 `shotNo` 的先按它排，没有的按位置（上→下、
 * 左→右）排在后面 —— 这与镜头带自己的排序同一条判据。
 */
export function buildConnectToShotTargets({
  nodes,
  edges,
  formatDuration,
}: BuildConnectToShotTargetsOptions): readonly ConnectToShotTarget[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const shots = nodes.filter(
    (node) =>
      node.data.kind === NODE_MEDIA_KIND_IDS.video &&
      node.data.subtype === NODE_V4_VIDEO_SUBTYPE_IDS.shot,
  )
  const ordered = [...shots].sort((a, b) => {
    const aNo = 'shotNo' in a.data ? a.data.shotNo : undefined
    const bNo = 'shotNo' in b.data ? b.data.shotNo : undefined
    if (aNo !== undefined && bNo !== undefined && aNo !== bNo) return aNo - bNo
    if (aNo !== undefined && bNo === undefined) return -1
    if (aNo === undefined && bNo !== undefined) return 1
    if (a.position.y !== b.position.y) return a.position.y - b.position.y
    return a.position.x - b.position.x
  })

  return ordered.map((node) => {
    const seconds = shotSeconds(node)
    const label =
      node.data.kind === NODE_MEDIA_KIND_IDS.video
        ? formatShotDisplayName(
            node.data.label ?? node.data.name,
            node.data.shotNo,
          )
        : node.data.name
    const occupiedSlots: NodeSlotId[] = []
    for (const edge of edges) {
      if (edge.target !== node.id) continue
      if (occupiedSlots.includes(edge.slot)) continue
      occupiedSlots.push(edge.slot)
    }
    const thumbnailUrl = shotThumbnail(node, edges, byId)
    return {
      id: node.id,
      name: label,
      ...(seconds > 0 ? { durationLabel: formatDuration(seconds) } : {}),
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
      occupiedSlots,
    }
  })
}

/**
 * 点一行 = 一批：**目标槽已有内容就先断旧边**，再连过去（spec §1.13「显示替换而
 * 不是静默覆盖」——UI 上说了要替换，落图这一步就得真的把旧的换掉）。
 *
 * ⚠ 一批而不是两次 `onApplyOp`：断 + 连是用户的**一步意图**，撤销也该是一步。
 */
export function buildConnectToShotOps({
  sourceId,
  targetId,
  slot,
  edges,
}: {
  readonly sourceId: string
  readonly targetId: string
  readonly slot: NodeSlotId
  readonly edges: readonly NodeWorkflowEdgeV4[]
}): readonly NodeAssistantOpV4[] {
  return [
    ...edges
      .filter((edge) => edge.target === targetId && edge.slot === slot)
      .map(
        (edge): NodeAssistantOpV4 => ({
          op: NODE_ASSISTANT_OP_V4_IDS.disconnect,
          edgeId: edge.id,
        }),
      ),
    {
      op: NODE_ASSISTANT_OP_V4_IDS.connect,
      source: sourceId,
      target: targetId,
      slot,
    },
  ]
}
