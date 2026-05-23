'use client'
/* eslint-disable @next/next/no-img-element -- data URL images from file upload */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Check,
  ImageIcon,
  Loader2,
  Paintbrush,
  RotateCcw,
  Sparkles,
  Trees,
  User,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { DEFAULT_ASPECT_RATIO, type AspectRatio } from '@/constants/config'
import type {
  AnalysisDimension,
  GenerationRecord,
  GenerateVariationsModel,
} from '@/types'
import { ImageSourcePicker } from '@/components/business/ImageSourcePicker'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { VariationGrid } from '@/components/business/VariationGrid'
import { useReverseImage } from '@/hooks/use-reverse-image'
import { cn } from '@/lib/utils'

const MAX_IMAGE_DIMENSION = 2048

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = url
  })
}

async function resizeImageToBase64(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await loadImageElement(objectUrl)
    let { width, height } = img
    if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
      const scale = MAX_IMAGE_DIMENSION / Math.max(width, height)
      width = Math.round(width * scale)
      height = Math.round(height * scale)
    }
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas not supported')
    ctx.drawImage(img, 0, 0, width, height)
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (nextBlob) => {
          if (nextBlob) {
            resolve(nextBlob)
          } else {
            reject(new Error('Failed to encode image'))
          }
        },
        'image/jpeg',
        0.85,
      )
    })
    return await readBlobAsDataUrl(blob)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

// ── Dimension config ────────────────────────────────────────────

const DIMENSION_CONFIG: {
  key: AnalysisDimension
  icon: React.ElementType
  labelKey: string
}[] = [
  { key: 'artStyle', icon: Paintbrush, labelKey: 'dimArtStyle' },
  { key: 'character', icon: User, labelKey: 'dimCharacter' },
  { key: 'background', icon: Trees, labelKey: 'dimBackground' },
  { key: 'overall', icon: ImageIcon, labelKey: 'dimOverall' },
  { key: 'tags', icon: Sparkles, labelKey: 'dimTags' },
]

// ── Component ───────────────────────────────────────────────────

interface ReverseEngineerPanelProps {
  onUsePrompt?: (prompt: string) => void
  /** Selected models with their bound API keys from the parent page */
  selectedModels?: GenerateVariationsModel[]
}

