'use client'
/* eslint-disable @next/next/no-img-element -- layer preview thumbnails */

import { useCallback, useRef, useState } from 'react'
import {
  Download,
  ImagePlus,
  Layers,
  Loader2,
  RotateCcw,
  Upload,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { useLayerDecompose } from '@/hooks/use-layer-decompose'
import { downloadRemoteAsset } from '@/lib/api-client'
import { cn } from '@/lib/utils'

const MAX_IMAGE_DIMENSION = 2048

function resizeImageToDataUrl(file: File): Promise<string> {
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
        resolve(canvas.toDataURL('image/png'))
      }
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = reader.result as string
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

interface LayerDecomposePanelProps {
  onAddAsReference?: (imageUrl: string) => Promise<void>
  onClose?: () => void
}

export function LayerDecomposePanel({
  onAddAsReference,
}: LayerDecomposePanelProps) {
  const t = useTranslations('LayerDecompose')
  const {
    step,
    sourceImageUrl,
    layers,
    psdUrl,
    layerCount,
    error,
    startDecompose,
    reset,
  } = useLayerDecompose()

  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) return
      const dataUrl = await resizeImageToDataUrl(file)
      void startDecompose(dataUrl)
    },
    [startDecompose],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) void handleFile(file)
    },
    [handleFile],
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) void handleFile(file)
    },
    [handleFile],
  )

  const handleReset = useCallback(() => {
    reset()
  }, [reset])

  const handleDownloadPsd = useCallback(async () => {
    if (!psdUrl) return
    const result = await downloadRemoteAsset(psdUrl, 'layers.psd')
    if (!result.success) {
      window.open(psdUrl, '_blank', 'noopener,noreferrer')
    }
  }, [psdUrl])

  const handleUseAsReference = useCallback(
    async (imageUrl: string, layerName: string) => {
      if (!onAddAsReference) return
      await onAddAsReference(imageUrl)
      toast.success(t('addedAsReference', { name: layerName }))
    },
    [onAddAsReference, t],
  )

  // Step: idle — Upload zone
  if (step === 'idle') {
    return (
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Layers className="size-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            {t('title')}
          </h3>
        </div>

        <p className="text-xs text-muted-foreground">{t('animeOnly')}</p>

        <div
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-6 transition-colors',
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-border/75 hover:border-primary/50 hover:bg-muted/30',
          )}
        >
          <Upload className="size-6 text-muted-foreground" />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              {t('uploadPrompt')}
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
      </div>
    )
  }

  // Step: decomposing — Loading
  if (step === 'decomposing') {
    return (
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              {t('title')}
            </h3>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={handleReset}
          >
            <RotateCcw className="size-3.5" />
          </Button>
        </div>

        {sourceImageUrl && (
          <div className="flex justify-center">
            <img
              src={sourceImageUrl}
              alt="Source"
              className="max-h-32 rounded-lg border border-border/60 object-contain"
            />
          </div>
        )}

        <div className="flex flex-col items-center gap-2 py-4">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="text-sm font-medium text-foreground">
            {t('decomposing')}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('decomposingHint')}
          </p>
        </div>
      </div>
    )
  }

  // Step: error
  if (step === 'error') {
    return (
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              {t('title')}
            </h3>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={handleReset}
          >
            <RotateCcw className="size-3.5" />
          </Button>
        </div>

        <p className="text-sm text-destructive">{error ?? t('error')}</p>
      </div>
    )
  }

  // Step: done — Show layers
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="size-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            {t('title')}
          </h3>
          <span className="text-xs text-muted-foreground">
            {t('layerCount', { count: layerCount })}
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={handleReset}
        >
          <RotateCcw className="size-3.5" />
        </Button>
      </div>

      {/* Layer grid */}
      <div className="grid grid-cols-3 gap-2">
        {layers.map((layer, idx) => (
          <div
            key={idx}
            className="group relative overflow-hidden rounded-lg border border-border/60 bg-muted/20"
          >
            <img
              src={layer.imageUrl}
              alt={layer.name}
              className="aspect-square w-full object-contain"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-4">
              <p className="truncate text-[10px] font-medium text-white">
                {layer.name}
              </p>
            </div>
            {/* Hover actions */}
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                onClick={() =>
                  void downloadRemoteAsset(layer.imageUrl, `${layer.name}.png`)
                }
                className="rounded-full bg-white/20 p-1.5 transition-colors hover:bg-white/40"
                title={t('downloadLayer')}
              >
                <Download className="size-4 text-white" />
              </button>
              {onAddAsReference && (
                <button
                  type="button"
                  onClick={() =>
                    void handleUseAsReference(layer.imageUrl, layer.name)
                  }
                  className="rounded-full bg-white/20 p-1.5 transition-colors hover:bg-white/40"
                  title={t('useAsReference')}
                >
                  <ImagePlus className="size-4 text-white" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {psdUrl && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1 rounded-full text-xs"
            onClick={() => void handleDownloadPsd()}
          >
            <Download className="size-3.5" />
            {t('downloadPsd')}
          </Button>
        )}
      </div>
    </div>
  )
}
