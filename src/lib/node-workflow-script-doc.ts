/**
 * ScriptDoc -> graph projection.
 *
 * Pure, idempotent, React-free so it tests in isolation. Given a confirmed
 * ScriptDoc and the current graph, it returns the nodes, node patches, and
 * edges needed to keep the canvas aligned with that doc. Entities are matched
 * by `scriptRef` or, for legacy Agent-created characters, by
 * `character.characterId`.
 */

import {
  NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS,
  NODE_STUDIO_EDGE_VISUALS,
  NODE_STUDIO_ID_PREFIXES,
  NODE_STUDIO_NODE_PLACEMENT,
  NODE_STUDIO_VOICE_PROFILE,
  NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS,
} from '@/constants/node-studio'
import {
  NODE_GENERATION_STATUS_IDS,
  NODE_IMAGE_ROLE_IDS,
  NODE_MEDIA_KIND_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
  NODE_WORKFLOW_FIELD_IDS,
} from '@/constants/node-types'
import {
  SCRIPT_DOC_MERGE_SOURCE_ID,
  SCRIPT_DOC_REF_KIND_IDS,
  type ScriptDocRefKind,
} from '@/constants/script-doc'
import type {
  NodeWorkflowEdge,
  NodeWorkflowNode,
  NodeWorkflowNodeData,
  NodeWorkflowState,
} from '@/types/node-workflow'
import type { ScriptDoc } from '@/types/script-doc'

export interface ProjectScriptDocOptions {
  makeId(prefix: string): string
  anchor: { x: number; y: number }
  /**
   * 分镜静帧 (包 3 / Q5「默认开 · 项目级可关」): project one still-image node
   * per shot. Omitted or `true` = on, matching the owner's default.
   *
   * Turning it OFF only stops NEW stills from being spawned — a still that
   * already exists is still claimed as "desired" so the orphan sweep below
   * leaves it (and its edges) alone. A settings toggle must never silently
   * delete an image the user already burned credit on.
   */
  shotStills?: boolean
}

export interface NodeWorkflowNodeDataUpdate {
  id: string
  data: Partial<NodeWorkflowNodeData>
}

export interface ProjectScriptDocResult {
  nodesToAdd: NodeWorkflowNode[]
  nodesToUpdate: NodeWorkflowNodeDataUpdate[]
  /** Projection-owned nodes whose role/shot/line was deleted from the doc. */
  nodesToRemove: NodeWorkflowNode[]
  edgesToAdd: NodeWorkflowEdge[]
  edgesToRemove: NodeWorkflowEdge[]
  created: number
  updated: number
  skipped: number
  removed: number
  removedEdges: number
}

export function createWorkflowEdge(
  id: string,
  source: string,
  target: string,
): NodeWorkflowEdge {
  return {
    id,
    source,
    target,
    type: NODE_STUDIO_EDGE_VISUALS.type,
    interactionWidth: NODE_STUDIO_EDGE_VISUALS.interactionWidth,
    markerEnd: {
      type: NODE_STUDIO_EDGE_VISUALS.markerEndType,
      color: NODE_STUDIO_EDGE_VISUALS.color,
      width: NODE_STUDIO_EDGE_VISUALS.markerSize,
      height: NODE_STUDIO_EDGE_VISUALS.markerSize,
      strokeWidth: NODE_STUDIO_EDGE_VISUALS.markerStrokeWidth,
    },
    style: {
      stroke: NODE_STUDIO_EDGE_VISUALS.color,
      strokeWidth: NODE_STUDIO_EDGE_VISUALS.strokeWidth,
      filter: NODE_STUDIO_EDGE_VISUALS.glowFilter,
    },
  }
}

function refKey(kind: ScriptDocRefKind, sourceId: string): string {
  return `${kind}:${sourceId}`
}

function stableValue(value: unknown): string {
  return JSON.stringify(value)
}

function hasDataChanges(
  current: NodeWorkflowNodeData,
  patch: Partial<NodeWorkflowNodeData>,
): boolean {
  const keys = Object.keys(patch) as Array<keyof NodeWorkflowNodeData>
  return keys.some(
    (key) => stableValue(current[key]) !== stableValue(patch[key]),
  )
}

