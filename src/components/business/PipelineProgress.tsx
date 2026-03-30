'use client'

import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import type { PipelineClipRecord, PipelineStatusRecord } from '@/types'

interface PipelineProgressProps {
  status: PipelineStatusRecord
  onRetryClip?: (clipIndex: number) => void
  onCancel?: () => void
}

export function PipelineProgress({
  status,
  onRetryClip,
  onCancel,
}: PipelineProgressProps) {
  const t = useTranslations('LongVideo')

  const progressPercent =
    status.totalClips > 0
      ? Math.round((status.completedClips / status.totalClips) * 100)
      : 0

  return (
    <div className="space-y-3">
      {/* Overall progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {t('clipProgress', {
              current: status.completedClips,
              total: status.totalClips,
            })}
          </span>
          <span>
            {Math.round(status.currentDurationSec)}s /{' '}
            {status.targetDurationSec}s
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Clip stepper */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {status.clips.map((clip) => (
          <ClipStep
            key={clip.clipIndex}
            clip={clip}
            onRetry={
              clip.status === 'FAILED' && onRetryClip
                ? () => onRetryClip(clip.clipIndex)
                : undefined
            }
          />
        ))}
      </div>

      {/* Cancel button */}
      {status.status === 'RUNNING' && onCancel && (
        <button
          onClick={onCancel}
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
        >
          {t('cancel')}
        </button>
      )}
    </div>
  )
}

function ClipStep({
  clip,
  onRetry,
}: {
  clip: PipelineClipRecord
  onRetry?: () => void
}) {
  const t = useTranslations('LongVideo')

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-md text-xs font-medium transition-colors',
          clip.status === 'COMPLETED' && 'bg-emerald-100 text-emerald-700',
          clip.status === 'RUNNING' &&
            'bg-amber-100 text-amber-700 animate-pulse',
          clip.status === 'QUEUED' && 'bg-blue-100 text-blue-700 animate-pulse',
          clip.status === 'PENDING' && 'bg-muted/50 text-muted-foreground',
          clip.status === 'FAILED' && 'bg-red-100 text-red-700',
        )}
        title={
          clip.status === 'COMPLETED'
            ? `${clip.durationSec?.toFixed(1)}s`
            : (clip.errorMessage ?? clip.status)
        }
      >
        {clip.status === 'COMPLETED' && (
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        )}
        {(clip.status === 'RUNNING' || clip.status === 'QUEUED') && (
          <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth={4}
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        )}
        {clip.status === 'PENDING' && <span>{clip.clipIndex + 1}</span>}
        {clip.status === 'FAILED' && (
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        )}
      </div>

      {clip.status === 'FAILED' && onRetry && (
        <button
          onClick={onRetry}
          className="text-[10px] text-red-600 underline underline-offset-2 hover:text-red-800 transition-colors"
        >
          {t('retryClip', { index: clip.clipIndex + 1 })}
        </button>
      )}
    </div>
  )
}
