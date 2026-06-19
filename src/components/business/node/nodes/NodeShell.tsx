'use client'

import type { ReactNode } from 'react'
import { Handle, Position } from '@xyflow/react'
import {
  AudioWaveform,
  Mountain,
  Play,
  UserRound,
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
  type NodeWorkflowStatus,
} from '@/constants/node-types'
import { cn } from '@/lib/utils'

import { NodeStatusBadge } from './NodeStatusBadge'

interface NodeShellRootProps {
  type: NodeTokenType
  selected?: boolean
  /** When `failed`, the card gets a red border (must-1 失败态). Optional so
   *  existing callers are unaffected; node cards pass their `data.status`. */
  status?: NodeWorkflowStatus
  children: ReactNode
  showSourceHandle?: boolean
  showTargetHandle?: boolean
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
  selected,
  status,
  children,
  showSourceHandle = true,
  showTargetHandle = true,
  className,
}: NodeShellRootProps) {
  const accent = NODE_ACCENTS[type]
  const Glyph = PORT_GLYPHS[type]
  const isFailed = status === NODE_STATUS_IDS.failed

  return (
    <article
      className={cn(
        'group relative w-node-card overflow-visible rounded-2xl border bg-node-panel text-node-foreground shadow-node-panel transition-colors',
        selected
          ? cn('border-node-foreground/70 ring-2', accent.selectedRing)
          : isFailed
            ? 'border-node-status-failed'
            : 'border-node-panel-inner/80 hover:border-node-muted/70',
        className,
      )}
    >
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
  action,
}: NodeShellHeaderProps) {
  const t = useTranslations('StudioNode.nodeTypes')
  const accent = NODE_ACCENTS[type]
  const trimmedTitle = title?.trim()
  const displayTitle =
    trimmedTitle && trimmedTitle.length > 0 ? trimmedTitle : t(type)

  return (
    <header className="flex items-center justify-between gap-3 border-b border-node-panel-inner/80 px-5 py-4">
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
        <span
          className="truncate text-sm font-semibold text-node-foreground"
          title={displayTitle}
        >
          {displayTitle}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {action}
        <NodeStatusBadge status={status} />
      </div>
    </header>
  )
}

function NodeShellBody({ children, className }: NodeShellSlotProps) {
  return <div className={cn('px-5 py-4', className)}>{children}</div>
}

function NodeShellFooter({ children, className }: NodeShellSlotProps) {
  return (
    <footer
      className={cn(
        'flex items-center justify-between gap-2 border-t border-node-panel-inner/80 px-5 py-4',
        className,
      )}
    >
      {children}
    </footer>
  )
}

export const NodeShell = Object.assign(NodeShellRoot, {
  Header: NodeShellHeader,
  Body: NodeShellBody,
  Footer: NodeShellFooter,
})
