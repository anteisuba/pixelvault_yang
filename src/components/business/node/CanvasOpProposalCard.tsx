'use client'

import { useCallback, useState } from 'react'
import {
  ArrowRightLeft,
  Check,
  Cpu,
  Film,
  ImagePlus,
  Link2,
  Link2Off,
  ListOrdered,
  Mic,
  PenLine,
  Plus,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Type,
  Undo2,
  type LucideIcon,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  NODE_ASSISTANT_OP_V4_IDS,
  NODE_ASSISTANT_OP_V4_SPECS,
  NODE_ASSISTANT_OP_V4_TIER_IDS,
  NODE_ASSISTANT_WRITE_MODES,
  type NodeAssistantOpV4Id,
} from '@/constants/node-assistant-ops'
import { findCanvasAddCatalogItemByV4 } from '@/constants/canvas-add-catalog'
import { NODE_REVIEW_STATE_IDS } from '@/constants/node-types'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import type {
  NodeAssistantOpPlanV4,
  PlannedNodeAssistantOpV4,
} from '@/lib/node-assistant-op-plan'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'

import type { NodeAssistantOpRunResult } from './nodes/v4/NodeV4ActionsBridge'

interface CanvasOpProposalCardProps {
  plan: NodeAssistantOpPlanV4
  /** 已有节点的显示名；节点已被删除时返回 undefined。 */
  getNodeLabel(nodeId: string): string | undefined
  onApply(
    ops: readonly PlannedNodeAssistantOpV4[],
  ): Promise<NodeAssistantOpRunResult>
  /**
   * 结构 op 已经自动落了几条（dock 记的账）。`undefined` = 没走自动落流程 ——
   * 浮卡在提案到达时是关着的就会走到这里。
   */
  autoAppliedCount?: number
  /** 这批里**声明了却没建成**的连线条数（台账 K-2）。 */
  autoFailedConnects?: number
  onUndoAutoApply?(): void
}

/**
 * ⚠ 类型是**穷举的 Record**，不是 `as const` 字面量：漏一个 op 时
 * `OP_ICONS[entry.op.op]` 会是 `undefined`，而 `<undefined />` 在渲染时才炸
 * ——整张卡连同对话一起白屏。写成 Record 让它在编译期就红。
 */
const OP_ICONS: Record<NodeAssistantOpV4Id, LucideIcon> = {
  [NODE_ASSISTANT_OP_V4_IDS.readCanvas]: Film,
  [NODE_ASSISTANT_OP_V4_IDS.findNode]: Film,
  // ⚠ 只读规划：图标与 `generate` 分得开 —— 它列名单，不出图。
  [NODE_ASSISTANT_OP_V4_IDS.planRerunDownstream]: ListOrdered,
  [NODE_ASSISTANT_OP_V4_IDS.addNode]: Plus,
  [NODE_ASSISTANT_OP_V4_IDS.connect]: Link2,
  [NODE_ASSISTANT_OP_V4_IDS.disconnect]: Link2Off,
  [NODE_ASSISTANT_OP_V4_IDS.delete]: Trash2,
  [NODE_ASSISTANT_OP_V4_IDS.moveToShot]: ArrowRightLeft,
  [NODE_ASSISTANT_OP_V4_IDS.reorderShot]: ListOrdered,
  [NODE_ASSISTANT_OP_V4_IDS.setText]: Type,
  [NODE_ASSISTANT_OP_V4_IDS.setPrompt]: Type,
  [NODE_ASSISTANT_OP_V4_IDS.setField]: PenLine,
  [NODE_ASSISTANT_OP_V4_IDS.attachAsset]: ImagePlus,
  [NODE_ASSISTANT_OP_V4_IDS.setSlotVersion]: ArrowRightLeft,
  [NODE_ASSISTANT_OP_V4_IDS.markVersionBlocked]: Undo2,
  [NODE_ASSISTANT_OP_V4_IDS.setModel]: Cpu,
  [NODE_ASSISTANT_OP_V4_IDS.setParams]: SlidersHorizontal,
  [NODE_ASSISTANT_OP_V4_IDS.setVoiceProfile]: Mic,
  [NODE_ASSISTANT_OP_V4_IDS.setMergeClips]: Scissors,
  [NODE_ASSISTANT_OP_V4_IDS.setReviewState]: Undo2,
  [NODE_ASSISTANT_OP_V4_IDS.generate]: Sparkles,
}

