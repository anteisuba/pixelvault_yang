'use client'

/**
 * Transform panel — orchestrates input image, presets, preservation, and results.
 *
 * Self-contained with local state — does NOT modify StudioContext.
 * Uses useImageTransform hook for API calls.
 *
 * @see 02-功能/功能-實作落地清單.md §1.5
 */

import { memo, useCallback, useState } from 'react'
import { Wand2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useImageTransform } from '@/hooks/use-image-transform'
import {
  TRANSFORM_PRESETS,
  type TransformPresetId,
} from '@/constants/transform-presets'
import {
  PRESERVATION_PRESETS,
  type PreservationPresetId,
} from '@/types/transform'

import { StudioInputImage } from './StudioInputImage'
import { StudioFaceConsentModal } from './StudioFaceConsentModal'
import { StudioTransformToggle } from './StudioTransformToggle'
import { StudioVariantsGrid } from './StudioVariantsGrid'

interface StudioTransformPanelProps {
  className?: string
}

export const StudioTransformPanel = memo(function StudioTransformPanel({
  className,
}: StudioTransformPanelProps) {
  const t = useTranslations('Transform')
  const tPresets = useTranslations('TransformPresets')

  // ─── Local state ──────────────────────────────────────────────
  const [inputImage, setInputImage] = useState<string | null>(null)
  const [selectedPresetId, setSelectedPresetId] =
    useState<TransformPresetId>('preset-watercolor')
  const [preservationMode, setPreservationMode] =
    useState<PreservationPresetId>('medium')
  const [variants, setVariants] = useState<1 | 4>(4)
  const [showFaceConsent, setShowFaceConsent] = useState(false)
  const [faceConsented, setFaceConsented] = useState(false)

  // ─── Hook ─────────────────────────────────────────────────────
  const { status, output, submit, retryVariant, reset } = useImageTransform()
  const isTransforming = status === 'transforming'

  // ─── Handlers ─────────────────────────────────────────────────
  const handleImageSelect = useCallback((base64: string) => {
    setInputImage(base64)
    setFaceConsented(false)
  }, [])

  const handleImageRemove = useCallback(() => {
    setInputImage(null)
    setFaceConsented(false)
    reset()
  }, [reset])

  const handleTransform = useCallback(() => {
    if (!inputImage || !selectedPresetId) return

    // Phase 1: simplified face consent — always ask on first transform
    if (!faceConsented) {
      setShowFaceConsent(true)
      return
    }

    const preservation = PRESERVATION_PRESETS[preservationMode]

    submit({
      input: { type: 'image', data: inputImage },
      subject: { type: 'upload', imageData: inputImage },
      style: { type: 'preset', presetId: selectedPresetId },
      transformation: { type: 'style' },
      preservation,
      variants,
    })
  }, [
    inputImage,
    selectedPresetId,
    faceConsented,
    preservationMode,
    variants,
    submit,
  ])

  const handleFaceConfirm = useCallback(() => {
    setFaceConsented(true)
    setShowFaceConsent(false)
    // Auto-trigger transform after consent
    if (!inputImage || !selectedPresetId) return
    const preservation = PRESERVATION_PRESETS[preservationMode]
    submit({
      input: { type: 'image', data: inputImage },
      subject: { type: 'upload', imageData: inputImage },
      style: { type: 'preset', presetId: selectedPresetId },
      transformation: { type: 'style' },
      preservation,
      variants,
    })
  }, [inputImage, selectedPresetId, preservationMode, variants, submit])

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Title */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t('title')}</h3>
        <StudioTransformToggle
          variants={variants}
          onVariantsChange={setVariants}
          disabled={isTransforming}
        />
      </div>

      {/* Input Image Upload */}
      <StudioInputImage
        imageData={inputImage}
        onImageSelect={handleImageSelect}
        onImageRemove={handleImageRemove}
        disabled={isTransforming}
      />

      {/* Preset Selector */}
      {inputImage && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Style</p>
          <div className="grid grid-cols-3 gap-1.5">
            {TRANSFORM_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={cn(
                  'rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
                  selectedPresetId === preset.id
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border/60 text-muted-foreground hover:border-primary/40',
                )}
                onClick={() =>
                  setSelectedPresetId(preset.id as TransformPresetId)
                }
                disabled={isTransforming}
              >
                {tPresets(preset.i18nKey.replace('TransformPresets.', ''))}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Preservation Mode */}
      {inputImage && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            {t('preservation.structure')}
          </p>
          <div className="inline-flex rounded-lg border border-border/60 p-0.5 text-xs">
            {(Object.keys(PRESERVATION_PRESETS) as PreservationPresetId[]).map(
              (mode) => (
                <button
                  key={mode}
                  type="button"
                  className={cn(
                    'rounded-md px-3 py-1.5 font-medium transition-colors',
                    preservationMode === mode
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  onClick={() => setPreservationMode(mode)}
                  disabled={isTransforming}
                >
                  {t(`preservation.${mode}`)}
                </button>
              ),
            )}
          </div>
        </div>
      )}

      {/* Transform Button */}
      {inputImage && (
        <Button
          onClick={handleTransform}
          disabled={isTransforming || !selectedPresetId}
          className="w-full gap-2"
        >
          <Wand2 className="size-4" />
          {isTransforming ? t('variants.retry') + '...' : t('title')}
        </Button>
      )}

      {/* Results */}
      <StudioVariantsGrid
        output={output}
        isTransforming={isTransforming}
        variantCount={variants}
        onRetry={retryVariant}
      />

      {/* Face Consent Modal */}
      <StudioFaceConsentModal
        open={showFaceConsent}
        onConfirm={handleFaceConfirm}
        onCancel={() => setShowFaceConsent(false)}
      />
    </div>
  )
})
