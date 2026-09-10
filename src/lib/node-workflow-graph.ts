import {
  NODE_SLOT_IDS,
  type NodeSlotId,
  type NodeSlotTextRole,
} from '@/constants/node-slots'
import {
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
  type NodeReviewState,
  type NodeWorkflowMediaKind,
} from '@/constants/node-types'
import type {
  NodeWorkflowEdge,
  NodeWorkflowNode,
  NodeWorkflowNodeData,
  NodeWorkflowReferenceAsset,
} from '@/types/node-workflow'

import {} from './node-media-review'

/**
 * 被审核门挡下的一张图（包 4 / §4.2 Q3）。
 *
 * ⚠ 收割函数返回它**不是为了好看** —— §5-W3 明写「排除时要提示」。静默少发一张
 * 比不挡更糟：用户会看到一个和自己预期不符的成片，却完全不知道少了谁。
 */
export interface BlockedUpstreamMedia {
  url: string
  /** 这张图挂在哪个节点上，好让提示能指名道姓。 */
  nodeId: string
  /** `awaiting_review` 还是 `rejected` —— 文案要分开写，两者的下一步不同。 */
  state: NodeReviewState
}

/** 收割结果 + 被门禁挡下的清单。 */
export interface HarvestedImageUrls {
  urls: string[]
  blocked: BlockedUpstreamMedia[]
  /**
   * `urls` 开头那一段里，真正被用户标成关键帧（`imageCategory` = frameStart /
   * frameEnd）的图，按首→尾排好，且**只含过审的**（是 `urls` 的真前缀）。
   *
   * ⚠ 为什么单独给一份而不是只靠「排在最前」这个约定：约定只在**全是关键帧**时成立。
   * 「1 张首帧 + 1 张角色卡图」的 `urls` 也是两条，下游若按位置取就会把角色图当尾帧
   * 发出去。首尾语义的载体是分类，不是位置 —— 位置只是它的投影。
   */
  keyframeUrls: string[]
}

export interface HarvestedImageReferences {
  references: UpstreamImageReference[]
  blocked: BlockedUpstreamMedia[]
}

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
 * 这是一张**卡片**（身份档案夹）吗 —— 角色卡 / 背景卡。
 *
 * 卡片与图是两件事，只是名字长得像：
 *
 * | role | 渲染 | 语义 |
 * | --- | --- | --- |
 * | character / background | `IdentityCollectorCard` | **卡片**：收集同一个主体的图，自己不生成 |
 * | shot / frame / closeup | 图卡 | **图**：生成的落点 |
 *
 * ⚠ 判据必须是 **role**，不能是「媒体种类」。卡片的 kind 也是 `image`，所以按 kind
 * 判会把卡片当成图 —— `inferComposerHost` 之前就是这么把生成框挂到角色卡上的。
 *
 * ⚠ 两个旧类型（`characterImage` / `backgroundImage`）名字里带 Image，其实渲染的
 * 就是卡片，存量图里还有它们，必须一起认。「图片和卡片搞混」的根就在这两个名字上。
 */
export function isIdentityCardNode(node: {
  type: NodeWorkflowNode['type']
  data: NodeWorkflowNodeData
}): boolean {
  if (
    node.type === NODE_TYPE_IDS.characterImage ||
    node.type === NODE_TYPE_IDS.backgroundImage
  ) {
    return true
  }
  if (node.type !== NODE_TYPE_IDS.image) return false
  return (
    node.data.role === NODE_IMAGE_ROLE_IDS.character ||
    node.data.role === NODE_IMAGE_ROLE_IDS.background
  )
}

/**
 * 「这个节点算哪种可生成媒体」的公共地基——身份卡（角色卡/背景卡，见上面
 * `isIdentityCardNode`：自己不产图，只负责引用）与没有媒体种类 / text 节点
 * （没有落生成结果的地方）统一收成 `undefined`，也就是「不是生成目标」。
 *
 * 《画布修法》02 节刀 1：`use-generate-composer.ts` 的 `inferComposerHost`
 * 与 `node-assistant-op-plan.ts` 的 `generate` op 此前各自手写过这条判据——
 * 两处的注释都自称「与对方同源」，现在真的同源了。调用方仍各自负责再收窄到
 * 自己认的媒体种类子集，这条差异不收进本函数：
 * - `inferComposerHost` 只认 image/audio（视频有自己的提示词栏，见
 *   `node-canvas-v2.md` §5）
 * - 助手的 `generate` op 额外放行 video——本函数不排除 video，
 *   与改前行为一致（`node-assistant-op-plan.test.ts` 锁了这条）
 */
