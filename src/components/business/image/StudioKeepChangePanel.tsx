'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'

import type { ImageIntent } from '@/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'

interface StudioKeepChangePanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentIntent: ImageIntent | null
  onSubmit: (keepTags: string[], changeTags: string[], freeText: string) => void
}

type Dimension = 'subject' | 'style' | 'composition' | 'lighting' | 'color'

const DIMENSIONS: Dimension[] = [
  'subject',
  'style',
  'composition',
  'lighting',
  'color',
]

function toggleValue(values: Dimension[], value: Dimension): Dimension[] {
  if (values.includes(value)) {
    return values.filter((item) => item !== value)
  }
  return [...values, value]
}

export function StudioKeepChangePanel({
  open,
  onOpenChange,
  currentIntent,
  onSubmit,
}: StudioKeepChangePanelProps) {
  const t = useTranslations('StudioKeepChangePanel')
  const [keepTags, setKeepTags] = useState<Dimension[]>([])
  const [changeTags, setChangeTags] = useState<Dimension[]>([])
  const [freeText, setFreeText] = useState('')

  const toggleKeep = useCallback((tag: Dimension) => {
    setKeepTags((current) => toggleValue(current, tag))
    setChangeTags((current) => current.filter((item) => item !== tag))
  }, [])

  const toggleChange = useCallback((tag: Dimension) => {
    setChangeTags((current) => toggleValue(current, tag))
    setKeepTags((current) => current.filter((item) => item !== tag))
  }, [])

  const handleSubmit = useCallback(() => {
    onSubmit(keepTags, changeTags, freeText.trim())
  }, [changeTags, freeText, keepTags, onSubmit])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        aria-describedby={undefined}
        data-has-intent={currentIntent !== null}
        className="max-h-svh md:bottom-auto md:left-auto md:right-0 md:top-0 md:h-full md:w-full md:max-w-md md:border-l md:border-t-0"
      >
        <SheetHeader>
          <SheetTitle className="font-display">{t('title')}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-4">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              {t('keepSection')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {DIMENSIONS.map((tag) => {
                const active = keepTags.includes(tag)

                return (
                  <Button
                    key={`keep-${tag}`}
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-pressed={active}
                    data-active={active}
                    onClick={() => toggleKeep(tag)}
                    className={cn(
                      'h-8 rounded-full border-border/60 bg-background/70 px-3 text-xs shadow-none',
                      active && 'border-primary/40 bg-primary/10 text-primary',
                    )}
                  >
                    {t(tag)}
                  </Button>
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              {t('changeSection')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {DIMENSIONS.map((tag) => {
                const active = changeTags.includes(tag)
                const keepActive = keepTags.includes(tag)

                return (
                  <Button
                    key={`change-${tag}`}
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-pressed={active}
                    data-active={active}
                    disabled={keepActive}
                    onClick={() => toggleChange(tag)}
                    className={cn(
                      'h-8 rounded-full border-border/60 bg-background/70 px-3 text-xs shadow-none',
                      active && 'border-primary/40 bg-primary/10 text-primary',
                    )}
                  >
                    {t(tag)}
                  </Button>
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="studio-keep-change-free-text"
              className="text-xs font-medium text-muted-foreground"
            >
              {t('freeText')}
            </label>
            <Textarea
              id="studio-keep-change-free-text"
              value={freeText}
              onChange={(event) => setFreeText(event.target.value)}
              placeholder={t('freeTextPlaceholder')}
              className="min-h-24 resize-none bg-background/70 font-serif text-sm"
            />
          </div>

          <Button type="button" className="w-full" onClick={handleSubmit}>
            {t('submit')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
