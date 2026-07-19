import {
  NODE_STUDIO_IMAGE_ROLE_VIDEO_LEGEND_CATEGORY,
  NODE_STUDIO_KEYFRAME_REFERENCE_ROLES,
  NODE_STUDIO_REFERENCE_ROLE_CUSTOM_ID,
  NODE_STUDIO_REFERENCE_ROLE_LEGEND_LABELS,
  NODE_STUDIO_SHOT_REFERENCE_LEGEND,
} from '@/constants/node-studio'
import {
  NODE_IMAGE_ROLE_IDS,
  NODE_MEDIA_KIND_BY_NODE_TYPE,
  NODE_MEDIA_KIND_IDS,
  NODE_TYPE_IDS,
} from '@/constants/node-types'
import type {
  NodeWorkflowEdge,
  NodeWorkflowNode,
  NodeWorkflowNodeData,
  NodeWorkflowReferenceAsset,
} from '@/types/node-workflow'
import type { SeedancePromptPlanReferences } from '@/types/seedance-prompt-plan'

import { buildNodeWorkflowPrompt } from './node-workflow-prompt'

/** Unified image roles that feed Seedance as a plain visual reference (vs the
 *  keyframe role, which pins temporal structure and is harvested first). */
const VISUAL_REFERENCE_IMAGE_ROLES: ReadonlySet<string> = new Set([
  NODE_IMAGE_ROLE_IDS.character,
  NODE_IMAGE_ROLE_IDS.shot,
  NODE_IMAGE_ROLE_IDS.background,
])

export function isVisualReferenceNode(node: NodeWorkflowNode): boolean {
  if (node.type === NODE_TYPE_IDS.image) {
    return VISUAL_REFERENCE_IMAGE_ROLES.has(
      node.data.role ?? NODE_IMAGE_ROLE_IDS.shot,
    )
  }
  // Legacy per-type image nodes (pre role-migration).
  return (
    node.type === NODE_TYPE_IDS.characterImage ||
    node.type === NODE_TYPE_IDS.shot ||
    node.type === NODE_TYPE_IDS.backgroundImage
  )
}

export function isKeyframeNode(node: NodeWorkflowNode): boolean {
  if (node.type === NODE_TYPE_IDS.image) {
    if (
      (node.data.role ?? NODE_IMAGE_ROLE_IDS.shot) === NODE_IMAGE_ROLE_IDS.frame
    ) {
      return true
    }
    // S5d frame 关键帧兼容迁移: the `frame` ROLE is retired from every
    // creation path (§6.0/§6.1 — new keyframes are loose images classified
    // 关键帧首/尾 instead), but old saved nodes with role='frame' still hit
    // the branch above unchanged. A NEW keyframe is signalled by
    // `data.imageCategory` instead — same seedance-harvest treatment
    // (harvested first, ahead of plain visual references), no new field name
    // invented beyond the S5d ③ category itself.
    return (
      typeof node.data.imageCategory === 'string' &&
      (NODE_STUDIO_KEYFRAME_REFERENCE_ROLES as readonly string[]).includes(
        node.data.imageCategory,
      )
    )
  }
  return node.type === NODE_TYPE_IDS.frameImage
}

/**
 * A closeup image (face detail) — a unified `image` node with role=closeup
 * (cast-redesign §9 B). closeup has no legacy per-type equivalent, so it only
 * ever exists as `image` + role. It is NOT a direct visual reference (it wires
 * into a character, not a video), so it rides image_urls via the 1-hop
 * `harvestUpstreamCloseupUrls`, not the direct `harvestUpstreamImageUrls`.
 */
export function isCloseupNode(node: NodeWorkflowNode): boolean {
  return (
    node.type === NODE_TYPE_IDS.image &&
    node.data.role === NODE_IMAGE_ROLE_IDS.closeup
  )
}

export function isShotTextNode(node: NodeWorkflowNode): boolean {
  return node.type === NODE_TYPE_IDS.shotText
}

export function isVoiceProfileNode(node: NodeWorkflowNode): boolean {
  return node.type === NODE_TYPE_IDS.voice
}

/**
 * The named reference family a node contributes to a downstream Seedance node's
 * reference panel (角色 / 背景 / 镜头 / 声音). Resolves the unified `image` node
 * via `data.role` AND the legacy per-type character/background/shot image nodes,
 * plus voice nodes. Returns null for nodes that feed generation but aren't
 * surfaced as a named family chip (frame images, text, video…) and for role-less
 * (unconfigured) image nodes.
 *
 * Centralizing this here keeps the composer's reference chips in lock-step with
 * the role migration — matching on raw `node.type` alone silently dropped every
 * unified image node (type === 'image') from the chips after consolidation.
 */
export type SeedanceReferenceKind =
  | 'character'
  | 'background'
  | 'shot'
  | 'voice'

export function getSeedanceReferenceKind(
  node: NodeWorkflowNode,
): SeedanceReferenceKind | null {
  if (isVoiceProfileNode(node)) return 'voice'
  const role =
    node.type === NODE_TYPE_IDS.image
      ? node.data.role
      : node.type === NODE_TYPE_IDS.characterImage
        ? NODE_IMAGE_ROLE_IDS.character
        : node.type === NODE_TYPE_IDS.backgroundImage
          ? NODE_IMAGE_ROLE_IDS.background
          : node.type === NODE_TYPE_IDS.shot
            ? NODE_IMAGE_ROLE_IDS.shot
            : undefined
  if (role === NODE_IMAGE_ROLE_IDS.character) return 'character'
  if (role === NODE_IMAGE_ROLE_IDS.background) return 'background'
  if (role === NODE_IMAGE_ROLE_IDS.shot) return 'shot'
  return null
}

