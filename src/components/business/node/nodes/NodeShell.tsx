'use client'

import { useMemo, type ReactNode } from 'react'
import {
  Handle,
  NodeToolbar,
  Position,
  useEdges,
  useNodes,
} from '@xyflow/react'
import {
  AudioWaveform,
  Maximize2,
  Mountain,
  Play,
  Trash2,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  NODE_ACCENTS,
  NODE_TOKEN_BADGE_LABELS,
  type NodeTokenType,
} from '@/constants/node-tokens'
import {
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
  type NodeWorkflowStatus,
} from '@/constants/node-types'
import { resolveNodePresentationType } from '@/lib/node-presentation'
import { getUpstreamNodes } from '@/lib/node-workflow-graph'
import { cn } from '@/lib/utils'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'

import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { NodeStatusBadge } from './NodeStatusBadge'

/** S2 成分栏最多展示的 chip 数，溢出折叠为「+N」（施工图改动清单⑤）。 */
const MAX_VISIBLE_INGREDIENTS = 4

interface NodeShellRootProps {
  type: NodeTokenType
  /** When set, a Figma-style floating toolbar (⤢ / delete) shows on select. */
  nodeId?: string
  selected?: boolean
  /** When `failed`, the card gets a red border (must-1 失败态). Optional so
   *  existing callers are unaffected; node cards pass their `data.status`. */
  status?: NodeWorkflowStatus
  children: ReactNode
  showSourceHandle?: boolean
  showTargetHandle?: boolean
  /** Shot-override signal (§5.1): the node's model differs from the canvas
   *  default → a neutral dashed border (no amber, per D1) so it's scannable. */
  overridden?: boolean
  /** Extra classes on the card root — e.g. an override width when expanded. */
  className?: string
}

interface NodeShellHeaderProps {
  type: NodeTokenType
  status: NodeWorkflowStatus
  /**
   * Optional override for the header's display name. Defaults to the
   * localized node-type label (e.g. "角色图"). Used by nodes that carry
   * a user-editable identity — for example a Character Image node shows
   * its characterName here so the canvas card title tracks renames done
   * in the Inspector.
   */
  title?: string
  /** Optional clickable breadcrumb crumb rendered before the title (e.g. a
   *  "图片 /" link on image cards that returns to the role chooser). */
  titleCrumb?: ReactNode
  /** Optional control rendered next to the status badge (e.g. a ⤢ toggle). */
  action?: ReactNode
}

interface NodeShellSlotProps {
  children: ReactNode
  className?: string
}

// §2.3 端口图标：4 个导演元素族各一个 glyph，渲在端口内（pointer-events-none，
// 不抢 ReactFlow 的拖拽热区）；通用节点无 glyph（纯点）。
const PORT_GLYPHS: Partial<Record<NodeTokenType, LucideIcon>> = {
  characterImage: UserRound,
  backgroundImage: Mountain,
  voice: AudioWaveform,
  seedance: Play,
  videoReference: Play,
  videoMerge: Play,
  video: Play,
}

// 公共 handle 基样式：尺寸 + 与画板分隔的 canvas 环 + hover 放大（125% 为标准 scale
// 档，避免 arbitrary value）。输出/输入再各自叠加实心/描边。
const HANDLE_BASE =
  '!z-10 flex !size-5 items-center justify-center ring-2 ring-node-canvas transition-transform hover:!scale-125'

