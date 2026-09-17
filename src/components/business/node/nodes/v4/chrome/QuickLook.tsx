'use client'

/**
 * 双击打开的**快速看**浮层（spec §1.10，画板 `ImageQuickLook.dc.html`）。
 *
 * 画布级：压暗 55%、原比例居中、底部一条「版本小点 + 读数 + 下载/关闭」。
 * ⚠ **portal 到 body**：`absolute inset-0` 会贴在**节点卡**上，于是整张浮层跟着
 * 画布缩放一起缩——42% 缩放下它只有拇指大（真机 2026-09-10 抓到）。快速看是
 * 画布级的，必须脱离 ReactFlow 的 viewport 变换。
 * ⛔ 没有任何参数——参数是提示词栏的事，快速看只回答「这一版长什么样」。
 * Esc / 点空白关闭，←→ 切版本。
 *
 * **内容插槽**：图 / 播放器 / 波形由调用方给（S3 / S5 / S6 各自的媒体件）。
 */

import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { Download, X } from '@/components/icons'

import { cn } from '@/lib/utils'

import { VersionDots } from './VersionDots'

export interface QuickLookProps {
  readonly open: boolean
  onClose(): void
  /** 图 / 播放器 / 波形。 */
  readonly children: ReactNode
  /** 读数，如「2 / 3 · 1792×1024 · Seedream」。 */
  readonly readout?: string
  readonly versionCount?: number
  readonly versionIndex?: number
  onVersionChange?(index: number): void
  onDownload?(): void
  readonly ariaLabel: string
  readonly className?: string
}

export function QuickLook({
  open,
  onClose,
  children,
  readout,
  versionCount = 0,
  versionIndex = 0,
  onVersionChange,
  onDownload,
  ariaLabel,
  className,
}: QuickLookProps) {
  const t = useTranslations('StudioNode.v4.chrome')

  // Esc 关闭 + ←→ 切版本挂在 document 上：焦点可能落在里面的播放器上，
  // 挂容器 `onKeyDown` 会漏掉那些不冒泡到容器的情形。
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (!onVersionChange || versionCount <= 1) return
      if (event.key === 'ArrowLeft' && versionIndex > 0) {
        event.preventDefault()
        onVersionChange(versionIndex - 1)
      } else if (
        event.key === 'ArrowRight' &&
        versionIndex < versionCount - 1
      ) {
        event.preventDefault()
        onVersionChange(versionIndex + 1)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, onVersionChange, versionCount, versionIndex])

  // ⚠ `open` 只可能被用户的交互点开，那一刻早就在客户端了；SSR 那一轮 `open`
  // 恒为 false，所以这里不需要 mounted 门（⛔ 也就不必在 effect 里 setState）。
  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      data-node-chrome="quick-look"
      // 点空白关闭：只认打在这一层本身的点击，⛔ 不认冒泡上来的
      // （否则点图里的播放钮也会把浮层关掉）。
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className={cn(
        'fixed inset-0 z-50 flex flex-col items-center justify-center gap-3.5 bg-background/55 p-8',
        className,
      )}
    >
      <div className="pointer-events-auto max-h-full max-w-full">
        {children}
      </div>
      <div className="flex items-center gap-4">
        {versionCount > 1 && onVersionChange && (
          <VersionDots
            count={versionCount}
            current={versionIndex}
            onSelect={onVersionChange}
            ariaLabel={t('versions')}
            labelOf={(index) =>
              t('versionOf', { index: index + 1, total: versionCount })
            }
          />
        )}
        {readout && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {readout}
          </span>
        )}
        <div className="flex items-center gap-0.75 rounded-xl p-0.75 surface-glass shadow-node-chrome">
          {onDownload && (
            <button
              type="button"
              aria-label={t('download')}
              data-quick-look-download
              onClick={onDownload}
              className="flex size-8.5 items-center justify-center rounded-lg text-foreground transition-colors duration-fast hover:bg-surface-fill-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Download aria-hidden className="size-4" />
            </button>
          )}
          <button
            type="button"
            aria-label={t('close')}
            data-quick-look-close
            onClick={onClose}
            className="flex size-8.5 items-center justify-center rounded-lg text-foreground transition-colors duration-fast hover:bg-surface-fill-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
