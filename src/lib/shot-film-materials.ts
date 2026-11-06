/**
 * 镜头表的「全片素材」与画布侧（H2b，owner 2026-11-07，`docs/design/canvas-shotlist.md` 第 23 / 26 条）。
 * **纯函数**：不碰 DOM、不发请求、不读时钟。
 *
 * ── 全片素材 = 两部分的并集 ─────────────────────────────────────────────
 * ① 任何一镜在用的素材（读时现算，`listFilmMaterials`）；
 * ② `shotlist.materials` 里拖进来、还没人用的画布卡（`idle`）。
 * ⛔ ① 不写进 `shotlist.materials`：在用的素材本来就算，存一份迟早和边对不上。
 * 卡被删后它的 id 可能还留在 ② 里 —— 读时按现存的卡过滤，下次写回时顺手去掉。这样撤销
 * 删卡时它原样回到全片素材，不必在删卡的 op 里再改一次 `shotlist`。
 *
 * ── 画布侧要的数 ────────────────────────────────────────────────────────
 * `filmMaterialShots`：每张素材卡被哪几镜用（「N 镜」角标 = 长度；表左缘的线落在第一镜那一行，
 * 点素材时散到每一镜）。只数画布卡（`origin: 'edge'`）：角色库的人不是画布卡，不画线。
 */

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'
import { characterCoverUrl } from '@/lib/card-bus'
import {
  boundCharacterId,
  kindRoleOf,
  thumbOf,
  type ShotFilmMaterial,
  type ShotTableMaterial,
} from '@/lib/shot-table-materials'
import { compactShotlist } from '@/lib/shot-table-rows'
import type { CharacterCardRecord } from '@/types'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type {
  NodeV4,
  NodeWorkflowShotlist,
  NodeWorkflowStateV4,
} from '@/types/node-workflow'

/** 能当素材的画布卡：图 / 音频 / 不是镜头卡的视频。文本卡、镜头卡不算。 */
export function isFilmMaterialNode(node: NodeV4): boolean {
  if (node.data.kind === NODE_MEDIA_KIND_IDS.image) return true
  if (node.data.kind === NODE_MEDIA_KIND_IDS.audio) return true
  if (node.data.kind === NODE_MEDIA_KIND_IDS.video) {
    return node.data.subtype !== NODE_V4_VIDEO_SUBTYPE_IDS.shot
  }
  return false
}

/** 一张画布卡作为全片素材的样子（「+」格子 / 「从画布拿」格子共用）。 */
export function filmMaterialOfNode(node: NodeV4): ShotFilmMaterial {
  const thumbUrl = thumbOf(node)
  return {
    origin: 'edge',
    sourceId: node.id,
    kindRole: kindRoleOf(node),
    name: node.data.name,
    ...(thumbUrl ? { thumbUrl } : {}),
    mediaKind: node.data.kind,
  }
}

/**
 * 每张素材卡被哪几镜用：卡 id → 镜头卡 id（按表的行序，同一镜只记一次）。
 * 角色库的人不在里面（不是画布卡）。
 */
export function filmMaterialShots(
  rows: readonly {
    readonly nodeId: string
    readonly materials: readonly ShotTableMaterial[]
  }[],
): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const row of rows) {
    for (const material of row.materials) {
      if (material.origin !== 'edge') continue
      const shots = out.get(material.sourceId) ?? []
      if (shots[shots.length - 1] !== row.nodeId) shots.push(row.nodeId)
      out.set(material.sourceId, shots)
    }
  }
  return out
}

/** `shotlist.materials` 里还活着的那几张（卡还在、还能当素材），去重保序。 */
function liveListed(
  nodes: readonly NodeV4[],
  shotlist: NodeWorkflowShotlist | undefined,
): NodeV4[] {
  const byId = new Map(nodes.map((node) => [node.id, node] as const))
  const seen = new Set<string>()
  const out: NodeV4[] = []
  for (const id of shotlist?.materials ?? []) {
    if (seen.has(id)) continue
    seen.add(id)
    const node = byId.get(id)
    if (node && isFilmMaterialNode(node)) out.push(node)
  }
  return out
}

