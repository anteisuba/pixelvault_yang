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
  useEffect,
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
  CANVAS_SHELL_ASSISTANT,
  CANVAS_SHELL_UPLOAD_ACCEPT,
  type CanvasShellPanelId,
} from '@/constants/canvas-shell'
import {
  getCanvasAddCatalogItem,
  type CanvasAddIntentId,
} from '@/constants/canvas-add-catalog'
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
  NODE_V4_IMAGE_SUBTYPE_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
  type NodeV4Subtype,
  type NodeWorkflowMediaKind,
} from '@/constants/node-types'
import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import {
  EDIT_DESK_MODE_PARAM,
  EDIT_DESK_MODE_VALUE,
} from '@/constants/edit-desk'
import { NODE_SLOT_IDS } from '@/constants/node-slots'
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
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type { NodeV4, NodeWorkflowStateV4 } from '@/types/node-workflow'
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

import { EditDesk } from '../edit-desk'
import { CanvasWorkspaceLayout } from '../CanvasWorkspaceLayout'
import { CanvasProjectPanel } from '../CanvasProjectPanel'
import { ProjectNameDialog } from '../ProjectNameDialog'
import { NodeCanvasEmptyGuide } from '../NodeCanvasEmptyGuide'
import { IngestDragProviderV4 } from '../IngestDragLayerV4'
import {
  NodeCanvasActionsProvider,
  type NodeCanvasActions,
} from '../nodes/v4/NodeV4ActionsBridge'
import { subscribeCanvasTextAssist } from '../nodes/v4/text/text-assist-request'
import { subscribeTimelinePlanRequest } from '@/lib/timeline-plan-request'
import type { NodeTextDeriveAction } from '../nodes/v4/NodeV4Context'
import { NodeV4Provider } from '../nodes/v4/NodeV4Provider'
import { CanvasV4 } from './CanvasV4'
import { WorkbenchAssistantDockV4, WorkbenchDocksV4 } from './WorkbenchDocksV4'
import { useWorkbenchDndV4 } from './WorkbenchDndV4'
import { useWorkbenchShortcutsV4 } from './WorkbenchShortcutsV4'
import { useWorkbenchRosterDropV4 } from './WorkbenchRosterDropV4'
import { ShellApiKeysProvider, useOpenApiKeys } from './shell/ShellApiKeys'
import { ShellAssistantFrame } from './shell/ShellAssistantFrame'
import { ShellBottomBar } from './shell/ShellBottomBar'
import { ShellPaneMenu, ShellQuickAdd } from './shell/ShellCanvasMenus'
import { ShellCommandPalette } from './shell/ShellCommandPalette'
import { ShellSidePanels } from './shell/ShellSidePanels'
import { ShellTopBar } from './shell/ShellTopBar'

/**
 * 文本卡的两个派生动作各建哪一类卡（§8）。
 *
 * ⚠ 只有工具条上真的有入口的那两个（生图 / 生镜头）在这里；`character` /
 * `background` / `askAssistant` 三个动作**画布上还没有入口**，⛔ 不先给它们
 * 编一条落点 —— 那会是一段没人走过、也没法验的路。
 */
const TEXT_DERIVE_TARGETS: Partial<
  Record<
    NodeTextDeriveAction,
    {
      readonly kind: NodeWorkflowMediaKind
      readonly subtype: NodeV4Subtype
    }
  >
> = {
  shotImage: {
    kind: NODE_MEDIA_KIND_IDS.image,
    subtype: NODE_V4_IMAGE_SUBTYPE_IDS.shot,
  },
  video: {
    kind: NODE_MEDIA_KIND_IDS.video,
    subtype: NODE_V4_VIDEO_SUBTYPE_IDS.shot,
  },
}

/** 批内别名（`add_node.ref`）：这一批只建一张卡，一个名字够用。 */
const TEXT_DERIVE_REF = 'derived'

/**
 * 「从这段文本派生一张生成卡」的那一批 op（建卡 + 连线）。
 *
 * 抽成纯函数是为了能单测「一批两条、连线指向本批新卡」这条约定 —— 落图与撤销
 * 由 `dispatchBatch` 负责，这里只管形状。`null` = 这个动作画布上还没有入口。
 */
