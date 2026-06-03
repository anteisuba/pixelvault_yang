'use client'

import { useState, useRef } from 'react'
import { Plus, Trash2, Loader2, Globe, Upload, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'

import type {
  CharacterCardRecord,
  CreateCharacterCardRequest,
  GenerationRecord,
  SourceImageUpload,
} from '@/types'
import { IMAGE_GENERATION } from '@/constants/config'
import { CHARACTER_CARD } from '@/constants/cards/character-card'
import { CARDIFY } from '@/constants/cards/cardify'
import type { SourceImageViewType } from '@/constants/cards/character-card'
import {
  checkImageGenerationStatusAPI,
  generateImageAPI,
} from '@/lib/api-client'
import { CardifyPreview } from '@/components/business/cards/CardifyPreview'

interface CharacterCardCreateFormProps {
  onSubmit: (
    data: CreateCharacterCardRequest,
  ) => Promise<CharacterCardRecord | null>
  onCancel: () => void
  isSubmitting: boolean
  /** If set, form creates a variant under this parent */
  parentId?: string
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function waitForCardifyGeneration(
  jobId: string,
): Promise<GenerationRecord | null> {
  for (
    let attempt = 0;
    attempt < IMAGE_GENERATION.MAX_POLL_ATTEMPTS;
    attempt += 1
  ) {
    const statusResponse = await checkImageGenerationStatusAPI(jobId)
    if (!statusResponse.success || !statusResponse.data) {
      return null
    }

    if (statusResponse.data.status === 'COMPLETED') {
      return statusResponse.data.generation
    }

    if (statusResponse.data.status === 'FAILED') {
      return null
    }

    await delay(IMAGE_GENERATION.POLL_INTERVAL_MS)
  }

  return null
}

export function CharacterCardCreateForm({
  onSubmit,
  onCancel,
  isSubmitting,
  parentId,
}: CharacterCardCreateFormProps) {
  const t = useTranslations('CharacterCard')
  const tView = useTranslations('CharacterCard.viewTypes')
  const tCardify = useTranslations('Cardify')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [variantLabel, setVariantLabel] = useState('')
  const [images, setImages] = useState<SourceImageUpload[]>([])
  const [cardifyEnabled, setCardifyEnabled] = useState(false)
  const [cardifyState, setCardifyState] = useState<{
    originalImage: string
    renderedUrl: string | null
    isRendering: boolean
    error: string | null
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    Array.from(files).forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => {
        setImages((prev) => {
          if (prev.length >= CHARACTER_CARD.MAX_SOURCE_IMAGES) return prev
          return [
            ...prev,
            {
              data: reader.result as string,
              viewType: 'other' as SourceImageViewType,
            },
          ]
        })
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }

  const setViewType = (index: number, viewType: SourceImageViewType) => {
    setImages((prev) =>
      prev.map((img, i) => (i === index ? { ...img, viewType } : img)),
    )
  }

  const renderCardify = async (originalImage: string) => {
    setCardifyState({
      originalImage,
      renderedUrl: null,
      isRendering: true,
      error: null,
    })

    try {
      const result = await generateImageAPI({
        prompt: CARDIFY.PROMPT,
        modelId: CARDIFY.DEFAULT_MODEL_ID,
        aspectRatio: CARDIFY.ASPECT_RATIO,
        referenceImage: originalImage,
      })
      if (!result.success || !result.data) throw new Error('no job')
      const generation = await waitForCardifyGeneration(result.data.jobId)
      if (!generation) throw new Error('no generation')
      setCardifyState({
        originalImage,
        renderedUrl: generation.url,
        isRendering: false,
        error: null,
      })
    } catch {
      setCardifyState((prev) =>
        prev
          ? {
              ...prev,
              isRendering: false,
              error: tCardify('errorRender'),
            }
          : null,
      )
    }
  }

  const submitWithImages = async (finalImages: SourceImageUpload[]) => {
    await onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      sourceImages: finalImages,
      parentId,
      variantLabel: variantLabel.trim() || undefined,
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || images.length === 0) return
    if (cardifyEnabled) {
      await renderCardify(images[0].data)
      return
    }
    await submitWithImages(images)
  }

  const handleAcceptCardify = async () => {
    if (!cardifyState?.renderedUrl) return
    const replacedImages: SourceImageUpload[] = [
      { ...images[0], data: cardifyState.renderedUrl },
      ...images.slice(1),
    ]
    await submitWithImages(replacedImages)
    setCardifyState(null)
  }

  const handleUseOriginal = async () => {
    await submitWithImages(images)
    setCardifyState(null)
  }

  if (cardifyState) {
    return (
      <CardifyPreview
        originalImage={cardifyState.originalImage}
        renderedImage={cardifyState.renderedUrl}
        isRendering={cardifyState.isRendering}
        isSubmitting={isSubmitting}
        error={cardifyState.error}
        onAccept={handleAcceptCardify}
        onRegenerate={() => renderCardify(cardifyState.originalImage)}
        onUseOriginal={handleUseOriginal}
        onCancel={() => setCardifyState(null)}
      />
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-border/60 bg-background/50 p-4"
    >
      <div>
        <label className="mb-1 block text-sm font-medium">{t('name')}</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('namePlaceholder')}
          maxLength={CHARACTER_CARD.NAME_MAX_LENGTH}
          className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm focus:border-primary/40 focus:outline-none"
          required
        />
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <Globe className="size-3 shrink-0" />
          {t('nameSearchHint')}
        </p>
      </div>

      {parentId && (
        <div>
          <label className="mb-1 block text-sm font-medium">
            {t('variantLabel')}
          </label>
          <input
            type="text"
            value={variantLabel}
            onChange={(e) => setVariantLabel(e.target.value)}
            placeholder={t('variantLabelPlaceholder')}
            maxLength={CHARACTER_CARD.VARIANT_LABEL_MAX_LENGTH}
            className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm focus:border-primary/40 focus:outline-none"
          />
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium">
          {t('descriptionLabel')}
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('descriptionPlaceholder')}
          maxLength={CHARACTER_CARD.DESCRIPTION_MAX_LENGTH}
          rows={2}
          className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm focus:border-primary/40 focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">
          {t('sourceImage')}
        </label>
        <p className="mb-2 text-xs text-muted-foreground">
          {t('sourceImageHint')} ({images.length}/
          {CHARACTER_CARD.MAX_SOURCE_IMAGES})
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />
        <div className="flex flex-wrap gap-2">
          {images.map((img, i) => (
            <div key={i} className="relative inline-block">
              <Image
                src={img.data}
                alt={`Source ${i + 1}`}
                width={96}
                height={96}
                className="rounded-md border border-border/60 object-cover"
                unoptimized
                style={{ width: 96, height: 96 }}
              />
              <select
                value={img.viewType}
                onChange={(e) =>
                  setViewType(i, e.target.value as SourceImageViewType)
                }
                className="absolute bottom-0 left-0 right-0 rounded-b-md border-t border-border/60 bg-background/90 px-1 py-0.5 text-[10px] backdrop-blur-sm focus:outline-none"
              >
                {CHARACTER_CARD.VIEW_TYPES.map((vt) => (
                  <option key={vt} value={vt}>
                    {tView(vt)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removeImage(i)}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-destructive-foreground shadow-sm"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          ))}
          {images.length < CHARACTER_CARD.MAX_SOURCE_IMAGES && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex size-24 items-center justify-center rounded-md border border-dashed border-border/60 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <Upload className="size-5" />
            </button>
          )}
        </div>
      </div>

      {images.length > 0 && (
        <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border/60 bg-muted/20 p-3">
          <input
            type="checkbox"
            checked={cardifyEnabled}
            onChange={(e) => setCardifyEnabled(e.target.checked)}
            className="mt-0.5 size-4 accent-primary"
          />
          <div className="flex-1">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <Sparkles className="size-3.5 text-primary" />
              {tCardify('toggleLabel')}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {tCardify('toggleHint')}
            </p>
          </div>
        </label>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!name.trim() || images.length === 0 || isSubmitting}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t('creatingWithSearch')}
            </>
          ) : (
            <>
              <Plus className="size-4" />
              {parentId ? t('addVariant') : t('createNew')}
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border/60 px-4 py-2 text-sm transition-colors hover:bg-muted"
        >
          {t('cancel')}
        </button>
      </div>
    </form>
  )
}
