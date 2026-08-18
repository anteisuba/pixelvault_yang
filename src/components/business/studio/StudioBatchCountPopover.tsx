'use client'

import { Images } from 'lucide-react'
import { useTranslations } from 'next-intl'
import * as Toolbar from '@radix-ui/react-toolbar'

import { IMAGE_BATCH_COUNTS } from '@/constants/studio'
import { useStudioForm } from '@/contexts/studio-context'
import { cn } from '@/lib/utils'
import {
  StudioToolPopoverContent,
  StudioToolSurface,
  StudioToolSurfaceTrigger,
  studioChipActiveClass,
  studioToolTriggerClass,
} from '@/components/business/studio-shared/primitives/tool-surface'

interface StudioBatchCountPopoverProps {
  disabled?: boolean
}

/**
 * StudioBatchCountPopover — image-only chip for "一次生成几张", sitting in the
 * same toolbar row as aspect ratio and resolution because it answers the same
 * class of question (对标 LibTV：数量与比例、分辨率同级，不是特殊功能)。
 *
 * >1 routes the run through `generateVariants` (N independent seeds) and the
 * results land in the shared image wall; ×1 is the plain single-image path. The chip
 * always renders — unlike resolution, every image model can be asked twice.
 */
export function StudioBatchCountPopover({
  disabled,
}: StudioBatchCountPopoverProps) {
  const { state, dispatch } = useStudioForm()
  const t = useTranslations('StudioV2')

  const open = state.panels.batchCount

  return (
    <StudioToolSurface
      open={open}
      onOpenChange={(nextOpen) =>
        dispatch({
          type: nextOpen ? 'OPEN_PANEL' : 'CLOSE_PANEL',
          payload: 'batchCount',
        })
      }
    >
      <StudioToolSurfaceTrigger asChild>
        <Toolbar.Button
          type="button"
          disabled={disabled}
          aria-label={t('batchCountLabel')}
          className={cn(studioToolTriggerClass, open && studioChipActiveClass)}
        >
          <Images className="size-4 shrink-0" aria-hidden />
          <span>{`×${state.imageBatchCount}`}</span>
        </Toolbar.Button>
      </StudioToolSurfaceTrigger>
      <StudioToolPopoverContent
        size="small"
        className="w-auto"
        side="top"
        align="center"
        label={t('batchCountLabel')}
      >
        <div className="flex flex-col gap-1.5">
          <span className="text-2xs font-medium text-muted-foreground/70">
            {t('batchCountLabel')}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {IMAGE_BATCH_COUNTS.map((count) => (
              <button
                key={count}
                type="button"
                role="radio"
                aria-checked={state.imageBatchCount === count}
                onClick={() =>
                  dispatch({ type: 'SET_IMAGE_BATCH_COUNT', payload: count })
                }
                className={cn(
                  'inline-flex min-w-14 items-center justify-center rounded-full border border-transparent px-3 py-1.5 text-xs font-medium transition-colors duration-150',
                  state.imageBatchCount === count
                    ? studioChipActiveClass
                    : 'border border-border/60 text-muted-foreground hover:border-primary/30 hover:text-foreground',
                )}
              >
                {`×${count}`}
              </button>
            ))}
          </div>
          <p className="text-2xs text-muted-foreground">
            {t('batchCountHint')}
          </p>
        </div>
      </StudioToolPopoverContent>
    </StudioToolSurface>
  )
}
