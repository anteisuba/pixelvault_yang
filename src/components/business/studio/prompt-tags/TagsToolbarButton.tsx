'use client'

import { useState } from 'react'
import { Tags } from 'lucide-react'
import { useTranslations } from 'next-intl'
import * as Toolbar from '@radix-ui/react-toolbar'

import { useActiveLoraStack } from '@/hooks/use-active-lora-stack'
import { useIsMobile } from '@/hooks/use-mobile'
import { usePromptTagStack } from '@/hooks/use-prompt-tag-stack'
import { cn } from '@/lib/utils'
import {
  StudioToolPopoverContent,
  studioToolTriggerClass,
} from '@/components/business/studio-shared/primitives/tool-surface'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { Popover, PopoverTrigger } from '@/components/ui/popover'

import { TagLibrary } from './TagLibrary'

interface TagsToolbarButtonProps {
  disabled?: boolean
}

export function TagsToolbarButton({ disabled }: TagsToolbarButtonProps) {
  const t = useTranslations('PromptTags')
  const [open, setOpen] = useState(false)
  const isMobile = useIsMobile()
  const promptTags = usePromptTagStack()
  const loraStack = useActiveLoraStack()
  const count = promptTags.selectedCount + loraStack.items.length
  const active = count > 0 || open

  const trigger = (
    <Toolbar.Button
      type="button"
      disabled={disabled}
      aria-label={
        count > 0
          ? t('toolbar.triggerWithCount', { count })
          : t('toolbar.trigger')
      }
      className={cn(
        studioToolTriggerClass,
        active ? 'bg-muted/30 text-primary' : 'text-muted-foreground',
      )}
    >
      <Tags className="size-4" aria-hidden />
      <span className="hidden sm:inline">{t('toolbar.label')}</span>
      {count > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-white">
          {count}
        </span>
      ) : null}
    </Toolbar.Button>
  )

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent className="max-h-[85vh]">
          <DrawerTitle className="sr-only">{t('library.title')}</DrawerTitle>
          <DrawerDescription className="sr-only">
            {t('library.description')}
          </DrawerDescription>
          <TagLibrary onClose={() => setOpen(false)} />
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <StudioToolPopoverContent
        side="top"
        align="end"
        size="action"
        className="h-[min(620px,76vh)] w-96 overflow-hidden p-0"
      >
        <TagLibrary onClose={() => setOpen(false)} />
      </StudioToolPopoverContent>
    </Popover>
  )
}
