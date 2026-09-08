'use client'

/**
 * **v4 原生 workbench**（第三期 · 画布 C3c-③d-3「写好不接」）。
 *
 * ⛔ 生产调用方为 0 —— 页面入口仍指向 `StudioNodeWorkbench`。接线是 ③d-4：
 * 把 `src/app/[locale]/(main)/studio/node/page.tsx` 换成本组件，同批删
 * `StudioNodeWorkbench.tsx` / `use-node-workflow.ts` / `node-workflow-v3-view.ts`
 * / `NodeV4ActionsV3Adapter.tsx` / `NodeWorkflowActionsContext.tsx`。
 *
 * ── 分层（顺序有意义，⛔ 别调）──────────────────────────────────────────
 *   ReactFlowProvider          ← store 在最外，卡匣 / 定位器 `useNodes()` 才读得到
 *     NodeCanvasActionsProvider ← **动作出口**，包住所有 dock（③b 的 13 个外壳）
 *       CanvasWorkspaceLayout   ← 画布 / 助手的几何唯一所有者
 *         IngestDragProviderV4  ← 拖投的 ghost 与落点候选
 *           NodeV4Provider      ← 卡片契约（读整图），消费**同一份**图引擎
 *             CanvasV4          ← ReactFlow 本体
 *
 * ⚠ 动作出口在 RF **外面**：卡匣、剧本工作区、助手 dock 都在画布之外，它们要的
 * 从来只是「发一条动作」，不是「读整张图」（见 `NodeV4ActionsBridge` 头注）。
 *
 * ── 状态住在哪 ──────────────────────────────────────────────────────────
 * · 项目从哪来往哪去 → `useNodeWorkflowStore`（**复用**，一行没改）
 * · 图语义 + 撤销栈 + 展开态 + 剪贴板 → `useNodeGraphV4`（唯一一份）
 * · 选中 / measured → 图引擎里的 RF 渲染层（受控模式的坑写在那儿）
 */

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { ReactFlowProvider, useReactFlow, type XYPosition } from '@xyflow/react'
import { useAuth } from '@clerk/nextjs'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  CANVAS_LEFT_PANEL_VIEW_IDS,
  type CanvasLeftPanelView,
} from '../CanvasLeftPanel'
import {
  NODE_STUDIO_CANVAS,
  NODE_STUDIO_DOCK,
  NODE_STUDIO_TOOL_MODE_IDS,
  type NodeStudioToolMode,
} from '@/constants/node-studio'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
  type NodeWorkflowMediaKind,
} from '@/constants/node-types'
import { NODE_SLOT_IDS } from '@/constants/node-slots'
import { DEFAULT_LOCALE, isAppLocale } from '@/i18n/routing'
import { useIsMobile } from '@/hooks/use-mobile'
import { useWorkflowModelOptions } from '@/hooks/use-workflow-model-options'
import { useNodeGraphV4 } from '@/hooks/node/use-node-graph-v4'
import { useNodeMediaGenerationV4 } from '@/hooks/node/use-node-media-generation-v4'
import { useNodeReviewMode } from '@/hooks/node/use-node-review-mode'
import { useNodeWorkflowStore } from '@/hooks/node/use-node-workflow-store'
import type {
  CanvasAppearance,
  NodeWorkflowEdge,
  NodeWorkflowNode,
  NodeWorkflowStateV4,
} from '@/types/node-workflow'
import type { ScriptDoc } from '@/types/script-doc'

import { CanvasWorkspaceLayout } from '../CanvasWorkspaceLayout'
import { CanvasProjectPanel } from '../CanvasProjectPanel'
import { NodeCanvasEmptyGuide } from '../NodeCanvasEmptyGuide'
import { IngestDragProviderV4 } from '../IngestDragLayerV4'
import {
  NodeCanvasActionsProvider,
  type NodeCanvasActions,
} from '../nodes/v4/NodeV4ActionsBridge'
import { NodeV4Provider } from '../nodes/v4/NodeV4Provider'
import { CanvasV4 } from './CanvasV4'
import { WorkbenchAssistantDockV4, WorkbenchDocksV4 } from './WorkbenchDocksV4'
import { useWorkbenchDndV4 } from './WorkbenchDndV4'
import { useWorkbenchShortcutsV4 } from './WorkbenchShortcutsV4'
import { WorkbenchToolbarV4 } from './WorkbenchToolbarV4'

