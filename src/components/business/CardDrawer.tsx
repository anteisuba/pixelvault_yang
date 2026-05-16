'use client'

import { memo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { Layers } from 'lucide-react'

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'

// Heavy content (3 card managers + their hooks) is split into its own chunk
// and only fetched when the drawer opens — keeps the always-mounted sidebar
// trigger free of card-management code.
const CardDrawerContent = dynamic(
  () =>
    import('@/components/business/CardDrawerContent').then(
      (m) => m.CardDrawerContent,
    ),
  { ssr: false },
)

interface CardDrawerProps {
  children?: React.ReactNode
}

export const CardDrawer = memo(function CardDrawer({
  children,
}: CardDrawerProps) {
  const t = useTranslations('StudioV2')
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {children ?? (
          <Button
            variant="ghost"
            size="sm"
            className="hidden sm:inline-flex gap-1.5 text-xs"
          >
            <Layers className="size-3.5" />
            {t('cardManagement')}
          </Button>
        )}
      </SheetTrigger>
      <SheetContent
        side="right"
        className="dark w-full sm:w-[420px] sm:max-w-[480px] flex flex-col p-0 border-l border-white/10 bg-sidebar text-sidebar-foreground"
      >
        <SheetHeader className="px-6 pt-6 pb-2">
          <SheetTitle className="font-display">
            {t('cardManagement')}
          </SheetTitle>
        </SheetHeader>
        {open && <CardDrawerContent />}
      </SheetContent>
    </Sheet>
  )
})
