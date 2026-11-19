'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'

import type { ImageIntent } from '@/types'
import {
  STUDIO_KEEP_CHANGE_DIMENSIONS,
  type StudioKeepChangeDimension,
} from '@/constants/studio'
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
  /**
   * 「改变」一行先勾上的维度（结果下方点「主体偏差」等进来）。宿主每次打开给一份
   * 新数组；引用变了 = 新的一次打开，按它重新预选。
   */
  presetChangeTags?: readonly Dimension[]
}

type Dimension = StudioKeepChangeDimension

const DIMENSIONS = STUDIO_KEEP_CHANGE_DIMENSIONS
const NO_PRESET: readonly Dimension[] = []

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
  presetChangeTags = NO_PRESET,
}: StudioKeepChangePanelProps) {
  const t = useTranslations('StudioKeepChangePanel')
  const [keepTags, setKeepTags] = useState<Dimension[]>([])
  const [changeTags, setChangeTags] = useState<Dimension[]>(() => [
    ...presetChangeTags,
  ])
  const [freeText, setFreeText] = useState('')
  // 宿主换了一份预选（又点了一次偏差标签）：在渲染里对齐（React 的「随 prop 调整 state」写法）。
  const [appliedPreset, setAppliedPreset] = useState(presetChangeTags)
  if (appliedPreset !== presetChangeTags) {
    setAppliedPreset(presetChangeTags)
    setChangeTags([...presetChangeTags])
    setKeepTags((current) =>
      current.filter((tag) => !presetChangeTags.includes(tag)),
    )
  }

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
          <SheetTitle>{t('title')}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-4">
          <div className="space-y-2">
            <p className="text-2xs text-muted-foreground">{t('keepSection')}</p>
            <div className="flex flex-wrap gap-1.5">
              {DIMENSIONS.map((tag) => {
                const active = keepTags.includes(tag)

                return (
                  <Button
                    key={`keep-${tag}`}
                    type="button"
                    // 选中 = 实心黑药丸；原来的 10% 底色在浅色面上看不出勾没勾。
                    variant={active ? 'default' : 'secondary'}
                    size="sm"
                    aria-pressed={active}
                    data-active={active}
                    onClick={() => toggleKeep(tag)}
                    className={cn('h-8 px-3', !active && 'shadow-none')}
                  >
                    {t(tag)}
                  </Button>
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-2xs text-muted-foreground">
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
                    variant={active ? 'default' : 'secondary'}
                    size="sm"
                    aria-pressed={active}
                    data-active={active}
                    disabled={keepActive}
                    onClick={() => toggleChange(tag)}
                    className={cn('h-8 px-3', !active && 'shadow-none')}
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
              className="text-2xs text-muted-foreground"
            >
              {t('freeText')}
            </label>
            <Textarea
              id="studio-keep-change-free-text"
              value={freeText}
              onChange={(event) => setFreeText(event.target.value)}
              placeholder={t('freeTextPlaceholder')}
              className="min-h-24 resize-none"
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
