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

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import { ChevronDown } from '@/components/icons'
import { useBlurSwapIn } from '@/components/ui/blur-swap'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'
import {
  CHIP_POPOVER,
  DURATION,
  EASE_IN,
  SPRING,
  motionTransition,
} from '@/constants/motion'
import { formatUnitPriceAmount } from '@/constants/models/unit-prices'
import type { SpecChipModel, SpecTier } from '@/lib/spec-chip-model'
import { cn } from '@/lib/utils'
import {
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
} from '@/components/ui/responsive-popover'
import {
  StudioMorphRatioGlyph,
  StudioRatioGlyph,
  getChipZoomMotion,
  studioToolPopoverBaseClass,
  studioToolSurfaceSizeClass,
  useStudioChipDensity,
  useStudioChipPopoverMotion,
} from '@/components/business/studio-shared/primitives/tool-surface'

import {
  SPEC_DURATION_SLIDER_THRESHOLD,
  SpecDurationField,
} from './SpecDurationField'

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
  /**
   * 接在摘要后面的一段（「1:1 · 2K」+「· 2 张」）。底部输入框把张数写上 chip
   * （owner 2026-09-26 原型），参数栏照旧只写比例与清晰度。
   */
  readonly summarySuffix?: string
  /** 摘要最前面那一段（画布图片卡开着九宫格时写「九宫格」）。 */
  readonly summaryPrefix?: string
  readonly summaryLead?: string
  readonly compactBatchCount?: {
    readonly value: number
    readonly options: readonly number[]
    readonly locked?: boolean
    readonly lockedHint?: string
    onChange(next: number): void
  }
  /**
   * 桌面档的张数（图片台底部输入框）：和比例、清晰度一样排成分段条，直接摆在
   * 清晰度下面（owner 2026-10-08 选「分段条」，⛔ 不再收进「更多」）。
   */
  readonly batchCount?: {
    readonly value: number
    readonly options: readonly number[]
    onChange(next: number): void
  }
  readonly triggerClassName?: string
  /** 弹层对齐，缺省 `start`（chip 在一行左边时往右长）。 */
  readonly popoverAlign?: 'start' | 'end'
  readonly 'data-testid'?: string
}

function SpecSection({
  label,
  note,
  locked,
  hint,
  compact = false,
  terminal = false,
  children,
}: {
  readonly compact?: boolean
  readonly terminal?: boolean
  readonly label: string
  readonly note?: ReactNode
  readonly locked?: boolean
  readonly hint?: string
  readonly children: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex flex-col',
        compact ? 'gap-0' : 'gap-1.5',
        compact && terminal && '-mt-0.5',
        locked && 'opacity-50',
      )}
    >
      <div
        className={cn(
          'flex items-baseline justify-between gap-2',
          compact && 'mx-0.5 mt-0.5 mb-2',
        )}
      >
        <span
          className={cn(
            compact
              ? 'text-2xs leading-4 font-normal text-muted-foreground'
              : 'text-2xs font-medium text-muted-foreground/70',
          )}
          style={compact ? { letterSpacing: '0.02em' } : undefined}
        >
          {label}
        </span>
        {note ? (
          <span className="font-mono text-2xs tabular-nums text-muted-foreground">
            {note}
          </span>
        ) : null}
      </div>
      {/* 分段条自己带轨道（`LiquidSegmented`），这里只管段与段之间的间距。 */}
      <div className={cn('flex', compact && (terminal ? 'mb-0.5' : 'mb-3'))}>
        {children}
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

