'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { SlidersHorizontal } from '@/components/icons'
import { RUNNER_SAMPLERS, RUNNER_SCHEDULERS } from '@/constants/runner-sampling'
import {
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
} from '@/components/ui/responsive-popover'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'
import {
  studioToolPopoverBaseClass,
  useStudioChipPopoverMotion,
} from '@/components/business/studio-shared/primitives/tool-surface'
import { cn } from '@/lib/utils'

const DEFAULT_OPTION = '__model_default__'

export type LoraRunnerUpscaler = 'none' | '4x-AnimeSharp'

interface LoraParamsChipProps {
  sampler: string
  onSamplerChange: (value: string) => void
  scheduler: string
  onSchedulerChange: (value: string) => void
  steps: string
  onStepsChange: (value: string) => void
  cfg: string
  onCfgChange: (value: string) => void
  /** 空串 = 随机。 */
  seed: string
  onSeedChange: (value: string) => void
  /** 打开「固定」时先落哪一个数（通常是正在看的那张的 seed）。 */
  seedToFix: () => string
  upscaler: LoraRunnerUpscaler
  onUpscalerChange: (value: LoraRunnerUpscaler) => void
  /** 放大后的尺寸那一句（选了放大才有）；`warn` = 尺寸大到该提醒耗时。 */
  upscaleNote?: { text: string; warn: boolean } | null
  /** 来源配方带着精修时那一句。 */
  hiresNote?: string | null
  /** 参数不合法的那一句 —— 出图键此时点不动，原因就说在这里。 */
  error: string | null
  /** 改过几项（chip 上没有采样器 / 步数可写时用它）。 */
  customCount: number
  /**
   * 底模自带的出图默认（清单写了才有，如 Anima Turbo「euler · 10 步 · CFG 1」）：没改时
   * chip 直接写它，滑杆也从它起。缺省 = 通用默认，chip 写「默认参数」。
   */
  defaults?: { sampler: string; steps: number; cfg?: number } | null
  disabled?: boolean
}

/**
 * 输入框工具行右组的「参数」chip（lora-generate.md §2.4，只 Runner 底模有）。
 *
 * chip 上写「采样器 · N 步」（CFG 改过再跟一段），都没改过写「默认参数」—— 底模自带默认
 * 的（`defaults`）写它的默认；弹层从 chip 长出来、关上缩回
 * chip —— 与规格 chip 同一套（`useStudioChipPopoverMotion`，宿主用描边外观圈定）。
 * ⚠ 每一格留空 = 底模默认：值原样是字符串，空串才是「没改」，⛔ 不塞一个假的默认数。
 */