/**
 * A node that produces video output (currently Seedance variants). Used as a
 * reference video source for downstream Seedance reference-to-video nodes.
 */
export function isVideoSourceNode(node: NodeWorkflowNode): boolean {
  return NODE_MEDIA_KIND_BY_NODE_TYPE[node.type] === NODE_MEDIA_KIND_IDS.video
}

export function getNodeMediaUrl(
  data: NodeWorkflowNodeData,
): string | undefined {
  const imageUrl = typeof data.imageUrl === 'string' ? data.imageUrl : undefined
  const mediaUrl = typeof data.mediaUrl === 'string' ? data.mediaUrl : undefined

  return imageUrl ?? mediaUrl
}

/**
 * V-2 主图（docs/plans/node-video-v2v3-master-panel.md）: the ONE image a
 * card (character/background identity node) contributes to a downstream
 * harvest (video reference / shot image-to-image). A card can collect
 * several `referenceAssets` for organizing/swapping (S5c 视觉身份区), but
 * only the user-starred one (`isPrimary`) actually rides `image_urls`.
 *
 * Resolution order:
 *   1. The `referenceAssets` entry marked `isPrimary` (explicit ★ pick).
 *   2. `getNodeMediaUrl` — the node's own `imageUrl`/`mediaUrl` ("首图" for
 *      every card saved before V-2, so an un-starred old card sends exactly
 *      what it always sent — no behavior change).
 *   3. The FIRST `referenceAssets` entry — closes a pre-existing gap for
 *      cards built purely through S5c 融合 (loose image → card), which have
 *      no `mediaUrl` at all and, before this function existed, contributed
 *      NOTHING to a video harvest even though they visibly hold images in
 *      the dossier gallery. This only ever ADDS a reference that was
 *      previously silently dropped; it never removes one a card already
 *      sent.
 *
 * Non-identity nodes (shot/keyframe/closeup) never get an `isPrimary` entry
 * today — no UI writes one there — so this always degrades to step 2 for
 * them, byte-identical to calling `getNodeMediaUrl` directly.
 */
export function getNodePrimaryMediaUrl(
  data: NodeWorkflowNodeData,
): string | undefined {
  const assets = data.referenceAssets ?? []
  const starred = assets.find((asset) => asset.isPrimary)
  if (starred) return starred.url
  return getNodeMediaUrl(data) ?? assets[0]?.url
}

/**
 * R3-6 出场组（canvas-relationship-v3-2026-07 §3.0a）: the ORDERED set of
 * images a collector card (character/background identity node) contributes
 * to a downstream harvest once its gallery entries are curated with
 * `onStage`. The V-2 主图 (`getNodePrimaryMediaUrl`) is ALWAYS first —
 * starring stays the "which one is canonical" signal, `onStage` layers "which
 * others also ride along". Default (no `referenceAssets` entry carries
 * `onStage`) degrades to exactly `[primary]`, byte-identical to calling
 * `getNodePrimaryMediaUrl` alone — every project saved before R3-6 has no
 * `onStage` field anywhere, so every existing card's harvest is unchanged.
 *
 * R3-6b §3 每镜覆写: `overrideUrls`, when passed, REPLACES the card's own
 * onStage curation for this one call (an edge-level override — see
 * `getEdgeStageOverrideUrls`). The ★ primary is still forced into position 0
 * even when `overrideUrls` omits it — 覆写不能让主图消失, only add/drop
 * EXTRAS. `overrideUrls: []` is a valid, meaningful input (the user unchecked
 * every extra for this video) and resolves to `[primary]`, same as the
 * no-override default — the difference only matters once other edges of the
 * same source node carry a DIFFERENT override (每镜 = per-edge, not global).
 * `undefined` (the param omitted entirely) keeps the pre-R3-6b behavior: fall
 * through to the card's own onStage set.
 */
export function getNodeStageMediaUrls(
  data: NodeWorkflowNodeData,
  overrideUrls?: readonly string[],
): string[] {
  const result: string[] = []
  pushUnique(result, getNodePrimaryMediaUrl(data))
  if (overrideUrls) {
    for (const url of overrideUrls) {
      pushUnique(result, url)
    }
    return result
  }
  for (const asset of data.referenceAssets ?? []) {
    if (asset.onStage) pushUnique(result, asset.url)
  }
  return result
}

/**
 * R3-6b §3 每镜覆写: read a `收集器→视频` edge's stage override, when it has
 * one. Defensive on the raw `edge.data` shape (React Flow edge data is
 * `Record<string, unknown>`, only loosely validated by
 * `NodeWorkflowEdgeSchema`'s `.catch(undefined)` seatbelt on load) — a
 * non-array or a mixed-type array degrades to `undefined` (= "no override,
 * inherit the card's onStage set") rather than throwing or silently coercing
 * garbage into the harvest. Returns `undefined` for a missing edge too, so
 * callers can pass the result of an `Array#find` straight through.
 */
export function getEdgeStageOverrideUrls(
  edge: NodeWorkflowEdge | undefined,
): string[] | undefined {
  const raw = edge?.data?.stageOverrideUrls
  if (!Array.isArray(raw)) return undefined
  return raw.filter((value): value is string => typeof value === 'string')
}

function findEdgeBetween(
  edges: readonly NodeWorkflowEdge[],
  sourceId: string,
  targetId: string,
): NodeWorkflowEdge | undefined {
  return edges.find(
    (edge) => edge.source === sourceId && edge.target === targetId,
  )
}

