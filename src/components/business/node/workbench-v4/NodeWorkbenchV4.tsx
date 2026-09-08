'use client'

/**
 * **v4 原生 workbench**（第三期 · 画布 C3c-③d-4「原子翻转」之后的**唯一** workbench）。
 *
 * 页面入口 `src/app/[locale]/(main)/studio/node/page.tsx` 直接挂本组件；v3 那份
 * （`StudioNodeWorkbench.tsx` / `use-node-workflow.ts` / `node-workflow-v3-view.ts`
 * / `NodeV4ActionsV3Adapter.tsx` / `NodeWorkflowActionsContext.tsx` /
 * `IngestDragLayer.tsx`）在同一次改动里删干净，⛔ 不留兼容层。
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
import { useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  CANVAS_LEFT_PANEL_VIEW_IDS,
  type CanvasLeftPanelView,
} from '../CanvasLeftPanel'
import {
  NODE_STUDIO_CANVAS,
  NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS,
  NODE_STUDIO_DOCK,
  NODE_STUDIO_NODE_PLACEMENT,
  NODE_STUDIO_TOOL_MODE_IDS,
  type NodeStudioToolMode,
} from '@/constants/node-studio'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
  type NodeWorkflowMediaKind,
} from '@/constants/node-types'
import { NODE_SLOT_IDS, getNodeV4Slot } from '@/constants/node-slots'
import { DEFAULT_LOCALE, isAppLocale } from '@/i18n/routing'
import { useIsMobile } from '@/hooks/use-mobile'
import { useWorkflowModelOptions } from '@/hooks/use-workflow-model-options'
import { useCanvasImageEditHandoffV4 } from '@/hooks/node/use-canvas-image-edit-handoff-v4'
import { useEdgeSigning } from '@/hooks/node/use-edge-signing'
import {
  useNodeGraphV4,
  type NodeGraphV4,
} from '@/hooks/node/use-node-graph-v4'
import { useNodeMediaGenerationV4 } from '@/hooks/node/use-node-media-generation-v4'
import { useNodeGenerationReconcileV4 } from '@/hooks/node/use-node-generation-reconcile-v4'
import { useNodeReviewMode } from '@/hooks/node/use-node-review-mode'
import { useNodeWorkflowStore } from '@/hooks/node/use-node-workflow-store'
import { prefersReducedMotion } from '@/hooks/node/node-ingest-dom'
import { readCanvasImageEditHandoff } from '@/lib/canvas-image-edit-handoff'
import type {
  CanvasAppearance,
  NodeV4,
  NodeWorkflowStateV4,
} from '@/types/node-workflow'
import type { ScriptDoc } from '@/types/script-doc'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

import { CanvasWorkspaceLayout } from '../CanvasWorkspaceLayout'
import { CanvasProjectPanel } from '../CanvasProjectPanel'
import { ProjectNameDialog } from '../ProjectNameDialog'
import { VideoMergeComposeToolbar } from '../VideoMergeComposeToolbar'
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
import { useWorkbenchRosterDropV4 } from './WorkbenchRosterDropV4'

/**
 * 一键成盒至少要几段 —— **读端口表**（`video.merge` 的 `clip` 槽 `min`），
 * ⛔ 不在这里另写一个 2：那个下限是连线规则的一部分，两处各写一份就会漂。
 */
const VIDEO_MERGE_MIN_CLIPS =
  getNodeV4Slot(
    NODE_MEDIA_KIND_IDS.video,
    NODE_V4_VIDEO_SUBTYPE_IDS.merge,
    NODE_SLOT_IDS.clip,
  )?.min ?? 0