export function resolveGenerateTargetKind(node: {
  type: NodeWorkflowNode['type']
  data: NodeWorkflowNodeData
}): NodeWorkflowMediaKind | undefined {
  if (isIdentityCardNode(node)) return undefined
  const kind = NODE_MEDIA_KIND_BY_NODE_TYPE[node.type]
  return kind === NODE_MEDIA_KIND_IDS.text ? undefined : kind
}

/**
 * A closeup image (face detail) — a unified `image` node with role=closeup
 * (cast-redesign §9 B). closeup has no legacy per-type equivalent, so it only
 * ever exists as `image` + role. It is NOT a direct visual reference (it wires
 * into a character, not a video), so it rides image_urls via the 1-hop
 * the deleted v3 close-up harvest, not the direct image one.
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

export function isVoiceProfileNode(
  // 只读 `type` —— 放宽成结构子集，好让**还没建出来的**节点也判得了族
  // （`resolveNodeSlotZone` 的落槽前预检要用，见 node-ingest-capacity 头注）。
  node: Pick<NodeWorkflowNode, 'type'>,
): boolean {
  return node.type === NODE_TYPE_IDS.voice
}

/**
 * The named reference family a node contributes to a downstream Seedance node's
 * reference panel (角色 / 背景 / 镜头 / 声音). Resolves the unified `image` node
 * via `data.role` AND the legacy per-type character/background/shot image nodes,
 * plus voice nodes. A role-less unified image defaults to `shot`, matching
 * `isVisualReferenceNode` and the actual image payload harvest. Returns null
 * only for nodes that feed generation but aren't surfaced as a named family
 * chip (frame images, text, video…).
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
      ? (node.data.role ?? NODE_IMAGE_ROLE_IDS.shot)
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
export function isVideoSourceNode(
  node: Pick<NodeWorkflowNode, 'type'>,
): boolean {
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
 * V-2 主图（docs/references/pages/canvas-video-card.md）: the ONE image a
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
 * 画布修法包 F: assemble a shot image node's final `referenceImages` + prompt
 * legend from a caller's OWN candidate URLs (whatever it already collected —
 * e.g. the generate-composer's pinned host thumbnail + manually picked
 * slots) plus the SAME upstream character/background harvest the toolbar
 * 「生成」button (`handleGenerateMediaNode`, 画布 workbench) has
 * always read for a shot node. One function, built from the exact primitives
 * that handler already calls in this order — the deleted v3 image harvest
 * → merge → `assembleReferenceImagePayload` (dedupe + cap) →
 * `buildShotReferenceLegend` — so a second reference-collecting call site
 * never again has to re-derive (and silently diverge from) that recipe.
 *
 * Before this existed, the generate-composer's send path
 * (`handleRunGenerateComposer`) never read the graph at all — a shot node
 * wired to a character/background card would drop that reference the moment
 * you generated from the composer instead of the toolbar button, with no
 * indication anything was missing (画布修法 包 F repro).
 *
 * Own candidates are prioritized first (first-seen-wins dedup, same as every
 * other reference-collecting call site) — an upstream reference only fills a
 * slot the caller's own picks didn't already claim.
 */
/**
 * 画布修法包 F 续（owner 2026-08-26 拍板「只修抹掉、不改发送」）：把 generate
 * composer 这一次要落盘的 `referenceAssets` 与**宿主已有的那份**合并，而不是
 * 覆盖。
 *
 * 起因：composer 发送时会拿自己的 `referenceImages` 反写 `referenceAssets`。
 * 宿主是空卡时 `fillsInPlace` 成立、落点就是宿主本身，于是一张手动加过
 * 风格/道具参考图、还没生成过的镜头图，从 composer 发一次就把那些条目连同
 * 它们的 `role`/`weight`/`name` 一起抹掉了——它们既不在 `input.referenceUrls`
 * 里、也不在上游收割里，没有任何一条路能把它们找回来。这与包 F 刚修掉的是
 * 同一类「静默丢参考图」，只是换了个来源。
 *
 * 宿主原有条目**整个留下且排在前面**：`buildReferenceAssetLegendEntries` 的
 * 分类图例、以及工具条那条路的候选取数，全都读这些字段，降级成
 * `defaultRole` 就等于把分类丢了。URL 撞车时保留宿主那条（更富信息），
 * composer 这次的条目只补没被占过的 URL。
 *
 * ⚠ 这只管**落盘**的那一份，**不动发送口径**：`referenceImages` 仍然只由
 * `input.referenceUrls` + 上游收割决定（见 `assembleShotImageReferencePlan`），
 * 被保住的这些图不会因此被发出去 —— composer 保持所见即所发。
 */
