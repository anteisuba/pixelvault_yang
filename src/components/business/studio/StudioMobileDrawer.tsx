'use client'

import { memo } from 'react'
import { Settings2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { StudioToolbarPanels } from './StudioToolbarPanels'
import { StudioGenerateBar } from './StudioGenerateBar'

/**
 * StudioMobileDrawer — Full settings drawer for mobile devices.
 * Triggered by a settings gear icon, opens as a bottom sheet with snap points.
 */
export const StudioMobileDrawer = memo(function StudioMobileDrawer() {
  const t = useTranslations('StudioV3')

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <button
          type="button"
          className="flex size-9 items-center justify-center rounded-lg border border-border/60 text-muted-foreground transition-colors hover:bg-muted lg:hidden"
          aria-label={t('settings')}
        >
          <Settings2 className="size-4" />
        </button>
      </DrawerTrigger>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader>
          <DrawerTitle className="font-display text-sm">
            {t('studioSettings')}
          </DrawerTitle>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-6 space-y-4">
          <StudioToolbarPanels />
          <StudioGenerateBar />
        </div>
      </DrawerContent>
    </Drawer>
  )
})
