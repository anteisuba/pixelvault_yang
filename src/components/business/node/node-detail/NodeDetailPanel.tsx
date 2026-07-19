'use client'

import { useEffect } from 'react'
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
import type { NodeWorkflowNode } from '@/types/node-workflow'
import { resolveNodePresentationType } from '@/lib/node-presentation'
import { cn } from '@/lib/utils'

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
  // S5d ③ retires the role-picker step entirely (node-canvas.md §6.0/§6.1):
  // a role-less `image` node presents as `image` itself (→ `LooseImageDetailBody`,
  // registry.ts), NOT `resolveNodePresentationType`'s `shot` fallback — 图片
  // （素材）must read as its own kind, distinct from 镜头图（生成）.
  const isLooseImage = Boolean(
    node?.type === NODE_TYPE_IDS.image && !node.data.role,
  )
  const presentationType = node
    ? isLooseImage
      ? NODE_TYPE_IDS.image
      : resolveNodePresentationType(node)
    : null
  // Single-layer breadcrumb now that the role-picker parent layer is gone —
  // every detail view returns straight to the canvas.
  const parentCrumb = {
    label: t('canvasCrumb'),
    title: t('backToCanvas'),
    onClick: onClose,
  }

  useEffect(() => {
    if (!node) return
    const handleKey = (event: KeyboardEvent) => {
      // R3-4 §4.2: don't eat the Escape a CJK IME uses to cancel its own
      // composition inside a field this panel hosts (e.g. a rename input).
      if (event.key === 'Escape' && !event.isComposing) onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [node, onClose])

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
          // R3-4 §4.1 L6: 对象任务面板，画布内唯一带 backdrop 的层。
          className="pointer-events-auto absolute inset-0 z-canvas-panel flex items-center justify-center p-4"
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
            className={cn(
              'relative flex max-h-[80svh] flex-col overflow-hidden rounded-2xl border border-node-panel-inner/80 bg-node-panel/95 text-node-foreground shadow-node-panel backdrop-blur-xl',
              node.type === NODE_TYPE_IDS.seedance ||
                node.type === NODE_TYPE_IDS.videoMerge
                ? 'w-node-detail-panel-wide'
                : 'w-node-detail-panel',
            )}
          >
            <header className="flex items-center justify-between gap-3 border-b border-node-panel-inner px-5 py-4">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold',
                    NODE_ACCENTS[presentationType].iconPlate,
                    NODE_ACCENTS[presentationType].iconText,
                  )}
                  aria-hidden
                >
                  {NODE_TOKEN_BADGE_LABELS[presentationType]}
                </span>
                <div className="flex min-w-0 items-center gap-1.5 text-sm">
                  <button
                    type="button"
                    onClick={parentCrumb.onClick}
                    aria-label={parentCrumb.title}
                    title={parentCrumb.title}
                    className="shrink-0 rounded-md px-1.5 py-0.5 font-medium text-node-muted transition-colors hover:bg-node-panel-inner hover:text-node-foreground"
                  >
                    {parentCrumb.label}
                  </button>
                  <span aria-hidden className="shrink-0 text-node-subtle">
                    /
                  </span>
                  <span className="truncate font-semibold text-node-foreground">
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
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