function queueNodeUpdate(
  updates: NodeWorkflowNodeDataUpdate[],
  node: NodeWorkflowNode,
  patch: Partial<NodeWorkflowNodeData>,
): boolean {
  if (!hasDataChanges(node.data, patch)) {
    return false
  }

  updates.push({ id: node.id, data: patch })
  return true
}

export function projectScriptDocToGraph(
  scriptDoc: ScriptDoc,
  existingState: NodeWorkflowState,
  { makeId, anchor, shotStills }: ProjectScriptDocOptions,
): ProjectScriptDocResult {
  const placement = NODE_STUDIO_NODE_PLACEMENT.scriptDocSpawn
  const wantsShotStills = shotStills !== false

  const existingByKey = new Map<string, string>()
  const existingNodeById = new Map<string, NodeWorkflowNode>()
  for (const node of existingState.nodes) {
    existingNodeById.set(node.id, node)
    const ref = node.data.scriptRef
    if (ref) {
      existingByKey.set(refKey(ref.kind, ref.sourceId), node.id)
    }

    // Legacy Agent-path characters lack a scriptRef and are matched by
    // character.characterId instead. Recognize both the legacy characterImage
    // type and the unified image node with role=character (post-migration), so
    // re-projection reuses the node instead of spawning a duplicate.
    const isCharacterNode =
      node.type === NODE_TYPE_IDS.characterImage ||
      (node.type === NODE_TYPE_IDS.image &&
        node.data.role === NODE_IMAGE_ROLE_IDS.character)
    if (isCharacterNode) {
      const characterId = node.data.character?.characterId
      if (typeof characterId === 'string' && characterId.length > 0) {
        existingByKey.set(
          refKey(SCRIPT_DOC_REF_KIND_IDS.character, characterId),
          node.id,
        )
      }
    }
  }

  const edgePairs = new Set<string>()
  for (const edge of existingState.edges) {
    edgePairs.add(`${edge.source}->${edge.target}`)
  }

  const nodesToAdd: NodeWorkflowNode[] = []
  const nodesToUpdate: NodeWorkflowNodeDataUpdate[] = []
  const edgesToAdd: NodeWorkflowEdge[] = []
  const edgesToRemove: NodeWorkflowEdge[] = []
  const spawnedByKey = new Map<string, string>()
  const desiredEdgePairs = new Set<string>()
  // Every refKey the current doc wants a node for — the inverse identifies the
  // orphans (deleted roles/shots/lines) to remove.
  const desiredKeys = new Set<string>()
  let created = 0
  let updated = 0
  let skipped = 0

  function resolveNode(
    kind: ScriptDocRefKind,
    sourceId: string,
    build: (id: string) => NodeWorkflowNode,
    buildUpdate: () => Partial<NodeWorkflowNodeData>,
  ): string {
    const key = refKey(kind, sourceId)
    desiredKeys.add(key)
    const existing = existingByKey.get(key) ?? spawnedByKey.get(key)
    if (existing) {
      skipped += 1
      const existingNode = existingNodeById.get(existing)
      if (
        existingNode &&
        queueNodeUpdate(nodesToUpdate, existingNode, buildUpdate())
      ) {
        updated += 1
      }
      return existing
    }

    const id = makeId(NODE_STUDIO_ID_PREFIXES.node)
    nodesToAdd.push(build(id))
    spawnedByKey.set(key, id)
    created += 1
    return id
  }

  function addDesiredEdge(source: string, target: string): void {
    const pair = `${source}->${target}`
    desiredEdgePairs.add(pair)
    if (edgePairs.has(pair)) {
      return
    }

    edgePairs.add(pair)
    edgesToAdd.push(
      createWorkflowEdge(makeId(NODE_STUDIO_ID_PREFIXES.edge), source, target),
    )
  }

  const roleNameById = new Map(
    scriptDoc.roles.map((role) => [role.id, role.name] as const),
  )

  const roleNodeId = new Map<string, string>()
  scriptDoc.roles.forEach((role, index) => {
    const visualSeed = role.description || role.name
    const createData: NodeWorkflowNodeData = {
      prompt: visualSeed,
      status: NODE_STATUS_IDS.idle,
      generationStatus: NODE_GENERATION_STATUS_IDS.idle,
      // Unified image node (option B): a projected role is an image with
      // role=character (was the standalone characterImage type pre-consolidation).
      role: NODE_IMAGE_ROLE_IDS.character,
      imageMode: NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.choice,
      referenceAssets: [],
      loras: [],
      characterName: role.name,
      character: {
        characterId: role.id,
        name: role.name,
        visualSeed,
      },
      scriptRef: {
        kind: SCRIPT_DOC_REF_KIND_IDS.character,
        sourceId: role.id,
      },
    }
    const updateData: Partial<NodeWorkflowNodeData> = {
      prompt: visualSeed,
      characterName: role.name,
      character: {
        characterId: role.id,
        name: role.name,
        visualSeed,
      },
      scriptRef: createData.scriptRef,
    }
    const nodeId = resolveNode(
      SCRIPT_DOC_REF_KIND_IDS.character,
      role.id,
      (id) => ({
        id,
        type: NODE_TYPE_IDS.image,
        position: {
          x: anchor.x + placement.characterOffsetX,
          y: anchor.y + index * placement.characterRowOffsetY,
        },
        data: createData,
      }),
      () => updateData,
    )
    roleNodeId.set(role.id, nodeId)
  })

  const seedanceNodeIds: string[] = []
  scriptDoc.shots.forEach((shot, shotIndex) => {
    const rowY = anchor.y + shotIndex * placement.shotRowOffsetY
    const shotTextData: NodeWorkflowNodeData = {
      prompt: '',
      status: NODE_STATUS_IDS.idle,
      mediaKind: NODE_MEDIA_KIND_IDS.text,
      [NODE_WORKFLOW_FIELD_IDS.action]: shot.summary,
      [NODE_WORKFLOW_FIELD_IDS.camera]: shot.camera ?? '',
      [NODE_WORKFLOW_FIELD_IDS.composition]: shot.composition ?? '',
      [NODE_WORKFLOW_FIELD_IDS.scene]: shot.sceneLabel ?? '',
      scriptRef: {
        kind: SCRIPT_DOC_REF_KIND_IDS.shotText,
        sourceId: shot.id,
      },
    }
    // 四个字段全量投影（2026-08-02）：`composition` 此前恒写空串、且不进
    // update patch —— 那是「ScriptDoc 里没有这个概念」时代的产物。现在它在
    // ScriptDoc 里有位置了，投影就该照读，否则用户在节点上编的构图会在下一
    // 次投影时凭空消失。
    // ⚠ 覆盖不再是数据丢失：节点侧的编辑会由 `updateNodeData` 同步回写
    // ScriptDoc（use-node-workflow.ts），所以这里读到的本来就是用户最新的值。
    const shotTextUpdate: Partial<NodeWorkflowNodeData> = {
      [NODE_WORKFLOW_FIELD_IDS.action]: shot.summary,
      [NODE_WORKFLOW_FIELD_IDS.camera]: shot.camera ?? '',
      [NODE_WORKFLOW_FIELD_IDS.composition]: shot.composition ?? '',
      [NODE_WORKFLOW_FIELD_IDS.scene]: shot.sceneLabel ?? '',
      scriptRef: shotTextData.scriptRef,
    }
    const shotTextId = resolveNode(
      SCRIPT_DOC_REF_KIND_IDS.shotText,
      shot.id,
      (id) => ({
        id,
        type: NODE_TYPE_IDS.shotText,
        position: { x: anchor.x + placement.shotTextOffsetX, y: rowY },
        data: shotTextData,
      }),
      () => shotTextUpdate,
    )

    // 分镜静帧 (包 3): the shot's still image — a unified `image` node with
    // role=shot, so `ImageNode` renders the 生成表单 while empty and the 散图卡
    // once it has a result. role=shot deliberately, NOT background/character:
    // those two render the identity card, whose存废 is still open (G5), and a
    // projection has no business betting on a contested形态.
    //
    // Idempotency: the still needs its own refKind because `shot.id` is
    // already the sourceId of this shot's shotText and seedance nodes.
    const shotStillKey = refKey(SCRIPT_DOC_REF_KIND_IDS.shotStill, shot.id)
    const hasExistingShotStill =
      existingByKey.has(shotStillKey) || spawnedByKey.has(shotStillKey)
    let shotStillId: string | null = null

    if (wantsShotStills || hasExistingShotStill) {
      const shotStillData: NodeWorkflowNodeData = {
        // `prompt` is seeded, and ONLY `prompt` — `buildNodeWorkflowPrompt`
        // has no field table for the unified `image` type, so it falls back to
        // `[prompt]`. Writing the summary into `action` as well would print the
        // same sentence twice in the Inspector while adding nothing the model
        // ever reads.
        //
        // Seeded at create time so the node is generatable out of the box; the
        // update patch below deliberately omits `prompt`, because a still's
        // prompt is what the creator精修s shot by shot and re-drafting the
        // outline must not wipe that (owner 2026-07-31).
        prompt: shot.summary,
        status: NODE_STATUS_IDS.idle,
        generationStatus: NODE_GENERATION_STATUS_IDS.idle,
        mediaKind: NODE_MEDIA_KIND_IDS.image,
        role: NODE_IMAGE_ROLE_IDS.shot,
        // Inspector-side context (role=shot shows prompt/camera/composition/
        // action). Kept in sync with the doc like the shotText sibling, but —
        // per the note above — it informs the creator, it does not reach the
        // model unless they fold it into the prompt themselves.
        [NODE_WORKFLOW_FIELD_IDS.camera]: shot.camera ?? '',
        referenceAssets: [],
        loras: [],
        scriptRef: {
          kind: SCRIPT_DOC_REF_KIND_IDS.shotStill,
          sourceId: shot.id,
        },
      }
      const shotStillUpdate: Partial<NodeWorkflowNodeData> = {
        [NODE_WORKFLOW_FIELD_IDS.camera]: shot.camera ?? '',
        scriptRef: shotStillData.scriptRef,
      }
      shotStillId = resolveNode(
        SCRIPT_DOC_REF_KIND_IDS.shotStill,
        shot.id,
        (id) => ({
          id,
          type: NODE_TYPE_IDS.image,
          position: { x: anchor.x + placement.shotStillOffsetX, y: rowY },
          data: shotStillData,
        }),
        () => shotStillUpdate,
      )
      // ⚠ 有意不连 shotText → 静帧（owner 2026-07-31）。三条理由：
      // ① 今天不会被消费 —— `upstreamTextPrompt` 只对视频节点计算
      //    (`StudioNodeWorkbench`: `isVideoMediaNode ? harvest : ''`)。
      // ② 就算接通也不该接 —— shotText 拼的是 场景/动作/镜头/构图 四段，
      //    其中「镜头」是运动词（缓慢推入 / 过肩），那是写给视频的；喂给图片
      //    模型只是噪音。静帧要的是这一镜长什么样，不是镜头怎么动。
      // ③ 会重复 —— 静帧自己的 prompt 已经是 shot.summary，而 shotText 的
      //    「动作」段同源，`mergePromptWithUpstreamText` 是裸拼接不去重。
      // 这一镜的文字与静帧的关系由 scriptRef 的同一个 shot.id 表达，不需要边。
    }

    const seedanceData: NodeWorkflowNodeData = {
      prompt: '',
      status: NODE_STATUS_IDS.idle,
      generationStatus: NODE_GENERATION_STATUS_IDS.idle,
      mediaKind: NODE_MEDIA_KIND_IDS.video,
      [NODE_WORKFLOW_FIELD_IDS.audioIntent]: '',
      [NODE_WORKFLOW_FIELD_IDS.camera]: shot.camera ?? '',
      [NODE_WORKFLOW_FIELD_IDS.duration]: '',
      [NODE_WORKFLOW_FIELD_IDS.motion]: '',
      scriptRef: {
        kind: SCRIPT_DOC_REF_KIND_IDS.seedance,
        sourceId: shot.id,
      },
    }
    const seedanceUpdate: Partial<NodeWorkflowNodeData> = {
      [NODE_WORKFLOW_FIELD_IDS.camera]: shot.camera ?? '',
      scriptRef: seedanceData.scriptRef,
    }
    const seedanceId = resolveNode(
      SCRIPT_DOC_REF_KIND_IDS.seedance,
      shot.id,
      (id) => ({
        id,
        type: NODE_TYPE_IDS.seedance,
        position: { x: anchor.x + placement.seedanceOffsetX, y: rowY },
        data: seedanceData,
      }),
      () => seedanceUpdate,
    )
    seedanceNodeIds.push(seedanceId)

    addDesiredEdge(shotTextId, seedanceId)

    if (shotStillId) {
      // The still rides into the video as a plain visual reference —
      // `isVisualReferenceNode` already counts role=shot (node-workflow-graph),
      // so this edge is what makes 先图后视 actually reach the video.
      addDesiredEdge(shotStillId, seedanceId)
    }

    for (const roleId of shot.roleIds) {
      const characterNodeId = roleNodeId.get(roleId)
      if (!characterNodeId) continue

      addDesiredEdge(characterNodeId, seedanceId)
      if (shotStillId) {
        // ADDITIVE, on top of character→seedance above (owner 2026-07-31):
        // a shot node is the one image-gen node that reads its own upstream —
        // `harvestUpstreamImageReferences` turns these into named references
        // ("图1：角色「…」"), which is what keeps the face in the still on
        // model. Without this edge the still would generate from bare text.
        addDesiredEdge(characterNodeId, shotStillId)
      }
    }

    shot.dialogue.forEach((line, lineIndex) => {
      const voiceName = roleNameById.get(line.speakerRoleId) ?? ''
      // Voice nodes are pure timbre / 音色身份 donors (剧本后置): the spoken line
      // is deliberately NOT projected onto the node. It lives in the ScriptDoc
      // (shot.dialogue) and the shot / Seedance prompt; the node↔line link is
      // carried by `scriptRef.sourceId = line.id`. VoiceNode / VoiceDetailBody are
      // identity-driven and never read `dialogue`, so writing it here would only
      // create write-only orphan state.
      const voiceData: NodeWorkflowNodeData = {
        prompt: '',
        status: NODE_STATUS_IDS.idle,
        generationStatus: NODE_GENERATION_STATUS_IDS.idle,
        mediaKind: NODE_MEDIA_KIND_IDS.audio,
        voiceSource: NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.manual,
        [NODE_WORKFLOW_FIELD_IDS.voiceId]: '',
        [NODE_WORKFLOW_FIELD_IDS.voiceName]: voiceName,
        [NODE_WORKFLOW_FIELD_IDS.voiceProvider]:
          NODE_STUDIO_VOICE_PROFILE.providerDefault,
        [NODE_WORKFLOW_FIELD_IDS.voiceEmotion]: '',
        [NODE_WORKFLOW_FIELD_IDS.voiceStyle]: '',
        scriptRef: {
          kind: SCRIPT_DOC_REF_KIND_IDS.voice,
          sourceId: line.id,
        },
      }
      const voiceUpdate: Partial<NodeWorkflowNodeData> = {
        [NODE_WORKFLOW_FIELD_IDS.voiceName]: voiceName,
        scriptRef: voiceData.scriptRef,
      }
      const voiceId = resolveNode(
        SCRIPT_DOC_REF_KIND_IDS.voice,
        line.id,
        (id) => ({
          id,
          type: NODE_TYPE_IDS.voice,
          position: {
            x: anchor.x + placement.voiceOffsetX,
            y: rowY + lineIndex * placement.voiceRowOffsetY,
          },
          data: voiceData,
        }),
        () => voiceUpdate,
      )
      addDesiredEdge(voiceId, seedanceId)
    })
  })

  if (seedanceNodeIds.length >= 2) {
    const mergeData: NodeWorkflowNodeData = {
      prompt: '',
      status: NODE_STATUS_IDS.idle,
      generationStatus: NODE_GENERATION_STATUS_IDS.idle,
      mediaKind: NODE_MEDIA_KIND_IDS.video,
      scriptRef: {
        kind: SCRIPT_DOC_REF_KIND_IDS.merge,
        sourceId: SCRIPT_DOC_MERGE_SOURCE_ID,
      },
    }
    const mergeId = resolveNode(
      SCRIPT_DOC_REF_KIND_IDS.merge,
      SCRIPT_DOC_MERGE_SOURCE_ID,
      (id) => ({
        id,
        type: NODE_TYPE_IDS.videoMerge,
        position: { x: anchor.x + placement.videoMergeOffsetX, y: anchor.y },
        data: mergeData,
      }),
      () => ({ scriptRef: mergeData.scriptRef }),
    )
    for (const seedanceId of seedanceNodeIds) {
      addDesiredEdge(seedanceId, mergeId)
    }
  }

  // Orphans: nodes this projection OWNS (carry a scriptRef) whose source is no
  // longer in the ScriptDoc — i.e. the creator deleted that role / shot / line.
  // Legacy characterId-matched nodes (no scriptRef) are deliberately left alone.
  const removedNodeIds = new Set<string>()
  const nodesToRemove: NodeWorkflowNode[] = []
  for (const node of existingState.nodes) {
    const ref = node.data.scriptRef
    if (ref && !desiredKeys.has(refKey(ref.kind, ref.sourceId))) {
      nodesToRemove.push(node)
      removedNodeIds.add(node.id)
    }
  }

  const managedNodeIds = new Set<string>(existingByKey.values())
  const removedEdgeIds = new Set<string>()
  for (const edge of existingState.edges) {
    if (removedEdgeIds.has(edge.id)) continue

    // An edge touching a removed node goes with it.
    if (removedNodeIds.has(edge.source) || removedNodeIds.has(edge.target)) {
      removedEdgeIds.add(edge.id)
      edgesToRemove.push(edge)
      continue
    }

    // Stale ScriptDoc-managed wiring: both ends managed, link no longer desired.
    const pair = `${edge.source}->${edge.target}`
    if (
      managedNodeIds.has(edge.source) &&
      managedNodeIds.has(edge.target) &&
      !desiredEdgePairs.has(pair)
    ) {
      removedEdgeIds.add(edge.id)
      edgesToRemove.push(edge)
    }
  }

  return {
    nodesToAdd,
    nodesToUpdate,
    nodesToRemove,
    edgesToAdd,
    edgesToRemove,
    created,
    updated,
    skipped,
    removed: nodesToRemove.length,
    removedEdges: edgesToRemove.length,
  }
}

