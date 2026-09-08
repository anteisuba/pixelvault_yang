'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { useEdges, useNodes } from '@xyflow/react'
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Eye,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { NODE_V4_SUBTYPE_LABELS } from '@/constants/node-studio'
import { formatShotDisplayName } from '@/lib/node-display-name'
import type {
  NodeV4,
  NodeV4Data,
  NodeWorkflowEdgeV4,
} from '@/types/node-workflow'

import { MediaReviewButtonsV4 } from './nodes/v4/MediaReviewButtonsV4'
import { CastDock } from './CastDock'
import {
  CANVAS_LEFT_PANEL_VIEW_IDS,
  type CanvasLeftPanelView,
} from './CanvasLeftPanel'
import { useNodeCanvasActions } from './nodes/v4/NodeV4ActionsBridge'
import { NodeStatusBadge } from './shared/NodeStatusBadge'
import { NodeVideoSurface } from './shared/NodeVideoSurface'

/**
 * 包 H（画布修法《手机 390px：能看、能审，不假装能编》，2026-08-26）。
 *
 * ── 为什么是「浮在画布上方的独立覆盖层」，而不是「桌面画布的移动分支」 ──────
 * 桌面 ReactFlow 保持挂载，移动列表复用同一份节点和边。
 * 覆盖层放在 CanvasWorkspaceLayout 的 stage 内，受 stage 的层叠上下文约束；
 * 这样它盖住桌面 chrome，但不会盖住 stage 外的助手 rail。
 * 用户点「查看画布」时这层覆盖层本身收起，露出的就是桌面那张缩微图——
 * 调查原话「能看到，很难做」在那条路径上原样保留，因为那条路径本来就没有
 * 被这个任务包要求重做，只是从默认路径退到了一个要主动点进去的入口后面。
 *
 * ── 复用点（横切纪律①「契约派生，不手写」）────────────────────────────────
 * · 列表 = `CastDock`（新增一个可选的 `onSelectNode`，省略时字节级不变）——
 *   不重新实现分组/搜索/名字解析。
 * · 审阅 = `useNodeCanvasActions().reviewMode`（既有 hook 的整个状态机）+
 *   `MediaReviewButtons`（既有的通过/打回按钮，`GenerateComposer` 里就是这颗）。
 *   本文件一行审核逻辑都没有新写。
 * · 状态章 = `NodeStatusBadge`；视频播放 = `NodeVideoSurface`；连接关系的
 *   上游 = 既有导出 `getUpstreamNodes`（下游是它的对称写法，节点图里没有共享
 *   的「下游」导出，`CanvasImageSelectionToolbar.tsx` 的 `PerformancesButton`
 *   也是就地写的同款两行 `edges.filter(source===id).map(target)`）。
 *
 * ── 关掉做不了的（横切纪律⑤「形态即说明」）─────────────────────────────
 * 生成 / 拖拽建边 / 多选合成三件事在这棵树里**没有对应入口**——不是置灰，是
 * 从未渲染：`CastDock` 本来就没有创建/编辑/删除控件（见其文件头注），预览只读
 * 媒体 + 状态章 + 通过/打回，没有 prompt 框、没有模型选择器、没有「重新生成」。
 */

/**
 * 类型名读**子型标签表**（`image.character` → 「角色」）。
 * ⛔ 不查 `nodeTypes.*`：那张表的键是 legacy type，v4 查不到只会把 kind 原样吐出来。
 */
function resolveV4TypeLabel(data: NodeV4Data): string {
  return NODE_V4_SUBTYPE_LABELS[`${data.kind}.${data.subtype}`] ?? data.subtype
}

/** 显示名 = 稳定名；镜头带 `S02·` 序号前缀（与定位器同一条）。 */
function resolveV4NodeName(data: NodeV4Data): string {
  return data.kind === NODE_MEDIA_KIND_IDS.video
    ? formatShotDisplayName(data.label ?? data.name, data.shotNo)
    : data.name
}

interface CanvasMobileViewProps {
  /** 用户主动点了「查看画布」，正停在桌面缩微画布上。 */
  peeking: boolean
  projectPanel?: ReactNode
  assistantHistoryPanel?: ReactNode
  onEnterPeek(): void
  onExitPeek(): void
}

