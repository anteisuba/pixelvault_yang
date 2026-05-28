import {
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

export function isVisualReferenceNode(node: NodeWorkflowNode): boolean {
  return (
    node.type === NODE_TYPE_IDS.characterImage ||
    node.type === NODE_TYPE_IDS.shot ||
    node.type === NODE_TYPE_IDS.backgroundImage
  )
}

export function isKeyframeNode(node: NodeWorkflowNode): boolean {
  return node.type === NODE_TYPE_IDS.frameImage
}

export function isShotTextNode(node: NodeWorkflowNode): boolean {
  return node.type === NODE_TYPE_IDS.shotText
}

export function isVoiceProfileNode(node: NodeWorkflowNode): boolean {
  return node.type === NODE_TYPE_IDS.voice
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

function readVoiceUrl(node: NodeWorkflowNode): string | undefined {
  if (!isVoiceProfileNode(node)) return undefined
  const url =
    typeof node.data.voiceReferenceAudioUrl === 'string'
      ? node.data.voiceReferenceAudioUrl.trim()
      : ''
  return url || undefined
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

  const push = (url: string, characterName?: string) => {
    if (seenUrls.has(url)) return
    seenUrls.add(url)
    bindings.push({ url, ...(characterName ? { characterName } : {}) })
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
      push(url, characterName)
    }
  }

  // Pass 2 — voices wired directly into the focal node (unbound).
  for (const node of directUpstream) {
    const url = readVoiceUrl(node)
    if (!url) continue
    push(url)
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
