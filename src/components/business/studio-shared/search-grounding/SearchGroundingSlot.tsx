'use client'

import { useTranslations } from 'next-intl'

import { Globe, X } from '@/components/icons'
import { cn } from '@/lib/utils'

interface SearchGroundingSlotProps {
  /** 开着、且这一枪有支持的型号 —— 收起时高度回 0、淡出。 */
  open: boolean
  /**
   * `slot` = 输入框 / 确认卡 / 手机抽屉顶上那道虚线槽（高 44）；
   * `pill` = 画布提示词栏首行那颗虚线胶囊（高 28）。
   */
  variant?: 'slot' | 'pill'
  /** 确认卡里标题与说明上下排。 */
  stacked?: boolean
  /** 平时那一句（各处说法不同：资料摆在图左边 / 图上方 / 跟这张卡存…）。 */
  description: string
  /** 正在搜：说明换成「正在搜网页和图片…」，槽里一道微光从左扫到右。 */
  searching?: boolean
  /** 同系列一起跑时标出只对哪个型号（「只对 Nano Banana 2.1」）。 */
  onlyModelLabel?: string
  disabled?: boolean
  onTurnOff: () => void
  className?: string
}

/**
 * 「先搜再画」开着时的那道虚线槽（B 定稿）：开 = 高 0→44 淡入（spring-slot），
 * 关 = 收起淡出（base）。槽上的 × 就是关。
 */
export function SearchGroundingSlot({
  open,
  variant = 'slot',
  stacked = false,
  description,
  searching = false,
  onlyModelLabel,
  disabled = false,
  onTurnOff,
  className,
}: SearchGroundingSlotProps) {
  const t = useTranslations('SearchGrounding')
  const isPill = variant === 'pill'
  const subtitle = searching ? t('searching') : description

  return (
    <div
      data-open={open ? 'true' : 'false'}
      aria-hidden={!open}
      inert={!open}
      className={cn('search-sources-slot search-sources-slot--rows', className)}
    >
      <div>
        <div
          className={cn(
            'relative flex items-center overflow-hidden border border-dashed border-foreground/25',
            isPill
              ? 'mb-2 inline-flex h-7 max-w-full gap-1.5 rounded-full pr-0.5 pl-2.5 text-xs'
              : 'mb-2.5 min-h-11 gap-2.5 rounded-xl py-1.5 pr-1.5 pl-3',
          )}
        >
          <Globe
            className={cn(
              'shrink-0 text-foreground',
              isPill ? 'size-3.5' : 'size-4',
            )}
            aria-hidden
          />
          {isPill ? (
            <span
              key={searching ? 'searching' : 'idle'}
              className="min-w-0 truncate animate-in fade-in-0 duration-fast ease-standard motion-reduce:animate-none"
            >
              {searching ? t('searching') : `${t('toggle')} · ${t('noPeople')}`}
            </span>
          ) : (
            <span
              className={cn(
                'flex min-w-0 flex-1 text-2sm leading-normal',
                stacked
                  ? 'flex-col gap-px'
                  : 'flex-wrap items-baseline gap-x-2 gap-y-0.5',
              )}
            >
              <b className="font-semibold whitespace-nowrap">{t('toggle')}</b>
              {onlyModelLabel ? (
                <span
                  className={cn(
                    'inline-flex h-5 items-center rounded-full bg-muted px-2 text-2xs font-medium whitespace-nowrap text-foreground',
                    stacked ? 'self-start' : 'self-center',
                  )}
                >
                  {t('onlyModel', { model: onlyModelLabel })}
                </span>
              ) : null}
              <span
                key={searching ? 'searching' : 'idle'}
                // ⚠ 上下排时 basis 会变成高度，只在横排时给。
                className={cn(
                  'min-w-0 animate-in text-xs text-muted-foreground fade-in-0 duration-fast ease-standard motion-reduce:animate-none',
                  !stacked && 'flex-1 basis-48',
                )}
              >
                {searching ? subtitle : `${subtitle} · ${t('noPeople')}`}
              </span>
            </span>
          )}
          {searching ? (
            <span
              aria-hidden
              className="search-slot-shimmer pointer-events-none absolute inset-0"
            />
          ) : null}
          <button
            type="button"
            onClick={onTurnOff}
            disabled={disabled}
            aria-label={t('turnOff')}
            className={cn(
              'grid shrink-0 place-items-center rounded-full text-muted-foreground transition-colors duration-fast ease-standard hover:bg-surface-fill hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
              isPill ? 'size-6' : 'size-7',
            )}
          >
            <X className={isPill ? 'size-3' : 'size-3.5'} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  )
}
