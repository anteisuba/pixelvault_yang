'use client'

import { useRef, useState, type ReactNode } from 'react'
import { Image as ImageIcon, X } from '@/components/icons'

import type { ReferenceImageEntry } from '@/hooks/use-image-upload'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'

interface ImageAttachmentPreviewStripProps {
  entries: ReadonlyArray<ReferenceImageEntry>
  previewAlt: string
  previewLabel?: (index: number) => string
  previewDescription?: string
  previewCloseLabel?: string
  removeLabel: (index: number) => string
  onRemove: (index: number) => void
  overLimitTooltip?: string
  unsupportedTooltip?: string
  /**
   * `tabs` = 标签台 A：小缩略图排在页签那一行的最前面（owner 2026-10-09 原型），
   * 只有页签那么高。
   */
  variant?: 'composer' | 'panel' | 'tabs'
  /**
   * 可选：缩略图可拖出去（原生 HTML5 拖拽），`dataTransfer` 里以这个 MIME 放图的 url。
   * 输入框参考图条传 `STUDIO_REFERENCE_DRAG_MIME`——故意不是画廊那个 MIME，
   * 舞台和输入框就不会把同一张参考图再加一遍。
   */
  dragMime?: string
  /** 宿主输入框的内边距不同时，用它对齐这一排（接在变体内边距后面）。 */
  className?: string
}

/** 每张缩略图的外壳；给了 `dragMime` 就能拖出去。 */
function StripEntryShell({
  dragMime,
  url,
  className,
  title,
  children,
}: {
  dragMime?: string
  url: string
  className: string
  title?: string
  children: ReactNode
}) {
  return (
    <div
      title={title}
      draggable={dragMime ? true : undefined}
      onDragStart={
        dragMime
          ? (event) => {
              event.dataTransfer.effectAllowed = 'copy'
              event.dataTransfer.setData(dragMime, url)
            }
          : undefined
      }
      className={cn(
        className,
        dragMime && 'cursor-grab active:cursor-grabbing',
      )}
    >
      {children}
    </div>
  )
}

export function ImageAttachmentPreviewStrip({
  entries,
  previewAlt,
  previewLabel,
  previewDescription,
  previewCloseLabel,
  removeLabel,
  onRemove,
  overLimitTooltip,
  unsupportedTooltip,
  variant = 'panel',
  dragMime,
  className,
}: ImageAttachmentPreviewStripProps) {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const previewTriggerRef = useRef<HTMLButtonElement | null>(null)

  if (entries.length === 0) return null

  const previewEntry =
    previewIndex === null ? null : (entries[previewIndex] ?? null)
  const isPreviewEnabled =
    previewLabel !== undefined &&
    previewDescription !== undefined &&
    previewCloseLabel !== undefined

  return (
    <>
      <div
        // 拖图进来时那颗缩略图影子飞到这一排末尾（`flyDropIntoRow`，动效样片 T）。
        data-studio-drop-row=""
        className={cn(
          'flex gap-2 overflow-x-auto overscroll-contain',
          // 输入框里的参考图（ui-spec.md §9「输入框」/ 参考图与加号）：字上面一排，
          // 48 方、圆角 8、左下角「图_N」，悬停右上角出 ×（× 探出格子，留出上右边距）。
          variant === 'composer'
            ? 'px-1 pb-0.5 pt-1.5 pr-1.5'
            : variant === 'tabs'
              ? 'shrink-0 gap-1'
              : 'rounded-xl border border-border/55 bg-background/45 p-2',
          className,
        )}
      >
        {entries.map((entry, index) => {
          const isDisabled = entry.disabledReason !== null
          const tooltip =
            entry.disabledReason === 'over_limit'
              ? overLimitTooltip
              : entry.disabledReason === 'unsupported'
                ? unsupportedTooltip
                : undefined
          const imageAlt = `${previewAlt} ${index + 1}`
          const imagePreviewLabel = previewLabel?.(index + 1)

          return (
            <StripEntryShell
              key={`${index}-${entry.url.slice(0, 32)}`}
              dragMime={dragMime}
              url={entry.url}
              title={tooltip}
              className={cn(
                'group relative flex size-16 shrink-0 rounded-xl border border-border/65 bg-muted/35 shadow-sm',
                variant !== 'composer' && 'overflow-hidden',
                variant === 'composer' &&
                  'size-12 rounded-md border-0 bg-muted shadow-none ring-1 ring-border ring-inset',
                variant === 'tabs' && 'size-7 rounded-md shadow-none',
                isDisabled && 'opacity-55',
              )}
            >
              {isPreviewEnabled && imagePreviewLabel ? (
                <button
                  type="button"
                  aria-label={imagePreviewLabel}
                  onClick={(event) => {
                    event.stopPropagation()
                    previewTriggerRef.current = event.currentTarget
                    setPreviewIndex(index)
                  }}
                  className="size-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={entry.url}
                    alt=""
                    // 图天生可拖，会抢走外壳的拖拽（拖出去的就成了裸图）。
                    draggable={dragMime ? false : undefined}
                    className={cn(
                      'size-full object-cover transition-transform duration-200 group-hover:scale-105',
                      variant === 'composer' &&
                        'rounded-md group-hover:scale-100',
                      isDisabled && 'grayscale',
                    )}
                  />
                </button>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={entry.url}
                  alt={imageAlt}
                  draggable={dragMime ? false : undefined}
                  className={cn(
                    'size-full object-cover transition-transform duration-200 group-hover:scale-105',
                    variant === 'composer' &&
                      'rounded-md group-hover:scale-100',
                    isDisabled && 'grayscale',
                  )}
                />
              )}
              {isDisabled ? (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-background/35 text-muted-foreground">
                  <ImageIcon className="size-4" />
                </span>
              ) : null}
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onRemove(index)
                }}
                aria-label={removeLabel(index + 1)}
                className={cn(
                  'absolute right-1 top-1 z-10 flex size-5 items-center justify-center rounded-full opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                  variant === 'tabs' && 'right-0 top-0 size-3.5',
                  variant === 'composer' &&
                    '-top-1.5 -right-1.5 size-4.5 bg-card text-ink-2 shadow-soft hover:text-foreground',
                  variant === 'tabs'
                    ? 'border border-black/10 bg-white/90 text-neutral-800 hover:bg-white'
                    : variant === 'panel'
                      ? 'bg-background/92 text-foreground hover:bg-background'
                      : null,
                )}
              >
                <X className="size-3" />
              </button>
            </StripEntryShell>
          )
        })}
      </div>

      {isPreviewEnabled ? (
        <Dialog
          open={previewEntry !== null}
          onOpenChange={(open) => {
            if (!open) setPreviewIndex(null)
          }}
        >
          <DialogContent
            closeLabel={previewCloseLabel}
            className="w-auto max-w-5xl gap-0 rounded-2xl border-border/60 bg-background/95 p-3 shadow-2xl backdrop-blur-md sm:max-w-5xl"
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              window.setTimeout(() => previewTriggerRef.current?.focus(), 0)
            }}
          >
            <DialogTitle className="sr-only">
              {previewIndex === null ? '' : previewLabel?.(previewIndex + 1)}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {previewDescription}
            </DialogDescription>
            {previewEntry && previewIndex !== null ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewEntry.url}
                alt={previewLabel?.(previewIndex + 1)}
                className="max-w-full rounded-xl object-contain"
                style={{ maxHeight: '80dvh' }}
              />
            ) : null}
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  )
}