export function getUpstreamNodes(
  nodeId: string,
  edges: readonly NodeWorkflowEdge[],
  nodes: readonly NodeWorkflowNode[],
): NodeWorkflowNode[] {
  const sourceIds = new Set<string>()
  for (const edge of edges) {
    if (edge.target === nodeId) {
      sourceIds.add(edge.source)
    }
  }

  return nodes.filter((node) => sourceIds.has(node.id))
}

function pushUnique(target: string[], value: string | undefined): void {
  if (!value) return
  if (target.includes(value)) return
  target.push(value)
}

/**
 * Harvest reference-image URLs from upstream visual + keyframe nodes.
 *
 * Order: keyframe nodes first (they pin temporal structure), then visual
 * reference nodes (character / background / shot). Duplicates are dropped and
 * empty `mediaUrl` / `imageUrl` are skipped. Callers should `.slice(0, max)`
 * against the chosen video model's reference-image cap.
 *
 * R3-6b §3 每镜覆写: `edges` + `focalNodeId` are OPTIONAL and, when both are
 * supplied, let a collector's (character/background) contribution honor a
 * per-edge `stageOverrideUrls` on the specific `collector → focalNodeId` edge
 * (§ `getEdgeStageOverrideUrls`) instead of the card's own onStage curation —
 * "每镜" = the override is scoped to THIS one downstream node, other edges
 * from the same collector keep resolving their own override (or the card
 * default). Omitting either param (the shot-image harvest path, which does
 * NOT get per-edge overrides per §3.0a's "shot 路径不做覆写") falls back to
 * the pre-R3-6b behavior byte-for-byte.
 */
export function harvestUpstreamImageUrls(
  upstreamNodes: readonly NodeWorkflowNode[],
  edges?: readonly NodeWorkflowEdge[],
  focalNodeId?: string,
): string[] {
  const result: string[] = []

  for (const node of upstreamNodes) {
    if (!isKeyframeNode(node)) continue
    pushUnique(result, getNodeMediaUrl(node.data))
  }
  // V-2 主图 + R3-6 出场组: a COLLECTOR card (character/background — the
  // "身份档案夹" with a curatable gallery) expands to its full onStage set
  // (primary first, see getNodeStageMediaUrls); a shot card is a visual
  // reference too but not a collector (no gallery-of-the-same-subject
  // semantics), so it still sends only its ★-starred/primary image.
  for (const node of upstreamNodes) {
    if (!isVisualReferenceNode(node)) continue
    const kind = getSeedanceReferenceKind(node)
    if (kind === 'character' || kind === 'background') {
      const override =
        edges && focalNodeId
          ? getEdgeStageOverrideUrls(
              findEdgeBetween(edges, node.id, focalNodeId),
            )
          : undefined
      for (const url of getNodeStageMediaUrls(node.data, override)) {
        pushUnique(result, url)
      }
    } else {
      pushUnique(result, getNodePrimaryMediaUrl(node.data))
    }
  }

  return result
}

/**
 * 1-hop harvest of closeup face-detail images (cast-redesign §9 B). A closeup
 * wires into a character (`closeup → character`), not the focal video node, so
 * it never appears in `harvestUpstreamImageUrls(directUpstream)`. This walks one
 * hop past each upstream character to collect its closeup images, in character
 * order then closeup order, so they ride image_urls right behind their subject.
 *
 * Callers append the result AFTER `harvestUpstreamImageUrls` (keyframes → main
 * refs → closeups) and dedup, so a closeup shared with a direct reference is
 * counted once and the main references keep priority under the model's cap.
 */
export function harvestUpstreamCloseupUrls(
  focalNodeId: string,
  edges: readonly NodeWorkflowEdge[],
  nodes: readonly NodeWorkflowNode[],
): string[] {
  const directUpstream = getUpstreamNodes(focalNodeId, edges, nodes)
  const result: string[] = []

  for (const node of directUpstream) {
    if (getSeedanceReferenceKind(node) !== 'character') continue
    for (const upstream of getUpstreamNodes(node.id, edges, nodes)) {
      if (!isCloseupNode(upstream)) continue
      pushUnique(result, getNodePrimaryMediaUrl(upstream.data))
    }
  }

  return result
}

/**
 * A shot-image node (镜头) — legacy `shot` type OR a unified `image` node whose
 * role is shot (role-less defaults to shot, mirroring isVisualReferenceNode).
 * Shot nodes are the only image-gen nodes that read the graph: they harvest
 * upstream character/background images as named references.
 */
export function isShotNode(node: NodeWorkflowNode): boolean {
  if (node.type === NODE_TYPE_IDS.image) {
    return (
      (node.data.role ?? NODE_IMAGE_ROLE_IDS.shot) === NODE_IMAGE_ROLE_IDS.shot
    )
  }
  return node.type === NODE_TYPE_IDS.shot
}

/**
 * A character/background image reference feeding a shot node, carrying the
 * subject name so the shot generator can label it in the prompt legend
 * ("图1：角色「yangyang」"). shot/frame images are leaf outputs, never refs.
 */
export interface UpstreamImageReference {
  url: string
  /** Absent for a category-labeled entry (§ below) — those print via
   *  `category` instead of the character/background kind label. */
  kind?: 'character' | 'background'
  name?: string
  /**
   * S5d ③ 分类进图例: a model-facing Chinese category label (from
   * `NODE_STUDIO_REFERENCE_ROLE_LEGEND_LABELS` or a user's custom label) for
   * a reference image that carries its OWN classification — a shot node's
   * own `referenceAssets` entries, not an upstream character/background
   * NODE (those keep the existing `kind`-based "角色「名字」" wording).
   * Mutually exclusive with `kind` in practice; `buildShotReferenceLegend`
   * checks `category` first.
   */
  category?: string
}

