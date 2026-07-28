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
  NODE_MEDIA_KIND_BY_NODE_TYPE,
  NODE_MEDIA_KIND_IDS,
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
 * A closeup image (face detail) — a unified `image` node with role=closeup.
 * It's the only image role that connects INTO a character node (the
 * `closeup → character` 1-hop, cast-redesign §9 B), where it rides image_urls
 * as part of the character's identity when harvested.
 */
function isCloseupSource(
  source: NodeWorkflowNodeType,
  sourceRole?: NodeImageRole,
): boolean {
  return (
    source === NODE_TYPE_IDS.image && sourceRole === NODE_IMAGE_ROLE_IDS.closeup
  )
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
  // ⛔ 2026-07-28 owner：「全部放开。这些都不做限制了。」
  //
  // 下面整套按角色/类型的准入矩阵**全部停用**，任意节点之间都可连。停用而不是
  // 删除：判据本身（谁被谁收割、特写只能挂角色、背景是叶子）仍然是下游收割逻辑
  // 的真实描述，删掉就得从头重建。
  //
  // ⚠ 放开后失去的是一条纪律：**「连得上就一定被用到」**。原注释里写得很直白
  // ——允许 closeup→shot/seedance 会「产生一条收割时被静默丢弃的边」。现在这类
  // 边可以画出来，但下游不一定消费它。用户会看到一条什么也没发生的连线。
  //
  // 换来的是：不再出现「拖了半天连不上、且和端口坏掉长得一模一样」——那个体验
  // 刚刚让我们花了三轮才分清是规则拒绝还是端口失效。owner 权衡后选了放开。
  //
  // ⚠ 真要收紧时，正确做法不是把这行删掉了事，而是**先给拒绝一个可见的理由**
  // （toast/提示），否则又会退回到「静默失败」那个坑里。
  return true

  // Target = character (legacy `characterImage` OR unified image role=character):
  // accepts a voice (音色 audio-binding hop) AND a closeup image (面部特写子参考,
  // closeup→character 1-hop, cast-redesign §9 B). Both ride the character forward
  // when it's harvested downstream. Single source of truth for character inputs —
  // the static matrix no longer lists characterImage.
  const targetIsCharacter =
    target === NODE_TYPE_IDS.characterImage ||
    (target === NODE_TYPE_IDS.image &&
      targetRole === NODE_IMAGE_ROLE_IDS.character)

  // A closeup's ONLY valid target is a character (§9 B) — it's not a direct
  // visual reference, so allowing closeup→shot/seedance would create an edge the
  // harvest silently drops (it rides its character instead). Reject it early so
  // "if you can connect it, it's used" holds.
  if (isCloseupSource(source, sourceRole)) {
    return targetIsCharacter
  }

  if (targetIsCharacter) {
    return source === NODE_TYPE_IDS.voice
  }

  // Target = shot (legacy `shot` type OR unified image with role=shot): accepts
  // character / background image references the generator harvests + labels.
  const targetIsShot =
    target === NODE_TYPE_IDS.shot ||
    (target === NODE_TYPE_IDS.image && targetRole === NODE_IMAGE_ROLE_IDS.shot)
  if (targetIsShot) {
    return isCharacterOrBackgroundSource(source, sourceRole)
  }

  // canvas-generate-composer.md §7「结果落点」: a populated image card's
  // generate composer spawns a NEW loose (role-less) result card and wires
  // source→result as a real edge, not just spatial proximity — "来源关系正是
  // 连线三维度编码要展示的东西". Scoped to a LOOSE target (targetRole
  // undefined): background/frame/character/shot stay leaf/source exactly as
  // before, only a freshly-spawned generic result card accepts this lineage
  // edge. Source may be ANY image-kind node (loose or role'd) — every image
  // family is a valid "改前" host per canvas-image-card.md §0's scope.
  if (target === NODE_TYPE_IDS.image && targetRole === undefined) {
    return NODE_MEDIA_KIND_BY_NODE_TYPE[source] === NODE_MEDIA_KIND_IDS.image
  }

  // Every other unified image role (background / frame) is a leaf/source that
  // accepts no input. The static matrix can't see role, so image targets resolve
  // here before the type-level fallback.
  if (target === NODE_TYPE_IDS.image) {
    return false
  }
  return NODE_CONNECTION_RULES[target]?.includes(source) ?? false
}