const [WRITE_MODE_REPLACE, WRITE_MODE_APPEND] = NODE_ASSISTANT_WRITE_MODES

/** 覆盖三选里的「保留」——不落这条 op。⛔ 不是一种写入模式，所以不在词表里。 */
const KEEP_CHOICE = 'keep'

type WriteChoice = typeof WRITE_MODE_APPEND | typeof WRITE_MODE_REPLACE | 'keep'

function readProposedBody(op: NodeAssistantOpV4): string | undefined {
  if (op.op === NODE_ASSISTANT_OP_V4_IDS.setText) return op.body
  if (op.op === NODE_ASSISTANT_OP_V4_IDS.setPrompt) return op.prompt
  return undefined
}

/**
 * 助手的画布改动提案（v4 重建，③e）。
 *
 * **提案不等于改动** —— 这张卡是那道审批门本身。三条分寸原样从 v3 那版搬过来，
 * 它们答的都不是「v3 还是 v4」这个问题：
 * ① **结构 op 自动落**，卡上是回执 + 一步撤销（整批一个撤销条目）；
 * ② **覆盖手写内容**要就地三选（追加在后 / 覆盖 / 保留，brief §5 第二档）——
 *    ⛔ 默认不选，用户不点就不落：默认覆盖等于取消这道门；
 * ③ **扣 credit 的 `generate` 与破坏性的 `delete`** 逐条确认，⛔ 不混进「顺手
 *    应用」里被一次点掉。
 *
 * 应用之后不再重算 —— 图已经变了，重算出来的状态（比如刚连上的边变成「槽满了」）
 * 只会让人以为出了错。改为显示一次实际发生了什么的回执。
 */
