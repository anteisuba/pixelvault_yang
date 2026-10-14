'use client'

/**
 * 发送键左边那一行读数（node-canvas-v2 §3「发送键带价」，A 方向 owner 2026-10-14）。
 *
 * - 有价：`≈$0.16`（单价 × 这一枪的张数），点开看算法。
 * - 型号缺 key：写「先配 key」，点了就地开 `QuickSetupDialog`（Hard Rule 8，
 *   ⛔ 跳 `/settings/keys`）。
 * - 钉不死一个价（区间价、缺价）：整行不画，⛔ 不写「$0」。
 *
 * 价是参考价（与画面弹层底部那一行同一份 `imageCostEstimate`），不是计费依据。
 */

import { useTranslations } from 'next-intl'

import { formatUnitPriceAmount } from '@/constants/models/unit-prices'

import { ChipPopover } from '../chrome/ChipPopover'

export interface ImageSendReadoutProps {
  /** 一张的价；null = 钉不死。 */
  readonly unit: number | null
  /** 这一枪发几张。 */
  readonly count: number
  /** 当前型号确定缺 key（名单已回来）。 */
  readonly missingKey: boolean
  onSetupKey(): void
  readonly disabled?: boolean
}

const readoutClass =
  'nodrag nopan h-7 shrink-0 rounded-full px-2 text-xs tabular-nums transition-colors duration-fast ease-standard hover:bg-surface-fill-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 data-[state=open]:bg-surface-fill-track'

export function ImageSendReadout({
  unit,
  count,
  missingKey,
  onSetupKey,
  disabled = false,
}: ImageSendReadoutProps) {
  const t = useTranslations('StudioNode.v4.image.send')
  if (missingKey) {
    return (
      <button
        type="button"
        data-image-send-readout="missing-key"
        disabled={disabled}
        onClick={onSetupKey}
        className={`${readoutClass} text-status-warning`}
      >
        {t('needsKey')}
      </button>
    )
  }
  if (unit === null) return null
  const total = formatUnitPriceAmount(unit * count)
  return (
    <ChipPopover
      width={240}
      ariaLabel={t('estimateTitle')}
      trigger={
        <button
          type="button"
          data-image-send-readout="price"
          aria-label={t('estimateLabel', { amount: total })}
          disabled={disabled}
          className={`${readoutClass} text-muted-foreground`}
        >
          {t('estimate', { amount: total })}
        </button>
      }
    >
      <div className="flex flex-col gap-1.5 text-xs">
        <span className="font-medium text-foreground">
          {t('estimateTitle')}
        </span>
        <span className="text-foreground tabular-nums">
          {t('estimateDetail', {
            unit: formatUnitPriceAmount(unit),
            count,
            amount: total,
          })}
        </span>
        <span className="text-muted-foreground">{t('estimateNote')}</span>
      </div>
    </ChipPopover>
  )
}
