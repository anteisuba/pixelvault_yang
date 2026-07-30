'use client'

import { useEffect, useId, useRef } from 'react'
import { useNodes } from '@xyflow/react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Minimize2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { motionTransition } from '@/constants/motion'
import { NODE_ACCENTS, NODE_TOKEN_BADGE_LABELS } from '@/constants/node-tokens'
import {
  NODE_TYPE_IDS,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import { resolveNodePresentationType } from '@/lib/node-presentation'
import { cn } from '@/lib/utils'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { NodeStatusBadge } from '../nodes/NodeStatusBadge'
import { GenericDetailBody } from './GenericDetailBody'
import { NODE_DETAIL_REGISTRY } from './registry'

interface NodeDetailPanelProps {
  expandedNodeId: string | null
  onClose(): void
}

function getNodeName(
  node: NodeWorkflowNode,
  presentationType: NodeWorkflowNodeType,
  fallback: string,
): string {
  if (presentationType === NODE_TYPE_IDS.characterImage) {
    return (
      node.data.characterName?.trim() ||
      node.data.character?.name?.trim() ||
      fallback
    )
  }
  if (presentationType === NODE_TYPE_IDS.voice) {
    return node.data.voiceName?.trim() || node.data.voiceId?.trim() || fallback
  }
  if (presentationType === NODE_TYPE_IDS.backgroundImage) {
    return node.data.backgroundName?.trim() || fallback
  }
  if (presentationType === NODE_TYPE_IDS.shot) {
    return node.data.shotName?.trim() || fallback
  }
  return fallback
}

/**
 * Shared Object studio for one expanded canvas node. It is a canvas-contained
 * modal: opening it never grows, moves, or changes the real graph node.
 */
export function NodeDetailPanel({
  expandedNodeId,
  onClose,
}: NodeDetailPanelProps) {
  const nodes = useNodes<NodeWorkflowNode>()
  const tTypes = useTranslations('StudioNode.nodeTypes')
  const t = useTranslations('StudioNode.nodeDetail')
  const reducedMotion = useReducedMotion()
  const titleId = useId()
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  const node = expandedNodeId
    ? (nodes.find((candidate) => candidate.id === expandedNodeId) ?? null)
    : null
  // A role-less image is an asset atom, not resolveNodePresentationType's shot
  // fallback. It therefore keeps the dedicated loose-image detail family.
  const isLooseImage = Boolean(
    node?.type === NODE_TYPE_IDS.image && !node.data.role,
  )
  const presentationType = node
    ? isLooseImage
      ? NODE_TYPE_IDS.image
      : resolveNodePresentationType(node)
    : null
  const parentCrumb = {
    label: t('canvasCrumb'),
    title: t('backToCanvas'),
    onClick: onClose,
  }

  useEffect(() => {
    if (!node) return
    const handleKey = (event: KeyboardEvent) => {
      // Escape can be consumed by a CJK IME before it closes the workspace.
      if (event.key === 'Escape' && !event.isComposing) onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [node, onClose])

  useEffect(() => {
    if (!node) return
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    closeButtonRef.current?.focus({ preventScroll: true })
    return () => {
      previousFocusRef.current?.focus({ preventScroll: true })
      previousFocusRef.current = null
    }
  }, [node])

  const transition = motionTransition('slow', reducedMotion)

  return (
    <AnimatePresence>
      {node && presentationType ? (
        <motion.div
          key={node.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={transition}
          className="canvas-object-studio-overlay pointer-events-auto absolute inset-0 z-canvas-panel flex items-center justify-center"
        >
          <button
            type="button"
            aria-label={t('close')}
            onClick={onClose}
            className="canvas-modal-scrim absolute inset-0 cursor-default"
          />
          <motion.div
            initial={{ scale: 0.96 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.97 }}
            transition={transition}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            data-node-detail-layout="object-studio"
            data-node-detail-family={presentationType}
            className="canvas-modal-surface canvas-object-studio-surface relative flex min-w-0 flex-col overflow-hidden"
          >
            <header className="canvas-modal-divider canvas-object-studio-header flex items-center justify-between border-b">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                    NODE_ACCENTS[presentationType].iconPlate,
                    NODE_ACCENTS[presentationType].iconText,
                  )}
                  aria-hidden
                >
                  {NODE_TOKEN_BADGE_LABELS[presentationType]}
                </span>
                <div className="grid min-w-0 gap-0.5">
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-node-muted">
                    <button
                      type="button"
                      onClick={parentCrumb.onClick}
                      aria-label={parentCrumb.title}
                      title={parentCrumb.title}
                      className="shrink-0 rounded-md px-1 py-0.5 font-medium transition-colors hover:bg-node-panel-inner hover:text-node-foreground"
                    >
                      {parentCrumb.label}
                    </button>
                    <span aria-hidden className="shrink-0 text-node-subtle">
                      /
                    </span>
                    <span className="truncate">{tTypes(presentationType)}</span>
                  </span>
                  <span
                    id={titleId}
                    className="truncate text-base font-semibold text-node-foreground"
                  >
                    {getNodeName(
                      node,
                      presentationType,
                      tTypes(presentationType),
                    )}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <NodeStatusBadge status={node.data.status} />
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={onClose}
                  aria-label={t('close')}
                  title={t('close')}
                  className="flex size-10 items-center justify-center rounded-full text-node-muted outline-none transition-colors hover:bg-node-panel-inner hover:text-node-foreground focus-visible:ring-2 focus-visible:ring-node-focus-ring/30"
                >
                  <Minimize2 className="size-4" />
                </button>
              </div>
            </header>
            <div
              className="canvas-object-studio-body min-h-0 min-w-0 flex-1 overflow-y-auto"
              data-node-detail-body="true"
            >
              <div className="canvas-object-studio-content min-w-0">
                {(() => {
                  const Body =
                    NODE_DETAIL_REGISTRY[presentationType] ?? GenericDetailBody
                  return (
                    <Body
                      nodeId={node.id}
                      type={presentationType}
                      data={node.data}
                    />
                  )
                })()}
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