function readBackgroundName(node: NodeWorkflowNode): string | undefined {
  const name =
    typeof node.data.backgroundName === 'string'
      ? node.data.backgroundName.trim()
      : ''
  return name || undefined
}

/**
 * S5d ③ / R3-6 出场组: resolve a reference asset's model-facing category label
 * — `NODE_STUDIO_REFERENCE_ROLE_LEGEND_LABELS[role]`, or the user-typed
 * `customLabel` for a `custom`-role asset. Undefined when neither resolves
 * (a `custom` role with no typed label yet — never guesses one). Shared by
 * `buildReferenceAssetLegendEntries` (a node's own referenceAssets) and the
 * out-of-stage-group harvest expansion below (a collector's EXTRA onStage
 * images, labeled the same way).
 */
function resolveReferenceAssetCategory(
  asset: NodeWorkflowReferenceAsset,
): string | undefined {
  return asset.role === NODE_STUDIO_REFERENCE_ROLE_CUSTOM_ID
    ? asset.customLabel
    : NODE_STUDIO_REFERENCE_ROLE_LEGEND_LABELS[asset.role]
}

/**
 * Harvest named character/background image references from a shot node's
 * upstream nodes. Each entry pairs the reference URL with its subject name so
 * the caller can both pass the URL to the image model AND label it in the
 * prompt legend. Empty media and duplicate URLs are dropped; edge/graph order
 * is preserved so the legend numbering is stable.
 *
 * R3-6 出场组: a collector (character/background) expands to its full
 * onStage set (`getNodeStageMediaUrls`), primary first — unchanged single
 * `{url, kind, name}` entry for the primary; each EXTRA onStage image gets
 * its own entry, labeled either "名字（分类）" (via the asset's own `role` +
 * name, S5d ③ category mechanism) when both resolve, or the SAME kind+name
 * format as the primary when they don't (§3.0a "无分类则同名同 kind 格式").
 * A card with no onStage entries degrades to exactly one entry per node,
 * byte-identical to the pre-R3-6 behavior.
 */
export function harvestUpstreamImageReferences(
  upstreamNodes: readonly NodeWorkflowNode[],
): UpstreamImageReference[] {
  const result: UpstreamImageReference[] = []
  const seen = new Set<string>()

  for (const node of upstreamNodes) {
    const kind = getSeedanceReferenceKind(node)
    if (kind !== 'character' && kind !== 'background') continue
    const name =
      kind === 'character' ? readCharacterName(node) : readBackgroundName(node)
    const stageUrls = getNodeStageMediaUrls(node.data)
    stageUrls.forEach((url, index) => {
      if (!url || seen.has(url)) return
      seen.add(url)
      if (index === 0) {
        result.push({ url, kind, name })
        return
      }
      const asset = (node.data.referenceAssets ?? []).find(
        (candidate) => candidate.url === url,
      )
      const category = asset ? resolveReferenceAssetCategory(asset) : undefined
      if (category && asset?.name) {
        result.push({ url, name: asset.name, category })
      } else {
        result.push({ url, kind, name })
      }
    })
  }

  return result
}

/**
 * Build the prompt legend that maps each named reference image (by its final
 * 1-based position in `referenceImages`) to its subject, so the image model
 * binds the name used in the prompt to the right reference picture. References
 * without a known name (e.g. manual uploads) are skipped. Returns '' when no
 * named reference made the cut.
 */
export function buildShotReferenceLegend(
  referenceImages: readonly string[],
  referenceByUrl: ReadonlyMap<string, UpstreamImageReference>,
): string {
  const lines: string[] = []
  referenceImages.forEach((url, index) => {
    const ref = referenceByUrl.get(url)
    if (!ref?.name) return
    // S5d ③: a category-labeled reference (the shot's own referenceAssets,
    // e.g. 风格/道具/关键帧首) prints "图N = 名字（分类）" — visually distinct
    // from the character/background kind format below so the model reads it
    // as a different flavor of binding, not a mislabeled subject.
    if (ref.category) {
      lines.push(`图${index + 1} = ${ref.name}（${ref.category}）`)
      return
    }
    if (!ref.kind) return
    const kindLabel = NODE_STUDIO_SHOT_REFERENCE_LEGEND.kindLabel[ref.kind]
    lines.push(`图${index + 1}：${kindLabel}「${ref.name}」`)
  })
  if (lines.length === 0) return ''
  return `${NODE_STUDIO_SHOT_REFERENCE_LEGEND.title}\n${lines.join('\n')}`
}

/**
 * S5d ③: build category-labeled legend entries from a node's OWN
 * `referenceAssets` (e.g. a shot node's manually-added 风格/道具/关键帧 refs),
 * so `buildShotReferenceLegend` can label them alongside the existing
 * upstream character/background entries. Pure — the URLs themselves are
 * already pushed into `referenceImages` by the existing dedup loop at the
 * call site; this only supplies the legend text. Skips an entry with no
 * `name` (nothing to print — mirrors the legend's own "no known name" skip)
 * and a `custom`-role entry with no typed `customLabel` yet (never guesses a
 * label).
 */
