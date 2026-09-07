'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type OnEdgesChange,
  type OnNodesChange,
  type XYPosition,
} from '@xyflow/react'

import {
  NODE_STUDIO_AGENT_MODE_IDS,
  NODE_STUDIO_EDGE_VISUALS,
  NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS,
  NODE_STUDIO_ID_PREFIXES,
  NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS,
  NODE_STUDIO_LOOSE_IMAGE_DEFAULT_SIZE,
  NODE_STUDIO_NODE_PLACEMENT,
  NODE_STUDIO_VOICE_PROFILE,
  NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS,
} from '@/constants/node-studio'
import {
  NODE_GENERATION_STATUS_IDS,
  NODE_MEDIA_KIND_BY_NODE_TYPE,
  NODE_MEDIA_KIND_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
  NODE_WORKFLOW_FIELD_IDS,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import {
  type CanvasAppearance,
  type NodeWorkflowEdge,
  type NodeWorkflowEdgeData,
  type NodeWorkflowNode,
  type NodeWorkflowNodeData,
  type NodeWorkflowProjectSummary,
  type NodeWorkflowState,
  type NodeWorkflowStateV4,
} from '@/types/node-workflow'
import {
  CanvasDerivedImageOutputsSchema,
  type CanvasDerivedImageOutput,
} from '@/types/canvas-image-edit'
import {} from '@/lib/api-client'
import {
  createWorkflowId,
  getCurrentProject,
  useNodeWorkflowStore,
  type NodeWorkflowReadOnlyReason,
} from '@/hooks/node/use-node-workflow-store'
import {
  projectV4ToV3View,
  writeV3ViewBackToV4,
} from '@/lib/node-workflow-v3-view'
import { applyDagreLayout } from '@/lib/node-workflow-layout'
import {
  projectScriptDocToGraph,
  syncSeedanceDurationPatchToScriptDoc,
  syncShotTextPatchToScriptDoc,
} from '@/lib/node-workflow-script-doc'
import type { ScriptDocDepth, ScriptDocStage } from '@/constants/script-doc'
import type { ScriptDoc } from '@/types/script-doc'

export const EMPTY_NODE_WORKFLOW_STATE: NodeWorkflowState = {
  nodes: [],
  edges: [],
}

export interface UseNodeWorkflowOptions {
  defaultProjectName: string
  /**
   * Clerk user id of the currently signed-in user. Passing `null` (e.g.
   * before Clerk finishes loading, or while signed out) puts the hook into
   * a "parked" state: it serves an empty default project but skips all
   * localStorage reads/writes and all server API calls. The moment a real
   * clerkId arrives, the hook hydrates from that user's scoped slot. This
   * is what stops a previous account's workflow data from leaking into a
   * different sign-in on the same browser.
   */
  clerkId: string | null
}

export interface NodeWorkflowActions {
  updateNodeData(id: string, patch: Partial<NodeWorkflowNodeData>): void
  /**
   * R3-6b §3 每镜覆写: patch an edge's `data` (currently only
   * `stageOverrideUrls` — see `NodeWorkflowEdgeDataSchema`). Mirrors
   * `updateNodeData`'s shallow-merge-and-persist shape; a no-op on an id that
   * doesn't exist. Setting `stageOverrideUrls: undefined` clears the override
   * back to the card's own onStage curation (the panel's "恢复默认" action).
   * Optional so the many existing `NodeWorkflowCanvasActions`-typed test
   * mocks (CharacterImageInspector.test / NodeMediaInspector.test) don't need
   * updating for a capability only the video composer's 管理素材 panel uses.
   */
  updateEdgeData?(id: string, patch: Partial<NodeWorkflowEdgeData>): void
  /**
   * Atomically place one or more non-destructive image edit results. Optional
   * on the shared canvas context until the UI wiring slice adopts the action;
   * the concrete useNodeWorkflow return always provides it.
   */
  placeDerivedImages?(
    sourceNodeId: string,
    outputs: readonly CanvasDerivedImageOutput[],
  ): string[]
  /** Persist the assistant's ScriptDoc fact model on the current project. */
  setScriptDoc(scriptDoc: ScriptDoc | undefined): void
  /** Persist or reset the current project's canvas wallpaper. */
  setCanvasAppearance(value: CanvasAppearance | undefined): void
  /** Persist the right-rail drafting stage / depth / manual-edit locks. */
  setScriptDocStage(value: ScriptDocStage): void
  setScriptDocDepth(value: ScriptDocDepth): void
  setScriptDocLocks(value: string[]): void
  /** 分镜静帧开关 (包 3): whether projecting spawns a still per shot. */
  setScriptDocShotStills(value: boolean): void
  /** Project the current ScriptDoc into character/voice/shot/merge nodes. */
  applyScriptDocToGraph(): ApplyScriptDocResult
  /** B4：同一套计算但不提交 —— 让「确认镜头」之前能看见将建/将更新/**将移除**。 */
  previewScriptDocProjection(): ApplyScriptDocResult
  deleteNode(id: string): void
  deleteEdge(id: string): void
  undo(): void
  redo(): void
  canUndo: boolean
  canRedo: boolean
}

export interface ApplyScriptDocResult {
  /** New nodes spawned this projection. */
  created: number
  /** Existing nodes whose ScriptDoc-owned fields changed. */
  updated: number
  /** Entities that already had a node (idempotent reuse). */
  skipped: number
  /** Nodes removed because their role/shot/line was deleted from the outline. */
  removed: number
  /** ScriptDoc-managed edges removed because the outline changed. */
  removedEdges: number
  refusal: 'noScriptDoc' | 'emptyScriptDoc' | null
}

interface UseNodeWorkflowValue extends NodeWorkflowActions {
  /**
   * B2.5：把一整批写入合并成一个撤销步。见实现处的注释。
   *
   * ⚠ **有意只放在这里，不放进 `NodeWorkflowActions`** —— 那个接口是发给节点卡片
   * 的动作集，卡片不该拿到撤销栈的记账开关。批次的拥有者是 workbench，它直接持有
   * hook 的返回值。
   */
  runAsSingleHistoryStep<T>(run: () => T | Promise<T>): Promise<T>
  /** True only after both local and server hydration finish for this user. */
  isHydrated: boolean
  /**
   * ⚠ v3 引擎与 legacy 画布消费的**投影视图**（③d 翻转后删）。事实在 `stateV4`。
   */
  state: NodeWorkflowState
  /** 存储的事实形状。`NODE_CANVAS_RENDER_V4` 那一支直接渲染它。 */
  stateV4: NodeWorkflowStateV4
  /** v4 组件（`NodeV4Provider`）的写回口 —— 整份替换，走同一个持久化层。 */
  setStateV4(next: NodeWorkflowStateV4): void
  /** 当前项目为什么只读（v3 备份没成功）；`null` = 可写。 */
  readOnlyReason: NodeWorkflowReadOnlyReason | null
  scriptDoc: ScriptDoc | undefined
  canvasAppearance: CanvasAppearance | undefined
  scriptDocStage: ScriptDocStage | undefined
  scriptDocDepth: ScriptDocDepth | undefined
  scriptDocLocks: string[] | undefined
  /** `undefined` = 默认开 (see NodeWorkflowStateDataSchema). */
  scriptDocShotStills: boolean | undefined
  nodes: NodeWorkflowNode[]
  edges: NodeWorkflowEdge[]
  projects: NodeWorkflowProjectSummary[]
  currentProjectId: string
  currentProjectName: string
  addNode(type: NodeWorkflowNodeType, position: XYPosition): string
  placeDerivedImages(
    sourceNodeId: string,
    outputs: readonly CanvasDerivedImageOutput[],
  ): string[]
  updateEdgeData(id: string, patch: Partial<NodeWorkflowEdgeData>): void
  createProject(name: string): string
  switchProject(id: string): void
  renameCurrentProject(name: string): void
  deleteProject(id: string): NodeWorkflowProjectSummary | null
  getOutgoingTargetByType(
    sourceId: string,
    targetType: NodeWorkflowNodeType,
  ): NodeWorkflowNode | null
  onNodesChange: OnNodesChange<NodeWorkflowNode>
  onEdgesChange: OnEdgesChange<NodeWorkflowEdge>
  onConnect(connection: Connection): void
  /**
   * Re-flow nodes via dagre. Pure layout — does not touch node data, edges,
   * or any project metadata, just rewrites positions.
   */
  tidyLayout(): void
  /**
   * Force the current project's state to the server right now, bypassing
   * the 5-second debounce. Resolves true on success, false otherwise so
   * the UI can toast the right message. Safe to call before the server
   * hydrate completes — it will no-op and return false.
   */
  saveNow(): Promise<boolean>
}

export function createDefaultNodeData(
  type: NodeWorkflowNodeType,
): NodeWorkflowNodeData {
  if (type === NODE_TYPE_IDS.composer) {
    return {
      prompt: '',
      status: NODE_STATUS_IDS.idle,
    }
  }

  if (type === NODE_TYPE_IDS.agent) {
    return {
      prompt: '',
      agentMode: NODE_STUDIO_AGENT_MODE_IDS.storyBreakdown,
      status: NODE_STATUS_IDS.idle,
    }
  }

  if (type === NODE_TYPE_IDS.characterImage) {
    return {
      prompt: '',
      status: NODE_STATUS_IDS.idle,
      generationStatus: NODE_GENERATION_STATUS_IDS.idle,
      imageMode: NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.choice,
      referenceAssets: [],
      loras: [],
    }
  }

  if (
    type === NODE_TYPE_IDS.shot ||
    type === NODE_TYPE_IDS.backgroundImage ||
    type === NODE_TYPE_IDS.frameImage
  ) {
    return {
      prompt: '',
      status: NODE_STATUS_IDS.idle,
      generationStatus: NODE_GENERATION_STATUS_IDS.idle,
      imageMode: NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.choice,
      mediaKind: NODE_MEDIA_KIND_IDS.image,
      referenceAssets: [],
      loras: [],
      [NODE_WORKFLOW_FIELD_IDS.action]: '',
      [NODE_WORKFLOW_FIELD_IDS.camera]: '',
      [NODE_WORKFLOW_FIELD_IDS.composition]: '',
      [NODE_WORKFLOW_FIELD_IDS.frameIntent]: '',
      [NODE_WORKFLOW_FIELD_IDS.lighting]: '',
      [NODE_WORKFLOW_FIELD_IDS.location]: '',
      [NODE_WORKFLOW_FIELD_IDS.mood]: '',
    }
  }

  if (type === NODE_TYPE_IDS.seedance) {
    return {
      prompt: '',
      status: NODE_STATUS_IDS.idle,
      generationStatus: NODE_GENERATION_STATUS_IDS.idle,
      mediaKind: NODE_MEDIA_KIND_IDS.video,
      [NODE_WORKFLOW_FIELD_IDS.audioIntent]: '',
      [NODE_WORKFLOW_FIELD_IDS.camera]: '',
      [NODE_WORKFLOW_FIELD_IDS.duration]: '',
      [NODE_WORKFLOW_FIELD_IDS.motion]: '',
    }
  }

  if (type === NODE_TYPE_IDS.voice) {
    return {
      prompt: '',
      status: NODE_STATUS_IDS.idle,
      generationStatus: NODE_GENERATION_STATUS_IDS.idle,
      mediaKind: NODE_MEDIA_KIND_IDS.audio,
      voiceSource: NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.manual,
      [NODE_WORKFLOW_FIELD_IDS.voiceId]: '',
      [NODE_WORKFLOW_FIELD_IDS.voiceName]: '',
      [NODE_WORKFLOW_FIELD_IDS.voiceProvider]:
        NODE_STUDIO_VOICE_PROFILE.providerDefault,
      [NODE_WORKFLOW_FIELD_IDS.voiceEmotion]: '',
      [NODE_WORKFLOW_FIELD_IDS.voiceStyle]: '',
    }
  }

  if (type === NODE_TYPE_IDS.videoReference) {
    return {
      prompt: '',
      status: NODE_STATUS_IDS.idle,
      mediaKind: NODE_MEDIA_KIND_IDS.video,
    }
  }

  if (type === NODE_TYPE_IDS.videoMerge) {
    return {
      prompt: '',
      status: NODE_STATUS_IDS.idle,
      generationStatus: NODE_GENERATION_STATUS_IDS.idle,
      mediaKind: NODE_MEDIA_KIND_IDS.video,
    }
  }

  if (type === NODE_TYPE_IDS.shotText) {
    return {
      prompt: '',
      status: NODE_STATUS_IDS.idle,
      mediaKind: NODE_MEDIA_KIND_IDS.text,
      [NODE_WORKFLOW_FIELD_IDS.action]: '',
      [NODE_WORKFLOW_FIELD_IDS.camera]: '',
      [NODE_WORKFLOW_FIELD_IDS.composition]: '',
      [NODE_WORKFLOW_FIELD_IDS.scene]: '',
    }
  }

  return {
    prompt: '',
    status: NODE_STATUS_IDS.idle,
  }
}

export function useNodeWorkflow({
  defaultProjectName,
  clerkId,
}: UseNodeWorkflowOptions): UseNodeWorkflowValue {
  const store = useNodeWorkflowStore({ defaultProjectName, clerkId })
  const { commitCurrentProjectState: commitV4, originV3Ref, storageRef } = store

  /**
   * ── v3 投影视图（③d 翻转后整段删）──────────────────────────────────────
   * 事实是 store 里那份 v4；v3 图引擎（本文件其余部分）与 `NODE_COMPONENTS` 消费
   * 的是它的投影。⚠ 投影**只在 v4 从外部换掉时**重算（水化 / 切项目 / 撤销以外的
   * 路径）；引擎自己的每一次改动直接把算好的 v3 结果留下，⛔ 不重投影——重投影会
   * 让 v4 没有落点的残留字段（`scriptRef` / `referenceAssets`）每敲一个字丢一次。
   */
  const v3ViewRef = useRef<NodeWorkflowState>(EMPTY_NODE_WORKFLOW_STATE)
  const projectedFrom = useRef<{
    projectId: string | null
    stateV4: NodeWorkflowStateV4 | null
  }>({ projectId: null, stateV4: null })
  const [v3View, setV3View] = useState<NodeWorkflowState>(
    EMPTY_NODE_WORKFLOW_STATE,
  )
  if (
    projectedFrom.current.stateV4 !== store.state ||
    projectedFrom.current.projectId !== store.currentProject.id
  ) {
    const sameProject =
      projectedFrom.current.projectId === store.currentProject.id
    const previous = sameProject
      ? v3ViewRef.current
      : originV3Ref.current.get(store.currentProject.id)
    const projected = projectV4ToV3View(store.state, previous)
    projectedFrom.current = {
      projectId: store.currentProject.id,
      stateV4: store.state,
    }
    v3ViewRef.current = projected
    // 渲染期同步（React 官方的「派生 state」写法），⛔ 不放 effect 里：放 effect
    // 里画布会先闪一帧空图。
    setV3View(projected)
  }

  /**
   * ⚠ **唯一写入口**：v3 引擎的改动在这里折回 v4。
   *
   * ⛔ 不重跑 `migrateNodeWorkflowStateToV4`（它会重算稳定名 / 镜号 / createdAt，
   * 等于每敲一个字把 `@` 提及指向的节点洗一遍）——`writeV3ViewBackToV4` 以 v4 那份
   * 为底逐字段覆盖，只有**新增**的节点才现造。
   */
  /**
   * 「当前项目的 v3 视图」的同步取值。⚠ 必须读 `storageRef`（同步真值）而不是
   * 渲染期的 `store.state`：同一个 act 批次里 `createProject` + `addNode` 会在
   * React 还没重渲染时先后发生，读渲染期的那份等于把新节点写进**上一个项目**。
   */
  const readV3View = useCallback(() => {
    const snapshot = storageRef.current
    const project = getCurrentProject(snapshot, defaultProjectName)
    if (
      projectedFrom.current.projectId === project.id &&
      projectedFrom.current.stateV4 === project.state
    ) {
      return v3ViewRef.current
    }
    const sameProject = projectedFrom.current.projectId === project.id
    const previous = sameProject
      ? v3ViewRef.current
      : originV3Ref.current.get(project.id)
    const projected = projectV4ToV3View(project.state, previous)
    projectedFrom.current = { projectId: project.id, stateV4: project.state }
    v3ViewRef.current = projected
    return projected
  }, [defaultProjectName, originV3Ref, storageRef])

  /**
   * ⚠ **唯一写入口**：v3 引擎的改动在这里折回 v4。
   *
   * ⛔ 不重跑 `migrateNodeWorkflowStateToV4`（它会重算稳定名 / 镜号 / createdAt，
   * 等于每敲一个字把 `@` 提及指向的节点洗一遍）——`writeV3ViewBackToV4` 以 v4 那份
   * 为底逐字段覆盖，只有**新增**的节点才现造。
   */
  const commitV3State = useCallback(
    (updater: (currentState: NodeWorkflowState) => NodeWorkflowState) => {
      const next = updater(readV3View())
      v3ViewRef.current = next
      const nextV4 = commitV4((currentV4) =>
        writeV3ViewBackToV4(next, currentV4),
      )
      projectedFrom.current = {
        projectId: storageRef.current.currentProjectId,
        stateV4: nextV4,
      }
      setV3View(next)
    },
    [commitV4, readV3View, storageRef],
  )

  const workflowHistory = useRef<{
    past: NodeWorkflowState[]
    future: NodeWorkflowState[]
  }>({
    past: [],
    future: [],
  })
  const historyProjectId = useRef<string | null>(null)
  const isRestoringHistory = useRef(false)
  /**
   * B2.5：一批写入正在进行中，撤销栈只在批次开头记一次账。
   *
   * ⚠ 实测出来的问题（2026-08-08）：助手
   * 应用「3 项」后按撤销是 3→2→1→0，**一次只退一个节点**。根因是批次里每个
   * `add_node` 都各自走一遍 `commitCurrentProjectState`，而去重只比引用相等
   * （`storageRef.current` 同步更新，所以同一 tick 的连续调用不会被折叠）。
   *
   * 剧本投影（`applyScriptDocToGraph`）没有这个问题 —— 它先算完再一次性提交。
   * ops 那条路做不到「先算完」（建节点要先拿到真 id 才能连线），所以改用这个开关。
   */
  const historySuppressed = useRef(false)
  const [historyAvailability, setHistoryAvailability] = useState({
    canUndo: false,
    canRedo: false,
  })

  const publishHistoryAvailability = useCallback(() => {
    setHistoryAvailability({
      canUndo: workflowHistory.current.past.length > 0,
      canRedo: workflowHistory.current.future.length > 0,
    })
  }, [])

  const recordCurrentProjectHistory = useCallback(() => {
    // B2.5：批次进行中 —— 开头已经记过一次账，批内其余写入不再各记一笔。
    if (historySuppressed.current) return

    const currentProjectId = storageRef.current.currentProjectId
    if (historyProjectId.current !== currentProjectId) {
      historyProjectId.current = currentProjectId
      workflowHistory.current = {
        past: [],
        future: [],
      }
      publishHistoryAvailability()
    }

    // 撤销栈存的是 **v3 视图**：栈里那份原样交回 `commitV3State`，与用户当时
    // 看到的图逐字段相同。⚠ 撤销一次删除会让被删节点的 v4 独有字段（槽绑定 /
    // sourceRef）重新按迁移生成——③d 之后撤销栈直接存 v4，这一条随之消失。
    const previousState = v3ViewRef.current
    const lastState =
      workflowHistory.current.past[workflowHistory.current.past.length - 1]
    if (lastState === previousState) {
      return
    }

    workflowHistory.current = {
      past: [...workflowHistory.current.past.slice(-49), previousState],
      future: [],
    }
    publishHistoryAvailability()
  }, [publishHistoryAvailability, storageRef])

  const currentProject = store.currentProject
  const state = v3View
  const isHydrated = store.isHydrated
  const projects = store.projects

  useEffect(() => {
    if (historyProjectId.current === currentProject.id) {
      return
    }

    historyProjectId.current = currentProject.id
    workflowHistory.current = {
      past: [],
      future: [],
    }
    publishHistoryAvailability()
  }, [currentProject.id, publishHistoryAvailability])

  const commitCurrentProjectState = useCallback(
    (updater: (currentState: NodeWorkflowState) => NodeWorkflowState) => {
      recordCurrentProjectHistory()
      commitV3State(updater)
    },
    [commitV3State, recordCurrentProjectHistory],
  )

  /**
   * B2.5：把 `run` 里的所有写入合并成**一个**撤销步。
   *
   * 用法是包住一整批高层动作（建节点 / 连线 / 改名…），而不是包住某一次
   * `commitCurrentProjectState` —— 批内那些动作各自调什么、调几次，调用方不需要知道。
   *
   * ⚠ **有意跨 await 保持开着**：一批 op 是一次用户决定，中间的异步步骤不该把它
   * 劈成两个撤销步。批次进行时 UI 的按钮是禁用的（`structuralRunning`），所以
   * 「批次期间用户又手动改了画布」这种并发在实际路径上够不到。
   *
   * 嵌套时内层直接透传：外层已经记过账，内层再记一次就又变成两步了。
   */
  const runAsSingleHistoryStep = useCallback(
    async <T>(run: () => T | Promise<T>): Promise<T> => {
      if (historySuppressed.current) return run()
      recordCurrentProjectHistory()
      historySuppressed.current = true
      try {
        return await run()
      } finally {
        historySuppressed.current = false
      }
    },
    [recordCurrentProjectHistory],
  )

  const addNode = useCallback(
    (type: NodeWorkflowNodeType, position: XYPosition) => {
      const nodeId = createWorkflowId(NODE_STUDIO_ID_PREFIXES.node)
      // Resizable card shells need an explicit RF size at creation so a
      // freshly-added node renders at a real size before anything is
      // measured. videoReference still owns a corner NodeResizer, so it
      // still needs this. `image` no longer does — S4（2026-07-27，
      // canvas-image-card.md §2「不提供拖拽把手」）retired LooseImageCard's
      // NodeResizer in favor of an aspect-ratio-derived, clamped size that
      // the card computes itself and applies as its own inline style;
      // leaving an explicit pinned width/height here would fight that (RF
      // applies `node.width`/`height` as a literal CSS size on the node
      // wrapper whenever they're set, which would clip/stretch the card's
      // own aspect-correct box). `image` now falls into the same
      // "role-stamped cards keep measuring from content" bucket as
      // composer/agent/voice/collector.
      const needsExplicitSize = type === NODE_TYPE_IDS.videoReference
      const nextNode: NodeWorkflowNode = {
        id: nodeId,
        type,
        position,
        data: createDefaultNodeData(type),
        ...(needsExplicitSize
          ? {
              width: NODE_STUDIO_LOOSE_IMAGE_DEFAULT_SIZE,
              height: NODE_STUDIO_LOOSE_IMAGE_DEFAULT_SIZE,
            }
          : {}),
      }

      commitCurrentProjectState((currentState) => ({
        ...currentState,
        nodes: [...currentState.nodes, nextNode],
      }))

      return nodeId
    },
    [commitCurrentProjectState],
  )

  const placeDerivedImages = useCallback(
    (
      sourceNodeId: string,
      outputs: readonly CanvasDerivedImageOutput[],
    ): string[] => {
      const parsedOutputs = CanvasDerivedImageOutputsSchema.safeParse(outputs)
      if (!parsedOutputs.success) {
        return []
      }

      const currentState = v3ViewRef.current
      const sourceNode = currentState.nodes.find(
        (node) => node.id === sourceNodeId,
      )
      const sourceImageUrl =
        sourceNode?.data.mediaUrl ?? sourceNode?.data.imageUrl
      // Prefer explicit mediaKind; fall back to type map; finally infer image
      // when a remote media URL is present (role-stamped `image` nodes often
      // omit mediaKind after createDefaultNodeData).
      const sourceMediaKind = sourceNode
        ? (sourceNode.data.mediaKind ??
          NODE_MEDIA_KIND_BY_NODE_TYPE[sourceNode.type] ??
          (sourceImageUrl?.trim() ? NODE_MEDIA_KIND_IDS.image : undefined))
        : undefined

      if (
        !sourceNode ||
        sourceMediaKind !== NODE_MEDIA_KIND_IDS.image ||
        !sourceImageUrl?.trim()
      ) {
        return []
      }

      const derivedFromGenerationId =
        sourceNode.data.generationId ?? sourceNode.data.sourceGenerationId
      const placement = NODE_STUDIO_NODE_PLACEMENT.derivedImage
      const nextNodes = parsedOutputs.data.map((output, index) => {
        const nodeId = createWorkflowId(NODE_STUDIO_ID_PREFIXES.node)
        const column = index % placement.columns
        const row = Math.floor(index / placement.columns)
        const nextData: NodeWorkflowNodeData = {
          ...createDefaultNodeData(NODE_TYPE_IDS.image),
          imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.generated,
          mediaKind: NODE_MEDIA_KIND_IDS.image,
          mediaUrl: output.imageUrl,
          generationStatus: NODE_GENERATION_STATUS_IDS.success,
          status: NODE_STATUS_IDS.done,
          derivedFromNodeId: sourceNode.id,
          editCapability: output.editCapability,
          ...(output.width === undefined ? {} : { mediaWidth: output.width }),
          ...(output.height === undefined
            ? {}
            : { mediaHeight: output.height }),
          ...(output.generationId ? { generationId: output.generationId } : {}),
          ...(output.sourceGenerationId
            ? { derivedFromGenerationId: output.sourceGenerationId }
            : {}),
          ...(output.label
            ? { mediaLabel: output.label, sourceLabel: output.label }
            : {}),
          ...(derivedFromGenerationId && !output.sourceGenerationId
            ? { derivedFromGenerationId }
            : {}),
        }

        return {
          id: nodeId,
          type: NODE_TYPE_IDS.image,
          position: {
            x:
              sourceNode.position.x +
              placement.offsetX +
              column * placement.columnOffsetX,
            y: sourceNode.position.y + row * placement.rowOffsetY,
          },
          // S4（2026-07-27）：不再钉死初始 320×320——LooseImageCard 自己按
          // output.width/height（下面写进 data.mediaWidth/Height）算出正确的
          // 钳制尺寸并测量渲染，钉一个假方形反而会在它自己的尺寸生效前抢跑
          // 一帧。见 addNode 里 needsExplicitSize 的同一条注释。
          data: nextData,
        } satisfies NodeWorkflowNode
      })

      commitCurrentProjectState((latestState) => ({
        ...latestState,
        nodes: [...latestState.nodes, ...nextNodes],
      }))

      return nextNodes.map((node) => node.id)
    },
    [commitCurrentProjectState],
  )

  const createProject = store.createProject
  const switchProject = store.switchProject
  const renameCurrentProject = store.renameCurrentProject
  const deleteProject = store.deleteProject

  const updateNodeData = useCallback(
    (id: string, patch: Partial<NodeWorkflowNodeData>) => {
      commitV3State((currentState) => {
        const nodes = currentState.nodes.map((node) =>
          node.id === id
            ? {
                ...node,
                data: {
                  ...node.data,
                  ...patch,
                },
              }
            : node,
        )
        // owner 2026-08-02：「助手这边只是自动生成，不用助手则用户手动
        // 输入然后生成 —— 是一种东西」。所以镜头文本不是「助手的产物」，
        // 是「一镜的文字定义」，助手只是填它的一种方式。
        //
        // 由此：投影出来的 shotText 节点（带 scriptRef）在节点上被编辑时
        // 必须回写 ScriptDoc，否则下一次投影会把用户的修改覆盖掉 —— 那
        // 不是「保护剧本」，只是两份数据没对齐。手工添加的节点没有
        // scriptRef（见 NodeWorkflowNodeDataSchema 该字段注释），本来就
        // 不受投影管辖，这里也自然跳过。
        //
        // ⚠ 落点选在这里而不是各个编辑组件里：`scriptDoc` 与 `nodes` 同在
        // 一个 state 对象上，这一次 setState 就能把两者原子更新，且以后
        // 任何新增的编辑入口都自动一致，不必各自记得回写。
        // 画布对齐三梁 · 梁1：镜头时长同一套道理——seedance 节点上的
        // duration 是「一镜的显式时长」的另一个入口，编辑后必须回写
        // ScriptDoc，否则下一次投影会把它覆盖掉。链在同一次 setState里，
        // 两个 sync 函数各自只认自己的节点类型（shotText / seedance），
        // 互不干扰，串行调用等价于同时生效。
        const scriptDoc = syncSeedanceDurationPatchToScriptDoc(
          syncShotTextPatchToScriptDoc(
            currentState.scriptDoc,
            currentState.nodes.find((node) => node.id === id),
            patch,
          ),
          currentState.nodes.find((node) => node.id === id),
          patch,
        )
        return scriptDoc === currentState.scriptDoc
          ? { ...currentState, nodes }
          : { ...currentState, nodes, scriptDoc }
      })
    },
    [commitV3State],
  )

  // R3-6b §3 每镜覆写: shallow-merges `patch` into the edge's `data`, same
  // "no history entry" treatment as `updateNodeData` (a checkbox toggle
  // shouldn't spam the undo stack any more than typing in a prompt field
  // does — structural ops like onConnect/deleteEdge still go through
  // `commitCurrentProjectState`, which DOES record history).
  const updateEdgeData = useCallback(
    (id: string, patch: Partial<NodeWorkflowEdgeData>) => {
      commitV3State((currentState) => ({
        ...currentState,
        edges: currentState.edges.map((edge) =>
          edge.id === id
            ? {
                ...edge,
                data: {
                  ...edge.data,
                  ...patch,
                },
              }
            : edge,
        ),
      }))
    },
    [commitV3State],
  )

  const deleteNode = useCallback(
    (id: string) => {
      commitCurrentProjectState((currentState) => ({
        ...currentState,
        nodes: currentState.nodes.filter((node) => node.id !== id),
        edges: currentState.edges.filter(
          (edge) => edge.source !== id && edge.target !== id,
        ),
      }))
    },
    [commitCurrentProjectState],
  )

  const deleteEdge = useCallback(
    (id: string) => {
      const currentState = v3ViewRef.current
      if (!currentState.edges.some((edge) => edge.id === id)) {
        return
      }

      commitCurrentProjectState((latestState) => ({
        ...latestState,
        edges: latestState.edges.filter((edge) => edge.id !== id),
      }))
    },
    [commitCurrentProjectState],
  )

  const setScriptDoc = useCallback(
    (scriptDoc: ScriptDoc | undefined) => {
      commitV3State((currentState) => ({
        ...currentState,
        scriptDoc,
      }))
    },
    [commitV3State],
  )

  const setCanvasAppearance = useCallback(
    (value: CanvasAppearance | undefined) => {
      commitV3State((currentState) => ({
        ...currentState,
        canvasAppearance: value,
      }))
    },
    [commitV3State],
  )

  const setScriptDocStage = useCallback(
    (value: ScriptDocStage) => {
      commitV3State((currentState) => ({
        ...currentState,
        scriptDocStage: value,
      }))
    },
    [commitV3State],
  )

  const setScriptDocDepth = useCallback(
    (value: ScriptDocDepth) => {
      commitV3State((currentState) => ({
        ...currentState,
        scriptDocDepth: value,
      }))
    },
    [commitV3State],
  )

  const setScriptDocLocks = useCallback(
    (value: string[]) => {
      commitV3State((currentState) => ({
        ...currentState,
        scriptDocLocks: value,
      }))
    },
    [commitV3State],
  )

  const setScriptDocShotStills = useCallback(
    (value: boolean) => {
      commitV3State((currentState) => ({
        ...currentState,
        scriptDocShotStills: value,
      }))
    },
    [commitV3State],
  )

  /**
   * B4：**投影会删节点** —— 它拥有的节点（带 `scriptRef`）在对应的角色/镜头/台词
   * 被从剧本里删掉后就成了孤儿，投影会一并移除。改之前用户只能从事后那个 toast
   * 里读到「移除 N 个」，事前看不见。
   *
   * 这里跑与 `applyScriptDocToGraph` 完全相同的计算但**不提交**，让工作区能在按下
   * 之前把「将建 / 将更新 / 将移除」摆出来。
   *
   * ⚠ 预览与随后的实投是**两次独立计算**（`makeId` 每次生成新 id）。计数因此只对
   * 「预览那一刻的图」成立 —— 确认是紧接着的一下，中间没有别的写入路径，所以够用；
   * 但别把预览结果缓存起来当成实投的结果用。
   */
  const previewScriptDocProjection = useCallback((): ApplyScriptDocResult => {
    const currentState = v3ViewRef.current
    const scriptDoc = currentState.scriptDoc
    if (!scriptDoc) {
      return {
        created: 0,
        updated: 0,
        skipped: 0,
        removed: 0,
        removedEdges: 0,
        refusal: 'noScriptDoc',
      }
    }
    if (scriptDoc.roles.length === 0 && scriptDoc.shots.length === 0) {
      return {
        created: 0,
        updated: 0,
        skipped: 0,
        removed: 0,
        removedEdges: 0,
        refusal: 'emptyScriptDoc',
      }
    }

    const result = projectScriptDocToGraph(scriptDoc, currentState, {
      makeId: createWorkflowId,
      anchor: NODE_STUDIO_NODE_PLACEMENT.scriptDocSpawn.origin,
      shotStills: currentState.scriptDocShotStills,
    })

    return {
      created: result.nodesToAdd.length,
      updated: result.nodesToUpdate.length,
      skipped: result.skipped,
      removed: result.nodesToRemove.length,
      removedEdges: result.edgesToRemove.length,
      refusal: null,
    }
  }, [])

  /**
   * Project the current project's ScriptDoc into the graph. Reads the latest
   * state off `storageRef` (never a stale closure), runs the pure idempotent
   * projection, and appends only genuinely new nodes/edges inside a single
   * `patchCurrentProjectState`. Re-running with the same doc is a no-op.
   */
  const applyScriptDocToGraph = useCallback((): ApplyScriptDocResult => {
    const currentState = v3ViewRef.current
    const scriptDoc = currentState.scriptDoc
    if (!scriptDoc) {
      return {
        created: 0,
        updated: 0,
        skipped: 0,
        removed: 0,
        removedEdges: 0,
        refusal: 'noScriptDoc',
      }
    }
    if (scriptDoc.roles.length === 0 && scriptDoc.shots.length === 0) {
      return {
        created: 0,
        updated: 0,
        skipped: 0,
        removed: 0,
        removedEdges: 0,
        refusal: 'emptyScriptDoc',
      }
    }

    const result = projectScriptDocToGraph(scriptDoc, currentState, {
      makeId: createWorkflowId,
      anchor: NODE_STUDIO_NODE_PLACEMENT.scriptDocSpawn.origin,
      // Absent on every project that predates the toggle → 默认开.
      shotStills: currentState.scriptDocShotStills,
    })

    if (
      result.nodesToAdd.length === 0 &&
      result.nodesToUpdate.length === 0 &&
      result.nodesToRemove.length === 0 &&
      result.edgesToAdd.length === 0 &&
      result.edgesToRemove.length === 0
    ) {
      return {
        created: 0,
        updated: 0,
        skipped: result.skipped,
        removed: 0,
        removedEdges: 0,
        refusal: null,
      }
    }

    commitCurrentProjectState((latestState) => {
      const updatesById = new Map(
        result.nodesToUpdate.map((update) => [update.id, update.data]),
      )
      const removeEdgeIds = new Set(result.edgesToRemove.map((edge) => edge.id))
      const removeNodeIds = new Set(result.nodesToRemove.map((node) => node.id))

      return {
        ...latestState,
        nodes: [
          ...latestState.nodes
            .filter((node) => !removeNodeIds.has(node.id))
            .map((node) => {
              const patch = updatesById.get(node.id)
              if (!patch) return node
              return {
                ...node,
                data: {
                  ...node.data,
                  ...patch,
                },
              }
            }),
          ...result.nodesToAdd,
        ],
        edges: [
          ...latestState.edges.filter((edge) => !removeEdgeIds.has(edge.id)),
          ...result.edgesToAdd,
        ],
      }
    })

    return {
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      removed: result.removed,
      removedEdges: result.removedEdges,
      refusal: null,
    }
  }, [commitCurrentProjectState])

  const getOutgoingTargetByType = useCallback(
    (sourceId: string, targetType: NodeWorkflowNodeType) => {
      const currentState = v3ViewRef.current
      for (const edge of currentState.edges) {
        if (edge.source !== sourceId) {
          continue
        }

        const targetNode = currentState.nodes.find(
          (node) => node.id === edge.target && node.type === targetType,
        )

        if (targetNode) {
          return targetNode
        }
      }

      return null
    },
    [],
  )

  const onNodesChange = useCallback<OnNodesChange<NodeWorkflowNode>>(
    (changes) => {
      const shouldRecordHistory = changes.some(
        (change) => change.type !== 'select' && change.type !== 'dimensions',
      )
      if (shouldRecordHistory && !isRestoringHistory.current) {
        recordCurrentProjectHistory()
      }

      commitV3State((currentState) => ({
        ...currentState,
        nodes: applyNodeChanges(changes, currentState.nodes),
      }))
    },
    [recordCurrentProjectHistory, commitV3State],
  )

  const onEdgesChange = useCallback<OnEdgesChange<NodeWorkflowEdge>>(
    (changes) => {
      const shouldRecordHistory = changes.some(
        (change) => change.type !== 'select',
      )
      if (shouldRecordHistory && !isRestoringHistory.current) {
        recordCurrentProjectHistory()
      }

      commitV3State((currentState) => ({
        ...currentState,
        edges: applyEdgeChanges(changes, currentState.edges),
      }))
    },
    [recordCurrentProjectHistory, commitV3State],
  )

  const saveNow = store.saveNow
  const setStateV4 = useCallback(
    (next: NodeWorkflowStateV4) => {
      commitV4(() => next)
    },
    [commitV4],
  )

  const tidyLayout = useCallback(() => {
    commitCurrentProjectState((currentState) => ({
      ...currentState,
      nodes: applyDagreLayout(currentState.nodes, currentState.edges),
    }))
  }, [commitCurrentProjectState])

  const onConnect = useCallback(
    (connection: Connection) => {
      const edgeId = createWorkflowId(NODE_STUDIO_ID_PREFIXES.edge)
      commitCurrentProjectState((currentState) => ({
        ...currentState,
        edges: addEdge(
          {
            ...connection,
            id: edgeId,
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
          },
          currentState.edges,
        ),
      }))
    },
    [commitCurrentProjectState],
  )

  const undo = useCallback(() => {
    const previousState =
      workflowHistory.current.past[workflowHistory.current.past.length - 1]
    if (!previousState) {
      return
    }

    const currentState = v3ViewRef.current
    workflowHistory.current = {
      past: workflowHistory.current.past.slice(0, -1),
      future: [currentState, ...workflowHistory.current.future.slice(0, 49)],
    }
    isRestoringHistory.current = true
    publishHistoryAvailability()
    commitV3State(() => previousState)
    window.setTimeout(() => {
      isRestoringHistory.current = false
    }, 300)
  }, [publishHistoryAvailability, commitV3State])

  const redo = useCallback(() => {
    const [nextState, ...remainingFuture] = workflowHistory.current.future
    if (!nextState) {
      return
    }

    const currentState = v3ViewRef.current
    workflowHistory.current = {
      past: [...workflowHistory.current.past.slice(-49), currentState],
      future: remainingFuture,
    }
    isRestoringHistory.current = true
    publishHistoryAvailability()
    commitV3State(() => nextState)
    window.setTimeout(() => {
      isRestoringHistory.current = false
    }, 300)
  }, [publishHistoryAvailability, commitV3State])

  return useMemo(
    () => ({
      isHydrated,
      state,
      stateV4: store.state,
      setStateV4,
      readOnlyReason: store.readOnlyReason,
      scriptDoc: state.scriptDoc,
      canvasAppearance: state.canvasAppearance,
      scriptDocStage: state.scriptDocStage,
      scriptDocDepth: state.scriptDocDepth,
      scriptDocLocks: state.scriptDocLocks,
      scriptDocShotStills: state.scriptDocShotStills,
      nodes: state.nodes,
      edges: state.edges,
      projects,
      currentProjectId: currentProject.id,
      currentProjectName: currentProject.name,
      addNode,
      placeDerivedImages,
      createProject,
      switchProject,
      renameCurrentProject,
      deleteProject,
      updateNodeData,
      updateEdgeData,
      setScriptDoc,
      setCanvasAppearance,
      setScriptDocStage,
      setScriptDocDepth,
      setScriptDocLocks,
      setScriptDocShotStills,
      applyScriptDocToGraph,
      previewScriptDocProjection,
      deleteNode,
      deleteEdge,
      undo,
      redo,
      canUndo: historyAvailability.canUndo,
      canRedo: historyAvailability.canRedo,
      runAsSingleHistoryStep,
      getOutgoingTargetByType,
      onNodesChange,
      onEdgesChange,
      onConnect,
      tidyLayout,
      saveNow,
    }),
    [
      addNode,
      applyScriptDocToGraph,
      createProject,
      currentProject.id,
      currentProject.name,
      deleteEdge,
      deleteNode,
      deleteProject,
      getOutgoingTargetByType,
      historyAvailability.canRedo,
      historyAvailability.canUndo,
      isHydrated,
      onConnect,
      onEdgesChange,
      onNodesChange,
      placeDerivedImages,
      previewScriptDocProjection,
      runAsSingleHistoryStep,
      projects,
      setStateV4,
      store.readOnlyReason,
      store.state,
      redo,
      renameCurrentProject,
      saveNow,
      setScriptDoc,
      setCanvasAppearance,
      setScriptDocStage,
      setScriptDocDepth,
      setScriptDocLocks,
      setScriptDocShotStills,
      state,
      switchProject,
      tidyLayout,
      undo,
      updateEdgeData,
      updateNodeData,
    ],
  )
}
