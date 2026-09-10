'use client'

/**
 * 排片提案卡与逐段栏（S10 · spec §6，画板 `EditDeskAI.dc.html` 右上 300 宽 `.glass`）。
 *
 * ── 三档纪律（与 `CanvasOpProposalCard` 同源）──────────────────────────────
 * 卡上永远写**三件事**：这次要改什么（摘要）、改多大（计数）、花不花钱。排片这条
 * 路的第三件永远是「不花积分」—— 它一个生成都不发，⛔ 不把它做成一个看起来要花钱
 * 的确认框。
 *
 * ⚠ 「采用」之前时间线**一个字都没动过**：幽灵段只是画上去的。于是「撤销」这颗键
 * 真的什么都不用撤 —— 它丢掉提案而已。
 */

import { Check, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { EDIT_DESK_LAYOUT, TIMELINE_PLAN_CARD } from '@/constants/edit-desk'
import { formatEditClock } from '@/lib/edit-project'
import { cn } from '@/lib/utils'
import type { TimelineProposal } from '@/types/edit-desk-plan'

import type { EditDesk } from '@/hooks/node/use-edit-desk'

export interface EditDeskProposalCardProps {
  readonly proposal: TimelineProposal
  onAdopt(): void
  onReview(): void
  onDiscard(): void
  /** 逐段模式开着时卡收成一条（⛔ 不摆两套按钮让人选）。 */
  readonly reviewing: boolean
}

export function EditDeskProposalCard({
  proposal,
  onAdopt,
  onReview,
  onDiscard,
  reviewing,
}: EditDeskProposalCardProps) {
  const t = useTranslations('StudioNode.editDesk.plan')

  return (
    <div
      data-testid="edit-desk-proposal-card"
      role="group"
      aria-label={t('cardTitle')}
      style={{
        width: TIMELINE_PLAN_CARD.widthPx,
        borderRadius: TIMELINE_PLAN_CARD.radiusPx,
        padding: TIMELINE_PLAN_CARD.paddingPx,
      }}
      className="canvas-glass flex flex-col gap-2.5 border border-border bg-card"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 shrink-0" aria-hidden />
        <span className="text-xs font-semibold">{t('cardTitle')}</span>
        <span className="ml-auto text-2xs text-muted-foreground">
          {t('notApplied')}
        </span>
      </div>

      <p className="text-xs leading-[18px] text-foreground">
        {proposal.summary}
      </p>

      <p className="text-2xs text-muted-foreground">
        {t('counts', {
          clips: proposal.counts.clipsChanged,
          tracks: proposal.counts.tracksAdded,
        })}
      </p>

      {reviewing ? null : (
        <div className="flex gap-1.5">
          <button
            type="button"
            data-testid="edit-desk-proposal-adopt"
            onClick={onAdopt}
            className="inline-flex h-[34px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary text-xs text-primary-foreground transition-opacity duration-fast hover:opacity-90"
          >
            <Check className="size-4 shrink-0" aria-hidden />
            {t('adopt')}
          </button>
          <button
            type="button"
            data-testid="edit-desk-proposal-review"
            onClick={onReview}
            className="inline-flex h-[34px] items-center justify-center rounded-lg bg-muted px-3 text-xs text-foreground transition-colors duration-fast hover:bg-accent"
          >
            {t('review')}
          </button>
          <button
            type="button"
            data-testid="edit-desk-proposal-discard"
            onClick={onDiscard}
            className="inline-flex h-[34px] items-center justify-center rounded-lg bg-muted px-3 text-xs text-foreground transition-colors duration-fast hover:bg-accent"
          >
            {t('discard')}
          </button>
        </div>
      )}
    </div>
  )
}

export interface EditDeskProposalInspectorProps {
  readonly desk: EditDesk
}

/**
 * 逐段看时右栏那一列（画板右栏：提案 · S02 / 取 1.0s–6.0s / 为什么 / 入点 / 出点
 * / 采用这段 · 跳过）。
 *
 * ⚠ 标题那句由**数字现拼**，⛔ 不由服务端拼好送过来：文案是三语的
 * （`timeline-plan.ts` 头注同源）。
 */
export function EditDeskProposalInspector({
  desk,
}: EditDeskProposalInspectorProps) {
  const t = useTranslations('StudioNode.editDesk.plan')
  const proposal = desk.proposal
  const index = desk.proposalClipIndex
  const entry =
    proposal && index !== null ? proposal.rationale[index] : undefined

  if (!proposal || index === null || !entry) return null

  const accepted = desk.proposalAcceptedClipIds.length
  const last = proposal.rationale.length - 1

  return (
    <div
      data-testid="edit-desk-proposal-inspector"
      style={{ width: EDIT_DESK_LAYOUT.inspectorWidthPx }}
      className="flex shrink-0 flex-col gap-2.5 overflow-y-auto rounded-xl border border-border bg-card p-3.5"
    >
      <div className="flex items-center gap-2">
        <span className="text-3xs uppercase text-muted-foreground">
          {t('clipHeading', { index: index + 1, total: last + 1 })}
        </span>
        <div className="ml-auto flex gap-0.5">
          <StepButton
            testId="edit-desk-proposal-prev"
            label={t('prev')}
            disabled={index === 0}
            onClick={() => desk.stepProposalReview(-1)}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </StepButton>
          <StepButton
            testId="edit-desk-proposal-next"
            label={t('next')}
            disabled={index === last}
            onClick={() => desk.stepProposalReview(1)}
          >
            <ChevronRight className="size-4" aria-hidden />
          </StepButton>
        </div>
      </div>

      <p className="text-xs leading-[18px] text-foreground">
        {t(`take.${entry.take}`, {
          in: formatEditClock(entry.inSec, true),
          out: formatEditClock(entry.outSec, true),
          seconds: Math.round((entry.outSec - entry.inSec) * 10) / 10,
          total: Math.round(entry.sourceDurationSec * 10) / 10,
        })}
      </p>

      {entry.reason ? (
        <p className="text-2xs text-muted-foreground">
          {t('why', { reason: entry.reason })}
        </p>
      ) : null}

      <span className="h-px bg-border" />

      <Row
        label={t('inPoint')}
        value={formatEditClock(entry.inSec, true)}
        testId="edit-desk-proposal-in"
      />
      <Row
        label={t('outPoint')}
        value={formatEditClock(entry.outSec, true)}
        testId="edit-desk-proposal-out"
      />

      <span className="h-px bg-border" />

      <div className="flex gap-1.5">
        <button
          type="button"
          data-testid="edit-desk-proposal-accept-clip"
          onClick={() => desk.decideProposalClip(true)}
          className="inline-flex h-8 flex-1 items-center justify-center rounded-lg bg-primary text-2xs text-primary-foreground transition-opacity duration-fast hover:opacity-90"
        >
          {t('acceptClip')}
        </button>
        <button
          type="button"
          data-testid="edit-desk-proposal-skip-clip"
          onClick={() => desk.decideProposalClip(false)}
          className="inline-flex h-8 items-center justify-center rounded-lg bg-muted px-2.5 text-2xs text-foreground transition-colors duration-fast hover:bg-accent"
        >
          {t('skipClip')}
        </button>
      </div>

      <p className="text-3xs text-muted-foreground">
        {t('acceptedSoFar', { count: accepted })}
      </p>
    </div>
  )
}

function StepButton({
  testId,
  label,
  disabled,
  onClick,
  children,
}: {
  readonly testId: string
  readonly label: string
  readonly disabled: boolean
  onClick(): void
  readonly children: React.ReactNode
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-md text-foreground transition-colors duration-fast',
        disabled ? 'opacity-40' : 'hover:bg-accent',
      )}
    >
      {children}
    </button>
  )
}

function Row({
  label,
  value,
  testId,
}: {
  readonly label: string
  readonly value: string
  readonly testId: string
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span>{label}</span>
      <span data-testid={testId} className="tabular-nums text-muted-foreground">
        {value}
      </span>
    </div>
  )
}
