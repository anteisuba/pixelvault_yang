'use client'

import { useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { ApiKeyManager } from '@/components/business/ApiKeyManager'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

interface StudioAdvancedDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function StudioAdvancedDrawer({
  open,
  onOpenChange,
}: StudioAdvancedDrawerProps) {
  const tApiKeys = useTranslations('StudioApiKeys')
  const [side, setSide] = useState<'right' | 'bottom'>('right')

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return
    }

    const query = window.matchMedia('(max-width: 767px)')
    const syncSide = () => setSide(query.matches ? 'bottom' : 'right')

    syncSide()
    query.addEventListener('change', syncSide)
    return () => query.removeEventListener('change', syncSide)
  }, [])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        className={cn(
          'flex w-full flex-col overflow-hidden bg-background font-display sm:max-w-none md:w-1/2',
          side === 'bottom' && 'max-h-screen rounded-t-2xl',
        )}
      >
        <SheetHeader className="gap-3 border-b border-border/60 px-5 py-5">
          <SheetTitle className="flex items-center gap-2 font-display text-xl">
            <KeyRound className="size-5" />
            {tApiKeys('sheetTitle')}
          </SheetTitle>
          <SheetDescription className="max-w-2xl font-serif leading-6">
            {tApiKeys('sheetDescription')}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-6">
          <ApiKeyManager />
        </div>
      </SheetContent>
    </Sheet>
  )
}