/**
 * shotText 节点字段 → ScriptDoc shot 字段的映射。
 *
 * 这是本文件正向投影（`shotTextData` / `shotTextUpdate`）的**反向**，两者必须
 * 一一对应 —— 放在同一个文件里就是为了改一边时能立刻看到另一边。
 */
const SHOT_TEXT_FIELD_TO_SHOT_FIELD = {
  [NODE_WORKFLOW_FIELD_IDS.action]: 'summary',
  [NODE_WORKFLOW_FIELD_IDS.camera]: 'camera',
  [NODE_WORKFLOW_FIELD_IDS.scene]: 'sceneLabel',
  [NODE_WORKFLOW_FIELD_IDS.composition]: 'composition',
} as const satisfies Partial<Record<string, keyof ScriptDoc['shots'][number]>>

/**
 * 把「在 shotText 节点上的一次字段编辑」同步回 ScriptDoc。
 *
 * owner 2026-08-02 拍板：「助手这边只是自动生成，不用助手则用户手动输入然后
 * 生成 —— 是一种东西」。镜头文本因此不是助手的产物，而是「一镜的文字定义」，
 * ScriptDoc 是它的事实源，节点是同一份数据的另一个入口。
 *
 * 不做任何事的三种情况（都原样返回入参引用，调用方靠 `===` 判断没变化）：
 * · 项目还没有 ScriptDoc；
 * · 这个节点不是 shotText，或者没有指回某个 shot 的 `scriptRef`
 *   （手工添加的节点就没有 —— 它不受投影管辖，字段就存在自己身上）；
 * · patch 里没有任何一个镜头字段（例如只是改了 `status`）。
 */
export function syncShotTextPatchToScriptDoc(
  doc: ScriptDoc | undefined,
  node: NodeWorkflowNode | undefined,
  patch: Partial<NodeWorkflowNodeData>,
): ScriptDoc | undefined {
  if (!doc || !node || node.type !== NODE_TYPE_IDS.shotText) return doc
  const ref = node.data.scriptRef
  if (!ref || ref.kind !== SCRIPT_DOC_REF_KIND_IDS.shotText) return doc

  let next = doc
  for (const [nodeField, shotField] of Object.entries(
    SHOT_TEXT_FIELD_TO_SHOT_FIELD,
  )) {
    const value = patch[nodeField as keyof NodeWorkflowNodeData]
    if (typeof value !== 'string') continue
    next = {
      ...next,
      shots: next.shots.map((shot) =>
        shot.id === ref.sourceId ? { ...shot, [shotField]: value } : shot,
      ),
    }
  }
  return next
}
