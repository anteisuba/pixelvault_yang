'use client'

import { useEffect, useState } from 'react'
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

import { ImageRolePickerBody } from '../nodes/ImageRolePicker'
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

  // Image nodes (option B) are a two-step flow: pick a role (角色/背景/镜头),
  // then edit that role's detail. `showRolePicker` lets the role-detail view
  // navigate back UP to the chooser via the breadcrumb (返回上一层) without
  // leaving the panel — it's view state, not node data, so going back doesn't
  // discard the role.
  const [showRolePicker, setShowRolePicker] = useState(false)
  // Reset the chooser view when the expanded node changes — the adjust-state-
  // during-render pattern (no effect, no cascading render).
  const [trackedNodeId, setTrackedNodeId] = useState(expandedNodeId)
  if (trackedNodeId !== expandedNodeId) {
    setTrackedNodeId(expandedNodeId)
    setShowRolePicker(false)
  }

  const node = expandedNodeId
    ? (nodes.find((candidate) => candidate.id === expandedNodeId) ?? null)
    : null
  const isImageNode = node?.type === NODE_TYPE_IDS.image
  // Show the role chooser when a freshly-added image node has no role yet OR the
  // user navigated back up to it from a role's detail — NOT fall through to
  // resolveNodePresentationType's `shot` default. Non-image nodes never show it.
  const showPickerBody = Boolean(
    isImageNode && (!node?.data.role || showRolePicker),
  )
  // A role's detail view has the chooser as its PARENT layer, so its breadcrumb
  // returns there (返回上一层) instead of straight to the canvas.
  const inImageRoleDetail = Boolean(
    isImageNode && node?.data.role && !showRolePicker,
  )
  // Image nodes present as their legacy per-role type — reuses the existing
  // badge / accent / i18n label / detail body for that role. While the chooser
  // is shown the node presents as the neutral `image` type.
  const presentationType = node
    ? showPickerBody
      ? NODE_TYPE_IDS.image
      : resolveNodePresentationType(node)
    : null
  // Breadcrumb parent crumb: each layer returns to the one above it. A role
  // detail's parent is the image chooser; everything else returns to the canvas.
  const parentCrumb = inImageRoleDetail
    ? {
        label: tTypes(NODE_TYPE_IDS.image),
        title: t('backToRolePicker'),
        onClick: () => setShowRolePicker(true),
      }
    : {
        label: t('canvasCrumb'),
        title: t('backToCanvas'),
        onClick: onClose,
      }

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
      {node && presentationType ? (
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
            className={cn(
              'relative flex max-h-[80svh] flex-col overflow-hidden rounded-2xl border border-node-panel-inner/80 bg-node-panel/95 text-node-foreground shadow-node-panel backdrop-blur-xl',
              node.type === NODE_TYPE_IDS.seedance
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
              {showPickerBody ? (
                <ImageRolePickerBody
                  nodeId={node.id}
                  onPicked={() => setShowRolePicker(false)}
                />
              ) : (
                (() => {
                  const Body =
                    NODE_DETAIL_REGISTRY[presentationType] ?? GenericDetailBody
                  return (
                    <Body
                      nodeId={node.id}
                      type={presentationType}
                      data={node.data}
                    />
                  )
                })()
              )}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