const OP_FAILURE_KEYS: Readonly<Record<string, string>> = {
  unknownNode: 'connectRejected.unknownNode',
  unknownSlot: 'connectRejected.unknownSlot',
  unknownEdge: 'connectRejected.unknownNode',
  blockedVersion: 'connectRejected.blockedVersion',
}

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

  /**
   * op 失败理由 → 一句人话。⛔ 只映射**真的会产出**的那几条；其余落 `opFailed`
   * 的通用句（带原始理由），⚠ 不静默吞掉：一条没有出口的失败等于一次「点了没反应」。
   */
  const onOpFailed = useCallback(
    (reason: string) => {
      const key = OP_FAILURE_KEYS[reason]
      toast.error(key ? tV4(key) : tV4('opFailed', { reason }))
    },
    [tV4],
  )

  const rawGraph = useNodeGraphV4({
    state: store.state,
    onStateChange: commitState,
    onOpFailed,
  })

  /**
   * §2.7 墨线签署 / 解绑反放。写入方是**连边 / 断边**这两个动作，所以在这里包一层
   * 而不是散在每个调用点上：端口拖拽、拖投、快投、名册落位、助手 op、一键成盒
   * 全都从 `graph.connect` 走，包一次就全都有了。
   *
   * ⚠ 只包 `connect`/`disconnect` 两个出口，⛔ 不把记账塞进图引擎：签署是**视觉
   * 的**，它不该出现在 op 表里，更不该进撤销栈。
   */
  const edgeSigning = useEdgeSigning()
  const { scheduleEdgeSigning, scheduleEdgeUnsign } = edgeSigning
  const graph = useMemo<NodeGraphV4>(() => {
    const skipSigning = prefersReducedMotion()
    return {
      ...rawGraph,
      connect: (source, target, slot, options) => {
        const ok = rawGraph.connect(source, target, slot, options)
        if (ok && !skipSigning) scheduleEdgeSigning(source, target)
        return ok
      },
      disconnect: (edgeId) => {
        const edge = rawGraph.edges.find((candidate) => candidate.id === edgeId)
        const ok = rawGraph.disconnect(edgeId)
        // 快照要在删之前取 —— 反向褪去画的是一条已经不在图上的边。
        if (ok && edge && !skipSigning) scheduleEdgeUnsign(edge)
        return ok
      },
    }
  }, [rawGraph, scheduleEdgeSigning, scheduleEdgeUnsign])

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
  const [projectDialogMode, setProjectDialogMode] = useState<
    'create' | 'rename' | null
  >(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
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

  /* ── 图片编辑 handoff（工作台「在画布里编辑」）────────────────────────── */
  const searchParams = useSearchParams()
  const imageEditHandoff = useMemo(
    () => readCanvasImageEditHandoff(searchParams),
    [searchParams],
  )
  useCanvasImageEditHandoffV4({
    graph,
    request: imageEditHandoff,
    userId: isLoaded ? userId : null,
    projectId: store.currentProject.id,
    isHydrated: store.isHydrated,
    onFocusNode: focusNode,
  })

  /* ── 审阅模式 ────────────────────────────────────────────────────────── */
  // 队列读的就是图引擎那份 v4 节点 —— `useNodeReviewMode` 的入参在 ③d-4 已改成
  // v4 形状，⛔ 这里没有任何转换层。
  const reviewMode = useNodeReviewMode({ nodes: graph.nodes, focusNode })

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
        graph.setRunState(nodeId, NODE_STATUS_IDS.running)
        void generation
          .generateNode(
            nodeId,
            { nodes: graph.nodes, edges: graph.edges },
            {
              // 落 job id = **持久化**「有一单在飞」。刷新 / 轮询窗口关掉之后，
              // `useNodeGenerationReconcileV4` 就是靠它把结果取回来的。
              onJobCreated: (jobId) =>
                graph.setMedia(nodeId, { mediaJobId: jobId }),
            },
          )
          .then((result) => {
            if (result.success) {
              graph.setMedia(nodeId, {
                url: result.mediaUrl,
                generationId: result.generation.id,
                mediaJobId: undefined,
                imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.generated,
                ...(result.thumbnailUrl
                  ? { videoThumbnailUrl: result.thumbnailUrl }
                  : {}),
              })
              graph.setRunState(nodeId, NODE_STATUS_IDS.done)
              return
            }
            // ⚠ `pending` 不是失败：轮询窗口关了而 worker 还在跑。job id 留着，
            // 交给回填 hook —— ⛔ 不在这里把它标成 failed。
            if (result.pending) return
            toast.error(tV4('generateDesk.failed', { reason: result.error }))
            graph.setMedia(nodeId, { mediaJobId: undefined })
            graph.setRunState(nodeId, NODE_STATUS_IDS.failed)
          })
      }
    },
    [graph, generation, tV4],
  )

  /**
   * 生成回填（③e）。⚠ 前台那条路（上面 `generateNodes` 的 `.then`）与刷新之后的
   * 这一条**读同一个 job id**，⛔ 两处不各存一份状态。
   */
  useNodeGenerationReconcileV4({
    nodes: graph.nodes,
    setMedia: graph.setMedia,
    setRunState: graph.setRunState,
    reportFailure: (_nodeId, payload) => {
      toast.error(tV4('generateDesk.failed', { reason: payload.error ?? '' }))
    },
  })

  /* ── 落物 ────────────────────────────────────────────────────────────── */
  const dnd = useWorkbenchDndV4({ graph, pasteEnabled: !heavyOverlayOpen })
  const rosterDrop = useWorkbenchRosterDropV4(graph)

  /* ── 一键成盒（多选视频 → 合并节点）──────────────────────────────────── */
  /**
   * 选中的这几张卡能不能一键成盒。⚠ 判据只有一条：**全是视频**。混进任何一个
   * 非视频节点就整条不渲染（不是置灰）—— 一条点了没反应的按钮比没有更糟。
   */
  const composeSelectionNodeIds = useMemo(() => {
    if (graph.selectedNodeIds.length < VIDEO_MERGE_MIN_CLIPS) {
      return null
    }
    const selected = graph.nodes.filter((node) =>
      graph.selectedNodeIds.includes(node.id),
    )
    if (selected.length !== graph.selectedNodeIds.length) return null
    return selected.every(
      (node) => node.data.kind === NODE_MEDIA_KIND_IDS.video,
    )
      ? selected.map((node) => node.id)
      : null
  }, [graph.nodes, graph.selectedNodeIds])

  const composeVideoMerge = useCallback(() => {
    if (!composeSelectionNodeIds) return
    // 点击那一刻**重读**当前图，⛔ 不吃上面那个 memo 的快照（框选可能在渲染与
    // 点击之间又变了）。
    const composeIds = new Set(composeSelectionNodeIds)
    const selected = graph.nodes.filter((node) => composeIds.has(node.id))
    if (selected.length < VIDEO_MERGE_MIN_CLIPS) return

    // 建边顺序 = 从左到右的空间阅读顺序（y 做次序兜底）。
    const ordered = [...selected].sort(
      (a, b) => a.position.x - b.position.x || a.position.y - b.position.y,
    )
    const bounds = ordered.reduce(
      (acc, node) => ({
        maxX: Math.max(acc.maxX, node.position.x),
        minY: Math.min(acc.minY, node.position.y),
      }),
      { maxX: -Infinity, minY: Infinity },
    )
    const newNodeId = graph.addNode(
      NODE_MEDIA_KIND_IDS.video,
      NODE_V4_VIDEO_SUBTYPE_IDS.merge,
      {
        position: {
          x: bounds.maxX + NODE_STUDIO_NODE_PLACEMENT.videoMergeCompose.offsetX,
          y: bounds.minY,
        },
      },
    )
    if (!newNodeId) return
    // 每段落进 `clip` 槽 —— 与手拖一条线**同一条** `connect`（同样的闸、同样的
    // 撤销、同样的墨线签署）。
    for (const node of ordered) {
      graph.connect(node.id, newNodeId, NODE_SLOT_IDS.clip)
    }
    toast.success(t('toasts.videoMergeComposed', { count: ordered.length }))
    focusNode(newNodeId)
  }, [composeSelectionNodeIds, graph, focusNode, t])

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

  /* ── 动作出口（v4 实现，替掉 ③d-4 之前那个 v3 适配器）──────────────── */
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
                ? (node.data.url ?? '')
                : '',
            name: node.data.name,
            kind: node.data.kind,
            subtype: node.data.subtype,
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
       * 助手提案的执行口（③e）。
       *
       * ⚠ 走 `graph.dispatchBatch` 而不是逐条 `applyOp`：批内 `add_node` 的别名要
       * 让后面的 `connect` 认得出（`refs` 表），而逐条 dispatch 读的是同一 tick 里
       * 的旧 state —— 「新建角色 → 连到镜头」会连不上。返回的是**真实的账**，
       * ⛔ 不假装成功：一个只会变大的「已落 N 个」恰恰盖住了「一条都没落」。
       */
      runAssistantOps: async (planned) => {
        const result = graph.dispatchBatch(planned.map((entry) => entry.op))
        lastCreatedRef.current = [...result.createdNodeIds]
        return {
          applied: result.applied,
          skipped: result.skipped,
          failedConnects: result.failedConnects,
          createdNodeIds: [...result.createdNodeIds],
        }
      },
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
      onCreateProject={() => setProjectDialogMode('create')}
      onRenameProject={() => setProjectDialogMode('rename')}
      onDeleteProject={() => setDeleteConfirmOpen(true)}
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
            scriptDoc={store.state.scriptDoc}
            locale={appLocale}
            nodes={graph.nodes}
            edges={graph.edges}
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
                edgeSigning={edgeSigning}
                onDrop={dnd.onDrop}
                onDragOver={dnd.onDragOver}
                onNodeDragStart={(node) =>
                  rosterDrop.onNodeDragStart(node as unknown as NodeV4)
                }
                onNodeDrag={(node, event) =>
                  rosterDrop.onNodeDrag(
                    node as unknown as NodeV4,
                    event.clientX,
                    event.clientY,
                  )
                }
                onNodeDragStopIntercept={(node, event) =>
                  rosterDrop.onNodeDragStop(
                    node as unknown as NodeV4,
                    event.clientX,
                    event.clientY,
                  )
                }
              >
                {/* 多选包围盒上方的「合成 N 段」条。挂在 `<ReactFlow>` 里当兄弟，
                    由 `NodeToolbar` 自己做画布→屏幕换算并跟随平移缩放。 */}
                <VideoMergeComposeToolbar
                  nodeIds={composeSelectionNodeIds}
                  onCompose={composeVideoMerge}
                />
              </CanvasV4>
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
                  nodes={graph.nodes}
                  edges={graph.edges}
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
              <ProjectNameDialog
                open={projectDialogMode !== null}
                title={
                  projectDialogMode === 'rename'
                    ? t('projectDialog.renameTitle')
                    : t('projectDialog.createTitle')
                }
                placeholder={t('topbar.createProjectPrompt')}
                submitLabel={
                  projectDialogMode === 'rename'
                    ? t('projectDialog.renameSubmit')
                    : t('projectDialog.createSubmit')
                }
                cancelLabel={t('projectDialog.cancel')}
                defaultValue={
                  projectDialogMode === 'rename'
                    ? store.currentProject.name
                    : t('projectNewDefaultName', {
                        n: store.projects.length + 1,
                      })
                }
                onOpenChange={(open) => {
                  if (!open) setProjectDialogMode(null)
                }}
                onSubmit={(name) => {
                  if (projectDialogMode === 'rename') {
                    store.renameCurrentProject(name)
                  } else {
                    store.createProject(name)
                  }
                  setProjectDialogMode(null)
                }}
              />
              <AlertDialog
                open={deleteConfirmOpen}
                onOpenChange={setDeleteConfirmOpen}
              >
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {t('projectDialog.deleteTitle')}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('topbar.deleteProjectConfirm', {
                        name: store.currentProject.name,
                      })}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>
                      {t('projectDialog.cancel')}
                    </AlertDialogCancel>
                    <AlertDialogAction
                      className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => {
                        store.deleteProject(store.currentProject.id)
                        setDeleteConfirmOpen(false)
                      }}
                    >
                      {t('projectDialog.deleteConfirm')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </NodeV4Provider>
        </IngestDragProviderV4>
      </CanvasWorkspaceLayout>
    </NodeCanvasActionsProvider>
  )
}
