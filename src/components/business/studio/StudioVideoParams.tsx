'use client'

import { memo } from 'react'
import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useStudioForm } from '@/contexts/studio-context'
import { VIDEO_GENERATION } from '@/constants/config'
import { OptionGroup } from '@/components/ui/option-group'

const RESOLUTION_OPTIONS = ['480p', '720p', '1080p'] as const

/**
 * StudioVideoParams — video-mode dock panel.
 * Hosts duration / resolution / negative prompt / long-video toggle.
 * Aspect ratio lives in StudioGenerateBar (shared cross-mode).
 */
export const StudioVideoParams = memo(function StudioVideoParams() {
  const { state, dispatch } = useStudioForm()
  const tPanels = useTranslations('StudioPanels')
  const tVideo = useTranslations('VideoGenerate')

  const close = () => dispatch({ type: 'CLOSE_PANEL', payload: 'videoParams' })

  const negativePrompt = state.advancedParams.negativePrompt ?? ''

  const setNegative = (value: string) =>
    dispatch({
      type: 'SET_ADVANCED_PARAMS',
      payload: { ...state.advancedParams, negativePrompt: value || undefined },
    })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-2xs font-medium text-muted-foreground/70">
          {tPanels('videoSettings')}
        </span>
        <button
          type="button"
          onClick={close}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Duration */}
      <div>
        <label className="mb-2 block text-2xs font-medium text-muted-foreground/70">
          {tVideo('durationLabel')}
        </label>
        <OptionGroup
          options={VIDEO_GENERATION.DURATION_OPTIONS.map((d) => ({
            value: String(d),
            label: `${d}s`,
          }))}
          value={String(state.videoDuration)}
          onChange={(v) =>
            dispatch({ type: 'SET_VIDEO_DURATION', payload: Number(v) })
          }
          variant="neutral"
        />
      </div>

      {/* Resolution */}
      <div>
        <label className="mb-2 block text-2xs font-medium text-muted-foreground/70">
          {tVideo('resolutionLabel')}
        </label>
        <OptionGroup
          options={RESOLUTION_OPTIONS.map((r) => r)}
          value={state.videoResolution ?? ''}
          onChange={(v) =>
            dispatch({
              type: 'SET_VIDEO_RESOLUTION',
              payload: v || null,
            })
          }
          allowDeselect
          variant="neutral"
        />
      </div>

      {/* Long Video pipeline — UI re-entry deferred to a follow-up WP
          (canvas-level pipeline progress needs wiring before re-exposing here). */}

      {/* Negative Prompt */}
      <div>
        <label className="mb-2 block text-2xs font-medium text-muted-foreground/70">
          {tVideo('negativePromptLabel')}
        </label>
        <textarea
          value={negativePrompt}
          onChange={(e) => setNegative(e.target.value)}
          placeholder={tVideo('negativePromptPlaceholder')}
          rows={2}
          className="w-full min-h-16 rounded-lg border border-border/60 bg-background/60 p-2 text-sm focus:border-primary/40 focus:outline-none"
        />
      </div>
    </div>
  )
})
