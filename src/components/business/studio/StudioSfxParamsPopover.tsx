'use client'

import { SlidersHorizontal } from 'lucide-react'
import { useTranslations } from 'next-intl'
import * as Toolbar from '@radix-ui/react-toolbar'

import { useStudioForm } from '@/contexts/studio-context'
import { cn } from '@/lib/utils'
import {
  StudioToolPopoverContent,
  StudioToolSurface,
  StudioToolSurfaceTrigger,
  studioChipActiveClass,
  studioToolTriggerClass,
} from '@/components/business/studio-shared/primitives/tool-surface'

import { StudioSfxParams } from './StudioSfxParams'

interface StudioSfxParamsPopoverProps {
  disabled?: boolean
}

/**
 * StudioSfxParamsPopover — sound-effect params (duration / prompt influence /
 * loop) as a chip-anchored popover, mirroring StudioAspectRatioPopover. Per the
 * studio tool-panel contract a small param set is a popover, not a full-screen
 * dialog. Open state rides on `panels.sfxParams` (same as aspect ratio).
 */
export function StudioSfxParamsPopover({
  disabled,
}: StudioSfxParamsPopoverProps) {
  const { state, dispatch } = useStudioForm()
  const tBar = useTranslations('StudioToolbar')
  const tPanels = useTranslations('StudioPanels')
  const open = state.panels.sfxParams

  return (
    <StudioToolSurface
      open={open}
      onOpenChange={(nextOpen) =>
        dispatch({
          type: nextOpen ? 'OPEN_PANEL' : 'CLOSE_PANEL',
          payload: 'sfxParams',
        })
      }
    >
      <StudioToolSurfaceTrigger asChild>
        <Toolbar.Button
          type="button"
          disabled={disabled}
          aria-label={tPanels('sfxSettings')}
          className={cn(studioToolTriggerClass, open && studioChipActiveClass)}
        >
          <SlidersHorizontal className="size-4 shrink-0" />
          <span className="hidden sm:inline">{tBar('sfxParams')}</span>
        </Toolbar.Button>
      </StudioToolSurfaceTrigger>
      <StudioToolPopoverContent
        size="small"
        side="top"
        align="center"
        label={tPanels('sfxSettings')}
      >
        <StudioSfxParams />
      </StudioToolPopoverContent>
    </StudioToolSurface>
  )
}