export function buildReferenceAssetLegendEntries(
  referenceAssets: readonly NodeWorkflowReferenceAsset[] | undefined,
): Map<string, UpstreamImageReference> {
  const map = new Map<string, UpstreamImageReference>()
  for (const asset of referenceAssets ?? []) {
    if (!asset.name) continue
    const category = resolveReferenceAssetCategory(asset)
    if (!category) continue
    map.set(asset.url, { url: asset.url, name: asset.name, category })
  }
  return map
}

export type VideoLegendImageKind =
  | 'character'
  | 'background'
  | 'shot'
  | 'closeup'

export interface VideoLegendImageReference {
  /**
   * SF-2b: optional — a `category`-only entry (a directly-referenced
   * shot/frame role node, see `NODE_STUDIO_IMAGE_ROLE_VIDEO_LEGEND_CATEGORY`)
   * never needs the bracket "kind「name」" wording, only a fallback source for
   * the auto-name prefix. `shot` keeps `kind` set (unchanged) so its existing
   * unnamed-fallback (`autoNamePrefix.shot`) still resolves; `frame` carries
   * no `kind` at all — it's never a `VideoLegendImageKind` member, and its
   * `name` is always populated at harvest time instead (see
   * `harvestUpstreamVideoImageReferences`'s keyframe pass), so the
   * kind-driven fallback path is never actually reached for it.
   */
  kind?: VideoLegendImageKind
  /** User-given name, or undefined when unnamed (the legend then falls back to
   *  the same auto-name the composer's token uses). */
  name?: string
  /**
   * R3-6 出场组: set on a collector's EXTRA onStage image (never the primary)
   * when its own `role` resolves a category label (S5d ③ mechanism,
   * `resolveReferenceAssetCategory`). `buildVideoReferenceLegend` checks this
   * first and prints "名字（分类）" instead of the kind-based line, mirroring
   * `UpstreamImageReference.category` / `buildShotReferenceLegend`.
   *
   * SF-2b: ALSO set unconditionally on a directly-referenced shot/frame
   * role node (`NODE_STUDIO_IMAGE_ROLE_VIDEO_LEGEND_CATEGORY`) — not just a
   * collector's extras — so "@token 引用后 Seedance 知道名字+分类" holds for
   * every shot/frame reference, not only onStage extras.
   */
  category?: string
}

/**
 * SF-2b: resolve the model-facing category label for a directly-referenced
 * KEYFRAME node (`isKeyframeNode` — role=frame / legacy frameImage OR a
 * role-less loose image classified `imageCategory: 'frameStart'|'frameEnd'`).
 * A role-less S5d ③ classification wins when present (more specific —
 * 关键帧首/关键帧尾 vs the generic 首帧); a plain role=frame/frameImage node
 * (no `imageCategory`) falls back to `NODE_STUDIO_IMAGE_ROLE_VIDEO_LEGEND_CATEGORY.frame`.
 */
function resolveKeyframeLegendCategory(node: NodeWorkflowNode): string {
  const nodeCategory = node.data.imageCategory
  if (nodeCategory) {
    const resolved =
      nodeCategory === NODE_STUDIO_REFERENCE_ROLE_CUSTOM_ID
        ? node.data.imageCategoryLabel
        : NODE_STUDIO_REFERENCE_ROLE_LEGEND_LABELS[nodeCategory]
    if (resolved) return resolved
  }
  return NODE_STUDIO_IMAGE_ROLE_VIDEO_LEGEND_CATEGORY.frame
}

/**
 * Map every named image reference a VIDEO node sends to its subject, keyed by
 * URL. Covers direct visual refs (character / background / shot) AND 1-hop
 * closeups (closeup → character), so the legend can bind `@特写N` too. The
 * caller looks each sent URL up by its FINAL position in `referenceImages`,
 * so this map's own iteration order doesn't matter (mirrors
 * buildShotReferenceLegend).
 *
 * SF-2b: keyframes are NO LONGER omitted — see the dedicated keyframe pass
 * at the top of the function body below, which gives every sent keyframe/
 * 首帧 a category-only entry (`resolveKeyframeLegendCategory`).
 *
 * R3-6 出场组: a collector (character/background) expands to its full
 * onStage set (`getNodeStageMediaUrls`), primary first — unchanged single
 * map entry for the primary; each EXTRA onStage image gets its own entry via
 * the same category-or-kind fallback `harvestUpstreamImageReferences` uses.
 * `shot` stays single-image (not a collector). A card with no onStage entries
 * degrades to exactly one map entry per node, byte-identical to pre-R3-6.
 *
 * R3-6b §3 每镜覆写: a collector's expansion honors the `collector →
 * focalNodeId` edge's `stageOverrideUrls` when present (§
 * `getEdgeStageOverrideUrls`), so this legend never disagrees with what
 * `harvestUpstreamImageUrls(..., edges, focalNodeId)` actually sends for the
 * SAME video node.
 */
