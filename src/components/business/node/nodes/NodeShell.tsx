'use client'

import type { ReactNode } from 'react'
import { Handle, Position } from '@xyflow/react'
import { useTranslations } from 'next-intl'

import {
  NODE_ACCENTS,
  NODE_TOKEN_BADGE_LABELS,
  type NodeTokenType,
} from '@/constants/node-tokens'
import type { NodeWorkflowStatus } from '@/constants/node-types'
import { cn } from '@/lib/utils'

import { NodeStatusBadge } from './NodeStatusBadge'

interface NodeShellRootProps {
  type: NodeTokenType
  selected?: boolean
  children: ReactNode
  showSourceHandle?: boolean
  showTargetHandle?: boolean
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
}

interface NodeShellSlotProps {
  children: ReactNode
  className?: string
}

function NodeShellRoot({
  type,
  selected,
  children,
  showSourceHandle = true,
  showTargetHandle = true,
}: NodeShellRootProps) {
  const accent = NODE_ACCENTS[type]

  return (
    <article
      className={cn(
        'group relative w-80 overflow-visible rounded-2xl border bg-node-panel text-node-foreground shadow-node-panel transition-colors',
        selected
          ? cn('border-node-foreground/70 ring-2', accent.selectedRing)
          : 'border-node-panel-inner/80 hover:border-node-muted/70',
      )}
    >
      {showTargetHandle ? (
        <Handle
          type="target"
          position={Position.Left}
          className={cn(
            '!z-10 !size-4 !border-2 !border-node-canvas ring-2 ring-node-canvas transition-transform hover:!scale-125',
            accent.dot,
          )}
        />
      ) : null}
      {showSourceHandle ? (
        <Handle
          type="source"
          position={Position.Right}
          className={cn(
            '!z-10 !size-4 !border-2 !border-node-canvas ring-2 ring-node-canvas transition-transform hover:!scale-125',
            accent.dot,
          )}
        />
      ) : null}
      {children}
    </article>
  )
}

function NodeShellHeader({ type, status, title }: NodeShellHeaderProps) {
  const t = useTranslations('StudioNode.nodeTypes')
  const accent = NODE_ACCENTS[type]
  const trimmedTitle = title?.trim()
  const displayTitle =
    trimmedTitle && trimmedTitle.length > 0 ? trimmedTitle : t(type)

  return (
    <header className="flex items-center justify-between gap-3 border-b border-node-panel-inner/80 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold',
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
      <NodeStatusBadge status={status} />
    </header>
  )
}

function NodeShellBody({ children, className }: NodeShellSlotProps) {
  return <div className={cn('px-4 py-3', className)}>{children}</div>
}

function NodeShellFooter({ children, className }: NodeShellSlotProps) {
  return (
    <footer
      className={cn(
        'flex items-center justify-between gap-2 border-t border-node-panel-inner/80 px-4 py-3',
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
