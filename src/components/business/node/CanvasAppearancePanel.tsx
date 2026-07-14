'use client'

import { useState } from 'react'
import { Check, ImagePlus, Palette, RotateCcw, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  NODE_STUDIO_CANVAS_APPEARANCE_DEFAULT,
  NODE_STUDIO_CANVAS_APPEARANCE_PRESETS,
} from '@/constants/node-studio'
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
} from '@/components/ui/responsive-popover'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import type { GenerationRecord } from '@/types'
import type { CanvasAppearance } from '@/types/node-workflow'

interface CanvasAppearancePanelProps {
  appearance: CanvasAppearance | undefined
  onChange(value: CanvasAppearance | undefined): void
}

function isLightColor(hex: string): boolean {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!match) return false
  const [r, g, b] = match.slice(1).map((c) => Number.parseInt(c, 16) / 255)
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.55
}

/**
 * Canvas surface controls. Visually distinct from topbar icon buttons so users
 * can find "desktop color" at a glance — painted swatch trigger, not a ghost icon.
 */
export function CanvasAppearancePanel({
  appearance,
  onChange,
}: CanvasAppearancePanelProps) {
  const t = useTranslations('StudioNode.appearance')
  const [assetDialogOpen, setAssetDialogOpen] = useState(false)
  const resolved = appearance ?? NODE_STUDIO_CANVAS_APPEARANCE_DEFAULT

  const updateAppearance = (patch: Partial<CanvasAppearance>) => {
    onChange({ ...resolved, ...patch })
  }

  const handleSelectAsset = (generation: GenerationRecord) => {
    if (generation.outputType !== 'IMAGE') return
    updateAppearance({
      image: {
        url: generation.url,
        sourceGenerationId: generation.id,
        fit: resolved.image?.fit ?? 'cover',
        opacity: resolved.image?.opacity ?? 0.28,
      },
    })
  }

  return (
    <>
      <ResponsivePopover>
        <ResponsivePopoverTrigger asChild>
          <button
            type="button"
            aria-label={t('trigger')}
            title={t('trigger')}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-node-paint/40 bg-node-panel-soft pl-1.5 pr-2.5 text-xs font-semibold text-node-foreground shadow-sm transition-colors hover:border-node-paint hover:bg-node-panel-inner"
          >
            <span
              className="relative flex size-6 items-center justify-center overflow-hidden rounded-full border border-node-edge/50 shadow-inner"
              style={{ backgroundColor: resolved.backgroundColor }}
              aria-hidden
            >
              {resolved.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={resolved.image.url}
                  alt=""
                  className="absolute inset-0 size-full object-cover"
                  style={{ opacity: resolved.image.opacity }}
                />
              ) : null}
              <Palette
                className={cn(
                  'relative size-3 drop-shadow',
                  isLightColor(resolved.backgroundColor)
                    ? 'text-neutral-800'
                    : 'text-white',
                )}
              />
            </span>
            <span className="hidden sm:inline">{t('triggerShort')}</span>
          </button>
        </ResponsivePopoverTrigger>
        <ResponsivePopoverContent
          label={t('title')}
          align="end"
          sideOffset={10}
          className="w-72 border-node-paint/30 bg-node-panel p-0 text-node-foreground shadow-node-panel ring-1 ring-node-paint/15"
          mobileClassName="space-y-5 pb-5"
        >
          <div className="border-b border-node-paint/20 bg-node-panel-soft/60 px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-node-foreground">
              <Palette className="size-4 text-node-paint" />
              {t('title')}
            </p>
            <p className="mt-0.5 text-xs leading-5 text-node-muted">
              {t('description')}
            </p>
          </div>

          <div className="space-y-5 p-4">
            <section
              className="space-y-2.5"
              aria-labelledby="canvas-color-label"
            >
              <Label
                id="canvas-color-label"
                className="text-xs text-node-muted"
              >
                {t('colorLabel')}
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                {NODE_STUDIO_CANVAS_APPEARANCE_PRESETS.map((color) => {
                  const selected =
                    resolved.backgroundColor.toUpperCase() ===
                    color.toUpperCase()
                  return (
                    <button
                      key={color}
                      type="button"
                      aria-label={t('presetColor', { color })}
                      aria-pressed={selected}
                      onClick={() =>
                        updateAppearance({ backgroundColor: color })
                      }
                      className={cn(
                        'relative size-9 rounded-full border-2 outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-node-paint',
                        selected
                          ? 'border-node-paint ring-2 ring-node-paint/40'
                          : 'border-node-edge/50',
                      )}
                      style={{ backgroundColor: color }}
                    >
                      {selected ? (
                        <Check
                          className={cn(
                            'absolute inset-0 m-auto size-3.5 drop-shadow',
                            isLightColor(color)
                              ? 'text-neutral-900'
                              : 'text-white',
                          )}
                        />
                      ) : null}
                    </button>
                  )
                })}
                <label
                  className="relative size-9 cursor-pointer overflow-hidden rounded-full border-2 border-dashed border-node-paint/50"
                  title={t('customColor')}
                >
                  <input
                    type="color"
                    value={resolved.backgroundColor}
                    aria-label={t('customColor')}
                    onChange={(event) =>
                      updateAppearance({
                        backgroundColor: event.target.value.toUpperCase(),
                      })
                    }
                    className="absolute -inset-2 size-14 cursor-pointer border-0 bg-transparent p-0"
                  />
                </label>
              </div>
            </section>

            <section
              className="space-y-2.5"
              aria-labelledby="canvas-image-label"
            >
              <div className="flex items-center justify-between gap-3">
                <Label
                  id="canvas-image-label"
                  className="text-xs text-node-muted"
                >
                  {t('imageLabel')}
                </Label>
                {resolved.image ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => updateAppearance({ image: undefined })}
                    className="h-7 rounded-lg px-2 text-2xs text-node-muted hover:bg-node-panel-inner hover:text-node-status-failed"
                  >
                    <Trash2 className="size-3.5" />
                    {t('removeImage')}
                  </Button>
                ) : null}
              </div>

              {resolved.image ? (
                <div className="relative aspect-[16/7] overflow-hidden rounded-xl border border-node-panel-inner bg-node-panel-soft">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resolved.image.url}
                    alt={t('previewAlt')}
                    className={cn(
                      'size-full',
                      resolved.image.fit === 'contain'
                        ? 'object-contain'
                        : 'object-cover',
                    )}
                    style={{ opacity: resolved.image.opacity }}
                  />
                </div>
              ) : null}

              <Button
                type="button"
                variant="outline"
                onClick={() => setAssetDialogOpen(true)}
                className="h-9 w-full rounded-xl border-node-paint/30 bg-node-panel-soft text-xs text-node-foreground hover:border-node-paint/50 hover:bg-node-panel-inner"
              >
                <ImagePlus className="size-4" />
                {resolved.image ? t('replaceImage') : t('chooseImage')}
              </Button>

              {resolved.image ? (
                <div className="space-y-4 rounded-xl bg-node-panel-soft p-3">
                  <div className="space-y-2">
                    <Label className="text-2xs text-node-muted">
                      {t('fitLabel')}
                    </Label>
                    <div className="grid grid-cols-2 rounded-lg bg-node-panel p-1">
                      {(['cover', 'contain'] as const).map((fit) => (
                        <button
                          key={fit}
                          type="button"
                          aria-pressed={resolved.image?.fit === fit}
                          onClick={() =>
                            updateAppearance({
                              image: resolved.image
                                ? { ...resolved.image, fit }
                                : undefined,
                            })
                          }
                          className={cn(
                            'h-7 rounded-md text-2xs font-semibold text-node-muted transition-colors',
                            resolved.image?.fit === fit &&
                              'bg-node-paint text-node-paint-fg',
                          )}
                        >
                          {t(fit === 'cover' ? 'fitCover' : 'fitContain')}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <Label className="text-2xs text-node-muted">
                        {t('opacityLabel')}
                      </Label>
                      <span className="text-2xs tabular-nums text-node-foreground">
                        {Math.round(resolved.image.opacity * 100)}%
                      </span>
                    </div>
                    <Slider
                      min={10}
                      max={100}
                      step={1}
                      value={[Math.round(resolved.image.opacity * 100)]}
                      aria-label={t('opacityLabel')}
                      onValueChange={([value]) =>
                        updateAppearance({
                          image: resolved.image
                            ? { ...resolved.image, opacity: value / 100 }
                            : undefined,
                        })
                      }
                      className="[&_[data-slot=slider-range]]:bg-node-paint [&_[data-slot=slider-thumb]]:border-node-paint"
                    />
                  </div>
                </div>
              ) : null}
            </section>

            <Button
              type="button"
              variant="ghost"
              onClick={() => onChange(undefined)}
              className="h-8 w-full rounded-xl text-xs text-node-muted hover:bg-node-panel-inner hover:text-node-foreground"
            >
              <RotateCcw className="size-3.5" />
              {t('restoreDefault')}
            </Button>
          </div>
        </ResponsivePopoverContent>
      </ResponsivePopover>

      <AssetSelectorDialog
        open={assetDialogOpen}
        onOpenChange={setAssetDialogOpen}
        onSelect={handleSelectAsset}
        title={t('dialogTitle')}
        description={t('dialogDescription')}
        mediaType="image"
      />
    </>
  )
}