export function harvestUpstreamVideoImageReferences(
  focalNodeId: string,
  edges: readonly NodeWorkflowEdge[],
  nodes: readonly NodeWorkflowNode[],
): Map<string, VideoLegendImageReference> {
  const directUpstream = getUpstreamNodes(focalNodeId, edges, nodes)
  const map = new Map<string, VideoLegendImageReference>()

  const readName = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined

  // SF-2b (canvas-shot-frame-fold-2026-07 §-1): keyframe/首帧 nodes used to be
  // entirely OMITTED from this map (see the old docstring — "no name/token").
  // They still carry no `@token` mention (projection-only, cast-redesign
  // §3/§4 — a separate system, use-video-composer.ts's `referenceTokens`),
  // but they now get a category-only legend line so a sent keyframe still
  // tells the model "this image is a 首帧/关键帧首/关键帧尾". Named via the
  // SAME generic `mediaLabel` rename field LooseImageCard/the selection
  // toolbar already read+write for a shot/frame card; an unnamed one falls
  // back to `${category}${ordinal}` — a cosmetic-only fallback (no composer
  // auto-name to byte-match, since keyframes have no insertable token).
  let keyframeOrdinal = 0
  for (const node of directUpstream) {
    if (!isKeyframeNode(node)) continue
    const url = getNodeMediaUrl(node.data)
    if (!url || map.has(url)) continue
    keyframeOrdinal += 1
    const category = resolveKeyframeLegendCategory(node)
    map.set(url, {
      name: readName(node.data.mediaLabel) ?? `${category}${keyframeOrdinal}`,
      category,
    })
  }

  for (const node of directUpstream) {
    const kind = getSeedanceReferenceKind(node)
    if (kind !== 'character' && kind !== 'background' && kind !== 'shot') {
      continue
    }
    const name =
      kind === 'character'
        ? readName(node.data.characterName)
        : kind === 'background'
          ? readName(node.data.backgroundName)
          : readName(node.data.shotName)

    if (kind === 'character' || kind === 'background') {
      // R3-6b §3 每镜覆写: this legend is always built FOR a specific
      // `focalNodeId`, so the override lookup is unconditional here (unlike
      // harvestUpstreamImageUrls, which is also called from the shot-image
      // path where overrides don't apply).
      const override = getEdgeStageOverrideUrls(
        findEdgeBetween(edges, node.id, focalNodeId),
      )
      const stageUrls = getNodeStageMediaUrls(node.data, override)
      stageUrls.forEach((url, index) => {
        if (!url || map.has(url)) return
        if (index === 0) {
          map.set(url, { kind, name })
          return
        }
        const asset = (node.data.referenceAssets ?? []).find(
          (candidate) => candidate.url === url,
        )
        const category = asset
          ? resolveReferenceAssetCategory(asset)
          : undefined
        map.set(
          url,
          category && asset?.name
            ? { kind, name: asset.name, category }
            : { kind, name },
        )
      })
    } else {
      // V-2 主图: key by the SAME primary-aware URL harvestUpstreamImageUrls
      // puts in referenceImages — otherwise this map misses every card whose
      // ★ pick differs from its raw mediaUrl, and the V-1 name→@ImageN
      // translation (buildReferenceImageIndexByName) silently fails to bind it.
      const url = getNodePrimaryMediaUrl(node.data)
      if (url && !map.has(url)) {
        // SF-2b: a directly-referenced shot ALSO carries the role→category
        // mapping (NODE_STUDIO_IMAGE_ROLE_VIDEO_LEGEND_CATEGORY.shot, '镜头')
        // so it prints through the SAME "名字（分类）" pipeline as an
        // imageCategory-tagged referenceAsset, not the older kind「名字」
        // bracket wording — `kind` stays set too so the unnamed-fallback
        // (`autoNamePrefix.shot`) is unchanged for the rare unnamed shot.
        map.set(url, {
          kind,
          name,
          category: NODE_STUDIO_IMAGE_ROLE_VIDEO_LEGEND_CATEGORY.shot,
        })
      }
    }

    if (kind !== 'character') continue
    for (const upstream of getUpstreamNodes(node.id, edges, nodes)) {
      if (!isCloseupNode(upstream)) continue
      const closeupUrl = getNodePrimaryMediaUrl(upstream.data)
      if (!closeupUrl || map.has(closeupUrl)) continue
      map.set(closeupUrl, {
        kind: 'closeup',
        name: readName(upstream.data.characterName),
      })
    }
  }

  return map
}

export interface VideoReferenceLegendLabels {
  title: string
  imagePrefix: string
  videoPrefix: string
  audioPrefix: string
  kindLabel: Record<VideoLegendImageKind | 'video', string>
  /** Auto-name prefix per kind — MUST be the same i18n string the composer's
   *  autoName uses, so `@特写1` in the prompt matches `特写1` here. */
  autoNamePrefix: Record<VideoLegendImageKind | 'video', string>
  characterVoiceSuffix: string
  narration: string
}

/**
 * Build the reference legend prepended to a video generation (cast §7.2⑦ / §9 D).
 * Each sent slot → `图N：角色「名字」` / `视N：视频「视频N」` / `音N：角色「名字」的音色`,
 * where an unnamed slot falls back to `${autoNamePrefix}${N}` — byte-identical to
 * the composer's auto-numbered @token, so the model binds them. `N` is the slot's
 * FINAL position in the sent payload, matching the 图N/视N/音N slot badges.
 * Returns '' when nothing is nameable.
 *
 * SF-2b: a keyframe/首帧 slot is no longer silently skipped — its map entry
 * (see `harvestUpstreamVideoImageReferences`'s keyframe pass) always carries a
 * `category` and a `name` (real or ordinal-fallback), so it prints a
 * "@ImageN = 名字（首帧）" line through the SAME branch below a shot/imageCategory
 * reference uses, even though it's still never an insertable `@token` mention
 * (that stays projection-only, an unrelated system — see
 * `use-video-composer.ts`'s `referenceTokens`).
 */
