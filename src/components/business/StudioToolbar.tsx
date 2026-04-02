'use client'

import {
  Sparkles,
  ScanText,
  Settings2,
  Image as ImageIcon,
  Key,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface StudioToolbarProps {
  /** Whether prompt enhance is available / loading */
  onEnhance?: () => void
  isEnhancing?: boolean
  /** Whether reverse-engineer panel is open */
  onReverse?: () => void
  /** Advanced settings toggle */
  onAdvanced?: () => void
  advancedOpen?: boolean
  /** Reference image panel toggle */
  onReferenceImage?: () => void
  referenceImageCount?: number
  /** Civitai token toggle */
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
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        'relative h-8 gap-1.5 px-2.5 text-xs text-muted-foreground transition-colors',
        'hover:bg-muted/30 hover:text-foreground',
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
    </Button>
  )
}

/**
 * Studio V2 Layer 2 toolbar.
 * Provides quick-access buttons for enhance, reverse, advanced, reference image, and Civitai token.
 */
export function StudioToolbar({
  onEnhance,
  isEnhancing,
  onReverse,
  onAdvanced,
  advancedOpen,
  onReferenceImage,
  referenceImageCount,
  onCivitaiToken,
  hasToken,
  disabled,
}: StudioToolbarProps) {
  const t = useTranslations('StudioV2')

  return (
    <div className="flex flex-wrap items-center gap-1 border-t border-border/60 pt-2">
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
      {/* Separator between creative tools and config */}
      <div className="h-4 w-px bg-border/60 mx-1" aria-hidden="true" />
      <ToolButton
        icon={<Key className="h-3.5 w-3.5" />}
        label={t('civitaiToken')}
        onClick={onCivitaiToken}
        active={hasToken}
        disabled={disabled}
      />
    </div>
  )
}
