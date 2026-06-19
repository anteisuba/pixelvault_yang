/**
 * ScriptDoc → graph projection (the autospawn engine).
 *
 * Pure, idempotent, React-free so it tests in isolation. Given a confirmed
 * ScriptDoc and the current graph, it returns the nodes + edges to ADD to
 * spawn character / voice / shot(seedance) / videoMerge nodes. Re-projecting
 * the same doc is a no-op (add-only idempotency): entities that already have a
 * node — matched by `scriptRef` (or a character's `character.characterId`, so
 * the legacy Agent path stays interoperable) — are reused for wiring and never
 * duplicated or clobbered. The assistant only edits the ScriptDoc; THIS is the
 * layer that touches the graph.
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
  /** Injected id factory (the hook passes its `createWorkflowId`). */
  makeId(prefix: string): string
  /** Absolute origin for the spawned pipeline (ScriptDoc has no node anchor). */
  anchor: { x: number; y: number }
}

export interface ProjectScriptDocResult {
  nodesToAdd: NodeWorkflowNode[]
  edgesToAdd: NodeWorkflowEdge[]
  /** New nodes spawned this projection. */
  created: number
  /** Entities that already had a node (reused, untouched). */
  skipped: number
}

/**
 * Build a canvas edge with the standard neutral visuals. Mirrors the edge
 * shape the hook's `onConnect` / `spawnCharactersFromBreakdown` produce.
 */
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

export function projectScriptDocToGraph(
  scriptDoc: ScriptDoc,
  existingState: NodeWorkflowState,
  { makeId, anchor }: ProjectScriptDocOptions,
): ProjectScriptDocResult {
  const placement = NODE_STUDIO_NODE_PLACEMENT.scriptDocSpawn

  // refKey -> existing nodeId. Characters get an extra alias key off
  // `character.characterId` so nodes spawned by the Agent path are reused
  // (not re-created) by this projection.
  const existingByKey = new Map<string, string>()
  for (const node of existingState.nodes) {
    const ref = node.data.scriptRef
    if (ref) {
      existingByKey.set(refKey(ref.kind, ref.sourceId), node.id)
    }
    if (node.type === NODE_TYPE_IDS.characterImage) {
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
  const edgesToAdd: NodeWorkflowEdge[] = []
  const spawnedByKey = new Map<string, string>()
  let created = 0
  let skipped = 0

  function resolveNode(
    kind: ScriptDocRefKind,
    sourceId: string,
    build: (id: string) => NodeWorkflowNode,
  ): string {
    const key = refKey(kind, sourceId)
    const existing = existingByKey.get(key) ?? spawnedByKey.get(key)
    if (existing) {
      skipped += 1
      return existing
    }
    const id = makeId(NODE_STUDIO_ID_PREFIXES.node)
    nodesToAdd.push(build(id))
    spawnedByKey.set(key, id)
    created += 1
    return id
  }

  function addEdge(source: string, target: string): void {
    const pair = `${source}->${target}`
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

  // ── Characters (one per role) ────────────────────────────────────────
  const roleNodeId = new Map<string, string>()
  scriptDoc.roles.forEach((role, index) => {
    const visualSeed = role.description || role.name
    const nodeId = resolveNode(
      SCRIPT_DOC_REF_KIND_IDS.character,
      role.id,
      (id) => ({
        id,
        type: NODE_TYPE_IDS.characterImage,
        position: {
          x: anchor.x + placement.characterOffsetX,
          y: anchor.y + index * placement.characterRowOffsetY,
        },
        data: {
          prompt: visualSeed,
          status: NODE_STATUS_IDS.idle,
          generationStatus: NODE_GENERATION_STATUS_IDS.idle,
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
        } as NodeWorkflowNodeData,
      }),
    )
    roleNodeId.set(role.id, nodeId)
  })

  // ── Shots (shotText + seedance, with character + voice wiring) ────────
  const seedanceNodeIds: string[] = []
  scriptDoc.shots.forEach((shot, shotIndex) => {
    const rowY = anchor.y + shotIndex * placement.shotRowOffsetY

    const shotTextId = resolveNode(
      SCRIPT_DOC_REF_KIND_IDS.shotText,
      shot.id,
      (id) => ({
        id,
        type: NODE_TYPE_IDS.shotText,
        position: { x: anchor.x + placement.shotTextOffsetX, y: rowY },
        data: {
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
        } as NodeWorkflowNodeData,
      }),
    )

    const seedanceId = resolveNode(
      SCRIPT_DOC_REF_KIND_IDS.seedance,
      shot.id,
      (id) => ({
        id,
        type: NODE_TYPE_IDS.seedance,
        position: { x: anchor.x + placement.seedanceOffsetX, y: rowY },
        data: {
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
        } as NodeWorkflowNodeData,
      }),
    )
    seedanceNodeIds.push(seedanceId)

    addEdge(shotTextId, seedanceId)

    for (const roleId of shot.roleIds) {
      const characterNodeId = roleNodeId.get(roleId)
      if (characterNodeId) {
        addEdge(characterNodeId, seedanceId)
      }
    }

    shot.dialogue.forEach((line, lineIndex) => {
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
          data: {
            prompt: '',
            status: NODE_STATUS_IDS.idle,
            generationStatus: NODE_GENERATION_STATUS_IDS.idle,
            mediaKind: NODE_MEDIA_KIND_IDS.audio,
            voiceSource: NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.manual,
            [NODE_WORKFLOW_FIELD_IDS.voiceId]: '',
            [NODE_WORKFLOW_FIELD_IDS.voiceName]:
              roleNameById.get(line.speakerRoleId) ?? '',
            [NODE_WORKFLOW_FIELD_IDS.voiceProvider]:
              NODE_STUDIO_VOICE_PROFILE.providerDefault,
            [NODE_WORKFLOW_FIELD_IDS.voiceEmotion]: '',
            [NODE_WORKFLOW_FIELD_IDS.voiceStyle]: '',
            [NODE_WORKFLOW_FIELD_IDS.dialogue]: line.line,
            scriptRef: {
              kind: SCRIPT_DOC_REF_KIND_IDS.voice,
              sourceId: line.id,
            },
          } as NodeWorkflowNodeData,
        }),
      )
      addEdge(voiceId, seedanceId)
    })
  })

  // ── videoMerge (single, only with ≥2 shots) ──────────────────────────
  if (seedanceNodeIds.length >= 2) {
    const mergeId = resolveNode(
      SCRIPT_DOC_REF_KIND_IDS.merge,
      SCRIPT_DOC_MERGE_SOURCE_ID,
      (id) => ({
        id,
        type: NODE_TYPE_IDS.videoMerge,
        position: { x: anchor.x + placement.videoMergeOffsetX, y: anchor.y },
        data: {
          prompt: '',
          status: NODE_STATUS_IDS.idle,
          generationStatus: NODE_GENERATION_STATUS_IDS.idle,
          mediaKind: NODE_MEDIA_KIND_IDS.video,
          scriptRef: {
            kind: SCRIPT_DOC_REF_KIND_IDS.merge,
            sourceId: SCRIPT_DOC_MERGE_SOURCE_ID,
          },
        } as NodeWorkflowNodeData,
      }),
    )
    for (const seedanceId of seedanceNodeIds) {
      addEdge(seedanceId, mergeId)
    }
  }

  return { nodesToAdd, edgesToAdd, created, skipped }
}
