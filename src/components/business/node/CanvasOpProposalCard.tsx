'use client'

import { useCallback, useState } from 'react'
import { Check, Link2, PenLine, Plus, Sparkles, Undo2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  isAutoApplyAssistantOp,
  NODE_ASSISTANT_OP_IDS,
} from '@/constants/node-assistant-ops'
import { getCanvasAddCatalogItem } from '@/constants/canvas-add-catalog'
import { NODE_REVIEW_STATE_IDS } from '@/constants/node-types'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import type {
  NodeAssistantOpNodeRef,
  NodeAssistantOpPlan,
  PlannedNodeAssistantOp,
} from '@/lib/node-assistant-op-plan'

import type { NodeAssistantOpRunResult } from './NodeWorkflowActionsContext'

interface CanvasOpProposalCardProps {
  plan: NodeAssistantOpPlan
  /** 已有节点的显示名；节点已被删除时返回 undefined。 */
  getNodeLabel(nodeId: string): string | undefined
  onApply(ops: PlannedNodeAssistantOp[]): Promise<NodeAssistantOpRunResult>
  /**
   * B3：结构 op 已经自动落了几条（dock 记的账）。`undefined` = 没自动落，退回
   * 「点一下应用」那条路 —— 浮卡在提案到达时是关着的就会走到这里。
   */
  autoAppliedCount?: number
  onUndoAutoApply?(): void
}

const OP_ICONS = {
  [NODE_ASSISTANT_OP_IDS.addNode]: Plus,
  [NODE_ASSISTANT_OP_IDS.connect]: Link2,
  [NODE_ASSISTANT_OP_IDS.rename]: PenLine,
  [NODE_ASSISTANT_OP_IDS.setReviewState]: Undo2,
  [NODE_ASSISTANT_OP_IDS.generate]: Sparkles,
} as const

/**
 * 助手的画布改动提案（包 5）。
 *
 * **提案不等于改动** —— 这张卡是那道审批门本身：助手把想做的事摆出来，用户点了
 * 才发生。同 `[[capability:…]]` chip 是一条路数，只是载荷大到需要一张卡。
 *
 * 两条刻意的分寸：
 * ① **结构操作整批一次应用**（可逐条剔除）—— 一次铺十几个节点时逐个点是灾难，
 *    那正是包 6 审阅网格要解决的同一件事。
 * ② **扣 credit 的 `generate` 从批里拆出来**，一条一个确认。花钱的动作不该混在
 *    「顺手应用」里被一次点掉。
 *
 * 应用之后不再重算 —— 图已经变了，重算出来的状态（比如刚连上的边变成「重复
 * 边」）只会让人以为出了错。改为显示一次实际发生了什么的回执。
 */
