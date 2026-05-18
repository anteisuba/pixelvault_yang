'use client'

import { Box, Key, Layers, Cpu, Compass } from 'lucide-react'
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
import { StudioReverseButton } from '@/components/business/studio/StudioReverseButton'
import { StudioTransformButton } from '@/components/business/studio/StudioTransformButton'
import { StylePresetButton } from '@/components/business/studio/StylePresetButton'

interface StudioToolbarProps {
  onLayerDecompose?: () => void
  onPlan?: () => void
  planLoading?: boolean
  planActive?: boolean
  onCivitaiToken?: () => void
  hasToken?: boolean
  /**
   * Wrap the user's prompt with a 3D-friendly template
   * (white background, 3/4 view, A-pose, etc.) so the next
   * generation produces a Hunyuan3D / TripoSR-ready source image.
   */
  onMake3DReady?: () => void
  /** Visual active state: true while prompt currently carries the [3D-READY] marker. */
  make3DReadyActive?: boolean
  disabled?: boolean
  /** Quick mode hides advanced tools */
  quickMode?: boolean
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
            'relative inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground transition-all duration-200',
            'hover:bg-muted/30 hover:text-foreground hover:scale-[1.03] active:scale-[0.95]',
            'focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none',
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
  onPlan,
  planLoading,
  planActive,
  onCivitaiToken,
  hasToken,
  onMake3DReady,
  make3DReadyActive,
  disabled,
  quickMode,
}: StudioToolbarProps) {
  const t = useTranslations('StudioV2')

  return (
    <TooltipProvider delayDuration={300}>
      <Toolbar.Root
        className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2.5"
        aria-label={t('toolbarLabel')}
      >
        {/* Group 1 — Prompt modifiers: enhance / reverse-engineer / style */}
        <StudioEnhanceButton disabled={disabled} />
        <StudioReverseButton disabled={disabled} />
        <StylePresetButton disabled={disabled} />

        <Toolbar.Separator className="mx-1 h-4 w-px bg-border/60" />

        {/* Group 2 — Inputs & type switches: reference image / transform / 3D / plan / cards */}
        <ReferenceImageChip disabled={disabled} />
        <StudioTransformButton disabled={disabled} />
        {onMake3DReady && (
          <ToolButton
            icon={<Box className="size-4" />}
            label={t('make3DReady')}
            onClick={onMake3DReady}
            active={make3DReadyActive}
            disabled={disabled}
          />
        )}
        {onPlan && (
          <ToolButton
            icon={
              <Compass
                className={cn('size-4', planLoading && 'animate-spin')}
              />
            }
            label={planLoading ? t('planLoading') : t('plan')}
            onClick={onPlan}
            active={planActive}
            disabled={disabled || planLoading}
          />
        )}
        <StudioCardsButton disabled={disabled} />
        {!quickMode && (
          <ToolButton
            icon={<Layers className="size-4" />}
            label={t('layerDecompose')}
            onClick={onLayerDecompose}
            disabled={disabled}
          />
        )}

        <Toolbar.Separator className="mx-1 h-4 w-px bg-border/60" />

        {/* Group 3 — Size */}
        <StudioAspectRatioPopover disabled={disabled} />
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
                  className={cn(
                    'relative inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground transition-all duration-200',
                    'hover:bg-muted/30 hover:text-foreground hover:scale-[1.03] active:scale-[0.95]',
                    'focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none',
                  )}
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
