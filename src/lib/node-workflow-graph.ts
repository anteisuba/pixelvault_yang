import { NODE_TYPE_IDS } from '@/constants/node-types'
import type {
  NodeWorkflowEdge,
  NodeWorkflowNode,
  NodeWorkflowNodeData,
} from '@/types/node-workflow'

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
