'use client'

import type { ReactNode } from 'react'
import { Handle, Position } from '@xyflow/react'
import { useTranslations } from 'next-intl'

import { NODE_ACCENTS, type NodeTokenType } from '@/constants/node-tokens'
import type { NodeWorkflowStatus } from '@/constants/node-types'
import { cn } from '@/lib/utils'

import { NodeStatusBadge } from './NodeStatusBadge'

interface NodeShellRootProps {
  type: NodeTokenType
  selected?: boolean
  children: ReactNode
}

interface NodeShellHeaderProps {
  type: NodeTokenType
  status: NodeWorkflowStatus
}

interface NodeShellSlotProps {
  children: ReactNode
  className?: string
}

function NodeShellRoot({ type, selected, children }: NodeShellRootProps) {
  const accent = NODE_ACCENTS[type]

  return (
    <article
      className={cn(
        'relative w-80 overflow-visible rounded-3xl border bg-node-panel text-node-foreground shadow-node-panel transition-colors',
        selected
          ? cn('border-node-foreground/70 ring-2', accent.selectedRing)
          : 'border-node-panel-inner/80 hover:border-node-muted/70',
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className={cn(
          '!z-10 !size-4 !border-2 !border-node-canvas ring-2 ring-node-canvas transition-transform hover:!scale-125',
          accent.dot,
        )}
      />
      <Handle
        type="source"
        position={Position.Right}
        className={cn(
          '!z-10 !size-4 !border-2 !border-node-canvas ring-2 ring-node-canvas transition-transform hover:!scale-125',
          accent.dot,
        )}
      />
      {children}
    </article>
  )
}

function NodeShellHeader({ type, status }: NodeShellHeaderProps) {
  const t = useTranslations('StudioNode.nodeTypes')
  const accent = NODE_ACCENTS[type]

  return (
    <header className="flex items-center justify-between gap-3 border-b border-node-panel-inner/80 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-xl text-xs font-bold',
            accent.iconPlate,
            accent.iconText,
          )}
          aria-hidden
        >
          C
        </span>
        <span className="truncate text-sm font-semibold text-node-foreground">
          {t(type)}
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
