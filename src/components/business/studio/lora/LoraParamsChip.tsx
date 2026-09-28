'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { ChevronDown } from '@/components/icons'
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
import { Switch } from '@/components/ui/switch'
import {
  studioToolPopoverBaseClass,
  useStudioChipPopoverMotion,
} from '@/components/business/studio-shared/primitives/tool-surface'
import { cn } from '@/lib/utils'

const DEFAULT_OPTION = '__model_default__'

export type LoraRunnerUpscaler = 'none' | '4x-AnimeSharp'

interface LoraParamsChipProps {
  /** 弹层标题里的底模名（「参数 · WAI-Illustrious v15」）。 */
  baseLabel: string
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
  baseLabel,
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
    <div className="flex min-h-7.5 items-center gap-2.5 text-2sm">
      <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
      {control}
    </div>
  )

  const numberField = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    range: { min: number; max: number; step: number; fallback: number },
  ) =>
    row(
      label,
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <Slider
          aria-label={t('generate.advanced.sliderLabel', { label })}
          min={range.min}
          max={range.max}
          step={range.step}
          value={[Number(value) || range.fallback]}
          onValueChange={([next]) => onChange(String(next))}
          trackClassName="data-[orientation=horizontal]:h-1 bg-surface-fill-track"
          thumbClassName="size-3.5 border-0 bg-background shadow-sm ring-1 ring-foreground/20"
        />
        <Input
          type="number"
          min={range.min}
          max={range.max}
          step={range.step}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={t('generate.paramsDefaultShort')}
          aria-label={label}
          className="h-8 w-16 shrink-0 border-border bg-transparent px-2 text-right font-mono tabular-nums placeholder:font-sans md:text-xs"
        />
      </div>,
    )

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
          className="min-w-0 flex-1 border-border bg-transparent md:text-xs"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={DEFAULT_OPTION}>
            {t('generate.advanced.modelDefault')}
          </SelectItem>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>,
    )

  return (
    <ResponsivePopover open={open} onOpenChange={setOpen}>
      <ResponsivePopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`${t('generate.advanced.title')} · ${summary}`}
          className={cn(
            'inline-flex h-8 min-w-0 max-w-56 items-center gap-1.5 rounded-full border px-3 text-2sm transition-colors duration-fast ease-standard',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:pointer-events-none disabled:opacity-50',
            error
              ? 'border-status-risk/50 bg-status-risk-surface text-status-risk'
              : open
                ? 'border-foreground bg-background text-foreground ring-3 ring-muted'
                : 'border-border bg-background text-foreground hover:border-foreground/40',
          )}
        >
          <span className="min-w-0 flex-1 truncate text-left">{summary}</span>
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
        label={t('generate.advanced.title')}
        side="top"
        align="end"
        sideOffset={8}
        collisionPadding={12}
        style={motion.style}
        className={cn(
          studioToolPopoverBaseClass,
          'w-80 overflow-y-auto overscroll-contain p-4',
          motion.className,
        )}
      >
        <div className="flex flex-col gap-3">
          <h4 className="text-xs font-semibold text-foreground/80">
            {t('generate.paramsTitle', { base: baseLabel })}
          </h4>
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
          {row(
            t('generate.paramsLabels.seed'),
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <label className="inline-flex shrink-0 items-center gap-2 text-2sm text-foreground/80">
                <Switch
                  checked={seedFixed}
                  onCheckedChange={(fixed) =>
                    onSeedChange(fixed ? seedToFix() : '')
                  }
                  aria-label={t('generate.seedFixed')}
                />
                {t('generate.seedFixed')}
              </label>
              {seedFixed ? (
                <Input
                  value={seed}
                  onChange={(event) => onSeedChange(event.target.value.trim())}
                  inputMode="numeric"
                  aria-label={t('generate.advanced.seed')}
                  className="h-8 min-w-0 flex-1 border-border bg-transparent px-2 font-mono tabular-nums md:text-xs"
                />
              ) : (
                <span className="ml-auto text-2sm text-muted-foreground">
                  {t('generate.seedRandom')}
                </span>
              )}
            </div>,
          )}
          {row(
            t('generate.paramsLabels.upscale'),
            <Select
              value={upscaler}
              onValueChange={(next) =>
                onUpscalerChange(
                  next === '4x-AnimeSharp' ? '4x-AnimeSharp' : 'none',
                )
              }
            >
              <SelectTrigger
                size="sm"
                aria-label={t('generate.advanced.upscaler')}
                className="min-w-0 flex-1 border-border bg-transparent md:text-xs"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  {t('generate.advanced.upscalerNone')}
                </SelectItem>
                <SelectItem value="4x-AnimeSharp">4x-AnimeSharp</SelectItem>
              </SelectContent>
            </Select>,
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
          <p className="text-xs text-muted-foreground">
            {t('generate.paramsDefaultNote')}
          </p>
        </div>
      </ResponsivePopoverContent>
    </ResponsivePopover>
  )
}