export function buildTextDeriveOps(
  source: NodeV4,
  action: NodeTextDeriveAction,
): NodeAssistantOpV4[] | null {
  const target = TEXT_DERIVE_TARGETS[action]
  if (!target) return null
  return [
    {
      op: NODE_ASSISTANT_OP_V4_IDS.addNode,
      kind: target.kind,
      subtype: target.subtype,
      ref: TEXT_DERIVE_REF,
      position: {
        // 产物落在来源右边 —— 与图像派生 / 一键成盒同一条约定，⛔ 不另编偏移。
        x: source.position.x + NODE_STUDIO_NODE_PLACEMENT.derivedImage.offsetX,
        y: source.position.y,
      },
    },
    {
      op: NODE_ASSISTANT_OP_V4_IDS.connect,
      source: source.id,
      target: TEXT_DERIVE_REF,
      slot: NODE_SLOT_IDS.text,
    },
  ]
}

/**
 * 剪辑台段 id 的生成器。
 *
 * ⚠ 与图引擎的 `mintId` 是同一种前缀 + uuid 的写法但**不是同一个函数**：那个是
 * 图引擎内部的（节点 / 边 id），段 id 不该跟着它的实现走。⛔ 也不用下标当 id ——
 * 换序之后下标全变，撤销就会指到别的段上。
 */