export function buildVideoReferenceLegend(input: {
  referenceImages: readonly string[]
  imageRefByUrl: ReadonlyMap<string, VideoLegendImageReference>
  videoUrls: readonly string[]
  audioBindings: readonly AudioBinding[]
  labels: VideoReferenceLegendLabels
}): string {
  const { referenceImages, imageRefByUrl, videoUrls, audioBindings, labels } =
    input
  const lines: string[] = []

  referenceImages.forEach((url, index) => {
    const ref = imageRefByUrl.get(url)
    if (!ref) return
    // SF-2b: `kind` is optional now (a category-only entry, e.g. a keyframe,
    // never carries one — see `VideoLegendImageReference`). Its `name` is
    // always populated at harvest time for that case, so this fallback is
    // typed-safe dead code for it, not a real runtime path.
    const name =
      ref.name ||
      (ref.kind
        ? `${labels.autoNamePrefix[ref.kind]}${index + 1}`
        : `${labels.imagePrefix}${index + 1}`)
    // R3-6 出场组 + SF-2b: a category-labeled entry (an onStage EXTRA, or a
    // directly-referenced shot/frame role node) prints "@ImageN = 名字（分类）",
    // mirroring buildShotReferenceLegend's category branch but keeping this
    // legend's own imagePrefix (@Image — the V-1 positional token Seedance
    // actually resolves, not the shot legend's Chinese "图").
    if (ref.category) {
      lines.push(
        `${labels.imagePrefix}${index + 1} = ${name}（${ref.category}）`,
      )
      return
    }
    if (!ref.kind) return
    lines.push(
      `${labels.imagePrefix}${index + 1}：${labels.kindLabel[ref.kind]}「${name}」`,
    )
  })

  videoUrls.forEach((_, index) => {
    const name = `${labels.autoNamePrefix.video}${index + 1}`
    lines.push(
      `${labels.videoPrefix}${index + 1}：${labels.kindLabel.video}「${name}」`,
    )
  })

  audioBindings.forEach((binding, index) => {
    const speaker = binding.characterName
      ? `${labels.kindLabel.character}「${binding.characterName}」${labels.characterVoiceSuffix}`
      : labels.narration
    lines.push(`${labels.audioPrefix}${index + 1}：${speaker}`)
  })

  if (lines.length === 0) return ''
  return `${labels.title}\n${lines.join('\n')}`
}

/**
 * Harvest reference-video URLs from upstream video-source nodes (e.g. a
 * Seedance node whose generation has resolved). Only their `mediaUrl` is
 * read — `imageUrl` is treated as a preview poster and ignored. Empty and
 * duplicate entries are dropped. Callers should `.slice(0, 3)` against the
 * fal cap.
 */
export function harvestUpstreamVideoUrls(
  upstreamNodes: readonly NodeWorkflowNode[],
): string[] {
  const result: string[] = []

  for (const node of upstreamNodes) {
    if (!isVideoSourceNode(node)) continue
    const url =
      typeof node.data.mediaUrl === 'string' ? node.data.mediaUrl.trim() : ''
    if (!url) continue
    pushUnique(result, url)
  }

  return result
}

/**
 * Harvest reference-audio URLs from upstream voice nodes. Voice nodes provide
 * a `voiceReferenceAudioUrl` once the user generates a TTS sample (or uploads
 * one). Empty entries are dropped, duplicates collapsed.
 */
export function harvestUpstreamVoiceAudioUrls(
  upstreamNodes: readonly NodeWorkflowNode[],
): string[] {
  const result: string[] = []

  for (const node of upstreamNodes) {
    if (!isVoiceProfileNode(node)) continue
    const url =
      typeof node.data.voiceReferenceAudioUrl === 'string'
        ? node.data.voiceReferenceAudioUrl.trim()
        : ''
    if (!url) continue
    pushUnique(result, url)
  }

  return result
}

/**
 * A reference-audio clip plus optional binding info — the character name
 * the voice belongs to, when the user wired the voice node through a
 * character node instead of directly into Seedance. The Seedance Reference
 * builder uses the name to label the `@AudioN` token in the prompt so the
 * model knows which audio goes with which character.
 */
export interface AudioBinding {
  /** Reference audio URL — what gets sent as fal `audio_urls[N]`. */
  url: string
  /**
   * The character name carried in by the upstream character node, if any.
   * Empty when the voice was wired directly into the focal node without
   * routing through a character.
   */
  characterName?: string
  /** The voice node's own id — lets the composer's @token hover preview
   *  locate it on canvas (§8.3), unlike the URL which is not unique per node. */
  nodeId?: string
  /** Voice cover — `voiceCoverImage` (system voice) or `voiceReferenceCoverImage`
   *  (user reference audio's asset-library cover), for the token thumbnail (§8.2). */
  coverImage?: string
  /** Distinguishes a finished Audio Clip from a Voice Profile donor sample. */
  sourceKind?: 'audio-clip' | 'voice-profile'
}

function readCharacterName(node: NodeWorkflowNode): string | undefined {
  const fromData =
    typeof node.data.characterName === 'string'
      ? node.data.characterName.trim()
      : ''
  if (fromData) return fromData
  const fromCharacter =
    node.data.character && typeof node.data.character === 'object'
      ? (node.data.character as { name?: unknown }).name
      : undefined
  if (typeof fromCharacter === 'string' && fromCharacter.trim()) {
    return fromCharacter.trim()
  }
  return undefined
}

export function readVoiceUrl(node: NodeWorkflowNode): string | undefined {
  if (!isVoiceProfileNode(node)) return undefined
  const audioClipUrl =
    node.data.audioClip && typeof node.data.audioClip === 'object'
      ? (node.data.audioClip as { url?: unknown }).url
      : undefined
  if (typeof audioClipUrl === 'string' && audioClipUrl.trim()) {
    return audioClipUrl.trim()
  }
  const url =
    typeof node.data.voiceReferenceAudioUrl === 'string'
      ? node.data.voiceReferenceAudioUrl.trim()
      : ''
  return url || undefined
}

