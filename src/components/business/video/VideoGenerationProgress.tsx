'use client'

import { Film, Loader2 } from 'lucide-react'
import { PipelineProgress } from '@/components/business/PipelineProgress'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatDuration } from '@/lib/video-utils'
import type { PipelineStatusRecord } from '@/types'

interface VideoGenerationProgressProps {
  /** Normal video generation */
  isGenerating: boolean
  stage: string
  elapsedSeconds: number
  stageLabels: Record<string, string>
  /** Long video generation */
  longVideoMode: boolean
  longVideo?: {
    isGenerating: boolean
    pipelineStatus: PipelineStatusRecord | null
    currentClipIndex: number
    elapsedSeconds: number
    retryClip: (clipIndex: number) => void
    cancel: () => void
  }
  /** Submit button */
  isAnyGenerating: boolean
  canSubmit: boolean
  submitLabel: string
  generatingLabel: string
  submitHint: string
}

export function VideoGenerationProgress({
  isGenerating,
  stage,
  elapsedSeconds,
  stageLabels,
  longVideoMode,
  longVideo,
  isAnyGenerating,
  canSubmit,
  submitLabel,
  generatingLabel,
  submitHint,
}: VideoGenerationProgressProps) {
  return (
    <>
      {/* Submit */}
      <div className="rounded-3xl border border-border/75 bg-primary/6 p-5 sm:p-6">
        <div className="flex flex-col items-center gap-4 lg:flex-row lg:justify-between">
          <p className="font-serif text-sm text-muted-foreground">
            {submitHint}
          </p>
          <Button
            type="submit"
            disabled={isAnyGenerating || !canSubmit}
            className="w-full rounded-full lg:w-auto"
          >
            {isAnyGenerating ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                {generatingLabel}
              </>
            ) : (
              <>
                <Film className="mr-2 size-4" />
                {submitLabel}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Long Video Pipeline Progress */}
      {longVideoMode && longVideo?.isGenerating && longVideo.pipelineStatus && (
        <div className="rounded-3xl border border-border/75 bg-card/82 p-6">
          <PipelineProgress
            status={longVideo.pipelineStatus}
            onRetryClip={longVideo.retryClip}
            onCancel={longVideo.cancel}
          />
          <p className="mt-3 text-center font-serif text-sm text-muted-foreground">
            {formatDuration(longVideo.elapsedSeconds)}
          </p>
        </div>
      )}

      {/* Normal video generation progress */}
      {!longVideoMode && isGenerating && stage !== 'idle' && (
        <div className="rounded-3xl border border-border/75 bg-card/82 p-6">
          <div className="mb-3 flex items-center justify-center gap-3 text-sm">
            {(['queued', 'generating', 'uploading'] as const).map((s, i) => (
              <span key={s} className="flex items-center gap-1.5">
                {i > 0 && <span className="mx-1 h-px w-4 bg-border" />}
                <span
                  className={cn(
                    'size-2 rounded-full',
                    stage === s
                      ? 'bg-primary'
                      : s < stage
                        ? 'bg-foreground'
                        : 'bg-border',
                  )}
                />
                <span
                  className={cn(
                    stage === s
                      ? 'font-medium text-primary'
                      : 'text-muted-foreground',
                  )}
                >
                  {stageLabels[s]}
                </span>
              </span>
            ))}
          </div>
          <p className="text-center font-serif text-sm text-muted-foreground">
            {formatDuration(elapsedSeconds)}
          </p>
        </div>
      )}
    </>
  )
}
