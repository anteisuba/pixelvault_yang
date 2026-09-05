'use client'

import { useEffect, useState } from 'react'
import { KeyRound, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useApiKeysContext } from '@/contexts/api-keys-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

interface ApiKeyDrawerTriggerProps {
  children: React.ReactNode
  className?: string
}

export function ApiKeyDrawerTrigger({
  children,
  className,
}: ApiKeyDrawerTriggerProps) {
  const [open, setOpen] = useState(false)
  const { keys, isLoading } = useApiKeysContext()
  const t = useTranslations('StudioApiKeys')
  const activeRouteCount = keys.filter((key) => key.isActive).length

  // Route browser Back to close the drawer instead of leaving Studio.
  // On open, push a sentinel history entry; popstate closes the sheet.
  // When the user closes via UI, consume that entry so the next Back goes
  // to the real previous page.
  useEffect(() => {
    if (!open) return
    window.history.pushState({ apiKeyDrawer: true }, '')
    const handler = () => setOpen(false)
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [open])

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (
      !next &&
      typeof window !== 'undefined' &&
      window.history.state?.apiKeyDrawer === true
    ) {
      window.history.back()
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-10 shrink-0 rounded-full border-border/70 bg-background/78 px-3 text-foreground shadow-none',
            className,
          )}
          data-onboarding="apiKey"
        >
          <KeyRound className="size-4" />
          <span>{t('triggerLabel')}</span>
          <Badge
            variant="secondary"
            className="rounded-full px-2 py-0 text-2xs"
          >
            {isLoading
              ? t('triggerLoading')
              : t('triggerCount', { count: activeRouteCount })}
          </Badge>
        </Button>
      </SheetTrigger>
      <SheetContent
        className="inset-y-2 right-2 h-auto w-[calc(100%-1rem)] gap-0 overflow-hidden rounded-2xl border bg-background/95 p-0 shadow-xl sm:max-w-3xl"
        showCloseButton={false}
      >
        <SheetTitle className="sr-only">{t('sheetTitle')}</SheetTitle>
        <SheetDescription className="sr-only">
          {t('sheetDescription')}
        </SheetDescription>
        <SheetClose
          aria-label={t('closeLabel')}
          className="absolute right-2 top-2 z-10 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <X className="size-5" />
        </SheetClose>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-12 sm:px-6">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  )
}
