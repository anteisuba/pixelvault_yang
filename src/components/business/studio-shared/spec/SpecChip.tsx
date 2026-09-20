'use client'

/**
 * 规格 chip —— 一颗 chip + 一个 360 宽弹层（D2 ④「规格 chip」画板，进度表第 12 项）。
 *
 * chip 上写全量摘要「比例 · 清晰度（· 时长）」，⛔ 不显价。三态：
 * 默认白底描边 / 打开中黑描边 + 3px muted 环 / 刚被模型切换改回默认时闪一次
 * warning 描边（1s 后恢复，由 `flashToken` 变化触发）。
 *
 * 弹层分段：比例 → 清晰度（图片叫「尺寸 / 清晰度」）→ 时长（仅视频）→ 底部虚线
 * 以下的附加段（内容由宿主给：张数 / 声音 / seed 等），⛔ 不收折（owner 2026-09-20
 * 「没必要做收放」）。
 *
 * **纯呈现 + 受控**：不认识 context、不认识节点。四个宿主（工作台图片 / 工作台视频 /
 * 画布图片卡 / 画布视频卡）各自把 `SpecChipModel` 与回调传进来 —— 它替掉的正是那
 * 四份各写一遍的 Spec 弹层。
 */

import { useEffect, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import { ChevronDown } from '@/components/icons'
import { formatUnitPriceAmount } from '@/constants/models/unit-prices'
import type { SpecChipModel, SpecTier } from '@/lib/spec-chip-model'
import { cn } from '@/lib/utils'
import {
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
} from '@/components/ui/responsive-popover'
import {
  StudioRatioGlyph,
  studioToolPopoverBaseClass,
  studioToolSurfaceSizeClass,
} from '@/components/business/studio-shared/primitives/tool-surface'

import { SpecDurationField } from './SpecDurationField'

/** warning 描边闪多久（ms）。画板：1s 后恢复默认态。 */
const FLASH_MS = 1000

export interface SpecChipProps {
  readonly model: SpecChipModel
  readonly aspectRatio: string | null
  onAspectRatioChange(next: string): void
  readonly resolution: string | null
  onResolutionChange(next: string): void
  onDurationChange?(seconds: number): void
  /** 清晰度段的标题：图片「尺寸 / 清晰度」，视频「清晰度」。 */
  readonly resolutionLabel: string
  /** 比例被首帧锁住时那一句「是谁锁的、怎么解除」。 */
  readonly ratioLockedHint?: string
  /** 底部虚线以下的附加段内容；不给就整段不渲染。 */
  readonly more?: ReactNode
  readonly disabled?: boolean
  /**
   * 「这一帧有值被吸附回默认」的信号。**从空变成非空**时闪一次 warning 描边；
   * 回到空不闪 —— 宿主写回状态之后它本来就会回到空，那不是第二次事故。
   */
  readonly flashSignal?: string | null
  readonly ariaLabel: string
  /** chip 触发器的额外样式（画布卡上的 chip 比工作台的小一档）。 */
  readonly triggerClassName?: string
  readonly 'data-testid'?: string
}

const tierBaseClass =
  'inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors duration-fast ease-standard md:h-7.5'
const tierIdleClass =
  'border-border bg-background text-foreground hover:border-foreground/40'
const tierActiveClass = 'border-foreground bg-foreground text-background'
const tierUnsupportedClass =
  'cursor-not-allowed border-border bg-background text-muted-foreground/60 line-through'

function SpecSection({
  label,
  note,
  locked,
  hint,
  children,
}: {
  readonly label: string
  readonly note?: ReactNode
  readonly locked?: boolean
  readonly hint?: string
  readonly children: ReactNode
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', locked && 'opacity-50')}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-2xs font-medium text-muted-foreground/70">
          {label}
        </span>
        {note ? (
          <span className="font-mono text-2xs tabular-nums text-muted-foreground">
            {note}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function SpecTierButton({
  tier,
  active,
  disabled,
  locked,
  unsupportedTitle,
  glyph,
  onSelect,
}: {
  readonly tier: SpecTier
  readonly active: boolean
  readonly disabled: boolean
  readonly locked: boolean
  readonly unsupportedTitle: string
  readonly glyph?: boolean
  onSelect(value: string): void
}) {
  const blocked = !tier.supported || locked || disabled
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      // ⚠ 用 `aria-disabled` 而不是 `disabled`：不支持的档要能 hover 看原因，
      //   而 `disabled` 的元素在多数浏览器里连 title 都不弹。
      aria-disabled={blocked}
      title={tier.supported ? undefined : unsupportedTitle}
      onClick={() => {
        if (blocked) return
        onSelect(tier.value)
      }}
      className={cn(
        tierBaseClass,
        !tier.supported
          ? tierUnsupportedClass
          : active
            ? tierActiveClass
            : tierIdleClass,
        (locked || disabled) && tier.supported && 'cursor-not-allowed',
      )}
    >
      {glyph ? <StudioRatioGlyph ratio={tier.value} /> : null}
      {tier.value}
    </button>
  )
}

export function SpecChip({
  model,
  aspectRatio,
  onAspectRatioChange,
  resolution,
  onResolutionChange,
  onDurationChange,
  resolutionLabel,
  ratioLockedHint,
  more,
  disabled = false,
  flashSignal,
  ariaLabel,
  triggerClassName,
  'data-testid': testId,
}: SpecChipProps) {
  const t = useTranslations('StudioSpecChip')
  const [open, setOpen] = useState(false)
  /**
   * ⚠ 上一次看到的信号存在 **state** 里而不是 ref：这是 React 官方的「渲染中调整
   * state」写法，⛔ 不在渲染里读写 ref（读到的可能是上一轮的值）。计时器那半边留在
   * effect 里 —— 它是异步回调，不是同步级联。
   */
  const [flash, setFlash] = useState<{
    seen: string | null | undefined
    active: string | null
  }>({ seen: flashSignal, active: null })
  if (flashSignal !== flash.seen) {
    // 第一次渲染不闪（初始值就是当时的信号）；回到空也不闪。
    setFlash({ seen: flashSignal, active: flashSignal ?? null })
  }
  const flashing = flash.active !== null

  useEffect(() => {
    if (flash.active === null) return
    const timer = window.setTimeout(
      () => setFlash((prev) => ({ ...prev, active: null })),
      FLASH_MS,
    )
    return () => window.clearTimeout(timer)
  }, [flash.active])

  const note =
    model.resolutionNote === null
      ? null
      : model.resolutionNote.kind === 'unsupported'
        ? model.resolutionNote.maxSupported
          ? t('resolutionCeiling', {
              tier: model.resolutionNote.tier,
              max: model.resolutionNote.maxSupported,
            })
          : t('tierUnsupported', { tier: model.resolutionNote.tier })
        : t('priceDelta', {
            tier: model.resolutionNote.tier,
            amount: formatUnitPriceAmount(model.resolutionNote.deltaPerSecond),
          })

  return (
    <ResponsivePopover open={open} onOpenChange={setOpen}>
      <ResponsivePopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          data-testid={testId}
          data-spec-chip
          data-spec-chip-state={flashing ? 'flash' : open ? 'open' : 'default'}
          className={cn(
            'nodrag nopan inline-flex h-8 min-w-0 items-center gap-1.5 rounded-full border px-3 text-2sm transition-colors duration-fast ease-standard',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:pointer-events-none disabled:opacity-50',
            flashing
              ? 'border-status-warning bg-status-warning-surface text-status-warning'
              : open
                ? 'border-foreground bg-background text-foreground ring-3 ring-muted'
                : 'border-border bg-background text-foreground hover:border-foreground/40',
            triggerClassName,
          )}
        >
          <span className="min-w-0 flex-1 truncate text-left tabular-nums">
            {model.summary || ariaLabel}
          </span>
          <ChevronDown
            aria-hidden
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform duration-base ease-standard',
              open && 'rotate-180',
            )}
          />
        </button>
      </ResponsivePopoverTrigger>
      <ResponsivePopoverContent
        label={ariaLabel}
        side="top"
        align="start"
        sideOffset={8}
        collisionPadding={12}
        data-spec-chip-popover
        className={cn(
          studioToolPopoverBaseClass,
          studioToolSurfaceSizeClass.action,
          'overflow-y-auto overscroll-contain',
        )}
      >
        <div className="flex flex-col gap-3">
          {model.ratios.length > 0 ? (
            <SpecSection
              label={t('aspectRatioLabel')}
              locked={model.ratioLocked}
              {...(model.ratioLocked && ratioLockedHint
                ? { hint: ratioLockedHint }
                : {})}
            >
              {model.ratios.map((tier) => (
                <SpecTierButton
                  key={tier.value}
                  tier={tier}
                  glyph
                  active={!model.ratioLocked && aspectRatio === tier.value}
                  disabled={disabled}
                  locked={model.ratioLocked}
                  unsupportedTitle={t('tierUnsupported', { tier: tier.value })}
                  onSelect={onAspectRatioChange}
                />
              ))}
            </SpecSection>
          ) : null}

          {model.resolutions.length > 0 ? (
            <SpecSection label={resolutionLabel} note={note}>
              {model.resolutions.map((tier) => (
                <SpecTierButton
                  key={tier.value}
                  tier={tier}
                  active={resolution === tier.value}
                  disabled={disabled}
                  locked={false}
                  unsupportedTitle={
                    model.resolutionNote?.kind === 'unsupported' &&
                    model.resolutionNote.maxSupported
                      ? t('resolutionCeiling', {
                          tier: tier.value,
                          max: model.resolutionNote.maxSupported,
                        })
                      : t('tierUnsupported', { tier: tier.value })
                  }
                  onSelect={onResolutionChange}
                />
              ))}
            </SpecSection>
          ) : null}

          {model.durations.length > 0 && onDurationChange ? (
            <SpecDurationField
              durations={model.durations}
              seconds={model.durationSeconds}
              totalPrice={model.totalPrice}
              disabled={disabled}
              onChange={onDurationChange}
            />
          ) : null}

          {more ? (
            <div
              data-spec-chip-more
              className="flex flex-col gap-2 border-t border-dashed border-border pt-2.5"
            >
              {more}
            </div>
          ) : null}
        </div>
      </ResponsivePopoverContent>
    </ResponsivePopover>
  )
}