export function ReverseEngineerPanel({
  onUsePrompt,
  selectedModels,
}: ReverseEngineerPanelProps = {}) {
  const t = useTranslations('ReverseEngineer')
  const tImageChip = useTranslations('ImageChip')
  const {
    step,
    sourceImageUrl,
    generatedPrompt,
    dimensions,
    variations,
    failedModels,
    error,
    uploadImage,
    extractDimensions,
    updatePrompt,
    generateVariations,
    reset,
  } = useReverseImage()

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [aspectRatio] = useState<AspectRatio>(DEFAULT_ASPECT_RATIO)
  const [selectedDims, setSelectedDims] = useState<Set<AnalysisDimension>>(
    new Set(),
  )
  const previewObjectUrlRef = useRef<string | null>(null)

  const revokePreviewObjectUrl = useCallback(() => {
    if (!previewObjectUrlRef.current) return
    URL.revokeObjectURL(previewObjectUrlRef.current)
    previewObjectUrlRef.current = null
  }, [])

  useEffect(() => revokePreviewObjectUrl, [revokePreviewObjectUrl])

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) return
      revokePreviewObjectUrl()
      const objectUrl = URL.createObjectURL(file)
      previewObjectUrlRef.current = objectUrl
      setPreviewUrl(objectUrl)
      const base64 = await resizeImageToBase64(file)
      uploadImage(base64)
    },
    [revokePreviewObjectUrl, uploadImage],
  )

  const handleSelectAsset = useCallback(
    (generation: GenerationRecord) => {
      if (generation.outputType !== 'IMAGE') return
      revokePreviewObjectUrl()
      setPreviewUrl(generation.url)
      uploadImage(generation.url)
    },
    [revokePreviewObjectUrl, uploadImage],
  )

  const toggleDimension = useCallback((dim: AnalysisDimension) => {
    setSelectedDims((prev) => {
      const next = new Set(prev)
      if (next.has(dim)) {
        next.delete(dim)
      } else {
        next.add(dim)
      }
      return next
    })
  }, [])

  const handleExtract = useCallback(() => {
    if (selectedDims.size === 0) return
    extractDimensions(Array.from(selectedDims), selectedModels?.[0]?.apiKeyId)
  }, [extractDimensions, selectedDims, selectedModels])

  const handleGenerateAll = useCallback(() => {
    if (!selectedModels || selectedModels.length === 0) return
    generateVariations(selectedModels, aspectRatio)
  }, [generateVariations, aspectRatio, selectedModels])

  const handleReset = useCallback(() => {
    revokePreviewObjectUrl()
    setPreviewUrl(null)
    setSelectedDims(new Set())
    reset()
  }, [reset, revokePreviewObjectUrl])

  // ── Step 1: Upload ──────────────────────────────────────────

  if (step === 'idle' || step === 'uploading') {
    return (
      <div className="studio-step-animate space-y-3">
        <ImageSourcePicker
          description={t('sourceDescription')}
          uploadLabel={tImageChip('upload')}
          uploadHint={t('uploadHint')}
          selectAssetLabel={t('selectAsset')}
          assetDialogTitle={t('selectAsset')}
          assetDialogDescription={t('sourceDescription')}
          pasteHint={t('pasteHint')}
          className="mx-auto w-64 max-w-full"
          onFileSelect={handleFile}
          onAssetSelect={handleSelectAsset}
        />

        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>
    )
  }

  // ── Step 2: Select dimensions ───────────────────────────────

  if (step === 'select-dimensions') {
    return (
      <div className="space-y-4 studio-step-animate">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            {t('title')}
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="rounded-full"
          >
            <X className="size-4" />
          </Button>
        </div>

        {previewUrl && (
          <div className="overflow-hidden rounded-2xl border border-border/75">
            <img
              src={previewUrl}
              alt="Source"
              className="max-h-36 w-full object-contain"
            />
          </div>
        )}

        <p className="text-sm text-muted-foreground">{t('selectDimensions')}</p>

        <div className="grid grid-cols-2 gap-2">
          {DIMENSION_CONFIG.map(({ key, icon: Icon, labelKey }) => {
            const isSelected = selectedDims.has(key)
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleDimension(key)}
                className={cn(
                  'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition-all',
                  isSelected
                    ? 'border-primary/50 bg-primary/8 text-foreground'
                    : 'border-border/60 bg-background/60 text-muted-foreground hover:border-primary/30 hover:bg-primary/3',
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="flex-1 font-medium">{t(labelKey)}</span>
                {isSelected && (
                  <Check className="size-3.5 shrink-0 text-primary" />
                )}
              </button>
            )
          })}
        </div>

        <Button
          type="button"
          onClick={handleExtract}
          disabled={selectedDims.size === 0}
          className="w-full gap-2 rounded-full"
        >
          <Sparkles className="size-4" />
          {t('extract')}
        </Button>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    )
  }

  // ── Step 3: Analyzing ───────────────────────────────────────

  if (step === 'analyzing') {
    return (
      <div className="space-y-4 studio-step-animate">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            {t('title')}
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="rounded-full"
          >
            <X className="size-4" />
          </Button>
        </div>

        {previewUrl && (
          <div className="overflow-hidden rounded-2xl border border-border/75">
            <img
              src={previewUrl}
              alt="Source"
              className="max-h-48 w-full object-contain"
            />
          </div>
        )}

        <div className="flex items-center justify-center gap-2 py-4">
          <Loader2 className="size-5 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">{t('analyzing')}</p>
        </div>
      </div>
    )
  }

  // ── Step 4: Results ─────────────────────────────────────────

  return (
    <div className="space-y-4 studio-step-animate">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{t('title')}</h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleReset}
          className="gap-1.5 rounded-full text-xs"
        >
          <RotateCcw className="size-3.5" />
          {t('reset')}
        </Button>
      </div>

      {/* Source image preview */}
      {(previewUrl || sourceImageUrl) && (
        <div className="overflow-hidden rounded-2xl border border-border/75">
          <img
            src={previewUrl || sourceImageUrl || ''}
            alt="Source"
            className="max-h-36 w-full object-contain"
          />
        </div>
      )}

      {/* Dimension results */}
      {dimensions && Object.keys(dimensions).length > 0 ? (
        <div className="space-y-3">
          {DIMENSION_CONFIG.filter(({ key }) => dimensions[key]).map(
            ({ key, icon: Icon, labelKey }) => (
              <div
                key={key}
                className="space-y-2 rounded-xl border border-border/60 p-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="size-3.5 text-primary" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t(labelKey)}
                    </p>
                  </div>
                  {onUsePrompt && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onUsePrompt(dimensions[key]!)}
                      className="h-7 gap-1.5 rounded-full px-3 text-xs"
                    >
                      <Check className="size-3" />
                      {t('useAsPrompt')}
                    </Button>
                  )}
                </div>
                <p className="font-serif text-sm leading-relaxed text-foreground/85">
                  {dimensions[key]}
                </p>
              </div>
            ),
          )}
        </div>
      ) : (
        /* Fallback: single prompt textarea (legacy or overall-only) */
        generatedPrompt && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <ImageIcon className="size-4 text-primary" />
              <p className="text-sm font-medium text-foreground">
                {t('generatedPromptLabel')}
              </p>
            </div>
            <Textarea
              value={generatedPrompt}
              onChange={(e) => updatePrompt(e.target.value)}
              rows={4}
              disabled={step === 'generating'}
              className="resize-none rounded-2xl border-border/75 bg-background/72 px-4 py-3 font-serif text-sm"
            />
          </div>
        )
      )}

      {/* Generate variations button */}
      {step === 'prompt-ready' &&
        !dimensions &&
        (onUsePrompt && generatedPrompt ? (
          <Button
            type="button"
            onClick={() => onUsePrompt(generatedPrompt)}
            className="w-full gap-2 rounded-full"
          >
            <Sparkles className="size-4" />
            {t('useAsPrompt')}
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleGenerateAll}
            className="w-full gap-2 rounded-full"
          >
            <Sparkles className="size-4" />
            {t('generateVariations')}
          </Button>
        ))}

      {/* Loading */}
      {step === 'generating' && (
        <div className="flex items-center justify-center gap-2 py-4">
          <Loader2 className="size-5 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            {t('generatingVariations')}
          </p>
        </div>
      )}

      {/* Results */}
      {step === 'done' && variations.length > 0 && (
        <VariationGrid
          sourceImageUrl={previewUrl || sourceImageUrl || ''}
          variations={variations}
          failedModels={failedModels}
        />
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
