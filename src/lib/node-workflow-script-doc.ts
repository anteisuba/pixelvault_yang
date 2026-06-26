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
  { makeId, anchor }: ProjectScriptDocOptions,
): ProjectScriptDocResult {
  const placement = NODE_STUDIO_NODE_PLACEMENT.scriptDocSpawn

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
      [NODE_WORKFLOW_FIELD_IDS.composition]: '',
      [NODE_WORKFLOW_FIELD_IDS.scene]: shot.sceneLabel ?? '',
      scriptRef: {
        kind: SCRIPT_DOC_REF_KIND_IDS.shotText,
        sourceId: shot.id,
      },
    }
    const shotTextUpdate: Partial<NodeWorkflowNodeData> = {
      [NODE_WORKFLOW_FIELD_IDS.action]: shot.summary,
      [NODE_WORKFLOW_FIELD_IDS.camera]: shot.camera ?? '',
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

    for (const roleId of shot.roleIds) {
      const characterNodeId = roleNodeId.get(roleId)
      if (characterNodeId) {
        addDesiredEdge(characterNodeId, seedanceId)
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
