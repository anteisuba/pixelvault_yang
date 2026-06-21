/**
 * Planner-retirement migration (pure, React-free, idempotent).
 *
 * The legacy text planner — Composer node (idea input) + Agent node (script
 * breakdown / seedance prompt) — is retired in favour of the right-rail
 * assistant (ScriptDoc + `projectScriptDocToGraph`). This migration folds an
 * Agent node's breakdown into the ScriptDoc fact model, then removes the
 * Composer/Agent nodes and their dangling edges.
 *
 * The node `type` enum keeps `composer`/`agent` (removing them would fail the
 * strict `z.array(NodeWorkflowNodeSchema)` parse on load and the server's
 * `validateState` would coerce that to an empty state, wiping the project).
 * This runs AFTER a successful parse and strips them at the data level instead.
 *
 * Owner-approved mapping decisions (canvas-baseline §13):
 *   1. breakdown mode never produced dialogue → shots get empty dialogue.
 *   2. an existing (assistant-authored) ScriptDoc wins — never overwritten.
 *   3. the first Agent with a breakdown wins; further breakdowns and the
 *      intermediate actions/beats are dropped (no ScriptDoc equivalent).
 */

import { NODE_TYPE_IDS } from '@/constants/node-types'
import { SCRIPT_DOC_LIMITS } from '@/constants/script-doc'
import type {
  NodeWorkflowEdge,
  NodeWorkflowNode,
  NodeWorkflowState,
} from '@/types/node-workflow'
import type { ScriptBreakdownResult } from '@/types/script-breakdown'
import type {
  ScriptDoc,
  ScriptDocRole,
  ScriptDocShot,
} from '@/types/script-doc'

const RETIRED_PLANNER_NODE_TYPES: ReadonlySet<string> = new Set([
  NODE_TYPE_IDS.composer,
  NODE_TYPE_IDS.agent,
])

function clamp(value: string, max: number): string {
  const trimmed = value.trim()
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

function clampOptional(
  value: string | undefined,
  max: number,
): string | undefined {
  if (!value) return undefined
  const clamped = clamp(value, max)
  return clamped.length > 0 ? clamped : undefined
}

/**
 * Map a retired Agent node's ScriptBreakdownResult onto the ScriptDoc fact
 * model. Lossy by design (see decisions 1 & 3 above). Clamps to
 * `SCRIPT_DOC_LIMITS` so the result is always a valid ScriptDoc.
 */
export function breakdownToScriptDoc(
  breakdown: ScriptBreakdownResult,
): ScriptDoc {
  const sceneLabelById = new Map(
    breakdown.scenes.map((scene) => [scene.id, scene.label] as const),
  )
  const knownRoleIds = new Set(breakdown.characters.map((c) => c.id))

  const roles: ScriptDocRole[] = breakdown.characters
    .slice(0, SCRIPT_DOC_LIMITS.maxRoles)
    .map((character) => ({
      id: character.id,
      name: clamp(
        character.nameSuggestion || character.label || character.id,
        SCRIPT_DOC_LIMITS.fieldMaxLength,
      ),
      description: clamp(
        character.visualSeed,
        SCRIPT_DOC_LIMITS.fieldMaxLength,
      ),
    }))

  const shots: ScriptDocShot[] = breakdown.shots
    .slice(0, SCRIPT_DOC_LIMITS.maxShots)
    .map((shot) => ({
      id: shot.id,
      sceneLabel: clampOptional(
        sceneLabelById.get(shot.sceneId),
        SCRIPT_DOC_LIMITS.fieldMaxLength,
      ),
      summary: clamp(
        shot.promptSeed || shot.label || shot.id,
        SCRIPT_DOC_LIMITS.fieldMaxLength,
      ),
      camera: clampOptional(shot.camera, SCRIPT_DOC_LIMITS.fieldMaxLength),
      // Only keep bindings to characters that became roles; drop danglers.
      roleIds: (shot.characterIds ?? [])
        .filter((id) => knownRoleIds.has(id))
        .slice(0, SCRIPT_DOC_LIMITS.maxRoles),
      // Decision 1: breakdown mode has no dialogue.
      dialogue: [],
    }))

  return {
    title: clamp(breakdown.title, SCRIPT_DOC_LIMITS.titleMaxLength),
    logline: clamp(breakdown.logline, SCRIPT_DOC_LIMITS.loglineMaxLength),
    styleNote: clampOptional(
      breakdown.referenceIntent,
      SCRIPT_DOC_LIMITS.styleNoteMaxLength,
    ),
    roles,
    shots,
  }
}

/**
 * Strip retired Composer/Agent nodes from a workflow state, folding the first
 * Agent breakdown into the ScriptDoc when one isn't already present. Returns
 * the input untouched (same reference) when there's nothing to migrate, so it
 * is safe to run on every load and is idempotent.
 */
export function migrateRetirePlanner(
  state: NodeWorkflowState,
): NodeWorkflowState {
  const hasPlannerNodes = state.nodes.some((node) =>
    RETIRED_PLANNER_NODE_TYPES.has(node.type),
  )
  if (!hasPlannerNodes) return state

  // Decision 2: only derive a ScriptDoc when none exists — the assistant's
  // doc is the source of truth and must not be clobbered.
  let scriptDoc = state.scriptDoc
  if (!scriptDoc) {
    // Decision 3: first Agent with a breakdown wins.
    const breakdownAgent = state.nodes.find(
      (node) =>
        node.type === NODE_TYPE_IDS.agent && Boolean(node.data.breakdown),
    )
    if (breakdownAgent?.data.breakdown) {
      scriptDoc = breakdownToScriptDoc(breakdownAgent.data.breakdown)
    }
  }

  const removedNodeIds = new Set(
    state.nodes
      .filter((node) => RETIRED_PLANNER_NODE_TYPES.has(node.type))
      .map((node) => node.id),
  )
  const nodes: NodeWorkflowNode[] = state.nodes.filter(
    (node) => !removedNodeIds.has(node.id),
  )
  const edges: NodeWorkflowEdge[] = state.edges.filter(
    (edge) =>
      !removedNodeIds.has(edge.source) && !removedNodeIds.has(edge.target),
  )

  return { ...state, nodes, edges, scriptDoc }
}
