/**
 * 画布 → 镜头表的行（`p-canvas-shotlist` 第 2 步，`docs/design/canvas-shotlist.md`）。
 *
 * ⭐ 表的每一行**就是**一张 `video.shot` 镜头卡，这里只是把卡上已有的东西摆成一行：
 * 「说明」= 卡的提示词正文，「时长」= `params.duration`，「画面」= 片子或首帧，
 * 「角色 · 场景」= 正文里 `@` 到的角色 + 连进来的背景卡。⛔ 不另存任何一格 ——
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
  NODE_V4_IMAGE_SUBTYPE_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'
import type { ShotSize } from '@/constants/shot-spec'
import { mentionedCharacters } from '@/lib/node-character-mentions'
import { resolveShotLook } from '@/lib/shot-spec-prompt'
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

export interface ShotTableCastEntry {
  readonly kind: 'character' | 'scene'
  readonly id: string
  readonly name: string
}

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
  readonly cast: readonly ShotTableCastEntry[]
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
  for (const node of input.nodes) {
    if (!isShotCard(node)) continue
    const shotNo = node.data.shotNo
    if (shotNo === undefined) continue
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

    const cast: ShotTableCastEntry[] = mentionedCharacters(
      prompt,
      input.characterCards ?? [],
      data.characterPicks,
    ).map(({ card }) => ({ kind: 'character', id: card.id, name: card.name }))
    for (const edge of edges) {
      const source = byId.get(edge.source)
      if (
        source?.data.kind === NODE_MEDIA_KIND_IDS.image &&
        source.data.subtype === NODE_V4_IMAGE_SUBTYPE_IDS.background &&
        !cast.some((entry) => entry.id === source.id)
      ) {
        cast.push({ kind: 'scene', id: source.id, name: source.data.name })
      }
    }

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
      cast,
      generating: data.status === NODE_STATUS_IDS.running,
    })
  }
  return rows.sort((a, b) => a.shotNo - b.shotNo)
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
