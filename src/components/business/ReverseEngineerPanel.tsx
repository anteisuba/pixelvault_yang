'use client'
/* eslint-disable @next/next/no-img-element -- data URL images from file upload */

import { useCallback, useRef, useState } from 'react'
import {
  ImageIcon,
  Loader2,
  RotateCcw,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { DEFAULT_ASPECT_RATIO, type AspectRatio } from '@/constants/config'
import type { GenerateVariationsModel } from '@/types'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { VariationGrid } from '@/components/business/VariationGrid'
import { useReverseImage } from '@/hooks/use-reverse-image'
import { cn } from '@/lib/utils'

const MAX_IMAGE_DIMENSION = 2048

function resizeImageToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
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
        if (!ctx) return reject(new Error('Canvas not supported'))
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = reader.result as string
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

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
  const {
    step,
    sourceImageUrl,
    generatedPrompt,
    variations,
    failedModels,
    error,
    analyzeImage,
    updatePrompt,
    generateVariations,
    reset,
  } = useReverseImage()

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [aspectRatio] = useState<AspectRatio>(DEFAULT_ASPECT_RATIO)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) return
      const base64 = await resizeImageToBase64(file)
      setPreviewUrl(base64)
      analyzeImage(base64, selectedModels?.[0]?.apiKeyId)
    },
    [analyzeImage, selectedModels],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  const handleGenerateAll = useCallback(() => {
    if (!selectedModels || selectedModels.length === 0) return
    generateVariations(selectedModels, aspectRatio)
  }, [generateVariations, aspectRatio, selectedModels])

  const handleReset = useCallback(() => {
    setPreviewUrl(null)
    reset()
  }, [reset])

  // Step 1: Upload
  if (step === 'idle' || step === 'uploading') {
    return (
      <div className="space-y-4 studio-step-animate">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            {t('title')}
          </h3>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 transition-colors',
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-border/75 hover:border-primary/50 hover:bg-muted/30',
          )}
        >
          <Upload className="size-8 text-muted-foreground" />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              {t('uploadTitle')}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('uploadHint')}
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    )
  }

  // Step 2: Analyzing
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

  // Step 3: Prompt ready / generating / done
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
            className="max-h-48 w-full object-contain"
          />
        </div>
      )}

      {/* Generated prompt */}
      {generatedPrompt && (
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
      )}

      {/* Generate variations button */}
      {step === 'prompt-ready' && (
        <div className="flex gap-2">
          {onUsePrompt && generatedPrompt ? (
            <Button
              type="button"
              onClick={() => onUsePrompt(generatedPrompt)}
              className="flex-1 gap-2 rounded-full"
            >
              <Sparkles className="size-4" />
              {t('useAsPrompt')}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleGenerateAll}
              className="flex-1 gap-2 rounded-full"
            >
              <Sparkles className="size-4" />
              {t('generateVariations')}
            </Button>
          )}
        </div>
      )}

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
