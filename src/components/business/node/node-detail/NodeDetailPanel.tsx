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

  // ⚠ 依赖是 `nodeId` 而不是 `node`（2026-08-03 真机复现后修）。
  //
  // `node` 来自 `nodes.find(...)`，而 `updateNodeData` 是 `{...node, data:{…}}`
  // 整体换新对象（`use-node-workflow.ts`），React Flow 又是受控模式直喂
  // `nodes={workflow.nodes}` —— 于是**每敲一个字符 node 就换一次身份**。
  // 挂 `[node]` 的后果是这两个 effect 每个字符重跑一次；下面那个聚焦 effect
  // 尤其致命：cleanup 先把焦点还给来源，effect 体再把焦点抢到「收起」按钮上。
  // 真机实测（镜头文本 · 动作字段）敲 `abcde` 只有 `a` 进得去，焦点当场跳到
  // 收起钮，后四个字符全丢。
  //
  // 语义上这两件事本来就只该在「打开的是哪一个节点」变化时发生一次，与该节点
  // 的数据变化无关，所以依赖收敛到 id。
  //
  // ⚠ 为什么图片族当时测不出来：它的字段走 `IMEAwareTextarea`，组字期间不向上
  // 提交，掩盖了非组字路径同样有的这个问题 —— 不要据此以为只有中文输入受影响。
  const nodeId = node?.id ?? null

  useEffect(() => {
    if (!nodeId) return
    const handleKey = (event: KeyboardEvent) => {
      // Escape can be consumed by a CJK IME before it closes the workspace.
      if (event.key === 'Escape' && !event.isComposing) onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [nodeId, onClose])

  useEffect(() => {
    if (!nodeId) return
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    closeButtonRef.current?.focus({ preventScroll: true })
    return () => {
      previousFocusRef.current?.focus({ preventScroll: true })
      previousFocusRef.current = null
    }
  }, [nodeId])

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
