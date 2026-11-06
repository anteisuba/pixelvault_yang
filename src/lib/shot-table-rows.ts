/**
 * 画布 → 镜头表的行（`p-canvas-shotlist` 第 2 步，`docs/design/canvas-shotlist.md`）。
 *
 * ⭐ 表的每一行**就是**一张 `video.shot` 镜头卡，这里只是把卡上已有的东西摆成一行：
 * 「说明」= 卡的提示词正文，「时长」= `params.duration`，「画面」= 片子或首帧，
 * 「素材」= 这一镜真实挂着的首帧 / 参考 / 语音 + `@` 到的角色库人物（`shot-table-materials.ts`，
 * H2a）。⛔ 不另存任何一格 ——
 * 改表就是改卡，表和画布永远对得上。
 *
 * 只收有镜号的镜头卡（镜头带里那一排）；没镜号的散卡不进表。
 *
 * ⛔ 纯函数：不读时钟、不碰 DOM。
 */

import { NODE_SLOT_IDS } from '@/constants/node-slots'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_STATUS_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'
import type { ShotSize } from '@/constants/shot-spec'
import { resolveShotLook } from '@/lib/shot-spec-prompt'
import {
  readShotMaterials,
  type ShotTableMaterial,
} from '@/lib/shot-table-materials'
import type { CharacterCardRecord } from '@/types'
import type {
  NodeV4,
  NodeV4VideoShotData,
  NodeWorkflowEdgeV4,
  NodeWorkflowShotlist,
} from '@/types/node-workflow'

/** 「画面」那一格放什么：有片放片，没片放首帧，都没有是空格。 */
export type ShotTableFrame =
  | { readonly kind: 'video'; readonly url: string; readonly poster?: string }
  | { readonly kind: 'image'; readonly url: string }
  | { readonly kind: 'empty' }

export interface ShotTableRow {
  readonly nodeId: string
  readonly shotNo: number
  readonly label: string
  readonly prompt: string
  readonly frame: ShotTableFrame
  readonly size?: ShotSize
  readonly move?: string
  /** 这一镜自己写的风格；空 = 跟全片。 */
  readonly look?: string
  /** 实际生效的风格（单镜的或全片的），显示「跟全片」时用。 */
  readonly effectiveLook?: string
  readonly durationSec?: number
  readonly durationLocked: boolean
  /** 素材列（H2a）：首 / 角 / 场 / 参 / 声。 */
  readonly materials: readonly ShotTableMaterial[]
  readonly generating: boolean
}

export interface ShotTableSummary {
  readonly shots: number
  readonly withVideo: number
  /** 各镜时长之和（没写时长的镜不算）。 */
  readonly durationSec: number
}

function isShotCard(
  node: NodeV4,
): node is NodeV4 & { data: NodeV4VideoShotData } {
  return (
    node.data.kind === NODE_MEDIA_KIND_IDS.video &&
    node.data.subtype === NODE_V4_VIDEO_SUBTYPE_IDS.shot
  )
}

function parseSeconds(value: string | undefined): number | undefined {
  if (!value) return undefined
  const seconds = Number.parseFloat(value)
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined
}

/**
 * 表里有哪几镜，按镜号排。⚠ 行与画布上「行右缘 → 镜头卡」那几根线共用这一份口径，
 * ⛔ 别处不再自己筛一遍（两处筛法一漂，就有行没线或线连到不在表里的卡）。
 */
export function listShotTableNodes(
  nodes: readonly NodeV4[],
): (NodeV4 & { data: NodeV4VideoShotData })[] {
  return nodes
    .filter(isShotCard)
    .filter((node) => node.data.shotNo !== undefined)
    .sort((a, b) => (a.data.shotNo ?? 0) - (b.data.shotNo ?? 0))
}

/**
 * 去掉空键；整份都空了就是「没设过」（`set_shotlist` 省略 = 清空，撤销能退回不存在）。
 * ⚠ `board`（表在画布上的位置）也是一键 —— 漏了它，改一下全片风格表就从画布上消失。
 */
export function compactShotlist(
  shotlist: NodeWorkflowShotlist,
): NodeWorkflowShotlist | undefined {
  const next: NodeWorkflowShotlist = {}
  if (shotlist.look) next.look = shotlist.look
  if (shotlist.totalDurationSec)
    next.totalDurationSec = shotlist.totalDurationSec
  if (shotlist.hiddenColumns && shotlist.hiddenColumns.length > 0) {
    next.hiddenColumns = shotlist.hiddenColumns
  }
  if (shotlist.board) next.board = shotlist.board
  return Object.keys(next).length > 0 ? next : undefined
}

export function buildShotTableRows(input: {
  readonly nodes: readonly NodeV4[]
  readonly edges: readonly NodeWorkflowEdgeV4[]
  readonly shotlist?: NodeWorkflowShotlist
  readonly characterCards?: readonly CharacterCardRecord[]
}): ShotTableRow[] {
  const byId = new Map(input.nodes.map((node) => [node.id, node] as const))
  const incoming = new Map<string, NodeWorkflowEdgeV4[]>()
  for (const edge of input.edges) {
    const list = incoming.get(edge.target)
    if (list) list.push(edge)
    else incoming.set(edge.target, [edge])
  }

  const rows: ShotTableRow[] = []
  for (const node of listShotTableNodes(input.nodes)) {
    const shotNo = node.data.shotNo ?? 0
    const data = node.data
    const edges = incoming.get(node.id) ?? []
    const prompt = data.prompt ?? ''

    let frame: ShotTableFrame = { kind: 'empty' }
    if (data.url) {
      frame = {
        kind: 'video',
        url: data.url,
        ...(data.videoThumbnailUrl ? { poster: data.videoThumbnailUrl } : {}),
      }
    } else {
      const first = edges.find((edge) => edge.slot === NODE_SLOT_IDS.firstFrame)
      const source = first ? byId.get(first.source) : undefined
      if (source?.data.kind === NODE_MEDIA_KIND_IDS.image && source.data.url) {
        frame = { kind: 'image', url: source.data.url }
      }
    }

    const materials = readShotMaterials({
      prompt,
      incoming: edges,
      byId,
      characterCards: input.characterCards ?? [],
      ...(data.characterPicks ? { characterPicks: data.characterPicks } : {}),
    })

    const spec = data.shot
    const effectiveLook = resolveShotLook(spec, input.shotlist)
    const durationSec = parseSeconds(data.params?.duration)
    rows.push({
      nodeId: node.id,
      shotNo,
      label: data.label,
      prompt,
      frame,
      ...(spec?.size ? { size: spec.size } : {}),
      ...(spec?.move ? { move: spec.move } : {}),
      ...(spec?.look ? { look: spec.look } : {}),
      ...(effectiveLook ? { effectiveLook } : {}),
      ...(durationSec === undefined ? {} : { durationSec }),
      durationLocked: spec?.durationLocked === true,
      materials,
      generating: data.status === NODE_STATUS_IDS.running,
    })
  }
  return rows
}

export function summarizeShotTable(
  rows: readonly ShotTableRow[],
): ShotTableSummary {
  return {
    shots: rows.length,
    withVideo: rows.filter((row) => row.frame.kind === 'video').length,
    durationSec: rows.reduce((total, row) => total + (row.durationSec ?? 0), 0),
  }
}
