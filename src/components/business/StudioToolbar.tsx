'use client'

import {
  Sparkles,
  ScanText,
  Settings2,
  Image as ImageIcon,
  Key,
  Layers,
  RatioIcon,
  Cpu,
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

interface StudioToolbarProps {
  onEnhance?: () => void
  isEnhancing?: boolean
  onReverse?: () => void
  onAdvanced?: () => void
  advancedOpen?: boolean
  onReferenceImage?: () => void
  referenceImageCount?: number
  onLayerDecompose?: () => void
  onAspectRatio?: () => void
  aspectRatioOpen?: boolean
  onCivitaiToken?: () => void
  hasToken?: boolean
  disabled?: boolean
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
            'relative inline-flex h-10 sm:h-8 items-center gap-1.5 rounded-lg px-3 sm:px-2.5 text-xs text-muted-foreground transition-all duration-200',
            'hover:bg-muted/30 hover:text-foreground hover:scale-[1.03] active:scale-[0.95]',
            'focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none',
            active && 'bg-muted/30 text-primary',
          )}
        >
          {icon}
          <span className="hidden sm:inline">{label}</span>
          {badge !== undefined && badge !== 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-white">
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
  onAdvanced,
  advancedOpen,
  onReferenceImage,
  referenceImageCount,
  onLayerDecompose,
  onAspectRatio,
  aspectRatioOpen,
  onCivitaiToken,
  hasToken,
  disabled,
}: StudioToolbarProps) {
  const t = useTranslations('StudioV2')

  return (
    <TooltipProvider delayDuration={300}>
      <Toolbar.Root
        className="flex flex-wrap items-center gap-1 border-t border-border/60 pt-2"
        aria-label="Studio tools"
      >
        <ToolButton
          icon={
            <Sparkles
              className={cn('h-3.5 w-3.5', isEnhancing && 'animate-pulse')}
            />
          }
          label={t('enhance')}
          onClick={onEnhance}
          disabled={disabled || isEnhancing}
        />
        <ToolButton
          icon={<ScanText className="h-3.5 w-3.5" />}
          label={t('reverse')}
          onClick={onReverse}
          disabled={disabled}
        />
        <ToolButton
          icon={<Settings2 className="h-3.5 w-3.5" />}
          label={t('advanced')}
          onClick={onAdvanced}
          active={advancedOpen}
          disabled={disabled}
        />
        <ToolButton
          icon={<ImageIcon className="h-3.5 w-3.5" />}
          label={t('referenceImage')}
          onClick={onReferenceImage}
          badge={referenceImageCount}
          disabled={disabled}
        />
        <ToolButton
          icon={<Layers className="h-3.5 w-3.5" />}
          label={t('layerDecompose')}
          onClick={onLayerDecompose}
          disabled={disabled}
        />
        <ToolButton
          icon={<RatioIcon className="h-3.5 w-3.5" />}
          label={t('aspectRatioLabel')}
          onClick={onAspectRatio}
          active={aspectRatioOpen}
          disabled={disabled}
        />
        <Toolbar.Separator className="mx-1 h-4 w-px bg-border/60" />
        <ToolButton
          icon={<Key className="h-3.5 w-3.5" />}
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
                'relative inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-muted-foreground transition-all duration-200',
                'hover:bg-muted/30 hover:text-foreground hover:scale-[1.03] active:scale-[0.95]',
                'focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none',
              )}
            >
              <Cpu className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Train LoRA</span>
            </Toolbar.Button>
          }
        />
      </Toolbar.Root>
    </TooltipProvider>
  )
}