/** 不支持的档：仍画在分段条里（灰着、悬停写原因），只是点不动。 */
function unsupportedValues(tiers: readonly SpecTier[]): string[] {
  return tiers.filter((tier) => !tier.supported).map((tier) => tier.value)
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
  summarySuffix,
  summaryPrefix,
  summaryLead,
  compactBatchCount,
  batchCount,
  popoverAlign = 'start',
  'data-testid': testId,
}: SpecChipProps) {
  const t = useTranslations('StudioSpecChip')
  const [open, setOpen] = useState(false)
  const [compactMounted, setCompactMounted] = useState(false)
  const closeTimer = useRef<number | null>(null)
  const reduceMotion = useReducedMotion()
  const compact = useStudioChipDensity() === 'compact'
  const compactImage = compact && compactBatchCount !== undefined
  // 底部输入框那一行（描边外观）与画布里，弹层从 chip 放大出来。
  const popoverMotion = useStudioChipPopoverMotion({
    side: 'top',
    align: popoverAlign,
    sideOffset: 8,
  })
  const compactOrigin = getChipZoomMotion({
    side: 'bottom',
    align: popoverAlign,
    sideOffset: 8,
  }).style.transformOrigin

  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
    },
    [],
  )

  function handleOpenChange(next: boolean) {
    if (next && closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    if (next && compact) setCompactMounted(true)
    setOpen(next)
  }

  function selectValue<T>(next: T, onChange: (value: T) => void) {
    onChange(next)
    if (!compact) return
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null
      setOpen(false)
    }, 160)
  }
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

  const summaryValue = [model.summary, summarySuffix]
    .filter(Boolean)
    .join(' · ')
  // 桌面：改了比例 / 张数，摘要字糊一下换掉；画布那一档保留原来的淡入。
  const summaryBlurSwap = useBlurSwapIn(summaryValue)
  const summaryMotion = compact
    ? ({
        initial: { opacity: 0.2 },
        animate: { opacity: 1 },
        transition: { duration: DURATION.fast, ease: 'linear' },
      } as const)
    : summaryBlurSwap
  const resolutionUnsupportedTitle = (tier: string) =>
    model.resolutionNote?.kind === 'unsupported' &&
    model.resolutionNote.maxSupported
      ? t('resolutionCeiling', {
          tier,
          max: model.resolutionNote.maxSupported,
        })
      : t('tierUnsupported', { tier })
  /**
   * 比例 / 清晰度 / 张数 / 时长都是同一种 A1 分段条（`LiquidSegmented`，owner
   * 2026-10-08）：桌面与画布同一颗，比例格带小形状。画布那一档选完 160ms 收起。
   */
  const popoverBody = (
    <div className={cn('flex flex-col', compact ? 'gap-0' : 'gap-3')}>
      {model.ratios.length > 0 ? (
        <SpecSection
          compact={compact}
          label={t('aspectRatioLabel')}
          locked={model.ratioLocked}
          {...(model.ratioLocked && ratioLockedHint
            ? { hint: ratioLockedHint }
            : {})}
        >
          <LiquidSegmented
            items={model.ratios.map((tier) => ({
              value: tier.value,
              label: tier.value,
              icon: <StudioRatioGlyph ratio={tier.value} />,
              ...(tier.supported
                ? {}
                : { hint: t('tierUnsupported', { tier: tier.value }) }),
            }))}
            value={model.ratioLocked ? '' : (aspectRatio ?? '')}
            onChange={(next) => selectValue(next, onAspectRatioChange)}
            ariaLabel={t('aspectRatioLabel')}
            disabled={disabled}
            // 首帧锁住比例：整组灰着但仍可悬停（原因写在下面那行提示里）。
            disabledValues={
              model.ratioLocked
                ? model.ratios.map((tier) => tier.value)
                : unsupportedValues(model.ratios)
            }
            semantics="radio"
            size="stack"
            fill
            reselect
          />
        </SpecSection>
      ) : null}

      {model.resolutions.length > 0 ? (
        <SpecSection compact={compact} label={resolutionLabel} note={note}>
          <LiquidSegmented
            items={model.resolutions.map((tier) => ({
              value: tier.value,
              label: tier.value,
              ...(tier.supported
                ? {}
                : { hint: resolutionUnsupportedTitle(tier.value) }),
            }))}
            value={resolution ?? ''}
            onChange={(next) => selectValue(next, onResolutionChange)}
            ariaLabel={resolutionLabel}
            disabled={disabled}
            disabledValues={unsupportedValues(model.resolutions)}
            semantics="radio"
            size="sm"
            fill
            reselect
            className="h-8"
          />
        </SpecSection>
      ) : null}

      {!compact && batchCount ? (
        <SpecSection label={t('moreItem.batchCount')}>
          {/* 助手改张数时这一格闪一下（`studio-operator-flash`）。 */}
          <div data-assistant-field="count" className="w-full">
            <LiquidSegmented
              items={batchCount.options.map((count) => ({
                value: String(count),
                label: `×${count}`,
              }))}
              value={String(batchCount.value)}
              onChange={(next) => batchCount.onChange(Number(next))}
              ariaLabel={t('moreItem.batchCount')}
              disabled={disabled}
              semantics="radio"
              size="sm"
              fill
              className="h-8"
            />
          </div>
        </SpecSection>
      ) : null}

      {compact && compactBatchCount ? (
        <SpecSection
          compact
          terminal
          label={t('moreItem.batchCount')}
          locked={compactBatchCount.locked}
          {...(compactBatchCount.lockedHint
            ? { note: compactBatchCount.lockedHint }
            : {})}
        >
          <LiquidSegmented
            items={compactBatchCount.options.map((count) => ({
              value: String(count),
              label: `×${count}`,
            }))}
            value={String(compactBatchCount.value)}
            onChange={(next) =>
              selectValue(Number(next), compactBatchCount.onChange)
            }
            ariaLabel={t('moreItem.batchCount')}
            disabled={disabled}
            // 九宫格开着张数钉在 1：整组灰着、仍可悬停。
            {...(compactBatchCount.locked
              ? {
                  disabledValues: compactBatchCount.options.map((count) =>
                    String(count),
                  ),
                }
              : {})}
            semantics="radio"
            size="sm"
            fill
            className="h-8"
          />
        </SpecSection>
      ) : null}

      {!compactImage && model.durations.length > 0 && onDurationChange ? (
        <SpecDurationField
          durations={model.durations}
          seconds={model.durationSeconds}
          totalPrice={model.totalPrice}
          disabled={disabled}
          compact={compact}
          onChange={(next) => {
            if (model.durations.length <= SPEC_DURATION_SLIDER_THRESHOLD) {
              selectValue(next, onDurationChange)
            } else {
              onDurationChange(next)
            }
          }}
        />
      ) : null}

      {!compactImage && more ? (
        <div
          data-spec-chip-more
          className={cn(
            'flex flex-col gap-2 border-t border-dashed border-border',
            compact ? 'pt-3' : 'pt-2.5',
          )}
        >
          {more}
        </div>
      ) : null}
    </div>
  )

  return (
    <ResponsivePopover open={open} onOpenChange={handleOpenChange}>
      <ResponsivePopoverTrigger asChild>
        <motion.button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          data-testid={testId}
          data-spec-chip-state={flashing ? 'flash' : open ? 'open' : 'default'}
          className={cn(
            'nodrag nopan inline-flex h-8 min-w-0 items-center gap-1.5 rounded-full border px-3 text-2sm transition-colors duration-fast ease-standard',
            compact &&
              'h-7 gap-1 border-0 bg-surface-fill px-2.5 text-xs transition-colors duration-fast hover:bg-surface-fill-hover',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:pointer-events-none disabled:opacity-50',
            compact
              ? open
                ? 'bg-surface-fill-track text-foreground hover:bg-surface-fill-track'
                : 'text-foreground'
              : flashing
                ? 'border-status-warning bg-status-warning-surface text-status-warning'
                : open
                  ? 'border-foreground bg-background text-foreground ring-3 ring-muted'
                  : 'border-border bg-background text-foreground hover:border-foreground/40',
            triggerClassName,
          )}
          whileTap={compact && !reduceMotion ? { scale: 0.96 } : undefined}
          transition={SPRING.press}
        >
          {!compact &&
          model.ratios.length > 0 &&
          !model.ratioLocked &&
          aspectRatio ? (
            <StudioMorphRatioGlyph ratio={aspectRatio} />
          ) : null}
          <span className="min-w-0 flex-1 truncate text-left tabular-nums">
            {model.summary ? (
              summaryLead ? (
                <>
                  <span>
                    {summaryPrefix ? `${summaryPrefix} · ` : ''}
                    {summaryLead}
                  </span>{' '}
                  <motion.span
                    key={summaryValue}
                    {...summaryMotion}
                    className="text-muted-foreground"
                  >
                    {summaryValue}
                  </motion.span>
                </>
              ) : (
                <motion.span key={summaryValue} {...summaryMotion}>
                  {[summaryPrefix, model.summary, summarySuffix]
                    .filter(Boolean)
                    .join(' · ')}
                </motion.span>
              )
            ) : (
              ariaLabel
            )}
          </span>
          <motion.span
            aria-hidden
            animate={{ rotate: open ? 180 : 0 }}
            transition={motionTransition('base', reduceMotion)}
            className="inline-flex shrink-0 text-muted-foreground"
          >
            <ChevronDown className={compact ? 'size-3' : 'size-3.5'} />
          </motion.span>
        </motion.button>
      </ResponsivePopoverTrigger>
      {compact ? (
        compactMounted ? (
          <ResponsivePopoverContent
            asChild
            forceMount
            label={ariaLabel}
            side="bottom"
            align={popoverAlign}
            sideOffset={8}
            collisionPadding={12}
            data-spec-chip-popover
            className="w-90 rounded-node-bar border-0 bg-popover p-3 text-foreground ring-1 ring-border shadow-node-menu outline-none"
          >
            <motion.div
              initial={{
                opacity: 0,
                scale: CHIP_POPOVER.fromScale,
                filter: `blur(${CHIP_POPOVER.blurPx}px)`,
              }}
              animate={
                open
                  ? { opacity: 1, scale: 1, filter: 'blur(0px)' }
                  : {
                      opacity: 0,
                      scale: CHIP_POPOVER.fromScale,
                      filter: `blur(${CHIP_POPOVER.blurPx}px)`,
                    }
              }
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : open
                    ? SPRING.slot
                    : { duration: DURATION.base, ease: EASE_IN }
              }
              onAnimationComplete={() => {
                if (!open) setCompactMounted(false)
              }}
              style={{
                animation: 'none',
                transformOrigin: compactOrigin,
                pointerEvents: open ? 'auto' : 'none',
              }}
            >
              {popoverBody}
            </motion.div>
          </ResponsivePopoverContent>
        ) : null
      ) : (
        <ResponsivePopoverContent
          style={popoverMotion.style}
          label={ariaLabel}
          side="top"
          align={popoverAlign}
          sideOffset={8}
          collisionPadding={12}
          data-spec-chip-popover
          className={cn(
            studioToolPopoverBaseClass,
            studioToolSurfaceSizeClass.action,
            'overflow-y-auto overscroll-contain',
            popoverMotion.className,
          )}
        >
          {popoverBody}
        </ResponsivePopoverContent>
      )}
    </ResponsivePopover>
  )
}