function getAudioBindingSourceKind(
  node: NodeWorkflowNode,
): AudioBinding['sourceKind'] {
  return node.data.audioClip && typeof node.data.audioClip === 'object'
    ? 'audio-clip'
    : node.data.voiceReferenceAudioUrl
      ? 'voice-profile'
      : undefined
}

export function readVoiceCoverImage(
  node: NodeWorkflowNode,
): string | undefined {
  const referenceCover =
    typeof node.data.voiceReferenceCoverImage === 'string'
      ? node.data.voiceReferenceCoverImage.trim()
      : ''
  if (referenceCover) return referenceCover
  const systemCover =
    typeof node.data.voiceCoverImage === 'string'
      ? node.data.voiceCoverImage.trim()
      : ''
  return systemCover || undefined
}

/**
 * Harvest reference-audio bindings (URL + optional character name) for a
 * focal node. Walks one hop further than `harvestUpstreamVoiceAudioUrls`:
 * voice nodes connected directly are emitted as unbound clips, voice nodes
 * connected to an upstream character node are emitted with that character's
 * name attached. The grand-upstream character chain is intentionally
 * 1-deep — anything further is exotic enough that explicit edges make more
 * sense than implicit propagation.
 */
export function harvestUpstreamAudioBindings(
  focalNodeId: string,
  edges: readonly NodeWorkflowEdge[],
  nodes: readonly NodeWorkflowNode[],
): AudioBinding[] {
  const directUpstream = getUpstreamNodes(focalNodeId, edges, nodes)
  const seenUrls = new Set<string>()
  const bindings: AudioBinding[] = []

  const push = (
    url: string,
    voiceNode: NodeWorkflowNode,
    characterName?: string,
  ) => {
    if (seenUrls.has(url)) return
    seenUrls.add(url)
    bindings.push({
      url,
      nodeId: voiceNode.id,
      ...(getAudioBindingSourceKind(voiceNode) === 'audio-clip'
        ? { sourceKind: 'audio-clip' as const }
        : {}),
      ...(characterName ? { characterName } : {}),
      ...(readVoiceCoverImage(voiceNode)
        ? { coverImage: readVoiceCoverImage(voiceNode) }
        : {}),
    })
  }

  // Pass 1 — voices wired through a character node (character-bound) take
  // priority so the first @AudioN slot gets the named binding when both
  // direct and character-routed voices reference the same URL.
  for (const node of directUpstream) {
    if (!isVisualReferenceNode(node)) continue
    const characterName = readCharacterName(node)
    const characterUpstream = getUpstreamNodes(node.id, edges, nodes)
    for (const candidate of characterUpstream) {
      const url = readVoiceUrl(candidate)
      if (!url) continue
      push(url, candidate, characterName)
    }
  }

  // Pass 2 — voices wired directly into the focal node (unbound).
  for (const node of directUpstream) {
    const url = readVoiceUrl(node)
    if (!url) continue
    push(url, node)
  }

  return bindings
}

/**
 * Build a prompt string from every upstream shotText node, in graph order.
 * Each shotText contributes its own scene/action/camera/composition stack via
 * `buildNodeWorkflowPrompt`. Multiple shotTexts are separated by a blank line
 * so downstream models see them as distinct beats.
 */
export function harvestUpstreamShotTextPrompt(
  upstreamNodes: readonly NodeWorkflowNode[],
): string {
  const chunks: string[] = []

  for (const node of upstreamNodes) {
    if (!isShotTextNode(node)) continue
    const chunk = buildNodeWorkflowPrompt(node.type, node.data).trim()
    if (!chunk) continue
    chunks.push(chunk)
  }

  return chunks.join('\n\n')
}

/**
 * Merge an upstream shotText prompt block in front of the focal node's own
 * prompt. If either side is empty the other is returned verbatim.
 */
export function mergePromptWithUpstreamText(
  basePrompt: string,
  upstreamPrompt: string,
): string {
  const base = basePrompt.trim()
  const upstream = upstreamPrompt.trim()

  if (!upstream) return base
  if (!base) return upstream
  return `${upstream}\n\n${base}`
}

/**
 * Summarise the reference assets feeding a focal Seedance node so the prompt
 * planner can orchestrate Seedance's multimodal @VideoN / @AudioN tokens with
 * intent. Counts are capped to the fal endpoint limits (≤9 images, ≤3 videos,
 * ≤3 audio). Audio carries the routing character name when one is wired, so
 * the planner can label `Alice (@Audio1)`. Returns zeros when nothing is wired.
 */
export function summarizeUpstreamSeedanceReferences(
  focalNodeId: string,
  edges: readonly NodeWorkflowEdge[],
  nodes: readonly NodeWorkflowNode[],
): SeedancePromptPlanReferences {
  const upstream = getUpstreamNodes(focalNodeId, edges, nodes)

  return {
    imageCount: Math.min(
      9,
      harvestUpstreamImageUrls(upstream, edges, focalNodeId).length,
    ),
    videoCount: Math.min(3, harvestUpstreamVideoUrls(upstream).length),
    audio: harvestUpstreamAudioBindings(focalNodeId, edges, nodes)
      .slice(0, 3)
      .map((binding) =>
        binding.characterName ? { characterName: binding.characterName } : {},
      ),
  }
}
