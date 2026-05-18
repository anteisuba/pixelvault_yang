'use client'

import { memo, useCallback, useMemo, useState } from 'react'
import { Check, MoveHorizontal, MoveVertical } from 'lucide-react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { OutpaintPadding } from '@/types'

interface StudioOutpaintEditorProps {
  imageUrl: string
  imageWidth: number
  imageHeight: number
  onApply: (padding: OutpaintPadding, prompt: string) => void
  onCancel: () => void
  isLoading?: boolean
}

type PaddingSide = keyof OutpaintPadding

const PADDING_SIDES: Array<{
  key: PaddingSide
  icon: typeof MoveVertical
}> = [
  { key: 'top', icon: MoveVertical },
  { key: 'right', icon: MoveHorizontal },
  { key: 'bottom', icon: MoveVertical },
  { key: 'left', icon: MoveHorizontal },
]

const DEFAULT_PADDING: OutpaintPadding = {
  top: 64,
  right: 64,
  bottom: 64,
  left: 64,
}

function clampPadding(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(512, Math.max(0, Math.round(value)))
}

function getImageDimension(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 1024
}

export const StudioOutpaintEditor = memo(function StudioOutpaintEditor({
  imageUrl,
  imageWidth,
  imageHeight,
  onApply,
  onCancel,
  isLoading = false,
}: StudioOutpaintEditorProps) {
  const t = useTranslations('StudioV3.outpaintEditor')
  const [padding, setPadding] = useState<OutpaintPadding>(DEFAULT_PADDING)
  const [prompt, setPrompt] = useState('')
  const safeImageWidth = getImageDimension(imageWidth)
  const safeImageHeight = getImageDimension(imageHeight)

  const finalWidth = safeImageWidth + padding.left + padding.right
  const finalHeight = safeImageHeight + padding.top + padding.bottom

  // Padding expressed as a percentage of the *final* canvas so the preview
  // mirrors the real outpaint proportions instead of an arbitrary cap.
  const previewPadding = useMemo(
    () => ({
      paddingTop: `${(padding.top / finalHeight) * 100}%`,
      paddingRight: `${(padding.right / finalWidth) * 100}%`,
      paddingBottom: `${(padding.bottom / finalHeight) * 100}%`,
      paddingLeft: `${(padding.left / finalWidth) * 100}%`,
    }),
    [finalHeight, finalWidth, padding],
  )

  const updatePadding = useCallback((side: PaddingSide, value: number) => {
    setPadding((current) => ({
      ...current,
      [side]: clampPadding(value),
    }))
  }, [])

  const applyPreset = useCallback((value: number) => {
    const nextValue = clampPadding(value)
    setPadding({
      top: nextValue,
      right: nextValue,
      bottom: nextValue,
      left: nextValue,
    })
  }, [])

  const handleApply = useCallback(() => {
    const trimmedPrompt = prompt.trim()
    if (!trimmedPrompt || isLoading) return
    onApply(padding, trimmedPrompt)
  }, [isLoading, onApply, padding, prompt])

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-border bg-muted p-4">
            <div
              className="relative mx-auto w-full max-w-xl rounded-md bg-background/60 ring-1 ring-dashed ring-border"
              style={{
                aspectRatio: `${finalWidth} / ${finalHeight}`,
                ...previewPadding,
              }}
              aria-label={t('padding')}
            >
              <Image
                src={imageUrl}
                alt=""
                width={safeImageWidth}
                height={safeImageHeight}
                unoptimized
                className="block size-full rounded-sm border border-border bg-background object-contain"
              />
            </div>
            <p className="mt-2 text-center text-xs tabular-nums text-muted-foreground">
              {t('finalSize', { width: finalWidth, height: finalHeight })}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-3 rounded-lg border border-border bg-card p-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {t('padding')}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {padding.top + padding.right + padding.bottom + padding.left}px
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[64, 128, 256].map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset(value)}
                >
                  {t(`presetUniform${value}`)}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {PADDING_SIDES.map(({ key, icon: Icon }) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={`outpaint-${key}`}>
                  <Icon className="size-3.5 text-muted-foreground" />
                  {t(key)}
                </Label>
                <Input
                  id={`outpaint-${key}`}
                  type="number"
                  min={0}
                  max={512}
                  value={padding[key]}
                  onChange={(event) =>
                    updatePadding(key, Number(event.target.value))
                  }
                />
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="outpaint-prompt">{t('prompt')}</Label>
            <Textarea
              id="outpaint-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={t('promptPlaceholder')}
              className="min-h-24 resize-none"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button
          type="button"
          onClick={handleApply}
          disabled={!prompt.trim() || isLoading}
        >
          <Check className="size-4" />
          {t('apply')}
        </Button>
      </div>
    </div>
  )
})