function NodeShellRoot({
  type,
  nodeId,
  selected,
  status,
  children,
  showSourceHandle = true,
  showTargetHandle = true,
  overridden = false,
  className,
}: NodeShellRootProps) {
  const t = useTranslations('StudioNode.nodeToolbar')
  const { setExpandedNodeId, deleteNode } = useNodeWorkflowActions()
  const accent = NODE_ACCENTS[type]
  const Glyph = PORT_GLYPHS[type]
  const isFailed = status === NODE_STATUS_IDS.failed

  return (
    <article
      className={cn(
        // node-card-paper = S2 场记卡作用域（容器级变量覆盖，globals.css）。
        // rounded-sm（非 rounded-md）：本项目 --radius-md 被 shadcn --radius 公式
        // 重定到 8px，rounded-sm 才是这套刻度里精确落在施工图标注 6px 的一档
        // （--radius-sm = --radius(10px) - 4px = 6px；S2 报告有算式）。
        'group relative w-node-card overflow-visible rounded-sm border bg-node-panel text-node-foreground shadow-node-panel transition-colors node-card-paper',
        selected
          ? 'border-node-paint/70 ring-2 ring-node-paint/60'
          : isFailed
            ? 'border-node-status-failed'
            : overridden
              ? 'border-dashed border-node-card-ink-subtle hover:border-node-card-ink'
              : 'border-node-card-line hover:border-node-card-ink-subtle',
        className,
      )}
    >
      {nodeId ? (
        <NodeToolbar
          nodeId={nodeId}
          isVisible={Boolean(selected)}
          position={Position.Top}
          offset={8}
        >
          <div className="flex items-center gap-1 rounded-xl border border-node-panel-inner bg-node-panel/95 p-1 shadow-node-panel backdrop-blur">
            <button
              type="button"
              onClick={() => setExpandedNodeId(nodeId)}
              aria-label={t('expand')}
              title={t('expand')}
              className="flex size-7 items-center justify-center rounded-lg text-node-muted transition-colors hover:bg-node-panel-inner hover:text-node-foreground"
            >
              <Maximize2 className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => deleteNode(nodeId)}
              aria-label={t('delete')}
              title={t('delete')}
              className="flex size-7 items-center justify-center rounded-lg text-node-muted transition-colors hover:bg-node-status-failed/40 hover:text-node-status-failed-fg"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </NodeToolbar>
      ) : null}
      {showTargetHandle ? (
        <Handle
          type="target"
          position={Position.Left}
          className={cn(
            HANDLE_BASE,
            '!border-2 !bg-node-canvas',
            accent.dotRing,
          )}
        >
          {Glyph ? (
            <Glyph
              className={cn('pointer-events-none size-3', accent.iconText)}
            />
          ) : null}
        </Handle>
      ) : null}
      {showSourceHandle ? (
        <Handle
          type="source"
          position={Position.Right}
          className={cn(
            HANDLE_BASE,
            '!border-2 !border-node-canvas',
            accent.dot,
          )}
        >
          {Glyph ? (
            <Glyph className="pointer-events-none size-3 text-node-canvas" />
          ) : null}
        </Handle>
      ) : null}
      {children}
    </article>
  )
}

function NodeShellHeader({
  type,
  status,
  title,
  titleCrumb,
  action,
}: NodeShellHeaderProps) {
  const t = useTranslations('StudioNode.nodeTypes')
  const accent = NODE_ACCENTS[type]
  const trimmedTitle = title?.trim()
  const displayTitle =
    trimmedTitle && trimmedTitle.length > 0 ? trimmedTitle : t(type)

  return (
    <header className="flex items-center justify-between gap-3 rounded-t-sm border-b border-node-card-line bg-node-panel-inner px-5 py-4">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold',
            accent.iconPlate,
            accent.iconText,
          )}
          aria-hidden
        >
          {NODE_TOKEN_BADGE_LABELS[type]}
        </span>
        <div className="flex min-w-0 items-center gap-1.5 text-sm">
          {titleCrumb}
          <span
            className="truncate font-semibold text-node-foreground"
            title={displayTitle}
          >
            {displayTitle}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {action}
        <NodeStatusBadge status={status} />
      </div>
    </header>
  )
}

interface NodeShellIngredientsProps {
  /** The node whose incoming edges are summarized. Matches the `nodeId` this
   *  card already passes to `NodeShellRoot` — same graph-store read pattern
   *  as the Inspector reference chips (ShotInspector), just compact + inert. */
  nodeId: string
}

