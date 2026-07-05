import { NODE_STUDIO_SHOT_REFERENCE_LEGEND } from '@/constants/node-studio'
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
    return (
      (node.data.role ?? NODE_IMAGE_ROLE_IDS.shot) === NODE_IMAGE_ROLE_IDS.frame
    )
  }
  return node.type === NODE_TYPE_IDS.frameImage
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
 */
export function harvestUpstreamImageUrls(
  upstreamNodes: readonly NodeWorkflowNode[],
): string[] {
  const result: string[] = []

  for (const node of upstreamNodes) {
    if (!isKeyframeNode(node)) continue
    pushUnique(result, getNodeMediaUrl(node.data))
  }
  for (const node of upstreamNodes) {
    if (!isVisualReferenceNode(node)) continue
    pushUnique(result, getNodeMediaUrl(node.data))
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
  kind: 'character' | 'background'
  name?: string
}

function readBackgroundName(node: NodeWorkflowNode): string | undefined {
  const name =
    typeof node.data.backgroundName === 'string'
      ? node.data.backgroundName.trim()
      : ''
  return name || undefined
}

/**
 * Harvest named character/background image references from a shot node's
 * upstream nodes. Each entry pairs the reference URL with its subject name so
 * the caller can both pass the URL to the image model AND label it in the
 * prompt legend. Empty media and duplicate URLs are dropped; edge/graph order
 * is preserved so the legend numbering is stable.
 */
export function harvestUpstreamImageReferences(
  upstreamNodes: readonly NodeWorkflowNode[],
): UpstreamImageReference[] {
  const result: UpstreamImageReference[] = []
  const seen = new Set<string>()

  for (const node of upstreamNodes) {
    const kind = getSeedanceReferenceKind(node)
    if (kind !== 'character' && kind !== 'background') continue
    const url = getNodeMediaUrl(node.data)
    if (!url || seen.has(url)) continue
    seen.add(url)
    const name =
      kind === 'character' ? readCharacterName(node) : readBackgroundName(node)
    result.push({ url, kind, name })
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
    const kindLabel = NODE_STUDIO_SHOT_REFERENCE_LEGEND.kindLabel[ref.kind]
    lines.push(`图${index + 1}：${kindLabel}「${ref.name}」`)
  })
  if (lines.length === 0) return ''
  return `${NODE_STUDIO_SHOT_REFERENCE_LEGEND.title}\n${lines.join('\n')}`
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
  const url =
    typeof node.data.voiceReferenceAudioUrl === 'string'
      ? node.data.voiceReferenceAudioUrl.trim()
      : ''
  return url || undefined
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
    imageCount: Math.min(9, harvestUpstreamImageUrls(upstream).length),
    videoCount: Math.min(3, harvestUpstreamVideoUrls(upstream).length),
    audio: harvestUpstreamAudioBindings(focalNodeId, edges, nodes)
      .slice(0, 3)
      .map((binding) =>
        binding.characterName ? { characterName: binding.characterName } : {},
      ),
  }
}
