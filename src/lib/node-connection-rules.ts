/**
 * Canvas connection contract (canvas-baseline §6, owner-ratified 2026-06-21;
 * shot-reference edges added 2026-06-25).
 *
 * Each node exposes a single input handle (no per-slot typing), so a connection
 * is validated at the (sourceType → targetType) level, with image roles
 * resolved on both ends. The matrix is STRICT — it lists only edges that are
 * actually consumed today, so "if you can connect it, it's used" (no
 * silently-ignored dead edges):
 *
 *   - seedance (video) is the aggregator: it reads shot text, image references
 *     (character / background / keyframe / shot), voice audio, and reference
 *     video clips (seedance / videoReference / videoMerge).
 *   - characterImage accepts voice — the voice→character→seedance audio-binding
 *     hop (harvestUpstreamAudioBindings labels @AudioN with the character name).
 *   - shot accepts character + background image references: the shot generator
 *     harvests them as named reference images (harvestUpstreamImageReferences)
 *     and labels them in the prompt legend so the model binds name → image.
 *   - videoMerge aggregates video-source clips.
 *   - every other node type is a leaf/source and accepts no inputs.
 *
 * frameImage still accepts nothing — its generator doesn't read the graph, so
 * allowing such edges would silently drop them.
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
 * Whether a node (legacy per-role type OR unified `image` with `sourceRole`)
 * is a character/background visual reference — the only sources a shot node
 * consumes. shot/frame images are leaf outputs, not references, so they are
 * intentionally rejected (connecting them would contribute nothing).
 */
function isCharacterOrBackgroundSource(
  source: NodeWorkflowNodeType,
  sourceRole?: NodeImageRole,
): boolean {
  if (
    source === NODE_TYPE_IDS.characterImage ||
    source === NODE_TYPE_IDS.backgroundImage
  ) {
    return true
  }
  if (source === NODE_TYPE_IDS.image) {
    return (
      sourceRole === NODE_IMAGE_ROLE_IDS.character ||
      sourceRole === NODE_IMAGE_ROLE_IDS.background
    )
  }
  return false
}

/**
 * Whether a `source` node type may connect into a `target` node type. Pure;
 * does NOT cover self-loops (same node id) — the caller rejects those by id,
 * since seedance→seedance is a valid type pair (reference-to-video between two
 * distinct clips). `targetRole` / `sourceRole` resolve unified `image` nodes,
 * which carry their identity in `data.role` rather than the node type.
 */
export function canConnectNodeTypes(
  source: NodeWorkflowNodeType,
  target: NodeWorkflowNodeType,
  targetRole?: NodeImageRole,
  sourceRole?: NodeImageRole,
): boolean {
  // Target = shot (legacy `shot` type OR unified image with role=shot): accepts
  // character / background image references the generator harvests + labels.
  const targetIsShot =
    target === NODE_TYPE_IDS.shot ||
    (target === NODE_TYPE_IDS.image && targetRole === NODE_IMAGE_ROLE_IDS.shot)
  if (targetIsShot) {
    return isCharacterOrBackgroundSource(source, sourceRole)
  }

  // Unified image node (non-shot role): only role=character accepts an input
  // (voice), mirroring the legacy characterImage rule; every other role is a
  // leaf/source. The static matrix can't see role, so image targets resolve here.
  if (target === NODE_TYPE_IDS.image) {
    return (
      targetRole === NODE_IMAGE_ROLE_IDS.character &&
      source === NODE_TYPE_IDS.voice
    )
  }
  return NODE_CONNECTION_RULES[target]?.includes(source) ?? false
}