/**
 * S2 成分栏，S5b B1-7 只读升级为可解绑：片头条下的 chip 行，摘要「这张卡吃了
 * 哪些上游连线」，hover 露出 × 解除对应边（= 吞噬「胃取出」的紧凑卡等效，和
 * 详情面板参考素材分区的「取出」同一颗 deleteEdge）。新 chip 首次挂载播放
 * 消化落定 pop（§8，globals.css `.node-ingest-chip-pop`，只在挂载时播放一次，
 * 已存在的 chip 重渲染不会重放）。空（叶子节点/未连线）则不渲染整行。
 */
function NodeShellIngredients({ nodeId }: NodeShellIngredientsProps) {
  const tTypes = useTranslations('StudioNode.nodeTypes')
  const tVideo = useTranslations('StudioNode.videoGeneration')
  const tIngest = useTranslations('StudioNode.ingest')
  const allNodes = useNodes<NodeWorkflowNode>()
  const edges = useEdges<NodeWorkflowEdge>()
  const { deleteEdge } = useNodeWorkflowActions()

  const upstream = useMemo(
    () => getUpstreamNodes(nodeId, edges, allNodes),
    [nodeId, edges, allNodes],
  )

  if (upstream.length === 0) {
    return null
  }

  const visible = upstream.slice(0, MAX_VISIBLE_INGREDIENTS)
  const overflow = upstream.length - visible.length

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 border-b border-node-card-line px-5 py-2"
      title={tVideo('upstreamTitle')}
    >
      {visible.map((sourceNode) => {
        const presentationType = resolveNodePresentationType(sourceNode)
        const Glyph = PORT_GLYPHS[presentationType]
        const data = sourceNode.data
        // Named sources (character/background/shot/voice) show their own
        // name — mirrors NodeMediaPreview's per-role header title so the same
        // node reads with the same label everywhere. Everything else falls
        // back to the localized type label (identical to NodeShell.Header's
        // own fallback for an untitled card).
        const customName =
          presentationType === NODE_TYPE_IDS.characterImage
            ? data.characterName?.trim() || data.character?.name?.trim()
            : presentationType === NODE_TYPE_IDS.backgroundImage
              ? data.backgroundName?.trim()
              : presentationType === NODE_TYPE_IDS.shot
                ? data.shotName?.trim()
                : presentationType === NODE_TYPE_IDS.voice
                  ? data.voiceName?.trim()
                  : undefined
        const label = customName || tTypes(presentationType)
        const edgeId = edges.find(
          (edge) => edge.source === sourceNode.id && edge.target === nodeId,
        )?.id

        return (
          <span
            key={sourceNode.id}
            className="node-ingest-chip-pop group/chip inline-flex max-w-28 items-center gap-1 rounded-full bg-node-panel-soft py-0.5 pl-2 pr-1 text-2xs font-medium text-node-muted"
          >
            {Glyph ? <Glyph aria-hidden className="size-3 shrink-0" /> : null}
            <span className="truncate">{label}</span>
            {edgeId ? (
              <button
                type="button"
                aria-label={tIngest('removeIngredient', { name: label })}
                title={tIngest('removeIngredient', { name: label })}
                onClick={() => deleteEdge(edgeId)}
                className="nodrag flex size-3.5 shrink-0 items-center justify-center rounded-full text-node-subtle opacity-0 transition-opacity hover:text-node-status-failed focus-visible:opacity-100 group-hover/chip:opacity-100"
              >
                <X className="size-2.5" aria-hidden />
              </button>
            ) : null}
          </span>
        )
      })}
      {overflow > 0 ? (
        <span className="shrink-0 text-2xs font-medium text-node-subtle">
          +{overflow}
        </span>
      ) : null}
    </div>
  )
}

function NodeShellBody({ children, className }: NodeShellSlotProps) {
  return <div className={cn('px-5 py-4', className)}>{children}</div>
}

function NodeShellFooter({ children, className }: NodeShellSlotProps) {
  return (
    <footer
      className={cn(
        'flex items-center justify-between gap-2 border-t border-node-card-line px-5 py-4',
        className,
      )}
    >
      {children}
    </footer>
  )
}

export const NodeShell = Object.assign(NodeShellRoot, {
  Header: NodeShellHeader,
  Ingredients: NodeShellIngredients,
  Body: NodeShellBody,
  Footer: NodeShellFooter,
})
