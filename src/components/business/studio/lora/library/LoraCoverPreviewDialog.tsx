'use client'

import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { LORA_PREVIEW_SWIPE_MIN_PX } from '@/constants/lora'

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'

// S3（docs/references/pages/lora-workbench.md §2.4）：抽屉「查看封面大图」
// 的全屏预览对话框——civitai/HF 两源共用同一套 UI（之前只有 civitai pane
// 有这段 JSX，HF 抽屉新增同样的放大查看能力，抽成共享件避免重复）。

export interface LoraCoverPreviewState {
  url: string
  name: string
}

interface LoraCoverPreviewDialogProps {
  preview: LoraCoverPreviewState | null
  images?: readonly string[]
  onClose: () => void
}

export function LoraCoverPreviewDialog({
  preview,
  images = [],
  onClose,
}: LoraCoverPreviewDialogProps) {
  const t = useTranslations('LoraWorkbench')
  const [index, setIndex] = useState(0)
  const start = useRef<{ x: number; y: number } | null>(null)
  const urls = [
    ...new Set(
      [preview?.url, ...images].filter((url): url is string => Boolean(url)),
    ),
  ]
  const move = (delta: number) =>
    setIndex((current) =>
      Math.max(0, Math.min(urls.length - 1, current + delta)),
    )

  return (
    <Dialog
      open={preview !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        className="left-0 top-0 flex h-svh max-h-svh w-dvw max-w-none translate-x-0 translate-y-0 items-center justify-center rounded-none border-none bg-transparent p-10 shadow-none sm:max-w-none sm:p-16"
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault()
            move(event.key === 'ArrowLeft' ? -1 : 1)
          }
        }}
        showCloseButton={false}
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose()
        }}
      >
        <DialogTitle className="sr-only">{preview?.name ?? ''}</DialogTitle>
        <DialogClose asChild>
          <button
            type="button"
            className="absolute right-3 top-3 z-10 inline-flex h-10 items-center gap-1.5 rounded-full border border-white/15 bg-black/70 px-3 text-sm font-medium text-white shadow-lg backdrop-blur-md transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            aria-label={t('coverPreviewBack')}
          >
            <ChevronLeft className="size-4" aria-hidden />
            <span>{t('coverPreviewBack')}</span>
          </button>
        </DialogClose>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={urls[index] ?? preview.url}
            alt={preview.name}
            draggable={false}
            onTouchStart={(event) => {
              const touch = event.touches[0]
              start.current =
                event.touches.length === 1 && touch
                  ? { x: touch.clientX, y: touch.clientY }
                  : null
            }}
            onTouchCancel={() => {
              start.current = null
            }}
            onTouchEnd={(event) => {
              const touch = event.changedTouches[0]
              const origin = start.current
              start.current = null
              if (!touch || !origin) return
              const dx = touch.clientX - origin.x
              const dy = touch.clientY - origin.y
              if (
                Math.abs(dx) >= LORA_PREVIEW_SWIPE_MIN_PX &&
                Math.abs(dx) > Math.abs(dy)
              )
                move(dx < 0 ? 1 : -1)
            }}
            className="block max-h-full max-w-full touch-pan-y rounded-xl object-contain"
          />
        ) : null}
        {urls.length > 1 && (
          <>
            <button
              type="button"
              aria-label={t('coverPreviewPrevious')}
              disabled={index === 0}
              onClick={() => move(-1)}
              className="absolute left-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white disabled:opacity-30 sm:left-4"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              aria-label={t('coverPreviewNext')}
              disabled={index >= urls.length - 1}
              onClick={() => move(1)}
              className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white disabled:opacity-30 sm:right-4"
            >
              <ChevronRight className="size-5" />
            </button>
            <span
              className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-sm text-white"
              aria-live="polite"
            >
              {index + 1} / {urls.length}
            </span>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
