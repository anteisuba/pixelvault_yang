'use client'

import { VIDEO_GENERATION } from '@/constants/config'
import { OptionGroup } from '@/components/ui/option-group'
import { cn } from '@/lib/utils'

const RESOLUTION_OPTIONS = ['480p', '720p', '1080p'] as const

interface VideoFormSettingsProps {
  cjk: boolean
  duration: number
  setDuration: (d: number) => void
  aspectRatio: string
  setAspectRatio: (ar: string) => void
  resolution: string | undefined
  setResolution: (r: string | undefined) => void
  longVideoMode: boolean
  targetDuration: number
  setTargetDuration: (d: number) => void
  labels: {
    durationLabel: string
    targetDuration: string
    aspectRatioLabel: string
    resolutionLabel: string
  }
}

export function VideoFormSettings({
  cjk,
  duration,
  setDuration,
  aspectRatio,
  setAspectRatio,
  resolution,
  setResolution,
  longVideoMode,
  targetDuration,
  setTargetDuration,
  labels,
}: VideoFormSettingsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="min-w-0 rounded-3xl border border-border/75 bg-card/82 p-5">
        <label
          className={cn(
            'mb-3 block text-xs font-semibold text-muted-foreground',
            !cjk && 'uppercase tracking-nav',
          )}
        >
          {longVideoMode ? labels.targetDuration : labels.durationLabel}
        </label>
        {longVideoMode ? (
          <OptionGroup
            options={VIDEO_GENERATION.LONG_VIDEO_DURATION_OPTIONS.map((d) => ({
              value: String(d),
              label: `${d}s`,
            }))}
            value={String(targetDuration)}
            onChange={(v) => setTargetDuration(Number(v))}
            variant="neutral"
          />
        ) : (
          <OptionGroup
            options={VIDEO_GENERATION.DURATION_OPTIONS.map((d) => ({
              value: String(d),
              label: `${d}s`,
            }))}
            value={String(duration)}
            onChange={(v) => setDuration(Number(v))}
            variant="neutral"
          />
        )}
      </div>

      <div className="min-w-0 rounded-3xl border border-border/75 bg-card/82 p-5">
        <label
          className={cn(
            'mb-3 block text-xs font-semibold text-muted-foreground',
            !cjk && 'uppercase tracking-nav',
          )}
        >
          {labels.aspectRatioLabel}
        </label>
        <OptionGroup
          options={['16:9', '9:16', '1:1']}
          value={aspectRatio}
          onChange={setAspectRatio}
          variant="neutral"
        />
      </div>

      <div className="min-w-0 rounded-3xl border border-border/75 bg-card/82 p-5">
        <label
          className={cn(
            'mb-3 block text-xs font-semibold text-muted-foreground',
            !cjk && 'uppercase tracking-nav',
          )}
        >
          {labels.resolutionLabel}
        </label>
        <OptionGroup
          options={RESOLUTION_OPTIONS.map((r) => r)}
          value={resolution ?? ''}
          onChange={(v) => setResolution(v || undefined)}
          allowDeselect
          variant="neutral"
        />
      </div>
    </div>
  )
}
