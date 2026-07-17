'use client'

import { ChevronLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'

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
  onClose: () => void
}

export function LoraCoverPreviewDialog({
  preview,
  onClose,
}: LoraCoverPreviewDialogProps) {
  const t = useTranslations('LoraWorkbench')

  return (
    <Dialog
      open={preview !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        className="left-0 top-0 h-svh max-h-svh w-dvw max-w-none translate-x-0 translate-y-0 place-items-center rounded-none border-none bg-transparent p-3 shadow-none sm:left-1/2 sm:top-1/2 sm:h-auto sm:w-auto sm:max-w-[min(90vw,72rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:p-0"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">{preview?.name ?? ''}</DialogTitle>
        <DialogClose asChild>
          <button
            type="button"
            className="absolute right-3 top-3 z-10 inline-flex h-10 items-center gap-1.5 rounded-full border border-white/15 bg-black/70 px-3 text-sm font-medium text-white shadow-lg backdrop-blur-md transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black sm:hidden"
            aria-label={t('coverPreviewBack')}
          >
            <ChevronLeft className="size-4" aria-hidden />
            <span>{t('coverPreviewBack')}</span>
          </button>
        </DialogClose>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview.url}
            alt={preview.name}
            className="block max-h-full max-w-full rounded-xl object-contain sm:max-h-[90svh] sm:max-w-[90vw]"
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
