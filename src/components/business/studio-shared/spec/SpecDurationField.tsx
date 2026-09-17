'use client'

/**
 * 规格弹层里的「时长」段（owner 批注 41 + 42）。
 *
 * 批注 41：时长做成滚动条 —— 范围取自模型的 `supportedDurations`，拖动整秒吸附。
 * 批注 42：**轨道下面不画任何刻度**；当前秒数由一颗黑底白字的 mono 小气泡跟着拇指
 * 走，拖动时实时更新、松手后留在原位；段标题右侧只显**合计价**（秒 × 该渠道每秒
 * 单价），⛔ 不再写「5 s ·」那一段 —— 秒数已经在气泡上了。
 *
 * ⚠ ≤3 档的模型（Veo 4 / 6 / 8 s）退回三颗按钮：三档并排一眼比完，做成滑条反而要
 * 拖两下才知道中间那档是几秒。
 *
 * ⚠ 气泡的水平位置按**拇指实际行程**算，不是按轨道全宽：拇指在两端会各差半个身位
 * （手机上 22px），照全宽摆气泡会明显对不上。内层的 `inset-x` 正好是半个拇指宽。
 */

import { useTranslations } from 'next-intl'

import { formatUnitPriceAmount } from '@/constants/models/unit-prices'
import { cn } from '@/lib/utils'
import { Slider } from '@/components/ui/slider'

/** 超过这个档数才用滚动条（owner 批注 41：「只有 ≤3 档的模型退回按钮」）。 */
export const SPEC_DURATION_SLIDER_THRESHOLD = 3

export interface SpecDurationFieldProps {
  readonly durations: readonly number[]
  readonly seconds: number | null
  /** 秒 × 每秒单价；缺价时为 null，那时段标题右侧什么都不写。 */
  readonly totalPrice: number | null
  readonly disabled?: boolean
  onChange(seconds: number): void
}

const buttonBaseClass =
  'inline-flex h-11 min-w-11 items-center justify-center rounded-lg border px-2.5 text-xs transition-colors duration-fast ease-standard md:h-7.5'

export function SpecDurationField({
  durations,
  seconds,
  totalPrice,
  disabled = false,
  onChange,
}: SpecDurationFieldProps) {
  const t = useTranslations('StudioSpecChip')
  const min = durations[0]
  const max = durations[durations.length - 1]
  if (min === undefined || max === undefined) return null

  const current = seconds ?? min
  const header = (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-2xs font-medium text-muted-foreground/70">
        {t('durationLabel')}
      </span>
      {totalPrice === null ? null : (
        <span
          data-spec-duration-total
          className="font-mono text-2xs tabular-nums text-muted-foreground"
        >
          {formatUnitPriceAmount(totalPrice)}
        </span>
      )}
    </div>
  )

  if (durations.length <= SPEC_DURATION_SLIDER_THRESHOLD) {
    return (
      <div className="flex flex-col gap-1.5">
        {header}
        <div className="flex flex-wrap gap-1.5">
          {durations.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={current === value}
              aria-disabled={disabled}
              onClick={() => {
                if (disabled) return
                onChange(value)
              }}
              className={cn(
                buttonBaseClass,
                current === value
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-background text-foreground hover:border-foreground/40',
              )}
            >
              {t('durationSeconds', { seconds: value })}
            </button>
          ))}
        </div>
      </div>
    )
  }

  const progress = max === min ? 0 : ((current - min) / (max - min)) * 100

  return (
    <div className="flex flex-col gap-1.5">
      {header}
      {/* 几何按 owner 2026-09-18 手改的那一版：轨道 12px / 圆角 2px 级 / border 灰底；
          已选填充 8px、上下各内嵌 2px、黑色；拇指 11px 白圆 + 1px 描边 + float 阴影，
          圆心坐在填充末端。手机上把**整条的纵向命中区**撑到 44px（Radix 的 pointer
          在 Root 上收），⛔ 不是把那颗小白圆画成 44px。 */}
      <div className="relative pt-6">
        {/* 气泡层：内缩半个拇指宽（11 / 2），于是 `left: n%` 正好落在拇指圆心。 */}
        <div className="pointer-events-none absolute inset-x-1.5 top-0">
          <span
            data-spec-duration-bubble
            style={{ left: `${progress}%` }}
            className="absolute -translate-x-1/2 rounded-md bg-foreground px-1.75 py-0.5 font-mono text-2xs tabular-nums whitespace-nowrap text-background"
          >
            {t('durationSeconds', { seconds: current })}
          </span>
        </div>
        <Slider
          data-spec-duration-slider
          aria-label={t('durationLabel')}
          aria-valuetext={t('durationSeconds', { seconds: current })}
          min={min}
          max={max}
          step={1}
          disabled={disabled}
          value={[current]}
          // 整秒吸附：滑条按整秒走，落到模型档位上（档位不连续时 —— 例如
          // LTX 的 [6, 8, 10] —— 吸附把中间那些秒收到最近的合法档）。
          onValueChange={([next]) => {
            if (next === undefined) return
            const snapped = durations.reduce((best, step) =>
              Math.abs(step - next) < Math.abs(best - next) ? step : best,
            )
            if (snapped !== current) onChange(snapped)
          }}
          className="h-11 md:h-3"
          trackClassName="rounded-xs bg-border data-[orientation=horizontal]:h-3"
          rangeClassName="top-0.5 rounded-xs bg-foreground data-[orientation=horizontal]:h-2"
          thumbClassName="size-2.75 border-border bg-background shadow-md"
        />
      </div>
    </div>
  )
}
