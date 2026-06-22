/**
 * Canvas connection contract (canvas-baseline §6, owner-ratified 2026-06-21).
 *
 * Each node exposes a single input handle (no per-slot typing), so a connection
 * is validated purely at the (sourceType → targetType) level. The matrix is
 * STRICT — it lists only edges that are actually consumed today, so "if you can
 * connect it, it's used" (no silently-ignored dead edges):
 *
 *   - seedance (video) is the aggregator: it reads shot text, image references
 *     (character / background / keyframe / shot), voice audio, and reference
 *     video clips (seedance / videoReference / videoMerge).
 *   - characterImage accepts voice — the voice→character→seedance audio-binding
 *     hop (harvestUpstreamAudioBindings labels @AudioN with the character name).
 *   - videoMerge aggregates video-source clips.
 *   - every other node type is a leaf/source and accepts no inputs.
 *
 * Image-gen nodes (shot / frameImage) intentionally accept nothing for now:
 * their generators don't read the graph (only their own inspector inputs), so
 * allowing such edges would silently drop them. Wiring them to consume graph
 * references is a separate feature (impl + contract together).
 */

import {
  NODE_IMAGE_ROLE_IDS,
  NODE_TYPE_IDS,
  type NodeImageRole,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'

/** Target node type → source node types it accepts. Absent target = accepts none. */
export const NODE_CONNECTION_RULES: Partial<
  Record<NodeWorkflowNodeType, readonly NodeWorkflowNodeType[]>
> = {
  [NODE_TYPE_IDS.seedance]: [
    NODE_TYPE_IDS.shotText,
    NODE_TYPE_IDS.characterImage,
    NODE_TYPE_IDS.backgroundImage,
    NODE_TYPE_IDS.frameImage,
    NODE_TYPE_IDS.shot,
    // Unified image node (any role) — seedance accepts it as a reference, the
    // same way it accepts the legacy per-role image types above.
    NODE_TYPE_IDS.image,
    NODE_TYPE_IDS.voice,
    NODE_TYPE_IDS.seedance,
    NODE_TYPE_IDS.videoReference,
    NODE_TYPE_IDS.videoMerge,
  ],
  [NODE_TYPE_IDS.characterImage]: [NODE_TYPE_IDS.voice],
  [NODE_TYPE_IDS.videoMerge]: [
    NODE_TYPE_IDS.seedance,
    NODE_TYPE_IDS.videoReference,
    NODE_TYPE_IDS.videoMerge,
  ],
}

/**
 * Whether a `source` node type may connect into a `target` node type. Pure;
 * does NOT cover self-loops (same node id) — the caller rejects those by id,
 * since seedance→seedance is a valid type pair (reference-to-video between two
 * distinct clips).
 */
export function canConnectNodeTypes(
  source: NodeWorkflowNodeType,
  target: NodeWorkflowNodeType,
  targetRole?: NodeImageRole,
): boolean {
  // Unified image node: only role=character accepts an input (voice), mirroring
  // the legacy characterImage rule; every other role is a leaf/source. The
  // static matrix can't see role, so image targets are resolved here.
  if (target === NODE_TYPE_IDS.image) {
    return (
      targetRole === NODE_IMAGE_ROLE_IDS.character &&
      source === NODE_TYPE_IDS.voice
    )
  }
  return NODE_CONNECTION_RULES[target]?.includes(source) ?? false
}
