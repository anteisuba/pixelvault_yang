'use client'

import { RatioIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import * as Toolbar from '@radix-ui/react-toolbar'

import type { AspectRatio } from '@/constants/config'
import {
  STUDIO_IMAGE_ASPECT_RATIOS,
  STUDIO_VIDEO_ASPECT_RATIOS,
} from '@/constants/studio'
import { getVideoModelCapabilities } from '@/constants/video-model-capabilities'
import { useStudioForm } from '@/contexts/studio-context'
import { useVideoModelOptions } from '@/hooks/use-video-model-options'
import { cn } from '@/lib/utils'
import {
  StudioToolPopoverContent,
  StudioToolSurface,
  StudioToolSurfaceTrigger,
  studioChipActiveClass,
  studioToolTriggerClass,
} from '@/components/business/studio-shared/primitives/tool-surface'

interface StudioAspectRatioPopoverProps {
  disabled?: boolean
}

/**
 * Visual preview rectangle for the selected aspect ratio — Krea shows the
 * picked ratio as a wireframe so the user can see at-a-glance whether the
 * canvas is portrait, square or landscape. The container is sized to a
 * fixed bounding box; the rectangle inside scales to match the ratio while
 * staying inscribed.
 */
function RatioPreview({ ratio }: { ratio: AspectRatio }) {
  const [w, h] = ratio.split(':').map(Number)
  // Inscribe the ratio in a 96×96 box so portrait/landscape both fit.
  const BOX = 96
  const scale = w >= h ? BOX / w : BOX / h
  const width = w * scale
  const height = h * scale
  return (
    <div className="flex size-24 shrink-0 items-center justify-center rounded-md border border-border/40 bg-muted/20">
      <div
        className="rounded-sm border-2 border-foreground/80"
        style={{ width: `${width}px`, height: `${height}px` }}
        aria-hidden
      />
    </div>
  )
}

/**
 * StudioAspectRatioPopover — Krea-style aspect ratio picker. Replaces the
 * inline aspect ratio panel that used to render in the dock's right 40%
 * column when `state.panels.aspectRatio` was true. Anchors a popover to
 * the toolbar AspectRatio button; content shows the ratio pills next to
 * a visual wireframe preview of the selected ratio.
 *
 * Self-contained (consumes StudioForm context directly) to mirror
 * StylePresetButton + ReferenceImageChip and keep StudioToolbar's prop
 * surface free of yet-another-handler.
 */
export function StudioAspectRatioPopover({
  disabled,
}: StudioAspectRatioPopoverProps) {
  const { state, dispatch } = useStudioForm()
  const { selectedModel: videoModel } = useVideoModelOptions(
    state.selectedOptionId ?? '',
  )
  const t = useTranslations('StudioV2')
  const open = state.panels.aspectRatio
  const ratios =
    state.outputType === 'video'
      ? (getVideoModelCapabilities(
          videoModel?.modelId ?? '',
        ).supportedAspectRatios?.filter((ratio) =>
          STUDIO_VIDEO_ASPECT_RATIOS.includes(ratio),
        ) ?? STUDIO_VIDEO_ASPECT_RATIOS)
      : STUDIO_IMAGE_ASPECT_RATIOS

  if (ratios.length < 2) {
    return null
  }

  return (
    <StudioToolSurface
      open={open}
      onOpenChange={(nextOpen) =>
        dispatch({
          type: nextOpen ? 'OPEN_PANEL' : 'CLOSE_PANEL',
          payload: 'aspectRatio',
        })
      }
    >
      <StudioToolSurfaceTrigger asChild>
        <Toolbar.Button
          type="button"
          disabled={disabled}
          aria-label={t('aspectRatioLabel')}
          className={cn(studioToolTriggerClass, open && studioChipActiveClass)}
        >
          <RatioIcon className="size-4 shrink-0" />
          <span className="hidden sm:inline">{state.aspectRatio}</span>
        </Toolbar.Button>
      </StudioToolSurfaceTrigger>
      <StudioToolPopoverContent
        size="small"
        className="w-auto"
        side="top"
        align="center"
        label={t('aspectRatioLabel')}
      >
        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-1.5">
            {ratios.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={state.aspectRatio === r}
                onClick={() => {
                  dispatch({ type: 'SET_ASPECT_RATIO', payload: r })
                }}
                className={cn(
                  'inline-flex min-w-14 items-center justify-center rounded-full border border-transparent px-3 py-1.5 text-xs font-medium transition-colors duration-150',
                  state.aspectRatio === r
                    ? studioChipActiveClass
                    : 'border border-border/60 text-muted-foreground hover:border-primary/30 hover:text-foreground',
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <RatioPreview ratio={state.aspectRatio} />
        </div>
      </StudioToolPopoverContent>
    </StudioToolSurface>
  )
}
