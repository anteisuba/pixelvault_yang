'use client'

import { Key, Layers, Cpu, SlidersHorizontal } from 'lucide-react'
import { useTranslations } from 'next-intl'
import * as Toolbar from '@radix-ui/react-toolbar'

import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { LoraTrainingDialog } from '@/components/business/LoraTrainingDialog'
import { ReferenceImageChip } from '@/components/business/studio/ReferenceImageChip'
import { StudioAspectRatioPopover } from '@/components/business/studio/StudioAspectRatioPopover'
import { StudioCardsButton } from '@/components/business/studio/StudioCardsButton'
import { StudioEnhanceButton } from '@/components/business/studio/StudioEnhanceButton'
import { StudioLoraChip } from '@/components/business/studio/StudioLoraChip'
import { StudioTransformButton } from '@/components/business/studio/StudioTransformButton'
import { StylePresetButton } from '@/components/business/studio/StylePresetButton'
import { studioToolTriggerClass } from '@/components/business/studio/tool-surface'

interface StudioToolbarProps {
  onLayerDecompose?: () => void
  onCivitaiToken?: () => void
  /**
   * Toggle the «Advanced» panel (seed lock + negative prompt). Image
   * mode only — video/audio modes have their own params panels.
   */
  onAdvanced?: () => void
  /**
   * Indicates the user has dialled a non-random seed and/or a negative
   * prompt — drives the active styling on the Advanced pill so users
   * can spot from the toolbar that they're not on default settings.
   */
  advancedActive?: boolean
  hasToken?: boolean
  disabled?: boolean
  /** Quick mode hides advanced tools */
  quickMode?: boolean
  compact?: boolean
}

interface ToolButtonProps {
  icon: React.ReactNode
  label: string
  onClick?: () => void
  active?: boolean
  badge?: number | string
  disabled?: boolean
}

function ToolButton({
  icon,
  label,
  onClick,
  active,
  badge,
  disabled,
}: ToolButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Toolbar.Button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className={cn(
            studioToolTriggerClass,
            active && 'bg-muted/30 text-primary',
          )}
        >
          {icon}
          <span className="hidden sm:inline">{label}</span>
          {badge !== undefined && badge !== 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-white">
              {badge}
            </span>
          )}
        </Toolbar.Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="sm:hidden">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * Studio toolbar — uses Radix Toolbar for roving tabindex keyboard navigation.
 */
export function StudioToolbar({
  onLayerDecompose,
  onCivitaiToken,
  onAdvanced,
  advancedActive,
  hasToken,
  disabled,
  quickMode,
  compact,
}: StudioToolbarProps) {
  const t = useTranslations('StudioV2')

  return (
    <TooltipProvider delayDuration={300}>
      <Toolbar.Root
        className={cn(
          'flex items-center gap-1.5',
          compact
            ? 'flex-nowrap border-t-0 pt-0'
            : 'flex-wrap border-t border-border/60 pt-2.5',
        )}
        aria-label={t('toolbarLabel')}
      >
        {/* Group 1 — Prompt modifiers: enhance / style */}
        <StudioEnhanceButton disabled={disabled} />
        <StylePresetButton disabled={disabled} />

        <Toolbar.Separator className="mx-1 h-4 w-px bg-border/60" />

        {/* Group 2 — Inputs & type switches: reference image / transform / cards */}
        <ReferenceImageChip disabled={disabled} />
        <StudioTransformButton disabled={disabled} />
        <StudioCardsButton disabled={disabled} />
        <StudioLoraChip disabled={disabled} />
        {!quickMode && (
          <ToolButton
            icon={<Layers className="size-4" />}
            label={t('layerDecompose')}
            onClick={onLayerDecompose}
            disabled={disabled}
          />
        )}

        <Toolbar.Separator className="mx-1 h-4 w-px bg-border/60" />

        {/* Group 3 — Size + advanced params */}
        <StudioAspectRatioPopover disabled={disabled} />
        {onAdvanced ? (
          <ToolButton
            icon={<SlidersHorizontal className="size-4" />}
            label={t('advanced')}
            onClick={onAdvanced}
            active={advancedActive}
            disabled={disabled}
          />
        ) : null}
        {!quickMode && (
          <>
            <Toolbar.Separator className="mx-1 h-4 w-px bg-border/60" />
            <ToolButton
              icon={<Key className="size-4" />}
              label={t('civitaiToken')}
              onClick={onCivitaiToken}
              active={hasToken}
              disabled={disabled}
            />
            <Toolbar.Separator className="mx-1 h-4 w-px bg-border/60" />
            <LoraTrainingDialog
              trigger={
                <Toolbar.Button
                  type="button"
                  disabled={disabled}
                  className={cn(studioToolTriggerClass)}
                >
                  <Cpu className="size-4" />
                  <span className="hidden sm:inline">{t('trainLora')}</span>
                </Toolbar.Button>
              }
            />
          </>
        )}
      </Toolbar.Root>
    </TooltipProvider>
  )
}