export function CanvasOpProposalCard({
  plan: livePlan,
  getNodeLabel,
  onApply,
  autoAppliedCount,
  autoFailedConnects,
  onUndoAutoApply,
}: CanvasOpProposalCardProps) {
  const t = useTranslations('StudioNode.canvasOps')
  const tAdd = useTranslations('StudioNode.addCatalog.items')
  const tKinds = useTranslations('StudioNode.v4.kinds')
  const tSlots = useTranslations('StudioNode.v4.slots')
  const tRejected = useTranslations('StudioNode.v4.connectRejected')

  /**
   * 动手之前跟着画布实时重算（用户中途删了个节点，卡上就该立刻显示连不上了）；
   * **一旦动了手就冻住** —— 图已经变了，再算出来的「槽满了」说的是刚刚成功连上
   * 的那条，读起来像是失败了。
   */
  const [frozenPlan, setFrozenPlan] = useState<NodeAssistantOpPlanV4 | null>(
    null,
  )
  /**
   * ⚠ 自动落把「动手之前」压成了不到一帧：effect 在首帧之后就改图了，之后每次
   * 重算 `livePlan` 都是**对着已经改完的图**算的。所以首帧的 plan 单独留一份。
   *
   * ⚠ 用 `useState` 的惰性初值而不是 `useRef(...).current` —— 后者要在 render
   * 期间读 ref，`react-hooks/refs` 会拦（规则是对的，那是 React 反模式）。
   */
  const [initialPlan] = useState(livePlan)
  /**
   * 自动落**真的落下的条数**；`null` = 一条没落。三处判断共用这一个值。
   *
   * ⚠ 判据是 `> 0` 而不是 `!== undefined`：`0` 与 `undefined` 来源不同，但对这三处
   * 的要求完全一样 —— 两种情况下**图都没被改**。早先三处各写各的判据，`0` 正好
   * 落进裂缝：「应用」在，但每一条都是 disabled。
   */
  const landedCount =
    autoAppliedCount !== undefined && autoAppliedCount > 0
      ? autoAppliedCount
      : null
  const plan = frozenPlan ?? (landedCount ? initialPlan : livePlan)

  const [choices, setChoices] = useState<Record<number, WriteChoice>>({})
  const [runningIndex, setRunningIndex] = useState<number | null>(null)
  const [contentRunning, setContentRunning] = useState(false)
  const [contentResult, setContentResult] =
    useState<NodeAssistantOpRunResult | null>(null)
  const [confirmed, setConfirmed] = useState<Set<number>>(() => new Set())

  const describeTarget = useCallback(
    (reference: string): string =>
      getNodeLabel(reference) ?? t('unknownTarget'),
    [getNodeLabel, t],
  )

  /** 新建的是什么 —— 菜单里有的说菜单的词，没有的退回 `kind·subtype`。 */
  const describeNewNode = useCallback(
    (kind: string, subtype: string): string => {
      const item = findCanvasAddCatalogItemByV4(
        kind as Parameters<typeof findCanvasAddCatalogItemByV4>[0],
        subtype as Parameters<typeof findCanvasAddCatalogItemByV4>[1],
      )
      return item
        ? tAdd(`${item.labelKey}.label`)
        : `${tKinds(kind as 'text' | 'image' | 'audio' | 'video')}·${subtype}`
    },
    [tAdd, tKinds],
  )

  const describe = useCallback(
    (entry: PlannedNodeAssistantOpV4): string => {
      const { op } = entry
      switch (op.op) {
        case NODE_ASSISTANT_OP_V4_IDS.addNode:
          return t('describe.addNode', {
            kind: describeNewNode(op.kind, op.subtype),
            name: op.name ?? t('unnamed'),
          })
        case NODE_ASSISTANT_OP_V4_IDS.connect:
          return t('describe.connectSlot', {
            source: describeTarget(op.source),
            target: describeTarget(op.target),
            slot: tSlots(op.slot),
          })
        case NODE_ASSISTANT_OP_V4_IDS.disconnect:
          return t('describe.disconnect')
        case NODE_ASSISTANT_OP_V4_IDS.delete:
          return t('describe.delete', { target: describeTarget(op.target) })
        case NODE_ASSISTANT_OP_V4_IDS.moveToShot:
          return op.shotNo === null
            ? t('describe.moveOutOfShot', { target: describeTarget(op.target) })
            : t('describe.moveToShot', {
                target: describeTarget(op.target),
                shotNo: String(op.shotNo),
              })
        case NODE_ASSISTANT_OP_V4_IDS.reorderShot:
          return t('describe.reorderShot', {
            from: String(op.from),
            to: String(op.to),
          })
        // 正文本身不进这句话 —— 它在下面单独整段显示（一行摘要塞不下一段提示词，
        // 而截断过的提示词等于没给用户看）。
        case NODE_ASSISTANT_OP_V4_IDS.setText:
          return t('describe.setText', { target: describeTarget(op.target) })
        case NODE_ASSISTANT_OP_V4_IDS.setPrompt:
          return t('describe.setPrompt', { target: describeTarget(op.target) })
        case NODE_ASSISTANT_OP_V4_IDS.setField:
          return t('describe.setField', {
            target: describeTarget(op.target),
            field: op.field,
            value: op.value === null ? t('unnamed') : String(op.value),
          })
        case NODE_ASSISTANT_OP_V4_IDS.attachAsset:
          return t('describe.attachAssetSlot', {
            source: describeTarget(op.sourceNodeId),
            target: describeTarget(op.target),
            slot: tSlots(op.slot),
          })
        case NODE_ASSISTANT_OP_V4_IDS.setSlotVersion:
          return t('describe.setSlotVersion', {
            target: describeTarget(op.target),
            slot: tSlots(op.slot),
          })
        case NODE_ASSISTANT_OP_V4_IDS.markVersionBlocked:
          return t(
            op.blocked ? 'describe.blockVersion' : 'describe.unblockVersion',
            { target: describeTarget(op.target), slot: tSlots(op.slot) },
          )
        case NODE_ASSISTANT_OP_V4_IDS.setModel:
          // 模型 id 原样显示 —— 用户要审的正是「换成哪一个」，而 id 就是那个事实。
          return t('describe.setModel', {
            target: describeTarget(op.target),
            model: op.modelId,
          })
        case NODE_ASSISTANT_OP_V4_IDS.setParams:
          return t('describe.setParamsV4', {
            target: describeTarget(op.target),
          })
        case NODE_ASSISTANT_OP_V4_IDS.setVoiceProfile:
          return t('describe.setVoiceProfile', {
            target: describeTarget(op.target),
          })
        case NODE_ASSISTANT_OP_V4_IDS.setMergeClips:
          return t('describe.setMergeClips', {
            target: describeTarget(op.target),
          })
        case NODE_ASSISTANT_OP_V4_IDS.setReviewState:
          // 三个态各说各的。`approved` 永远会被拒，但**说的必须是它真的想干什么**
          // ——写成「标为待审」会让「助手不能替你放行」那句理由读起来莫名其妙。
          if (op.state === NODE_REVIEW_STATE_IDS.rejected) {
            return t('describe.reject', { target: describeTarget(op.target) })
          }
          return op.state === NODE_REVIEW_STATE_IDS.approved
            ? t('describe.approve', { target: describeTarget(op.target) })
            : t('describe.awaitReview', { target: describeTarget(op.target) })
        case NODE_ASSISTANT_OP_V4_IDS.generate:
          return t('describe.generate', { target: describeTarget(op.target) })
        default:
          // 读类 op 进不到这里（规划器把它们滤在门外），但 switch 要穷举 —— 兜底
          // 说出它的 op 名，⛔ 不返回空串（一条没有说法的条目读起来像卡坏了）。
          return op.op
      }
    },
    [describeNewNode, describeTarget, t, tSlots],
  )

  /**
   * 待确认的两类：**覆盖手写内容**的写入（走三选）与 `confirm` 档的结构 op
   * （今天只有 `delete`）。它们的共同点是「自动落集合放不下」，不是同一种理由，
   * 所以下面渲染时仍然分开显示各自的按钮。
   */
  const overwriteOps = plan.ops.filter(
    (entry) => entry.status === 'ready' && entry.requiresChoice === true,
  )
  const confirmOps = plan.ops.filter(
    (entry) =>
      entry.status === 'ready' &&
      entry.requiresChoice !== true &&
      NODE_ASSISTANT_OP_V4_SPECS[entry.op.op].tier !==
        NODE_ASSISTANT_OP_V4_TIER_IDS.free,
  )

  /** 三选之后真正要落的 op —— 「保留」整条不落，「追加」改写 `mode`。 */
  const chosenOverwriteOps = overwriteOps.flatMap((entry) => {
    const choice = choices[entry.index]
    if (choice === undefined || choice === KEEP_CHOICE) return []
    return [{ ...entry, op: { ...entry.op, mode: choice } }]
  })

  const handleApplyOverwrites = useCallback(async () => {
    if (contentRunning || chosenOverwriteOps.length === 0) return
    setFrozenPlan(plan)
    setContentRunning(true)
    const result = await onApply(chosenOverwriteOps)
    setContentRunning(false)
    setContentResult(result)
  }, [chosenOverwriteOps, contentRunning, onApply, plan])

  const handleConfirmOne = useCallback(
    async (entry: PlannedNodeAssistantOpV4) => {
      if (runningIndex !== null) return
      setFrozenPlan(plan)
      setRunningIndex(entry.index)
      await onApply([entry])
      setRunningIndex(null)
      setConfirmed((current) => new Set(current).add(entry.index))
    },
    [onApply, plan, runningIndex],
  )

  if (plan.ops.length === 0) return null

  return (
    <div className="mt-2 rounded-2xl border border-node-panel-inner bg-node-canvas/50 p-2.5">
      <p className="text-2xs font-semibold text-node-foreground">
        {t('title')}
      </p>

      <ul className="mt-1.5 space-y-1">
        {plan.ops.map((entry) => {
          const Icon = OP_ICONS[entry.op.op]
          const isRejected = entry.status === 'rejected'
          const proposedBody = readProposedBody(entry.op)
          const needsChoice = !isRejected && entry.requiresChoice === true
          const needsOwnConfirm =
            !isRejected &&
            !needsChoice &&
            NODE_ASSISTANT_OP_V4_SPECS[entry.op.op].tier !==
              NODE_ASSISTANT_OP_V4_TIER_IDS.free
          const choice = choices[entry.index]

          return (
            <li key={entry.index}>
              <div
                className={cn(
                  'flex w-full items-start gap-1.5 rounded-lg px-1.5 py-1 text-left text-2xs',
                  isRejected || choice === KEEP_CHOICE
                    ? 'text-node-subtle'
                    : 'text-node-muted',
                )}
              >
                <Icon className="mt-0.5 size-3 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block',
                      choice === KEEP_CHOICE ? 'line-through' : undefined,
                    )}
                  >
                    {describe(entry)}
                  </span>
                  {/* 助手写进来的正文要在这里看得见。批准一条自己看不到内容的写
                      操作，等于没有审批 —— 正文恰恰是这条 op 里唯一有内容的部分。 */}
                  {proposedBody ? (
                    <span className="mt-0.5 block whitespace-pre-wrap break-words text-node-subtle">
                      {proposedBody}
                    </span>
                  ) : null}
                  {isRejected ? (
                    <span className="block text-node-subtle">
                      {t('rejectedPrefix', {
                        reason: entry.capacity
                          ? `${tRejected('slotFull')} ${entry.capacity.current}/${entry.capacity.limit}`
                          : tRejected(entry.reason ?? 'unknownNode'),
                      })}
                    </span>
                  ) : null}
                </span>
                {needsOwnConfirm && confirmed.has(entry.index) ? (
                  <Check className="mt-0.5 size-3 shrink-0" />
                ) : null}
              </div>

              {/* brief §5 第二档：覆盖用户手写内容 → 就地三选。⛔ 不预选任何一项。 */}
              {needsChoice && !contentResult ? (
                <div className="flex flex-wrap items-center gap-1 px-1.5 pb-1">
                  <span className="text-2xs text-node-subtle">
                    {t('overwriteQuestion')}
                  </span>
                  {(
                    [
                      WRITE_MODE_APPEND,
                      WRITE_MODE_REPLACE,
                      KEEP_CHOICE,
                    ] as const
                  ).map((option) => (
                    <button
                      key={option}
                      type="button"
                      disabled={contentRunning}
                      onClick={() =>
                        setChoices((current) => ({
                          ...current,
                          [entry.index]: option,
                        }))
                      }
                      className={cn(
                        'rounded-lg border px-2 py-0.5 text-2xs transition-colors',
                        choice === option
                          ? 'border-node-foreground bg-node-foreground text-node-canvas'
                          : 'border-node-panel-inner bg-node-panel-soft text-node-foreground hover:bg-node-panel-inner',
                      )}
                    >
                      {t(`overwriteChoice.${option}`)}
                    </button>
                  ))}
                </div>
              ) : null}

              {needsOwnConfirm && !confirmed.has(entry.index) ? (
                <div className="px-1.5 pb-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={runningIndex !== null}
                    onClick={() => void handleConfirmOne(entry)}
                    className="h-8 rounded-lg border-node-panel-inner bg-node-panel-soft px-2 text-2xs text-node-foreground"
                  >
                    {runningIndex === entry.index ? (
                      <Spinner size="sm" />
                    ) : null}
                    {entry.op.op === NODE_ASSISTANT_OP_V4_IDS.generate
                      ? t('confirmGenerate')
                      : entry.op.op === NODE_ASSISTANT_OP_V4_IDS.delete
                        ? t('confirmDelete')
                        : t('confirmReview')}
                  </Button>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>

      {landedCount ? (
        // 已经落了。这里不是审批入口，是**回执 + 后悔药** —— 整批只占一个撤销步，
        // 所以「撤销」按一下就全退。
        <div className="mt-1.5 flex items-center justify-between gap-2 px-1.5">
          <span className="text-2xs text-node-subtle">
            {t('autoApplied', { count: landedCount })}
            {/* 台账 K-2：连线没建成必须**点名**，不能只让「已落 N 个」那个数变小
                —— 用户读不出少的那几个是什么。 */}
            {autoFailedConnects && autoFailedConnects > 0 ? (
              <span className="text-node-status-failed">
                {` · ${t('autoConnectsFailed', { count: autoFailedConnects })}`}
              </span>
            ) : null}
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
      ) : null}

      {contentResult ? (
        <p className="mt-1.5 px-1.5 text-2xs text-node-subtle">
          {contentResult.skipped > 0
            ? t('appliedSummaryWithSkipped', {
                applied: contentResult.applied,
                skipped: contentResult.skipped,
              })
            : t('appliedSummary', { applied: contentResult.applied })}
        </p>
      ) : overwriteOps.length > 0 ? (
        <div className="mt-1.5 flex items-center justify-between gap-2 px-1.5">
          <span className="text-2xs text-node-subtle">
            {confirmOps.length > 0 ? t('generateSeparateHint') : null}
          </span>
          <Button
            type="button"
            size="sm"
            disabled={contentRunning || chosenOverwriteOps.length === 0}
            onClick={() => void handleApplyOverwrites()}
            className="h-8 shrink-0 rounded-lg bg-node-foreground px-3 text-2xs text-node-canvas hover:bg-node-foreground/90"
          >
            {contentRunning ? <Spinner size="sm" /> : null}
            {t('apply', { count: chosenOverwriteOps.length })}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