function mintEditId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.()
  return `${prefix}_${random ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
}

const OP_FAILURE_KEYS: Readonly<Record<string, string>> = {
  unknownNode: 'connectRejected.unknownNode',
  unknownSlot: 'connectRejected.unknownSlot',
  unknownEdge: 'connectRejected.unknownNode',
  blockedVersion: 'connectRejected.blockedVersion',
}

/**
 * 空白处那一下按在哪 —— 三套坐标各有各的用处，⛔ 别互相顶替：
 * · `screen` 相对画布容器 → 浮层的 `left/top`（浮层挂在 chrome 层里）
 * · `client` 视口坐标 → 上传落物（`dropFiles` 自己做 `screenToFlowPosition`）
 * · `flow` 画布坐标 → 新建空卡的 `position`
 */
interface CanvasPointerAnchor {
  readonly screen: XYPosition
  readonly client: XYPosition
  readonly flow: XYPosition
}

export function NodeWorkbenchV4() {
  return (
    <ReactFlowProvider>
      {/* 「配置渠道与 key」的抽屉挂在最外：⌘K 与卡上的模型选择器页脚共用同一份。 */}
      <ShellApiKeysProvider>
        <NodeWorkbenchV4Inner />
      </ShellApiKeysProvider>
    </ReactFlowProvider>
  )
}

function NodeWorkbenchV4Inner() {
  const t = useTranslations('StudioNode')
  const tV4 = useTranslations('StudioNode.v4')
  const tShell = useTranslations('StudioNode.shell')
  const openApiKeys = useOpenApiKeys()
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
  /**
   * 关系线总开关。⚠ S7 的底栏（画板 `ChromeOverview.dc.html`）**没有**这一颗 ——
   * 旧 `CanvasBottomDock` 上那个开关随顶栏/底栏重做一起退场，所以这里钉死在
   * 「不收起」。⛔ 不留一个没有入口的 state 假装还能切。
   */
  const relationsCollapsed = false
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [assistantExpanded, setAssistantExpanded] = useState(false)
  const [activePanel, setActivePanel] = useState<CanvasShellPanelId | null>(
    null,
  )
  const [nodeQuery, setNodeQuery] = useState('')
  const [assistantWidth, setAssistantWidth] = useState<number>(
    CANVAS_SHELL_ASSISTANT.defaultWidthPx,
  )
  /** 助手从没开过时右缘不留那一条（画板默认态右缘是空的）。 */
  const [assistantEverOpened, setAssistantEverOpened] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [assistantHistoryHost, setAssistantHistoryHost] =
    useState<HTMLDivElement | null>(null)
  /**
   * 就地加节点的两个浮层（双击 / 右键）。`screen` 是**相对画布容器**的坐标 ——
   * 浮层挂在 chrome 层里，用 clientX/Y 会在 stage 不贴视口左上角时整体偏移。
   */
  const [quickAdd, setQuickAdd] = useState<CanvasPointerAnchor | null>(null)
  const [paneMenu, setPaneMenu] = useState<CanvasPointerAnchor | null>(null)
  const [canvasPeek, setCanvasPeek] = useState(false)
  const [projectDialogMode, setProjectDialogMode] = useState<
    'create' | 'rename' | 'duplicate' | null
  >(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  /** 上传的落点（视口坐标）。`null` = 落在画布中心。 */
  const uploadPointRef = useRef<XYPosition | null>(null)

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

  /**
   * 文本卡工具条的「生图 / 生镜头」与画中框的 ⌘↵（§8）。
   *
   * 在文本卡**右侧**落一张空的生成卡，并把这段文本连进它的 `text` 槽 —— 落点
   * 用的就是「产物落在来源右边」那条既有约定（`derivedImage.offsetX`），⛔ 不
   * 为这条路径另编一个偏移。
   *
   * ⚠ 两条 op 走 `dispatchBatch` 而不是 `addNode` + `connect`：后者是**两个**
   * 撤销条目，用户按一次 ⌘Z 只撤掉连线、留下一张孤零零的空卡。批内 `connect`
   * 认得 `add_node` 的别名（`refs`），所以「建卡 + 连线」是一步意图、一次撤销。
   */
  const deriveFromText = useCallback(
    (nodeId: string, action: NodeTextDeriveAction) => {
      const source = graph.nodes.find((node) => node.id === nodeId)
      if (!source) return
      const ops = buildTextDeriveOps(source, action)
      if (!ops) return

      const created = graph.dispatchBatch(ops).createdNodeIds[0]
      if (created) focusNode(created)
    },
    [graph, focusNode],
  )

  /**
   * 文本卡助手栏投便条时**把助手打开**。
   *
   * ⚠ 助手从没开过时 dock 根本没挂（`ShellAssistantFrame` 收起态返回 null），
   * 而「打开助手」这个开关只有工作台拿得到 —— dock 自己没挂，它救不了自己。
   * ⛔ 这里**不取走**那张便条：取走要拼消息、要会话，那是 dock 的事；两处都取
   * 会变成一场赛跑，谁先跑到谁把便条吃掉。dock 挂上来时自己排空（见那边的
   * `consume()`）。
   */
  useEffect(
    () =>
      subscribeCanvasTextAssist(() => {
        setAssistantOpen(true)
        setAssistantEverOpened(true)
      }),
    [],
  )

  /**
   * 剪辑台的排片栏投便条时同样**把助手挂起来**（S10）。
   *
   * ⚠ 与上面逐字同源，只是这一次用户看不到那次打开 —— 剪辑台是盖在外壳上的
   * 全屏面。挂不起来的后果一样：点了发送什么也没发生。
   */
  useEffect(
    () =>
      subscribeTimelinePlanRequest(() => {
        setAssistantOpen(true)
        setAssistantEverOpened(true)
      }),
    [],
  )

  /* ── 快捷键（**唯一**一份，Provider 那份因为收到 graph 自动让位）───── */
  const onEscape = useCallback((): boolean => {
    if (paletteOpen) {
      setPaletteOpen(false)
      return true
    }
    if (paneMenu) {
      setPaneMenu(null)
      return true
    }
    if (quickAdd) {
      setQuickAdd(null)
      return true
    }
    if (activePanel) {
      setActivePanel(null)
      return true
    }
    if (assistantOpen && assistantExpanded) {
      setAssistantExpanded(false)
      return true
    }
    if (assistantOpen) {
      setAssistantOpen(false)
      return true
    }
    if (reviewMode.active) {
      reviewMode.exit()
      return true
    }
    return false
  }, [
    paletteOpen,
    paneMenu,
    quickAdd,
    activePanel,
    assistantOpen,
    assistantExpanded,
    reviewMode,
  ])

  /**
   * 三条加节点路的**同一个**落点函数（S7：没有常驻加号）。⚠ 身份读
   * `CANVAS_ADD_CATALOG` 的 `intent.v4`，⛔ 不在任一条路上另推一遍。
   */
  const addNodeFromIntent = useCallback(
    (intentId: CanvasAddIntentId, position?: XYPosition) => {
      const item = getCanvasAddCatalogItem(intentId)
      const nodeId = graph.addNode(item.v4.kind, item.v4.subtype, {
        ...(position ? { position } : {}),
      })
      setQuickAdd(null)
      setPaneMenu(null)
      if (nodeId) lastCreatedRef.current = [nodeId]
    },
    [graph],
  )

  /** 键盘 T/I/A/V 与 ⌘K 的落点：视口中心（没有指针位置可用）。 */
  const addNodeAtViewportCenter = useCallback(
    (intentId: CanvasAddIntentId) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      const center = rect
        ? screenToFlowPosition({
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          })
        : undefined
      addNodeFromIntent(intentId, center)
    },
    [addNodeFromIntent, screenToFlowPosition],
  )

  /**
   * 三条加节点路里那颗**上传**（S7 §7 owner 追加）。
   *
   * 参数是**视口坐标**的落点（双击 / 右键那一下按在哪），省略 = 视口中心（键盘
   * ⌘U 与 ⌘K 没有指针位置）。系统对话框是异步的，所以落点先记进 ref —— 菜单在
   * 用户挑文件之前就关掉了。
   *
   * ⚠ 真正落物走 `dnd.dropFiles`（拖入 / 粘贴同一条），⛔ 不另写上传。
   */
  const openUpload = useCallback((screenPoint?: XYPosition) => {
    uploadPointRef.current = screenPoint ?? null
    setQuickAdd(null)
    setPaneMenu(null)
    uploadInputRef.current?.click()
  }, [])

  const fitAllNodes = useCallback(() => {
    void fitView({
      duration: NODE_STUDIO_DOCK.focusDurationMs,
      maxZoom: NODE_STUDIO_CANVAS.fitViewMaxZoom,
    })
  }, [fitView])

  useWorkbenchShortcutsV4({
    graph,
    onGenerateSelected: generateNodes,
    onTidyLayout: graph.tidyLayout,
    onEscape,
    onQuickAdd: addNodeAtViewportCenter,
    onFitView: fitAllNodes,
    onOpenCommandPalette: () => setPaletteOpen(true),
    onCreateProject: () => setProjectDialogMode('create'),
    onOpenUpload: () => openUpload(),
    enabled: !heavyOverlayOpen,
  })

  /* ── 动作出口（v4 实现，替掉 ③d-4 之前那个 v3 适配器）──────────────── */
  /* ── 剪辑台 · 全屏模式（S8 · spec §6）────────────────────────────────── */
  /**
   * ⚠ 模式是**本地 state + history 改参**，⛔ 不走 `router.push`：Next 的导航会让
   * 这棵树重挂，画布视口与选中就没了 —— 而「退出即回到刚才那个地方」正是剪辑台
   * 做成模式而不是新页的全部理由。URL 上仍然有 `?mode=edit`，刷新 / 分享都还在。
   */
  const [editMode, setEditMode] = useState(
    () => searchParams.get(EDIT_DESK_MODE_PARAM) === EDIT_DESK_MODE_VALUE,
  )
  /** 「进剪辑台」带进来的那几张卡（台面开起来就先追加进 V 轨）。 */
  const [editDeskSeed, setEditDeskSeed] = useState<readonly string[]>([])

  const writeEditModeParam = useCallback((on: boolean) => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (on) {
      url.searchParams.set(EDIT_DESK_MODE_PARAM, EDIT_DESK_MODE_VALUE)
    } else {
      url.searchParams.delete(EDIT_DESK_MODE_PARAM)
    }
    window.history.replaceState(null, '', url.toString())
  }, [])

  const openEditDesk = useCallback(
    (nodeIds?: readonly string[]) => {
      setEditDeskSeed(nodeIds ?? [])
      setEditMode(true)
      writeEditModeParam(true)
    },
    [writeEditModeParam],
  )

  /**
   * 顶栏「剪辑台」/ ⌘K 开台时**带上当前选中的卡**（spec §6「多选视频卡后进剪辑台」）。
   *
   * ⚠ 不在这里挑种类：`addClips` 自己按卡的种类落 V / A 轨，落不进去的（文本 /
   * 图片 / 还没产物的空卡）它直接跳过。⛔ 这里再筛一遍就是把同一条规则写两处。
   */
  const openEditDeskWithSelection = useCallback(() => {
    openEditDesk(graph.selectedNodeIds)
  }, [openEditDesk, graph.selectedNodeIds])

  const exitEditDesk = useCallback(() => {
    setEditMode(false)
    setEditDeskSeed([])
    writeEditModeParam(false)
  }, [writeEditModeParam])

  /** 「回节点重生成这段」：关模式 + 定位并选中来源卡。 */
  const backToNodeFromEditDesk = useCallback(
    (nodeId: string) => {
      exitEditDesk()
      focusNode(nodeId)
      graph.onRfNodesChange([{ id: nodeId, type: 'select', selected: true }])
    },
    [exitEditDesk, focusNode, graph],
  )

  const actions = useMemo<NodeCanvasActions>(
    () => ({
      applyOp: async (op) => {
        graph.dispatch(op)
      },
      focusNode,
      focusGeneratedNodes,
      undo: graph.undo,
      // 视频卡 ⋯「加入剪辑台」走这条（spec §6「入口」的第三条）。
      openEditDesk,
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
      openEditDesk,
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

  /**
   * 空白处的两个手势 → 同一份落点（相对画布容器的屏幕坐标 + 画布坐标）。
   * 双击弹四颗小图标、右键弹菜单，⛔ 两者互斥（后开的把先开的关掉）。
   */
  const readPointerAnchor = useCallback(
    (event: ReactMouseEvent | MouseEvent): CanvasPointerAnchor => {
      const rect = canvasRef.current?.getBoundingClientRect()
      return {
        screen: {
          x: event.clientX - (rect?.left ?? 0),
          y: event.clientY - (rect?.top ?? 0),
        },
        client: { x: event.clientX, y: event.clientY },
        flow: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      }
    },
    [screenToFlowPosition],
  )

  const onPaneDoubleClick = useCallback(
    (event: ReactMouseEvent) => {
      setPaneMenu(null)
      setQuickAdd(readPointerAnchor(event))
    },
    [readPointerAnchor],
  )

  const onPaneContextMenu = useCallback(
    (event: ReactMouseEvent | MouseEvent) => {
      event.preventDefault()
      setQuickAdd(null)
      setPaneMenu(readPointerAnchor(event))
    },
    [readPointerAnchor],
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
          <ShellAssistantFrame
            open={assistantOpen}
            showStrip={assistantEverOpened}
            width={isMobile ? undefined : assistantWidth}
            onWidthChange={setAssistantWidth}
            onOpen={() => setAssistantOpen(true)}
          >
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
          </ShellAssistantFrame>
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
            onDeriveFromText={deriveFromText}
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
                onPaneDoubleClick={onPaneDoubleClick}
                onPaneContextMenu={onPaneContextMenu}
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
              />
              {graph.nodes.length === 0 ? (
                <div className="pointer-events-none absolute inset-x-4 bottom-24 top-20 z-canvas-selection flex items-center justify-center md:inset-x-8 md:bottom-16 md:top-24">
                  <NodeCanvasEmptyGuide
                    onChatOutline={() => {
                      setAssistantOpen(true)
                      setAssistantExpanded(true)
                    }}
                    onAddNode={() => setPaletteOpen(true)}
                  />
                </div>
              ) : null}
              <div className="pointer-events-none absolute inset-0 z-canvas-chrome">
                <ShellTopBar
                  projectName={store.currentProject.name}
                  projects={store.projects}
                  currentProjectId={store.currentProject.id}
                  isSaving={dnd.isUploading}
                  onSwitchProject={store.switchProject}
                  onCreateProject={() => setProjectDialogMode('create')}
                  onRenameProject={() => setProjectDialogMode('rename')}
                  onDuplicateProject={() => setProjectDialogMode('duplicate')}
                  onDeleteProject={() => setDeleteConfirmOpen(true)}
                  onOpenEditDesk={openEditDeskWithSelection}
                  assistantOpen={assistantOpen}
                  // 右上那颗是**开关**：再点一次收起（收起后右缘留一条，画板
                  // `ChromeAssistant.dc.html`）。
                  onOpenAssistant={() => {
                    setAssistantOpen(!assistantOpen)
                    setAssistantEverOpened(true)
                  }}
                />
                <ShellSidePanels
                  activePanel={activePanel}
                  onActivePanelChange={setActivePanel}
                  nodeQuery={nodeQuery}
                  onNodeQueryChange={setNodeQuery}
                  onUpload={() => openUpload()}
                />
                <ShellBottomBar
                  toolMode={toolMode}
                  onToolModeChange={setToolMode}
                  canUndo={graph.canUndo}
                  canRedo={graph.canRedo}
                  onUndo={graph.undo}
                  onRedo={graph.redo}
                  onTidyLayout={graph.tidyLayout}
                />
                <ShellQuickAdd
                  at={quickAdd?.screen ?? null}
                  onAdd={(intentId) =>
                    addNodeFromIntent(intentId, quickAdd?.flow)
                  }
                  onUpload={() => openUpload(quickAdd?.client)}
                  onClose={() => setQuickAdd(null)}
                />
                <ShellPaneMenu
                  at={paneMenu?.screen ?? null}
                  onAdd={(intentId) =>
                    addNodeFromIntent(intentId, paneMenu?.flow)
                  }
                  onUpload={() => openUpload(paneMenu?.client)}
                  onPaste={() => {
                    graph.pasteClipboard()
                    setPaneMenu(null)
                  }}
                  onTidyLayout={() => {
                    graph.tidyLayout()
                    setPaneMenu(null)
                  }}
                  onFitView={() => {
                    fitAllNodes()
                    setPaneMenu(null)
                  }}
                  onClose={() => setPaneMenu(null)}
                />
                <ShellCommandPalette
                  open={paletteOpen}
                  onOpenChange={setPaletteOpen}
                  nodes={graph.nodes}
                  projects={store.projects}
                  currentProjectId={store.currentProject.id}
                  onFocusNode={focusNode}
                  onAdd={addNodeAtViewportCenter}
                  onUpload={() => openUpload()}
                  onAskAssistant={() => {
                    setAssistantOpen(true)
                    setAssistantEverOpened(true)
                  }}
                  onOpenEditDesk={openEditDeskWithSelection}
                  onSwitchProject={store.switchProject}
                  onManageChannels={openApiKeys}
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
                  accept={CANVAS_SHELL_UPLOAD_ACCEPT}
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? [])
                    event.target.value = ''
                    if (files.length === 0) return
                    const at = uploadPointRef.current
                    uploadPointRef.current = null
                    const rect = canvasRef.current?.getBoundingClientRect()
                    dnd.dropFiles(
                      files,
                      at ?? {
                        x: (rect?.left ?? 0) + (rect?.width ?? 0) / 2,
                        y: (rect?.top ?? 0) + (rect?.height ?? 0) / 2,
                      },
                    )
                  }}
                />
              </div>
              {/* 剪辑台盖在外壳**之上**（S8）：画布留在 DOM 里只是被盖住，
                  退出时视口与选择原样还在。 */}
              {editMode ? (
                <EditDesk
                  state={graph.state}
                  projectId={store.currentProject.id}
                  dispatchBatch={graph.dispatchBatch}
                  mintId={mintEditId}
                  addNode={graph.addNode}
                  setMedia={graph.setMedia}
                  connect={graph.connect}
                  canUndo={graph.canUndo}
                  onUndo={graph.undo}
                  onExit={exitEditDesk}
                  onBackToNode={backToNodeFromEditDesk}
                  initialNodeIds={editDeskSeed}
                  onInitialConsumed={() => setEditDeskSeed([])}
                />
              ) : null}
              <ProjectNameDialog
                open={projectDialogMode !== null}
                title={
                  projectDialogMode === 'rename'
                    ? t('projectDialog.renameTitle')
                    : projectDialogMode === 'duplicate'
                      ? tShell('project.duplicate')
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
                    : projectDialogMode === 'duplicate'
                      ? tShell('project.duplicateSuffix', {
                          name: store.currentProject.name,
                        })
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
                  } else if (projectDialogMode === 'duplicate') {
                    store.duplicateProject(store.currentProject.id, name)
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
