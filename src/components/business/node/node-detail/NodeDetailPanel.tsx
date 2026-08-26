'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
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
import { resolveNodeDisplayName } from '@/lib/node-display-name'
import { resolveNodePresentationType } from '@/lib/node-presentation'
import { cn } from '@/lib/utils'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { NodeStatusBadge } from '../nodes/NodeStatusBadge'
import { NodeDetailFrame } from './NodeDetailFrame'
import { isNodeDetailFamily, NODE_DETAIL_SLOT_REGISTRY } from './registry'

interface NodeDetailPanelProps {
  expandedNodeId: string | null
  onClose(): void
}

/**
 * 画布修法 08-A：原实现按 presentationType 分支手抄了一份优先链，绕开了
 * 读侧的机器值守卫——「选已有图」写入口把上传备注常量当名字写进
 * characterName/backgroundName/shotName 时，这个大标题会照单展示。四个
 * presentationType 各自只有一个专属身份字段，与共享解析器的优先链结果
 * 一致，改走它；`voiceId` 兜底是 voice 分支独有的（resolver 不认 id 类
 * 字段），单独保留。
 */
function getNodeName(
  node: NodeWorkflowNode,
  presentationType: NodeWorkflowNodeType,
  fallback: string,
): string {
  const resolved = resolveNodeDisplayName(node.data)
  if (resolved) return resolved
  if (presentationType === NODE_TYPE_IDS.voice) {
    const voiceId = node.data.voiceId?.trim()
    if (voiceId) return voiceId
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

  /**
   * 分发：查槽表拿该族的提供者，交给它填七槽。
   *
   * ⚠ 槽表是**穷举**的（S8），没有 legacy 分支也没有兜底 body ——
   * 缺一个族在编译期就过不去。别把兜底加回来：兜底的代价是新族静默落进一个
   * 谁也没设计过的面板，而那正是这轮改版开头查出来的病。
   *
   * ⚠ 仍然做一次运行时判空并返回 null：`presentationType` 来自
   * `resolveNodePresentationType`，理论上恒在表内，但它读的是持久化数据 ——
   * 一个来自未来版本、本地枚举还不认识的 type 应当让面板不开，
   * 而不是把 `undefined` 当组件渲染然后整棵树崩。
   *
   * ⚠ `key={presentationType}`：换族时强制卸载重挂 provider，
   * 避免不同族的 provider 之间 hook 顺序错位。**不要**用随 data 变化的 key
   * （那会让输入框每敲一个字符 remount，焦点 bug 以新形态复活）。
   */
  const renderFrame = (identity: ReactNode) => {
    if (!node || !presentationType) return null
    if (!isNodeDetailFamily(presentationType)) return null
    const SlotProvider = NODE_DETAIL_SLOT_REGISTRY[presentationType]
    return (
      <SlotProvider
        key={presentationType}
        nodeId={node.id}
        type={presentationType}
        data={node.data}
      >
        {(slots) => <NodeDetailFrame identity={identity} slots={slots} />}
      </SlotProvider>
    )
  }

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
            {renderFrame(
              <>
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
                      <span className="truncate">
                        {tTypes(presentationType)}
                      </span>
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
              </>,
            )}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
