'use client'

import { createContext, useContext, type ReactNode } from 'react'

import type {
  NodeImageRole,
  NodeWorkflowNodeType,
} from '@/constants/node-types'
import type { NodeStudioToolMode } from '@/constants/node-studio'
import type { ScriptDocDepth, ScriptDocStage } from '@/constants/script-doc'
import type { NodeWorkflowActions } from '@/hooks/node/use-node-workflow'
import type {
  NodeWorkflowModelOptionsByType,
  VideoDefaultModel,
} from '@/types/node-workflow'

/** A backfilled reference to autospawn upstream of a video node (§7.1): an
 *  already-resolved media asset (uploaded or picked from the library) that
 *  becomes a new source node, auto-wired into the target. */
export interface SpawnReferenceInput {
  /** The video (seedance) node the new reference feeds into. */
  targetNodeId: string
  /** The source node type to create: `image` / `voice` / `videoReference`. */
  nodeType: NodeWorkflowNodeType
  /** Image role (character / background / shot) — required for `image`, so the
   *  role-less unified image node is stamped with the department the user
   *  added it under. */
  role?: NodeImageRole
  /** The resolved media the new node carries. */
  media: {
    url: string
    /** Backing generation id, when the asset came from the library. */
    generationId?: string
    /** Poster for a video reference (§9). */
    thumbnailUrl?: string
    /** User-facing name / source label (defaults applied downstream). */
    name?: string
  }
}

export interface NodeWorkflowCanvasActions extends NodeWorkflowActions {
  generateCharacterImage?(nodeId: string): Promise<void>
  generateMediaNode?(nodeId: string): Promise<void>
  /**
   * AI-enhance a video (Seedance) node's prompt in place: reads the node's
   * current prompt + upstream references, runs the seedance-prompt-plan
   * planner (assistant's auto LLM route), and writes the orchestrated
   * finalPrompt / motion / camera / duration / timeline back onto the same
   * node. This is the home of the retired Agent node's `seedancePrompt` mode.
   */
  enhanceSeedancePrompt?(nodeId: string): Promise<void>
  focusGeneratedNodes?(): void
  /** Select + fitView to a single node — used by the video composer's
   *  reference token hover preview ("点击定位到画布对应节点", §8.3). */
  focusNode?(nodeId: string): void
  /** Autospawn an upstream reference node from a resolved asset and wire it
   *  into `targetNodeId` (§7.1 部门条 ＋添加位). Creates the node, stamps its
   *  role/media, and connects it — one high-level op so the composer never
   *  touches raw addNode/onConnect. Returns the new node id. */
  spawnReference?(input: SpawnReferenceInput): string
  /**
   * S5c 三.3 融合：a loose canvas image node's media is absorbed into a
   * character/background node's `referenceAssets` (source:'canvas', sourceId
   * = the loose node's id) and the loose node folds hidden
   * (`fusedIntoNodeId`). Rejects (returns false, no mutation) on illegal
   * target / duplicate / capacity-full — same legality vocabulary as the
   * Cast-card ingest engine (`evaluateCastIngest`), reused here for the
   * reverse direction (canvas → dock card).
   */
  fuseLooseImageNode?(sourceNodeId: string, targetNodeId: string): boolean
  /**
   * S5c 三.4 拆出（对称无损）: removes a reference from a character/
   * background node's `referenceAssets`. A `source:'canvas'` entry un-hides
   * its origin loose node in place (clears `fusedIntoNodeId`); any other
   * source (upload/asset/paste) spawns a brand-new loose image node at the
   * canvas viewport center carrying the same url — "拆出 = 落画布" either way.
   */
  extractReference?(nodeId: string, referenceId: string): void
  toolMode: NodeStudioToolMode
  setToolMode(mode: NodeStudioToolMode): void
  /**
   * The node whose ⤢ detail panel is open, or null. Lifted to the workbench
   * so a single shared floating panel renders the one expanded node — nodes
   * (rendered by ReactFlow `nodeTypes`, no props) read/set it through context.
   */
  expandedNodeId: string | null
  setExpandedNodeId(id: string | null): void
  modelOptionsByType: NodeWorkflowModelOptionsByType
  /** Canvas-default video model (two-tier {brand,variant}); new video nodes
   *  inherit it via the autospawn effect. Set from the topbar chip. */
  defaultVideoModel: VideoDefaultModel | undefined
  /** Right-rail workspace UI state, persisted on the project so it survives a
   *  reload. The ScriptDoc workspace reads + writes these through the context. */
  scriptDocStage: ScriptDocStage | undefined
  scriptDocDepth: ScriptDocDepth | undefined
  scriptDocLocks: string[] | undefined
}

const NodeWorkflowActionsContext =
  createContext<NodeWorkflowCanvasActions | null>(null)

interface NodeWorkflowActionsProviderProps {
  value: NodeWorkflowCanvasActions
  children: ReactNode
}

export function NodeWorkflowActionsProvider({
  value,
  children,
}: NodeWorkflowActionsProviderProps) {
  return (
    <NodeWorkflowActionsContext.Provider value={value}>
      {children}
    </NodeWorkflowActionsContext.Provider>
  )
}

export function useNodeWorkflowActions(): NodeWorkflowCanvasActions {
  const context = useContext(NodeWorkflowActionsContext)
  if (!context) {
    throw new Error('NodeWorkflowActionsProvider is missing')
  }

  return context
}