export function CanvasOpProposalCard({
  plan: livePlan,
  getNodeLabel,
  onApply,
  autoAppliedCount,
  onUndoAutoApply,
}: CanvasOpProposalCardProps) {
  const t = useTranslations('StudioNode.canvasOps')
  /**
   * 动手之前跟着画布实时重算（用户中途删了个节点，卡上就该立刻显示连不上了）；
   * **一旦动了手就冻住** —— 图已经变了，再算出来的「重复边」说的是刚刚成功连上
   * 的那条，读起来像是失败了。
   */
  const [frozenPlan, setFrozenPlan] = useState<NodeAssistantOpPlan | null>(null)
  /**
   * ⚠ B3 自动落把上面那个「动手之前」压成了不到一帧：effect 在首帧之后就改图了，
   * 之后每次重算 `livePlan` 都是**对着已经改完的图**算的 —— 刚连上的边会算成
   * 「重复边」，看起来像失败。所以首帧的 plan 单独留一份，自动落之后按它显示。
   *
   * ⚠ 用 `useState` 的惰性初值而不是 `useRef(...).current` —— 后者要在 render 期间
   * 读 ref，`react-hooks/refs` 会拦（规则是对的，那是 React 反模式）。语义完全一样：
   * 初值只在首帧取一次，之后再也不变。
   */
  const [initialPlan] = useState(livePlan)
  /**
   * 自动落**真的落下的条数**；`null` = 一条没落。这张卡有三处判断都在问这一个
   * 问题，共用这一个值。
   *
   * ⚠ 判据是 `> 0` 而不是 `!== undefined`：`0` 与 `undefined` 来源不同，但对这三处
   * 的要求完全一样 ——
   *   `undefined` = 这批还没走自动落流程；
   *   `0`         = 走过了，但**一条都没落**。唯一来源是 dock 的
   *                 `handleApplyAssistantOps`：`runAssistantCanvasOps` 缺席时直接
   *                 返回 `{applied: 0, skipped: 全部}`（`isLoading` 守卫与 `seen`
   *                 去重都是提前 return，产生的是 `undefined`，不是 0）。
   * 两种情况下**图都没被改**，所以：计划要继续跟着画布实时重算、条目要能勾选、
   * 回执没有可回的东西。
   *
   * 早先三处各写各的判据（两处 `=== undefined`、一处 `> 0`），`0` 正好落进裂缝：
   * 「应用」按钮在，但每一条都是 disabled —— 用户看得见应用，却一条都剔不掉、也
   * 点不动。现在三处共用这一个值，物理上不可能再不一致。
   */
  const landedCount =
    autoAppliedCount !== undefined && autoAppliedCount > 0
      ? autoAppliedCount
      : null
  const plan = frozenPlan ?? (landedCount ? initialPlan : livePlan)
  const tAdd = useTranslations('StudioNode.addCatalog.items')
  const tIngest = useTranslations('StudioNode.ingest.reasons')
  const [excluded, setExcluded] = useState<Set<number>>(() => new Set())
  const [runningIndex, setRunningIndex] = useState<number | null>(null)
  const [structuralRunning, setStructuralRunning] = useState(false)
  const [structuralResult, setStructuralResult] =
    useState<NodeAssistantOpRunResult | null>(null)
  const [appliedGenerates, setAppliedGenerates] = useState<Set<number>>(
    () => new Set(),
  )

  const toggleExcluded = useCallback((index: number) => {
    setExcluded((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }, [])

  const describeRef = useCallback(
    (reference: NodeAssistantOpNodeRef | undefined): string => {
      if (!reference) return t('unknownTarget')
      if (reference.kind === 'existing') {
        return getNodeLabel(reference.nodeId) ?? t('unknownTarget')
      }
      // 批内新建的节点还没有 id，用它自己那条 add_node 说的名字；没起名就用族名。
      const source = plan.ops.find(
        (entry) =>
          entry.op.op === NODE_ASSISTANT_OP_IDS.addNode &&
          entry.op.ref === reference.ref,
      )
      if (source && source.op.op === NODE_ASSISTANT_OP_IDS.addNode) {
        return (
          source.op.name ??
          tAdd(`${getCanvasAddCatalogItem(source.op.intent).labelKey}.label`)
        )
      }
      return t('unknownTarget')
    },
    [getNodeLabel, plan.ops, t, tAdd],
  )

  const describe = useCallback(
    (entry: PlannedNodeAssistantOp): string => {
      const { op } = entry
      switch (op.op) {
        case NODE_ASSISTANT_OP_IDS.addNode:
          return t('describe.addNode', {
            kind: tAdd(`${getCanvasAddCatalogItem(op.intent).labelKey}.label`),
            name: op.name ?? t('unnamed'),
          })
        case NODE_ASSISTANT_OP_IDS.connect:
          return t('describe.connect', {
            source: describeRef(entry.source),
            target: describeRef(entry.target),
          })
        case NODE_ASSISTANT_OP_IDS.rename:
          return t('describe.rename', {
            target: describeRef(entry.target),
            name: op.name,
          })
        case NODE_ASSISTANT_OP_IDS.setReviewState:
          // 三个态各说各的。`approved` 永远会被拒，但**说的必须是它真的想干什么**
          // ——写成「标为待审」会让「助手不能替你放行」那句理由读起来莫名其妙。
          if (op.state === NODE_REVIEW_STATE_IDS.rejected) {
            return t('describe.reject', { target: describeRef(entry.target) })
          }
          return op.state === NODE_REVIEW_STATE_IDS.approved
            ? t('describe.approve', { target: describeRef(entry.target) })
            : t('describe.awaitReview', { target: describeRef(entry.target) })
        default:
          return t('describe.generate', { target: describeRef(entry.target) })
      }
    },
    [describeRef, t, tAdd],
  )

  const explainRejection = useCallback(
    (entry: PlannedNodeAssistantOp): string => {
      switch (entry.reason) {
        case 'duplicate':
          return tIngest('duplicate')
        case 'capacityFull':
          return entry.capacity
            ? tIngest('capacityFullWithLimit', entry.capacity)
            : tIngest('capacityFull')
        case 'typeMismatch':
          return tIngest('typeMismatch')
        case undefined:
          return t('reasons.unknownNode')
        default:
          return t(`reasons.${entry.reason}`)
      }
    },
    [t, tIngest],
  )

  // B3 三档：自动落的纯结构 / 要逐条确认的判断与花钱 / 已被规划器拒掉的。
  const structuralOps = plan.ops.filter(
    (entry) => entry.status === 'ready' && isAutoApplyAssistantOp(entry.op.op),
  )
  const selectedStructuralOps = structuralOps.filter(
    (entry) => !excluded.has(entry.index),
  )
  const generateOps = plan.ops.filter(
    (entry) =>
      entry.status === 'ready' &&
      entry.op.op === NODE_ASSISTANT_OP_IDS.generate,
  )

  const handleApplyStructural = useCallback(async () => {
    if (structuralRunning || selectedStructuralOps.length === 0) return
    setFrozenPlan(plan)
    setStructuralRunning(true)
    const result = await onApply(selectedStructuralOps)
    setStructuralRunning(false)
    setStructuralResult(result)
  }, [onApply, plan, selectedStructuralOps, structuralRunning])

  const handleApplyGenerate = useCallback(
    async (entry: PlannedNodeAssistantOp) => {
      if (runningIndex !== null) return
      setFrozenPlan(plan)
      setRunningIndex(entry.index)
      await onApply([entry])
      setRunningIndex(null)
      setAppliedGenerates((current) => new Set(current).add(entry.index))
    },
    [onApply, plan, runningIndex],
  )

  return (
    <div className="mt-2 rounded-2xl border border-node-panel-inner bg-node-canvas/50 p-2.5">
      <p className="text-2xs font-semibold text-node-foreground">
        {t('title')}
      </p>

      <ul className="mt-1.5 space-y-1">
        {plan.ops.map((entry) => {
          const Icon = OP_ICONS[entry.op.op]
          const isRejected = entry.status === 'rejected'
          // B3：判断（审核态）与花钱（生成）都不自动落，各自逐条确认。
          const needsOwnConfirm = !isAutoApplyAssistantOp(entry.op.op)
          const isExcluded = excluded.has(entry.index)
          const canToggle =
            !isRejected &&
            !needsOwnConfirm &&
            !landedCount &&
            !structuralResult &&
            !structuralRunning

          return (
            <li key={entry.index}>
              <button
                type="button"
                disabled={!canToggle}
                onClick={() => toggleExcluded(entry.index)}
                className={cn(
                  'flex w-full items-start gap-1.5 rounded-lg px-1.5 py-1 text-left text-2xs',
                  canToggle ? 'hover:bg-node-panel-inner' : 'cursor-default',
                  isRejected || isExcluded
                    ? 'text-node-subtle'
                    : 'text-node-muted',
                )}
              >
                <Icon className="mt-0.5 size-3 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block',
                      isExcluded && !isRejected ? 'line-through' : undefined,
                    )}
                  >
                    {describe(entry)}
                  </span>
                  {/* B1：助手写进来的提示词要在这里看得见。批准一条自己看不到内容
                      的写操作，等于没有审批 —— 提示词恰恰是这条 op 里唯一有内容
                      的部分。 */}
                  {entry.op.op === NODE_ASSISTANT_OP_IDS.addNode &&
                  entry.op.prompt ? (
                    <span className="mt-0.5 block whitespace-pre-wrap break-words text-node-subtle">
                      {entry.op.prompt}
                    </span>
                  ) : null}
                  {isRejected ? (
                    <span className="block text-node-subtle">
                      {t('rejectedPrefix', { reason: explainRejection(entry) })}
                    </span>
                  ) : null}
                </span>
                {needsOwnConfirm && appliedGenerates.has(entry.index) ? (
                  <Check className="mt-0.5 size-3 shrink-0" />
                ) : null}
              </button>

              {needsOwnConfirm &&
              !appliedGenerates.has(entry.index) &&
              !isRejected ? (
                <div className="px-1.5 pb-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={runningIndex !== null}
                    onClick={() => void handleApplyGenerate(entry)}
                    className="h-8 rounded-lg border-node-panel-inner bg-node-panel-soft px-2 text-2xs text-node-foreground"
                  >
                    {runningIndex === entry.index ? (
                      <Spinner size="sm" />
                    ) : null}
                    {entry.op.op === NODE_ASSISTANT_OP_IDS.generate
                      ? t('confirmGenerate')
                      : t('confirmReview')}
                  </Button>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>

      {landedCount ? (
        // B3：已经落了。这里不是审批入口，是**回执 + 后悔药** —— B2.5 之后整批
        // 只占一个撤销步，所以「撤销」按一下就全退。
        <div className="mt-1.5 flex items-center justify-between gap-2 px-1.5">
          <span className="text-2xs text-node-subtle">
            {t('autoApplied', { count: landedCount })}
          </span>
          {onUndoAutoApply ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onUndoAutoApply}
              className="h-8 shrink-0 rounded-lg border-node-panel-inner bg-node-panel-soft px-2 text-2xs text-node-foreground"
            >
              <Undo2 className="size-3" />
              {t('undoAutoApplied')}
            </Button>
          ) : null}
        </div>
      ) : structuralResult ? (
        <p className="mt-1.5 px-1.5 text-2xs text-node-subtle">
          {structuralResult.skipped > 0
            ? t('appliedSummaryWithSkipped', {
                applied: structuralResult.applied,
                skipped: structuralResult.skipped,
              })
            : t('appliedSummary', { applied: structuralResult.applied })}
        </p>
      ) : structuralOps.length > 0 ? (
        <div className="mt-1.5 flex items-center justify-between gap-2 px-1.5">
          <span className="text-2xs text-node-subtle">
            {generateOps.length > 0 ? t('generateSeparateHint') : null}
          </span>
          <Button
            type="button"
            size="sm"
            disabled={structuralRunning || selectedStructuralOps.length === 0}
            onClick={() => void handleApplyStructural()}
            className="h-8 shrink-0 rounded-lg bg-node-foreground px-3 text-2xs text-node-canvas hover:bg-node-foreground/90"
          >
            {structuralRunning ? <Spinner size="sm" /> : null}
            {t('apply', { count: selectedStructuralOps.length })}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