export function mergeComposerReferenceAssets(
  hostAssets: readonly NodeWorkflowReferenceAsset[] | undefined,
  composerAssets: readonly NodeWorkflowReferenceAsset[],
): NodeWorkflowReferenceAsset[] {
  const kept = hostAssets ?? []
  const keptUrls = new Set(kept.map((asset) => asset.url))
  return [
    ...kept,
    ...composerAssets.filter((asset) => !keptUrls.has(asset.url)),
  ]
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
   * the deleted v3 video-legend harvest's keyframe pass), so the
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
 * (see the deleted v3 video-legend harvest's keyframe pass) always carries a
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

/**
 * 这个音色节点能拿出来发的那一条音频 URL。
 *
 * 取值顺序（2026-08-10 字段收敛后只剩两档）：
 *   1. `audioClip.url` —— 音频族的成品片段（`isAudioMediaNode` 的产出，不是音色节点
 *      自己的字段，所以它单独一档）
 *   2. `voiceClipUrl` —— **这个节点交付的那段参考语音**，三种来源共用一个字段
 *
 * ⚠ 收敛之前这里是三档（`audioClip` > `voiceReferenceAudioUrl` > `voiceSampleUrl`），
 * 同一个事实分散在两个字段上，每个读的地方各写各的链 —— 收割层就漏了系统音色那一档，
 * 导致整条支线送不出声（2026-08-09 补的第 3 档）；卡面又另写一条「有 voiceId 就 ready」，
 * 导致绿灯却发不出去（2026-08-10）。域定义见
 * `docs/references/pages/canvas-voice-card.md` §0.5：一个产物、一个字段、一个判据。
 *
 * 「样本能不能当配音素材发」不是这里现拍的，三处既有事实早就答了「能」：
 *   · `NODE_STUDIO_VOICE_PROFILE.referenceSampleText` 的注释写明这段样本按
 *     ~12-15s 设计，**就是为了卡进 fal Seedance reference-to-video 的 15s 音频上限**
 *   · 详情面板证据抽屉的标题就是「取样将发送」（`nodeDetail.sampleWillSend`）
 *   · 卡面（`VoiceNode`）与面板（`VoiceDetailBody`）的试听源解析**都把
 *     `voiceSampleUrl` 当这个音色的音频**
 * 于是缺的不是判断，是这一层没跟上 —— 同一个事实两条链，收割层是掉队的那条。
 *
 * ⚠ 与卡面的试听源解析**有意不完全一致**：卡面按 `voiceSource` 先取对应档
 * （它要回答「点播放该响哪一段」），这里按「谁是更好的音色供体」排序 —— 真实
 * 录制/上传的 clip 永远优于一段固定文本的样本。两者只在「两个字段都有值」时
 * 才分岔，且各自的取舍都在自己的问题里成立。
 */
export function readVoiceUrl(node: NodeWorkflowNode): string | undefined {
  if (!isVoiceProfileNode(node)) return undefined
  return readVoiceUrlFromData(node.data)
}

/**
 * 同一条取值链的 data 版本。给「手上只有 `data`、没有整个 node」的 UI 用
 * （卡面 `VoiceNode` 的 status、详情面板 `VoiceDetailBody` 的 status）。
 *
 * ⚠ 存在的理由就是**不许再出现第二条链**：这个域反复栽在「同一个事实各写各的」
 * 上 —— 收割层曾漏掉 `voiceSampleUrl` 整条系统音色支线送不出声（2026-08-09 才
 * 补上第 3 档），卡面又用「有 voiceId 就算 ready」自成一套，于是卡面说 ready、
 * 实际发不出去。判「能不能发」的地方一律走这里。
 */
export function readVoiceUrlFromData(
  data: NodeWorkflowNodeData,
): string | undefined {
  const audioClipUrl =
    data.audioClip && typeof data.audioClip === 'object'
      ? (data.audioClip as { url?: unknown }).url
      : undefined
  if (typeof audioClipUrl === 'string' && audioClipUrl.trim()) {
    return audioClipUrl.trim()
  }
  const clipUrl =
    typeof data.voiceClipUrl === 'string' ? data.voiceClipUrl.trim() : ''
  return clipUrl || undefined
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

export interface HarvestedSlotEntry {
  readonly node: NodeWorkflowNode
  /** 这条入边的 id。⚠ 一跳外的来源（特写 / 绑在角色卡上的音色）不在这里，
   *  它们是**那张卡**的槽，对那张卡再调一次 `harvestSlots`。 */
  readonly edgeId: string
  readonly slot: NodeSlotId
  /** 只有 `text` 槽有角色；v3 边不带角色，一律回落 `script`（见下）。 */
  readonly role?: NodeSlotTextRole
}

export interface HarvestedTextSlots {
  /** 要拍的内容本身（0..1）。v3 图里 = 第一条文本边。 */
  readonly script?: HarvestedSlotEntry
  /** 风格 / 规则约束段（0..N）。v3 图恒空——旧图的文本边全部算剧本。 */
  readonly style: readonly HarvestedSlotEntry[]
  /** 角色描述段（0..N）。v3 图恒空，同上。 */
  readonly character: readonly HarvestedSlotEntry[]
  /**
   * 全部文本边，**发现顺序**。
   *
   * ⚠ 存在的理由是**逐字保真**：v3 收割层（已删）把每条文本边的
   * 正文按图顺序拼成一段，v3 图里它们全是 `script`，而 `script` 只有一个位置。
   * 没有这条名单，第 2 条起的文本边就会在装配时凭空消失或被误塞进约束段。
   */
  readonly ordered: readonly HarvestedSlotEntry[]
}

export interface HarvestedSlots {
  /** 首帧（0..1）= `keyframes` 里第一条首帧档的边。 */
  readonly first?: HarvestedSlotEntry
  /** 尾帧（0..1）= `keyframes` 里第一条尾帧档的边。 */
  readonly last?: HarvestedSlotEntry
  /**
   * 全部关键帧入边，**发现顺序**（`first` / `last` 是它的语义指针）。
   *
   * ⚠ 存在的理由是**逐字保真**：首尾槽都是 0..1，而存量图完全可能挂两张
   * `frameStart`——按旧规则它们两张都骑 `image_urls`（`orderKeyframes` 收全部关键
   * 帧，`planVideoKeyframeImages` 才 `slice(0, 2)`）。只留 first/last 两个指针就会
   * 在装配时把第 2 张静默吃掉。⛔ 收割层不做这种删减。
   */
  readonly keyframes: readonly HarvestedSlotEntry[]
  /** 参考素材（0..N）：角色卡 / 背景卡 / 镜头图 / 参考视频。 */
  readonly reference: readonly HarvestedSlotEntry[]
  /** 语音 / 音色（0..N），**只有直连的**。绑在角色卡上的那些是角色卡的槽。 */
  readonly voice: readonly HarvestedSlotEntry[]
  /** 面部特写（0..N）。只在角色卡上出现（特写连的是卡，不是视频）。 */
  readonly closeup: readonly HarvestedSlotEntry[]
  /** 合并节点的待接片段（2..9）。 */
  readonly clip: readonly HarvestedSlotEntry[]
  readonly text: HarvestedTextSlots
}

export function orderedKeyframeEntries(
  slots: HarvestedSlots,
): HarvestedSlotEntry[] {
  return [...slots.keyframes].sort(
    (a, b) =>
      (a.slot === NODE_SLOT_IDS.lastFrame ? 1 : 0) -
      (b.slot === NODE_SLOT_IDS.lastFrame ? 1 : 0),
  )
}

/**
 * 首尾帧槽 → 画布图例分类（`frameStart` / `frameEnd`）。
 *
 * 两套名字指的是同一件事：分类是 v3 存在节点身上的载体，槽是 v4 存在边上的载体。
 * ⚠ 需要这条翻译的只有**显示**（图例标签、素材条槽名的 i18n 键）——判据一律走槽。
 * C3c 之后分类那一半退役，这个函数跟着删。
 */
export function keyframeSlotCategory(
  slot: NodeSlotId,
): (typeof NODE_STUDIO_KEYFRAME_REFERENCE_ROLES)[number] | undefined {
  if (slot === NODE_SLOT_IDS.firstFrame) {
    return NODE_STUDIO_KEYFRAME_REFERENCE_ROLES[0]
  }
  if (slot === NODE_SLOT_IDS.lastFrame) {
    return NODE_STUDIO_KEYFRAME_REFERENCE_ROLES[1]
  }
  return undefined
}
