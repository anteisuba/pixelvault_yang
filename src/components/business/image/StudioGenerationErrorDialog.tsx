'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Shuffle,
} from 'lucide-react'

import { parseGenerationErrorCode } from '@/constants/generation-errors'
import type { GenerationErrorCode } from '@/constants/generation-errors'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export interface GenerationErrorInfo {
  message: string
  code?: GenerationErrorCode
}

interface StudioGenerationErrorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  error: GenerationErrorInfo
  onRetry: () => void
  onSwitchModel: () => void
}

export function StudioGenerationErrorDialog({
  open,
  onOpenChange,
  error,
  onRetry,
  onSwitchModel,
}: StudioGenerationErrorDialogProps) {
  const t = useTranslations('StudioV2')
  const [detailsExpanded, setDetailsExpanded] = useState(false)

  const errorCode = error.code ?? parseGenerationErrorCode(error.message)
  const reasonKey = `generationError.reasons.${errorCode}` as const

  const handleRetry = () => {
    onOpenChange(false)
    onRetry()
  }

  const handleSwitchModel = () => {
    onOpenChange(false)
    onSwitchModel()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="size-5 text-destructive" />
            </div>
            <div>
              <DialogTitle className="font-sans">
                {t('generationError.title')}
              </DialogTitle>
              <DialogDescription className="mt-1 font-serif">
                {t(reasonKey)}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-2">
          <button
            type="button"
            onClick={() => setDetailsExpanded((prev) => !prev)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            aria-expanded={detailsExpanded}
          >
            {detailsExpanded ? (
              <ChevronUp className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
            {t('generationError.viewDetails')}
          </button>
          {detailsExpanded && (
            <pre className="mt-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all font-mono">
              {error.message}
            </pre>
          )}
        </div>

        <DialogFooter className="mt-4 flex-col gap-2 sm:flex-row">
          <Button variant="default" onClick={handleRetry} className="gap-2">
            <RefreshCw className="size-4" />
            {t('generationError.retry')}
          </Button>
          <Button
            variant="outline"
            onClick={handleSwitchModel}
            className="gap-2"
          >
            <Shuffle className="size-4" />
            {t('generationError.switchModel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
