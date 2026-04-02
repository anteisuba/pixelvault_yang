'use client'

import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useApiKeysContext } from '@/contexts/api-keys-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
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

  return (
    <Sheet open={open} onOpenChange={setOpen}>
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
      <SheetContent className="w-full overflow-y-auto border-l bg-background/95 px-0 sm:max-w-2xl">
        <SheetHeader className="gap-3 border-b px-6 pb-5 pt-6">
          <SheetTitle className="flex items-center gap-2 font-display text-lg font-medium">
            <KeyRound className="size-4" />
            {t('sheetTitle')}
          </SheetTitle>
          <SheetDescription className="max-w-md font-serif leading-6">
            {t('sheetDescription')}
          </SheetDescription>
        </SheetHeader>
        <div className="px-6 py-6">{children}</div>
      </SheetContent>
    </Sheet>
  )
}
