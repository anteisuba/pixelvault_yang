'use client'

import { memo } from 'react'

import { ApiKeyDrawerTrigger } from '@/components/business/ApiKeyDrawerTrigger'
import { ApiKeyManager } from '@/components/business/ApiKeyManager'
import { cn } from '@/lib/utils'

interface StudioApiRoutesSectionProps {
  compact?: boolean
  className?: string
}

export const StudioApiRoutesSection = memo(function StudioApiRoutesSection({
  compact = false,
  className,
}: StudioApiRoutesSectionProps) {
  return (
    <ApiKeyDrawerTrigger
      className={cn(
        compact
          ? 'h-8 gap-1.5 rounded-xl border-border/60 bg-background/50 px-2.5 text-xs text-muted-foreground hover:bg-muted/30 hover:text-foreground'
          : 'h-12 w-full justify-between rounded-2xl border-border/60 bg-background/60 px-4 text-sm font-medium shadow-none',
        className,
      )}
    >
      <ApiKeyManager />
    </ApiKeyDrawerTrigger>
  )
})