export function LoraParamsChip({
  sampler,
  onSamplerChange,
  scheduler,
  onSchedulerChange,
  steps,
  onStepsChange,
  cfg,
  onCfgChange,
  seed,
  onSeedChange,
  seedToFix,
  upscaler,
  onUpscalerChange,
  upscaleNote,
  hiresNote,
  error,
  customCount,
  defaults = null,
  disabled = false,
}: LoraParamsChipProps) {
  const t = useTranslations('LoraWorkbench')
  const [open, setOpen] = useState(false)
  const motion = useStudioChipPopoverMotion({
    side: 'top',
    align: 'end',
    sideOffset: 8,
  })

  const shownSampler = sampler.trim() || defaults?.sampler || ''
  const shownSteps = steps.trim() || (defaults ? String(defaults.steps) : '')
  const summaryParts = [
    shownSampler || null,
    shownSteps ? t('generate.paramsSteps', { steps: shownSteps }) : null,
    cfg.trim() ? t('generate.paramsCfg', { cfg: cfg.trim() }) : null,
  ].filter((part): part is string => part !== null)
  const summary =
    summaryParts.length > 0
      ? summaryParts.join(' · ')
      : customCount > 0
        ? t('generate.advanced.customSummary', { count: customCount })
        : t('generate.paramsDefault')
  const seedFixed = seed.trim().length > 0

  const row = (label: string, control: React.ReactNode) => (
    <div className="flex min-h-8 items-center gap-3 text-2sm">
      <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
      {control}
    </div>
  )

  // 步数 / CFG：黑色胖条（ui-spec §9「滑杆」），值写在右边；没动过写底模默认（浅字）。
  const numberField = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    range: { min: number; max: number; step: number; fallback: number },
  ) =>
    row(
      label,
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Slider
          look="bar"
          aria-label={t('generate.advanced.sliderLabel', { label })}
          min={range.min}
          max={range.max}
          step={range.step}
          value={[Number(value) || range.fallback]}
          onValueChange={([next]) => onChange(String(next))}
        />
        {/* 值写在右边（等宽）：也能直接敲一个数；没动过时浅字写底模默认。 */}
        <Input
          type="number"
          min={range.min}
          max={range.max}
          step={range.step}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={String(range.fallback)}
          aria-label={label}
          className="h-7 w-11 shrink-0 border-0 bg-transparent px-0 text-right font-mono tabular-nums shadow-none placeholder:text-muted-foreground md:text-xs"
        />
      </div>,
    )

  // 采样器 / 调度器：灰底下拉，没动过写「默认」浅字。
  const selectField = (
    label: string,
    value: string,
    options: readonly string[],
    onChange: (value: string) => void,
  ) =>
    row(
      label,
      <Select
        value={value || DEFAULT_OPTION}
        onValueChange={(next) => onChange(next === DEFAULT_OPTION ? '' : next)}
      >
        <SelectTrigger
          size="sm"
          aria-label={label}
          className={cn(
            'min-w-0 flex-1 border-0 bg-muted font-mono shadow-none md:text-xs',
            !value && 'font-sans text-muted-foreground',
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={DEFAULT_OPTION}>
            {t('generate.paramsDefaultShort')}
          </SelectItem>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>,
    )

  // Seed / 放大：小号切换条（ui-spec ㊲ `LoraParams`）。
  const toggleField = <T extends string>(
    label: string,
    ariaLabel: string,
    value: T,
    items: readonly { value: T; label: string }[],
    onChange: (value: T) => void,
  ) =>
    row(
      label,
      <LiquidSegmented
        ariaLabel={ariaLabel}
        size="row"
        semantics="radio"
        fill
        value={value}
        items={items}
        onChange={onChange}
      />,
    )

  return (
    <ResponsivePopover open={open} onOpenChange={setOpen}>
      <ResponsivePopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`${t('generate.advanced.title')} · ${summary}`}
          className={cn(
            'inline-flex h-8 min-w-0 max-w-56 items-center gap-1.5 rounded-full px-3 text-2sm transition-[background-color,color,box-shadow] duration-fast ease-standard',
            'focus-visible:outline-none focus-visible:shadow-focus',
            'disabled:pointer-events-none disabled:opacity-45',
            error
              ? 'bg-status-risk-surface text-status-risk'
              : open
                ? 'bg-fill-strong text-foreground'
                : 'bg-muted text-foreground hover:tint-hover',
          )}
        >
          <SlidersHorizontal
            aria-hidden
            className="size-3.75 shrink-0 text-muted-foreground"
          />
          <span className="min-w-0 flex-1 truncate text-left">{summary}</span>
        </button>
      </ResponsivePopoverTrigger>
      <ResponsivePopoverContent
        label={t('generate.advanced.title')}
        side="top"
        align="end"
        sideOffset={8}
        collisionPadding={12}
        style={motion.style}
        className={cn(
          studioToolPopoverBaseClass,
          'w-85 overflow-y-auto overscroll-contain p-3.5',
          motion.className,
        )}
      >
        <div className="flex flex-col gap-2.5">
          {error ? (
            <p
              role="alert"
              className="rounded-md bg-status-risk-surface px-2.5 py-2 text-xs text-status-risk"
            >
              {error}
            </p>
          ) : null}
          {selectField(
            t('generate.paramsLabels.sampler'),
            sampler,
            RUNNER_SAMPLERS,
            onSamplerChange,
          )}
          {selectField(
            t('generate.paramsLabels.scheduler'),
            scheduler,
            RUNNER_SCHEDULERS,
            onSchedulerChange,
          )}
          {numberField(t('generate.paramsLabels.steps'), steps, onStepsChange, {
            min: 1,
            max: 100,
            step: 1,
            fallback: defaults?.steps ?? 30,
          })}
          {numberField(t('generate.paramsLabels.cfg'), cfg, onCfgChange, {
            min: 0,
            max: 30,
            step: 0.1,
            fallback: defaults?.cfg ?? 7,
          })}
          {toggleField(
            t('generate.paramsLabels.seed'),
            t('generate.paramsLabels.seed'),
            seedFixed ? 'fixed' : 'random',
            [
              { value: 'random', label: t('generate.seedRandom') },
              { value: 'fixed', label: t('generate.seedFixed') },
            ],
            (next) => onSeedChange(next === 'fixed' ? seedToFix() : ''),
          )}
          {seedFixed ? (
            <div className="flex items-center gap-3 pl-17">
              <Input
                value={seed}
                onChange={(event) => onSeedChange(event.target.value.trim())}
                inputMode="numeric"
                aria-label={t('generate.advanced.seed')}
                className="h-8 min-w-0 flex-1 border-0 bg-muted px-2.5 font-mono tabular-nums shadow-none md:text-xs"
              />
            </div>
          ) : null}
          {toggleField(
            t('generate.paramsLabels.upscale'),
            t('generate.advanced.upscaler'),
            upscaler,
            [
              { value: 'none', label: t('generate.upscaleNone') },
              { value: '4x-AnimeSharp', label: '4x-AnimeSharp' },
            ],
            onUpscalerChange,
          )}
          {upscaleNote ? (
            <p
              className={cn(
                'text-xs',
                upscaleNote.warn
                  ? 'text-status-warning'
                  : 'text-muted-foreground',
              )}
            >
              {upscaleNote.text}
            </p>
          ) : null}
          {hiresNote ? (
            <p className="text-xs text-muted-foreground">{hiresNote}</p>
          ) : null}
        </div>
      </ResponsivePopoverContent>
    </ResponsivePopover>
  )
}
