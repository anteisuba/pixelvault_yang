'use client'

import { AlertCircle, RotateCcw, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { UploadQueueItem } from '@/hooks/use-asset-upload-queue'
import { cn } from '@/lib/utils'

/**
 * 上传占位瓦片 —— `docs/references/pages/assets.md` §7.3。
 *
 * 选中文件的**那一刻**就插在网格最前面，不等服务端：虚线框 + 本地缩略图 +
 * 文件名 + 进度环 + 百分比。单张完成后原地换成真图（**不跳位**）；单张失败
 * 变错误瓦片（红边 + 原因 + 行内「重试 / 移除」），⛔ **不静默消失**。
 */

interface AssetUploadTileProps {
  item: UploadQueueItem
  width: number
  height: number
  onRetry: (id: string) => void
  onRemove: (id: string) => void
}

export function AssetUploadTile({
  item,
  width,
  height,
  onRetry,
  onRemove,
}: AssetUploadTileProps) {
  const t = useTranslations('AssetsPage')
  const isError = item.status === 'error'
  // 进度环：周长按半径算，`strokeDashoffset` 走真实百分比（不是假动画）。
  const radius = 13
  const circumference = 2 * Math.PI * radius

  return (
    <div
      style={{ width, height }}
      className={cn(
        'relative shrink-0 overflow-hidden rounded-lg border border-dashed bg-muted/40',
        isError ? 'border-destructive' : 'border-border',
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- local object URL, no remote optimization involved */}
      <img
        src={item.previewUrl}
        alt=""
        className={cn(
          'absolute inset-0 size-full object-cover',
          isError ? 'opacity-40' : 'opacity-60',
        )}
      />

      {!isError && (
        <span
          aria-label={t('uploadQueueProgress', { percent: item.progress })}
          className="asset-tile-badge absolute left-1/2 top-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
        >
          <svg viewBox="0 0 32 32" className="size-7 -rotate-90">
            <circle
              cx="16"
              cy="16"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.3"
              strokeWidth="3"
            />
            <circle
              cx="16"
              cy="16"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={
                circumference - (circumference * item.progress) / 100
              }
            />
          </svg>
        </span>
      )}

      <span className="asset-tile-veil pointer-events-none absolute inset-x-0 bottom-0 flex items-end gap-1 px-2 pb-1.5 pt-6">
        <span className="min-w-0 flex-1 truncate text-2xs text-white">
          {isError ? (item.error ?? t('uploadFailed')) : item.fileName}
        </span>
        {!isError && (
          <span className="asset-tile-veil-sub shrink-0 text-3xs tabular-nums">
            {item.progress}%
          </span>
        )}
      </span>

      {isError && (
        <span className="absolute inset-x-1.5 top-1.5 flex items-center gap-1">
          <AlertCircle className="size-3.5 shrink-0 text-destructive" />
          <span className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => onRetry(item.id)}
              aria-label={t('uploadQueueRetry')}
              className="asset-tile-badge flex size-6 items-center justify-center rounded-md"
            >
              <RotateCcw className="size-3" />
            </button>
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              aria-label={t('uploadQueueRemove')}
              className="asset-tile-badge flex size-6 items-center justify-center rounded-md"
            >
              <X className="size-3" />
            </button>
          </span>
        </span>
      )}
    </div>
  )
}