export function NodeWorkbenchV4() {
  return (
    <ReactFlowProvider>
      <NodeWorkbenchV4Inner />
    </ReactFlowProvider>
  )
}

function NodeWorkbenchV4Inner() {
  const t = useTranslations('StudioNode')
  const tV4 = useTranslations('StudioNode.v4')
  const locale = useLocale()
  const appLocale = isAppLocale(locale) ? locale : DEFAULT_LOCALE
  const isMobile = useIsMobile()

  // Clerk userId 给 store 划分本地槽与服务端调用；未加载时传 null = 停在空态，
  // ⛔ 不泄漏上一个账号的快照。
  const { isLoaded, userId } = useAuth()
  const store = useNodeWorkflowStore({
    defaultProjectName: t('projectUntitled'),
    clerkId: isLoaded ? userId : null,
  })

  const commitState = useCallback(
    (next: NodeWorkflowStateV4) => {
      store.commitCurrentProjectState(() => next)
    },
    [store],
  )

  const onOpFailed = useCallback(
    (reason: string) => {
      toast.error(tV4('opFailed', { reason }))
    },
    [tV4],
  )

  const graph = useNodeGraphV4({
    state: store.state,
    onStateChange: commitState,
    onOpFailed,
  })

  const { fitView, screenToFlowPosition } = useReactFlow()
  const modelOptionsByType = useWorkflowModelOptions()
  const generation = useNodeMediaGenerationV4()

  /* ── chrome 的会话态 ─────────────────────────────────────────────────── */
  const [toolMode, setToolMode] = useState<NodeStudioToolMode>(
    NODE_STUDIO_TOOL_MODE_IDS.hand,
  )
  const [relationsCollapsed, setRelationsCollapsed] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [assistantExpanded, setAssistantExpanded] = useState(false)
  const [leftPanelExpanded, setLeftPanelExpanded] = useState(true)
  const [leftPanelView, setLeftPanelView] = useState<CanvasLeftPanelView>(
    CANVAS_LEFT_PANEL_VIEW_IDS.cast,
  )
  const [assistantHistoryHost, setAssistantHistoryHost] =
    useState<HTMLDivElement | null>(null)
  const [addMenu, setAddMenu] = useState<{
    screen: XYPosition
    flow: XYPosition
  } | null>(null)
  const [canvasPeek, setCanvasPeek] = useState(false)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const uploadInputRef = useRef<HTMLInputElement | null>(null)

  /** 助手全屏（剧本笺）时算重浮层：粘贴与快捷键让位给它。 */
  const heavyOverlayOpen = assistantOpen && assistantExpanded

  /* ── 相机 ────────────────────────────────────────────────────────────── */
  const focusNode = useCallback(
    (nodeId: string) => {
      const node = graph.nodes.find((candidate) => candidate.id === nodeId)
      if (!node) return
      void fitView({
        nodes: [{ id: nodeId }],
        duration: NODE_STUDIO_DOCK.focusDurationMs,
        maxZoom: NODE_STUDIO_CANVAS.fitViewMaxZoom,
      })
    },
    [fitView, graph.nodes],
  )

  /** 刚投影/刚落的一批入镜。空 = 整图 fit（与 v3 那条同一个兜底）。 */
  const lastCreatedRef = useRef<readonly string[]>([])
  const focusGeneratedNodes = useCallback(() => {
    const ids = lastCreatedRef.current
    void fitView({
      ...(ids.length > 0 ? { nodes: ids.map((id) => ({ id })) } : {}),
      duration: NODE_STUDIO_DOCK.focusDurationMs,
      maxZoom: NODE_STUDIO_CANVAS.fitViewMaxZoom,
    })
  }, [fitView])

  /* ── 审阅模式 ────────────────────────────────────────────────────────── */
  // ⚠ 队列读的是 RF store 那份节点（= v4 数据）。`useNodeReviewMode` 的入参类型
  // 仍是 v3 形状 —— 见 `WorkbenchDocksV4` 头注的已知缺口，③d-4 一并改签名。
  const reviewNodes = graph.rfNodes as NodeWorkflowNode[]
  const reviewMode = useNodeReviewMode({ nodes: reviewNodes, focusNode })

  /* ── 生成 ────────────────────────────────────────────────────────────── */
  const generateNodes = useCallback(
    (nodeIds: readonly string[]) => {
      if (nodeIds.length === 0) {
        toast.info(tV4('generateDesk.noModel'))
        return
      }
      for (const nodeId of nodeIds) {
        const node = graph.nodes.find((candidate) => candidate.id === nodeId)
        // 文本节点没有生成落点（只能派生）—— 说清楚而不是静默跳过。
        if (node?.data.kind === NODE_MEDIA_KIND_IDS.text) {
          toast.info(tV4('generateDesk.noGenerate'))
          continue
        }
        void generation.generateNode(nodeId, {
          nodes: graph.nodes,
          edges: graph.edges,
        })
      }
    },
    [graph.nodes, graph.edges, generation, tV4],
  )

  /* ── 落物 ────────────────────────────────────────────────────────────── */
  const dnd = useWorkbenchDndV4({ graph, pasteEnabled: !heavyOverlayOpen })

  /* ── 快捷键（**唯一**一份，Provider 那份因为收到 graph 自动让位）───── */
  const onEscape = useCallback((): boolean => {
    if (addMenu) {
      setAddMenu(null)
      return true
    }
    if (assistantOpen && assistantExpanded) {
      setAssistantExpanded(false)
      return true
    }
    if (reviewMode.active) {
      reviewMode.exit()
      return true
    }
    return false
  }, [addMenu, assistantOpen, assistantExpanded, reviewMode])

  useWorkbenchShortcutsV4({
    graph,
    onGenerateSelected: generateNodes,
    onTidyLayout: graph.tidyLayout,
    onEscape,
  })

  /* ── 动作出口（v4 实现，替掉 `NodeV4ActionsV3Adapter`）──────────────── */
  const actions = useMemo<NodeCanvasActions>(
    () => ({
      applyOp: async (op) => {
        graph.dispatch(op)
      },
      focusNode,
      focusGeneratedNodes,
      undo: graph.undo,
      /**
       * 运行态**不进 op 表**（`NodeV4ActionsBridge` 例外 ①）：进度跳变不是用户的
       * 意图，给每一次跳变记一条撤销会把撤销栈冲垮。
       */
      setNodeRunState: (nodeId, runState) => {
        graph.setRunState(
          nodeId,
          runState === 'running'
            ? NODE_STATUS_IDS.running
            : runState === 'success'
              ? NODE_STATUS_IDS.done
              : NODE_STATUS_IDS.failed,
        )
      },
      placeDerivedImages: (sourceNodeId, outputs) => {
        const source = graph.nodes.find((node) => node.id === sourceNodeId)
        const created: string[] = []
        outputs.forEach((output, index) => {
          const id = graph.addNode(
            NODE_MEDIA_KIND_IDS.image,
            'result',
            source
              ? {
                  position: {
                    x: source.position.x + (index + 1) * 360,
                    y: source.position.y + 240,
                  },
                }
              : {},
          )
          if (!id) return
          graph.setMedia(id, { url: output.imageUrl })
          created.push(id)
        })
        lastCreatedRef.current = created
        return created
      },
      spawnReference: (input) => {
        const target = graph.nodes.find(
          (node) => node.id === input.targetNodeId,
        )
        const id = graph.addNode(
          NODE_MEDIA_KIND_IDS.image,
          'result',
          target
            ? {
                position: {
                  x: target.position.x - 420,
                  y: target.position.y + 200,
                },
              }
            : {},
        )
        if (!id) return null
        graph.setMedia(id, { url: input.media.url })
        // 接不进去就把新卡留着并回 `null` —— 调用方据此决定要不要在正文里留 `@`。
        return graph.connect(id, input.targetNodeId, NODE_SLOT_IDS.reference)
          ? id
          : null
      },
      listCanvasImageSources: (excludeNodeId) =>
        graph.nodes
          .filter(
            (node) =>
              node.id !== excludeNodeId &&
              node.data.kind === NODE_MEDIA_KIND_IDS.image &&
              typeof node.data.url === 'string',
          )
          .map((node) => ({
            nodeId: node.id,
            url:
              node.data.kind === NODE_MEDIA_KIND_IDS.image
                ? node.data.url!
                : '',
            name: node.data.name,
            // ⚠ 出口契约上这一栏还是 legacy 的 `NodeWorkflowNodeType`（③d-4 改签名）。
            type: NODE_TYPE_IDS.image,
          })),
      connectReferenceNode: (sourceNodeId, targetNodeId) => {
        const already = graph.edges.some(
          (edge) =>
            edge.source === sourceNodeId &&
            edge.target === targetNodeId &&
            edge.slot === NODE_SLOT_IDS.reference,
        )
        // 重复引用同样回 `true`：调用方问的是「它现在在不在槽里」。
        if (already) return true
        return graph.connect(
          sourceNodeId,
          targetNodeId,
          NODE_SLOT_IDS.reference,
        )
      },
      /**
       * ⚠ **③e 的活**：助手提案目前仍是 v3 op 形状（`PlannedNodeAssistantOp`），
       * 落到 v4 图上要先过 v4 规划器（`planV4Connect` 那条分支的完整版）。
       * 这里**不假装成功** —— 全部记为 skipped 并返回真实的账，⛔ 不静默丢弃：
       * 一个只会变大的「已落 N 个」恰恰盖住了「一条都没落」。
       */
      runAssistantOps: async (ops) => ({
        applied: 0,
        skipped: ops.length,
        failedConnects: 0,
        createdNodeIds: [],
      }),
      reviewMode,
      regenerateForReview: async (nodeId, promptAppend) => {
        await generation.generateNode(
          nodeId,
          { nodes: graph.nodes, edges: graph.edges },
          promptAppend ? { prompt: promptAppend } : {},
        )
      },
      scriptDoc: {
        stage: store.state.scriptDocStage,
        depth: store.state.scriptDocDepth,
        locks: store.state.scriptDocLocks,
        shotStills: store.state.scriptDocShotStills,
        setStage: (value) =>
          commitState({ ...store.state, scriptDocStage: value }),
        setDepth: (value) =>
          commitState({ ...store.state, scriptDocDepth: value }),
        setLocks: (value) =>
          commitState({ ...store.state, scriptDocLocks: value }),
        setShotStills: (value) =>
          commitState({ ...store.state, scriptDocShotStills: value }),
        setDoc: (scriptDoc: ScriptDoc | undefined) =>
          commitState({ ...store.state, scriptDoc }),
        applyToGraph: () => {
          const doc = store.state.scriptDoc
          if (!doc) {
            return {
              created: 0,
              updated: 0,
              skipped: 0,
              removed: 0,
              removedEdges: 0,
              refusal: 'noScriptDoc' as const,
            }
          }
          const result = graph.projectScriptDoc(
            doc,
            store.state.scriptDocShotStills,
          )
          lastCreatedRef.current = result.created
          return {
            created: result.created.length,
            updated: 0,
            skipped: result.kept.length,
            removed: result.removed.length,
            removedEdges: 0,
            refusal: null,
          }
        },
        /**
         * 「确认镜头」之前的预览 —— **只算不提交**。⚠ 与 `applyToGraph` 走同一条
         * 投影（⛔ 不另写一份算法），差别只在这里不调 `onStateChange`。
         */
        previewProjection: () => {
          const doc = store.state.scriptDoc
          if (!doc) {
            return {
              created: 0,
              updated: 0,
              skipped: 0,
              removed: 0,
              removedEdges: 0,
              refusal: 'noScriptDoc' as const,
            }
          }
          const projectedShots = doc.shots?.length ?? 0
          return {
            created: projectedShots,
            updated: 0,
            skipped: graph.nodes.filter(
              (node) => node.data.shotNo === undefined,
            ).length,
            removed: graph.nodes.filter(
              (node) => node.data.shotNo !== undefined,
            ).length,
            removedEdges: 0,
            refusal: projectedShots === 0 ? ('emptyScriptDoc' as const) : null,
          }
        },
      },
    }),
    [
      graph,
      focusNode,
      focusGeneratedNodes,
      reviewMode,
      generation,
      store.state,
      commitState,
    ],
  )

  /* ── 派生 ────────────────────────────────────────────────────────────── */
  const modelOptionsByKind = useMemo(
    () =>
      ({
        [NODE_MEDIA_KIND_IDS.image]:
          modelOptionsByType[NODE_TYPE_IDS.image] ?? [],
        [NODE_MEDIA_KIND_IDS.video]:
          modelOptionsByType[NODE_TYPE_IDS.seedance] ?? [],
        [NODE_MEDIA_KIND_IDS.audio]:
          modelOptionsByType[NODE_TYPE_IDS.voice] ?? [],
      }) satisfies Partial<Record<NodeWorkflowMediaKind, unknown[]>>,
    [modelOptionsByType],
  )

  const assistantMode = !assistantOpen
    ? 'closed'
    : assistantExpanded
      ? 'script'
      : 'chat'

  const openAddMenu = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      const screen = { x: event.clientX, y: event.clientY }
      setAddMenu({ screen, flow: screenToFlowPosition(screen) })
    },
    [screenToFlowPosition],
  )

  const setCanvasAppearance = useCallback(
    (value: CanvasAppearance | undefined) => {
      commitState({ ...store.state, canvasAppearance: value })
    },
    [commitState, store.state],
  )

  const projectPanel = (
    <CanvasProjectPanel
      projectName={store.currentProject.name}
      projects={store.projects}
      currentProjectId={store.currentProject.id}
      nodeCount={graph.nodes.length}
      isSaving={false}
      onSave={() => void store.saveNow()}
      onCreateProject={() => store.createProject(t('projectUntitled'))}
      onRenameProject={() => undefined}
      onDeleteProject={() => store.deleteProject(store.currentProject.id)}
      onSwitchProject={store.switchProject}
    />
  )

  return (
    <NodeCanvasActionsProvider value={actions}>
      <CanvasWorkspaceLayout
        assistantMode={assistantMode}
        stageRef={canvasRef}
        reviewMode={reviewMode.active}
        assistant={
          <WorkbenchAssistantDockV4
            projectId={store.currentProject.id}
            projectName={store.currentProject.name}
            modelOptionsByType={modelOptionsByType}
            scriptDoc={store.state.scriptDoc}
            locale={appLocale}
            edges={[] as NodeWorkflowEdge[]}
            assistantOpen={assistantOpen}
            assistantExpanded={assistantExpanded}
            onAssistantOpenChange={setAssistantOpen}
            onAssistantExpandedChange={setAssistantExpanded}
            onFocusNode={focusNode}
            assistantHistoryHost={assistantHistoryHost}
          />
        }
      >
        <IngestDragProviderV4
          nodes={graph.nodes}
          edges={graph.edges}
          onConnect={graph.connect}
        >
          <NodeV4Provider
            state={graph.state}
            onStateChange={commitState}
            graph={graph}
            modelOptionsByKind={modelOptionsByKind}
            onFocusNode={focusNode}
          >
            <div className="node-workbench-v4 contents">
              <CanvasV4
                graph={graph}
                toolMode={toolMode}
                relationsCollapsed={relationsCollapsed}
                canvasAppearance={store.state.canvasAppearance}
                onDrop={dnd.onDrop}
                onDragOver={dnd.onDragOver}
              />
              {graph.nodes.length === 0 ? (
                <div className="pointer-events-none absolute inset-x-4 bottom-24 top-20 z-canvas-selection flex items-center justify-center md:inset-x-8 md:bottom-16 md:top-24">
                  <NodeCanvasEmptyGuide
                    onChatOutline={() => {
                      setAssistantOpen(true)
                      setAssistantExpanded(true)
                    }}
                    onAddNode={openAddMenu}
                  />
                </div>
              ) : null}
              <div className="pointer-events-none absolute inset-0 z-canvas-chrome">
                <WorkbenchToolbarV4
                  graph={graph}
                  projectName={store.currentProject.name}
                  nodeCount={graph.nodes.length}
                  isSaving={dnd.isUploading}
                  canvasAppearance={store.state.canvasAppearance}
                  onCanvasAppearanceChange={setCanvasAppearance}
                  reviewPendingCount={reviewMode.remaining}
                  onStartReview={reviewMode.enter}
                  assistantOpen={assistantOpen}
                  onOpenAssistant={() => setAssistantOpen(true)}
                  onOpenProjects={() => {
                    setLeftPanelView(CANVAS_LEFT_PANEL_VIEW_IDS.projects)
                    setLeftPanelExpanded(true)
                  }}
                  toolMode={toolMode}
                  onToolModeChange={setToolMode}
                  relationsCollapsed={relationsCollapsed}
                  onRelationsCollapsedChange={setRelationsCollapsed}
                  addMenuPosition={addMenu?.screen ?? null}
                  addNodePosition={addMenu?.flow ?? null}
                  onCloseAddMenu={() => setAddMenu(null)}
                  onUpload={() => uploadInputRef.current?.click()}
                  onPickFromLibrary={() => setAddMenu(null)}
                />
                <WorkbenchDocksV4
                  projectId={store.currentProject.id}
                  projectName={store.currentProject.name}
                  projectPanel={projectPanel}
                  modelOptionsByType={modelOptionsByType}
                  scriptDoc={store.state.scriptDoc}
                  locale={appLocale}
                  edges={[] as NodeWorkflowEdge[]}
                  leftPanelExpanded={leftPanelExpanded}
                  onLeftPanelExpandedChange={setLeftPanelExpanded}
                  leftPanelView={leftPanelView}
                  onLeftPanelViewChange={setLeftPanelView}
                  nodeCount={graph.nodes.length}
                  onAddClick={openAddMenu}
                  assistantOpen={assistantOpen}
                  assistantExpanded={assistantExpanded}
                  onAssistantOpenChange={setAssistantOpen}
                  onAssistantExpandedChange={setAssistantExpanded}
                  onFocusNode={focusNode}
                  assistantHistoryHost={assistantHistoryHost}
                  setAssistantHistoryHost={setAssistantHistoryHost}
                  isMobile={isMobile}
                  canvasPeek={canvasPeek}
                  onEnterPeek={() => setCanvasPeek(true)}
                  onExitPeek={() => setCanvasPeek(false)}
                />
                {/* 添加菜单「上传素材」的隐藏 input：菜单关掉后仍要在场接住系统
                    对话框的 change，所以挂宿主不挂菜单。 */}
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept="image/*,video/*,audio/*"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? [])
                    event.target.value = ''
                    if (files.length === 0) return
                    setAddMenu(null)
                    const rect = canvasRef.current?.getBoundingClientRect()
                    dnd.dropFiles(files, {
                      x: (rect?.left ?? 0) + (rect?.width ?? 0) / 2,
                      y: (rect?.top ?? 0) + (rect?.height ?? 0) / 2,
                    })
                  }}
                />
              </div>
            </div>
          </NodeV4Provider>
        </IngestDragProviderV4>
      </CanvasWorkspaceLayout>
    </NodeCanvasActionsProvider>
  )
}
