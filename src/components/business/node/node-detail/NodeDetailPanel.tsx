'use client'

import { useEffect } from 'react'
import { useNodes } from '@xyflow/react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Minimize2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { motionTransition } from '@/constants/motion'
import { NODE_ACCENTS, NODE_TOKEN_BADGE_LABELS } from '@/constants/node-tokens'
import { NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowNode } from '@/types/node-workflow'
import { cn } from '@/lib/utils'

import { NodeStatusBadge } from '../nodes/NodeStatusBadge'
import { GenericDetailBody } from './GenericDetailBody'
import { NODE_DETAIL_REGISTRY } from './registry'

interface NodeDetailPanelProps {
  expandedNodeId: string | null
  onClose(): void
}

function getNodeName(node: NodeWorkflowNode, fallback: string): string {
  if (node.type === NODE_TYPE_IDS.characterImage) {
    return (
      node.data.characterName?.trim() ||
      node.data.character?.name?.trim() ||
      fallback
    )
  }
  if (node.type === NODE_TYPE_IDS.voice) {
    return node.data.voiceName?.trim() || node.data.voiceId?.trim() || fallback
  }
  return fallback
}

/**
 * Shared ⤢ floating "详情" panel (B3). A single centered overlay over the
 * canvas — it does NOT grow the card or reflow nodes ("不挤画布"). Enter/exit
 * animate via the canvas motion canon (`AnimatePresence` keeps it mounted for
 * the exit; backdrop fades, panel scales; `DURATION.slow` + `EASE_STANDARD`;
 * `useReducedMotion` zeroes the duration). Reads the target node live from the
 * ReactFlow store, dispatches its body by node type, closes on backdrop click /
 * Escape / 收起.
 */
export function NodeDetailPanel({
  expandedNodeId,
  onClose,
}: NodeDetailPanelProps) {
  const nodes = useNodes<NodeWorkflowNode>()
  const tTypes = useTranslations('StudioNode.nodeTypes')
  const t = useTranslations('StudioNode.nodeDetail')
  const reducedMotion = useReducedMotion()

  const node = expandedNodeId
    ? (nodes.find((candidate) => candidate.id === expandedNodeId) ?? null)
    : null

  useEffect(() => {
    if (!node) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [node, onClose])

  const transition = motionTransition('slow', reducedMotion)

  return (
    <AnimatePresence>
      {node ? (
        <motion.div
          key={node.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={transition}
          className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center p-4"
        >
          <button
            type="button"
            aria-label={t('close')}
            onClick={onClose}
            className="absolute inset-0 cursor-default bg-node-canvas/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.96 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.97 }}
            transition={transition}
            style={{ maxWidth: 'calc(100vw - 2rem)' }}
            className="relative flex max-h-[80svh] w-node-detail-panel flex-col overflow-hidden rounded-2xl border border-node-panel-inner/80 bg-node-panel/95 text-node-foreground shadow-node-panel backdrop-blur-xl"
          >
            <header className="flex items-center justify-between gap-3 border-b border-node-panel-inner px-5 py-4">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold',
                    NODE_ACCENTS[node.type].iconPlate,
                    NODE_ACCENTS[node.type].iconText,
                  )}
                  aria-hidden
                >
                  {NODE_TOKEN_BADGE_LABELS[node.type]}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-node-foreground">
                    {getNodeName(node, tTypes(node.type))}
                  </p>
                  <p className="truncate text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
                    {t('detailSuffix', { type: tTypes(node.type) })}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <NodeStatusBadge status={node.data.status} />
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t('close')}
                  title={t('close')}
                  className="flex size-8 items-center justify-center rounded-lg text-node-muted transition-colors hover:bg-node-panel-inner hover:text-node-foreground"
                >
                  <Minimize2 className="size-4" />
                </button>
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {(() => {
                const Body =
                  NODE_DETAIL_REGISTRY[node.type] ?? GenericDetailBody
                return (
                  <Body nodeId={node.id} type={node.type} data={node.data} />
                )
              })()}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