/** 拖进全片素材、但还没有哪一镜在用的（「+」里悬停出 ✕；画布上一根淡线到表顶）。 */
export function listIdleFilmMaterials(input: {
  readonly nodes: readonly NodeV4[]
  readonly shotlist: NodeWorkflowShotlist | undefined
  readonly used: ReadonlyMap<string, readonly string[]>
}): ShotFilmMaterial[] {
  return liveListed(input.nodes, input.shotlist)
    .filter((node) => !input.used.has(node.id))
    .map((node) => ({ ...filmMaterialOfNode(node), idle: true }))
}

/**
 * 「从画布 / 角色库拿」的两段（第 26 条 ③）：
 * - 画布上的 = 能当素材、但还不在全片素材里的画布卡；
 * - 角色库 = 还不在全片素材里的人（画布上已有一张绑着他的卡在全片素材里，也算在了）。
 */
export function listMaterialPicks(input: {
  readonly nodes: readonly NodeV4[]
  readonly film: readonly ShotFilmMaterial[]
  readonly characterCards: readonly CharacterCardRecord[]
}): {
  readonly canvas: ShotFilmMaterial[]
  readonly library: ShotFilmMaterial[]
} {
  const inFilm = new Set(
    input.film.map((material) => `${material.origin}:${material.sourceId}`),
  )
  const byId = new Map(input.nodes.map((node) => [node.id, node] as const))
  const boundInFilm = new Set<string>()
  for (const material of input.film) {
    if (material.origin !== 'edge') continue
    const node = byId.get(material.sourceId)
    const bound = node ? boundCharacterId(node) : undefined
    if (bound) boundInFilm.add(bound)
  }
  const canvas = input.nodes
    .filter((node) => isFilmMaterialNode(node))
    .filter((node) => !inFilm.has(`edge:${node.id}`))
    .map(filmMaterialOfNode)
  const library = input.characterCards
    .filter((card) => !inFilm.has(`library:${card.id}`))
    .filter((card) => !boundInFilm.has(card.id))
    .map(filmMaterialOfCard)
  return { canvas, library }
}

/** 一位角色库的人作为全片素材的样子（「从角色库拿」格子）。 */
export function filmMaterialOfCard(
  card: CharacterCardRecord,
): ShotFilmMaterial {
  const thumbUrl = characterCoverUrl(card) ?? undefined
  return {
    origin: 'library',
    sourceId: card.id,
    kindRole: 'character',
    name: card.name,
    ...(thumbUrl ? { thumbUrl } : {}),
    mediaKind: NODE_MEDIA_KIND_IDS.image,
  }
}

function setMaterials(
  state: NodeWorkflowStateV4,
  materials: readonly string[],
): NodeAssistantOpV4 {
  const shotlist = compactShotlist({
    ...state.shotlist,
    materials: [...materials],
  })
  return {
    op: NODE_ASSISTANT_OP_V4_IDS.setShotlist,
    ...(shotlist ? { shotlist } : {}),
  }
}

/**
 * 把一张画布卡拖到表上 = 进全片素材（一步撤销）。已经在列表里、或不能当素材 = 不发。
 * 写回时顺手去掉已经不在的卡。
 */
export function planFilmMaterialAdd(
  state: NodeWorkflowStateV4,
  nodeId: string,
): NodeAssistantOpV4[] {
  const node = state.nodes.find((item) => item.id === nodeId)
  if (!node || !isFilmMaterialNode(node)) return []
  const live = liveListed(state.nodes, state.shotlist).map((item) => item.id)
  if (live.includes(nodeId)) return []
  return [setMaterials(state, [...live, nodeId])]
}

/** 从全片素材里拿掉一张闲着的（「+」弹层的 ✕，一步撤销）。不在列表里 = 不发。 */
export function planFilmMaterialRemove(
  state: NodeWorkflowStateV4,
  nodeId: string,
): NodeAssistantOpV4[] {
  if (!(state.shotlist?.materials ?? []).includes(nodeId)) return []
  const live = liveListed(state.nodes, state.shotlist)
    .map((item) => item.id)
    .filter((id) => id !== nodeId)
  return [setMaterials(state, live)]
}
