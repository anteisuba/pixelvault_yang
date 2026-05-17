'use client'

import {
  Box,
  Sparkles,
  ScanText,
  Key,
  Layers,
  Wand2,
  Cpu,
  Compass,
  PanelsTopLeft,
} from 'lucide-react'
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
import { StylePresetButton } from '@/components/business/studio/StylePresetButton'

interface StudioToolbarProps {
  onEnhance?: () => void
  isEnhancing?: boolean
  onReverse?: () => void
  onLayerDecompose?: () => void
  onTransform?: () => void
  transformOpen?: boolean
  onPlan?: () => void
  planLoading?: boolean
  planActive?: boolean
  onCards?: () => void
  cardsOpen?: boolean
  selectedCardCount?: number
  onCivitaiToken?: () => void
  hasToken?: boolean
  /**
   * Wrap the user's prompt with a 3D-friendly template
   * (white background, 3/4 view, A-pose, etc.) so the next
   * generation produces a Hunyuan3D / TripoSR-ready source image.
   */
  onMake3DReady?: () => void
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
  onEnhance,
  isEnhancing,
  onReverse,
  onLayerDecompose,
  onTransform,
  transformOpen,
  onPlan,
  planLoading,
  planActive,
  onCards,
  cardsOpen,
  selectedCardCount,
  onCivitaiToken,
  hasToken,
  onMake3DReady,
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
        <ToolButton
          icon={
            <Sparkles
              className={cn('size-4', isEnhancing && 'animate-pulse')}
            />
          }
          label={t('enhance')}
          onClick={onEnhance}
          disabled={disabled || isEnhancing}
        />
        <ToolButton
          icon={<ScanText className="size-4" />}
          label={t('reverse')}
          onClick={onReverse}
          disabled={disabled}
        />
        <StylePresetButton disabled={disabled} />
        {/*
         * Reference image entry is the Krea-style chip (Phase 5.5b) — it
         * owns its own popover (Upload + Select asset), so the toolbar
         * doesn't need to drive a parent-controlled panel for it.
         */}
        <ReferenceImageChip disabled={disabled} />
        <ToolButton
          icon={<Wand2 className="size-4" />}
          label={t('transform')}
          onClick={onTransform}
          active={transformOpen}
          disabled={disabled}
        />
        {onMake3DReady && (
          <ToolButton
            icon={<Box className="size-4" />}
            label={t('make3DReady')}
            onClick={onMake3DReady}
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
        {onCards && (
          <ToolButton
            icon={<PanelsTopLeft className="size-4" />}
            label={t('cards')}
            onClick={onCards}
            active={cardsOpen}
            badge={selectedCardCount}
            disabled={disabled}
          />
        )}
        {!quickMode && (
          <ToolButton
            icon={<Layers className="size-4" />}
            label={t('layerDecompose')}
            onClick={onLayerDecompose}
            disabled={disabled}
          />
        )}
        {/*
         * AspectRatio entry is the Krea-style popover (Phase 5.5c) — it
         * owns its own popover anchored to this button and renders pills
         * + visual ratio preview, so the toolbar doesn't drive a parent
         * panel for it any more.
         */}
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