function resolveUpstreamNodes(
  nodeId: string,
  edges: readonly NodeWorkflowEdgeV4[],
  nodes: readonly NodeV4[],
): NodeV4[] {
  const sourceIds = new Set<string>()
  for (const edge of edges) {
    if (edge.target === nodeId) sourceIds.add(edge.source)
  }
  return nodes.filter((node) => sourceIds.has(node.id))
}

function resolveDownstreamNodes(
  nodeId: string,
  edges: readonly NodeWorkflowEdgeV4[],
  nodes: readonly NodeV4[],
): NodeV4[] {
  const targetIds = new Set<string>()
  for (const edge of edges) {
    if (edge.source === nodeId) targetIds.add(edge.target)
  }
  return nodes.filter((node) => targetIds.has(node.id))
}

function ConnectionGroup({
  icon: Icon,
  label,
  items,
  onSelect,
}: {
  icon: typeof ArrowUpRight
  label: string
  items: readonly NodeV4[]
  onSelect(nodeId: string): void
}) {
  if (items.length === 0) return null

  return (
    <section className="flex flex-col gap-1.5">
      <div
        className="flex items-center gap-1.5 px-1"
        style={{ color: 'var(--canvas-ink-muted)' }}
      >
        <Icon className="size-3.5 shrink-0" aria-hidden />
        <h3 className="text-2xs font-semibold">{label}</h3>
        <span className="ml-auto text-2xs tabular-nums">{items.length}</span>
      </div>
      <div className="flex flex-col gap-1">
        {items.map((node) => {
          const typeLabel = resolveV4TypeLabel(node.data)
          const name = resolveV4NodeName(node.data)
          return (
            <button
              key={node.id}
              type="button"
              onClick={() => onSelect(node.id)}
              className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-node-panel-inner/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-node-foreground">
                {name}
              </span>
              <span className="shrink-0 truncate text-2xs text-node-subtle">
                {typeLabel}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

interface CanvasMobileNodePreviewProps {
  node: NodeV4
  nodes: readonly NodeV4[]
  edges: readonly NodeWorkflowEdgeV4[]
  onSelectNode(nodeId: string): void
}

function CanvasMobileNodePreview({
  node,
  nodes,
  edges,
  onSelectNode,
}: CanvasMobileNodePreviewProps) {
  const tMobile = useTranslations('StudioNode.mobileCanvas')

  const { data } = node
  const typeLabel = resolveV4TypeLabel(data)
  const name = resolveV4NodeName(data)
  const kind = data.kind
  const isText = kind === NODE_MEDIA_KIND_IDS.text
  const mediaUrl = isText ? undefined : data.url
  // 文本卡的正文就是它交付的东西；有画面的卡回落到提示词（只读，看一眼当时写了啥）。
  const textContent = isText ? data.body : data.prompt
  const videoThumbnailUrl = isText ? undefined : data.videoThumbnailUrl

  const upstream = useMemo(
    () => resolveUpstreamNodes(node.id, edges, nodes),
    [node.id, edges, nodes],
  )
  const downstream = useMemo(
    () => resolveDownstreamNodes(node.id, edges, nodes),
    [node.id, edges, nodes],
  )

  return (
    <div
      className="flex flex-col gap-4 p-3"
      data-testid="canvas-mobile-node-preview"
    >
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="min-w-0 truncate text-base font-semibold text-node-foreground">
            {name}
          </h2>
          <NodeStatusBadge status={node.data.status} />
        </div>
        <span className="text-xs text-node-muted">{typeLabel}</span>
      </div>

      <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-node-panel-inner">
        {kind === NODE_MEDIA_KIND_IDS.video && mediaUrl ? (
          <NodeVideoSurface
            src={mediaUrl}
            poster={videoThumbnailUrl}
            fit="contain"
          />
        ) : kind === NODE_MEDIA_KIND_IDS.audio && mediaUrl ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
            <audio src={mediaUrl} controls className="w-full" />
          </div>
        ) : kind === NODE_MEDIA_KIND_IDS.image && mediaUrl ? (
          // 与 CastDock 行缩略图同源（任意 R2/用户媒体走原生 <img>），但这里是
          // 这一屏唯一、占满整块的主体媒体（不是旁边有文字标签的小缩略图），
          // alt 因此给节点名而不是空字符串——空 alt 会让它在无障碍树里被判成
          // 纯装饰，读屏用户在「只读预览」这个专门给「看」用的屏幕上反而什么
          // 都听不到。
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl} alt={name} className="size-full object-contain" />
        ) : textContent ? (
          <p className="h-full overflow-y-auto whitespace-pre-wrap p-4 text-sm text-node-foreground">
            {textContent}
          </p>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-node-subtle">
            {tMobile('emptyMedia')}
          </div>
        )}
      </div>

      {mediaUrl ? <MediaReviewButtonsV4 nodeId={node.id} data={data} /> : null}

      <ConnectionGroup
        icon={ArrowUpRight}
        label={tMobile('fedBy')}
        items={upstream}
        onSelect={onSelectNode}
      />
      <ConnectionGroup
        icon={ArrowDownRight}
        label={tMobile('feeds')}
        items={downstream}
        onSelect={onSelectNode}
      />
      {upstream.length === 0 && downstream.length === 0 ? (
        <p className="px-1 text-xs text-node-subtle">
          {tMobile('noConnections')}
        </p>
      ) : null}
    </div>
  )
}

export function CanvasMobileView({
  peeking,
  onEnterPeek,
  onExitPeek,
  projectPanel,
  assistantHistoryPanel,
}: CanvasMobileViewProps) {
  const t = useTranslations('StudioNode')
  const tReviewMode = useTranslations('StudioNode.reviewMode')
  const tMobile = useTranslations('StudioNode.mobileCanvas')
  // ③d-4 起 RF store 里只有 v4 节点。
  const nodes = useNodes<NodeV4>()
  const edges = useEdges<NodeWorkflowEdgeV4>()
  const { reviewMode } = useNodeCanvasActions()
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [view, setView] = useState<CanvasLeftPanelView>(
    CANVAS_LEFT_PANEL_VIEW_IDS.cast,
  )

  // 审阅模式接管预览目标：进审阅时 `reviewMode.current` 才是「现在该看哪张」，
  // 翻页（goNext/goPrev）也会改它——这里跟着走而不是自己另维护一份游标，
  // 否则「下一张」翻的是 reviewMode 的账，屏幕上却还停在上一张。
  const previewNodeId = reviewMode?.active
    ? (reviewMode.current?.nodeId ?? null)
    : activeNodeId
  const previewNode = previewNodeId
    ? (nodes.find((node) => node.id === previewNodeId) ?? null)
    : null

  const handleBack = () => {
    if (reviewMode?.active) {
      reviewMode.exit()
      return
    }
    setActiveNodeId(null)
  }

  const handleStartReview = () => {
    if (!reviewMode) return
    const first = reviewMode.queue[0]
    reviewMode.enter()
    setActiveNodeId(first?.nodeId ?? null)
  }

  if (peeking) {
    // 明确的「查看画布」入口后面（调查原话「能看到，很难做」的那张缩微图）：
    // 这一层只留一个回列表的按钮，其余全部 pointer-events 透给桌面画布——
    // 桌面 chrome 与 ReactFlow 从未卸载，只是被上面这层不透明覆盖层盖住过；
    // 收起覆盖层本身即可露出，不需要重新挂载任何东西。
    return (
      <div className="domain-canvas pointer-events-none absolute inset-0 z-canvas-workspace">
        <button
          type="button"
          onClick={onExitPeek}
          aria-label={tMobile('backToList')}
          className="canvas-glass canvas-peek-exit pointer-events-auto absolute left-3 flex h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-node-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {tMobile('backToList')}
        </button>
      </div>
    )
  }

  return (
    <div
      data-testid="canvas-mobile-view"
      className="domain-canvas absolute inset-0 z-canvas-workspace flex flex-col overflow-hidden bg-node-canvas text-node-foreground"
    >
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-node-panel-inner bg-node-panel px-1">
        {previewNode ? (
          <button
            type="button"
            onClick={handleBack}
            aria-label={tMobile('backToList')}
            className="flex h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-node-foreground hover:bg-node-panel-inner"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </button>
        ) : (
          <span className="flex h-11 shrink-0 items-center gap-1.5 pl-2 text-sm font-semibold text-node-foreground">
            {t('castDock.title')}
            <span className="text-xs font-normal tabular-nums text-node-muted">
              {nodes.length}
            </span>
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-node-foreground">
          {previewNode ? resolveV4NodeName(previewNode.data) : null}
        </span>
        <button
          type="button"
          onClick={onEnterPeek}
          aria-label={tMobile('viewCanvas')}
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-node-muted hover:bg-node-panel-inner hover:text-node-foreground"
        >
          <Eye className="size-4" aria-hidden />
          {tMobile('viewCanvas')}
        </button>
      </header>

      {projectPanel && assistantHistoryPanel ? (
        <nav className="flex shrink-0 gap-1 border-b border-node-panel-inner px-2 py-1">
          {[
            { id: CANVAS_LEFT_PANEL_VIEW_IDS.cast, label: t('castDock.title') },
            {
              id: CANVAS_LEFT_PANEL_VIEW_IDS.projects,
              label: t('projectMenu.current'),
            },
            {
              id: CANVAS_LEFT_PANEL_VIEW_IDS.assistantHistory,
              label: t('history.title'),
            },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={view === item.id}
              onClick={() => setView(item.id)}
              className="min-h-11 min-w-0 flex-1 rounded-lg px-2 text-sm font-medium text-node-muted aria-pressed:bg-node-panel-inner aria-pressed:text-node-foreground"
            >
              {item.label}
            </button>
          ))}
        </nav>
      ) : null}

      {view === CANVAS_LEFT_PANEL_VIEW_IDS.cast &&
      !previewNode &&
      !reviewMode?.active &&
      (reviewMode?.remaining ?? 0) > 0 ? (
        <button
          type="button"
          onClick={handleStartReview}
          className="flex min-h-11 shrink-0 items-center justify-center gap-2 border-b border-node-panel-inner bg-node-paint/10 px-3 py-2 text-center text-sm font-semibold text-node-paint"
        >
          <ClipboardCheck className="size-4 shrink-0" aria-hidden />
          {t('topbar.startReview', { count: reviewMode?.remaining ?? 0 })}
        </button>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {view === CANVAS_LEFT_PANEL_VIEW_IDS.projects ? (
          projectPanel
        ) : view === CANVAS_LEFT_PANEL_VIEW_IDS.assistantHistory ? (
          assistantHistoryPanel
        ) : previewNodeId && !previewNode ? (
          <p className="p-4 text-sm text-node-subtle">
            {tMobile('removedNotice')}
          </p>
        ) : previewNode ? (
          <CanvasMobileNodePreview
            node={previewNode}
            nodes={nodes}
            edges={edges}
            onSelectNode={setActiveNodeId}
          />
        ) : (
          <CastDock
            query={query}
            onQueryChange={setQuery}
            onSelectNode={setActiveNodeId}
          />
        )}
      </div>

      {view === CANVAS_LEFT_PANEL_VIEW_IDS.cast &&
      reviewMode?.active &&
      previewNode ? (
        <footer className="flex h-14 shrink-0 items-center justify-center gap-4 border-t border-node-panel-inner bg-node-panel px-2">
          <button
            type="button"
            onClick={reviewMode.goPrev}
            disabled={!reviewMode.hasPrev}
            aria-label={tReviewMode('previous')}
            className="flex h-11 min-w-11 items-center justify-center rounded-lg text-node-foreground hover:bg-node-panel-inner disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <span className="text-xs font-medium tabular-nums text-node-muted">
            {tReviewMode('remaining', { count: reviewMode.remaining })}
          </span>
          <button
            type="button"
            onClick={reviewMode.goNext}
            disabled={!(reviewMode.hasNext || reviewMode.currentDecided)}
            aria-label={tReviewMode('next')}
            className="flex h-11 min-w-11 items-center justify-center rounded-lg text-node-foreground hover:bg-node-panel-inner disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronRight className="size-5" aria-hidden />
          </button>
        </footer>
      ) : null}
    </div>
  )
}
