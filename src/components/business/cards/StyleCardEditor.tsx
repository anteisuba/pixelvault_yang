'use client'

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'

import {
  AI_MODELS,
  getAvailableImageModels,
  IMAGE_KIND,
} from '@/constants/models'
import type {
  StyleCardRecord,
  CreateStyleCardRequest,
  UpdateStyleCardRequest,
} from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { ReferenceImageSection } from '@/components/ui/reference-image-section'
import { useImageUpload } from '@/hooks/use-image-upload'

// ─── Types ──────────────────────────────────────────────────────

interface StyleCardEditorProps {
  /** Existing card (edit mode) or undefined (create mode) */
  card?: StyleCardRecord
  onSave: (
    data: CreateStyleCardRequest | UpdateStyleCardRequest,
  ) => Promise<boolean>
  onCancel?: () => void
  isLoading?: boolean
}

// ─── Component ──────────────────────────────────────────────────

/**
 * Style card editor: a generation model plus an optional style reference
 * image. LoRA mounting lives in the LoRA workbench, not on cards (owner
 * 2026-09-11) — a card saved earlier on a LoRA base shows no model here until
 * the user picks one.
 */
export function StyleCardEditor({
  card,
  onSave,
  onCancel,
  isLoading = false,
}: StyleCardEditorProps) {
  const t = useTranslations('StyleCard')
  const tv2 = useTranslations('StudioV2')

  const modelList = getAvailableImageModels(IMAGE_KIND.GENERATE)

  const [name, setName] = useState(card?.name ?? '')
  const [stylePrompt, setStylePrompt] = useState(card?.stylePrompt ?? '')
  const [selectedModelId, setSelectedModelId] = useState<string>(() =>
    modelList.some((m) => m.id === card?.modelId) ? (card?.modelId ?? '') : '',
  )
  const imageUpload = useImageUpload()

  const handleSubmit = useCallback(async () => {
    if (!name.trim() || !stylePrompt.trim()) return

    const selectedModel = modelList.find((m) => m.id === selectedModelId)

    const data: CreateStyleCardRequest | UpdateStyleCardRequest = {
      name: name.trim(),
      stylePrompt: stylePrompt.trim(),
      modelId: (selectedModelId as AI_MODELS) || undefined,
      adapterType: selectedModel?.adapterType ?? undefined,
      sourceImageData: imageUpload.referenceImage,
    }

    await onSave(data)
  }, [
    name,
    stylePrompt,
    selectedModelId,
    modelList,
    imageUpload.referenceImage,
    onSave,
  ])

  return (
    <div className="space-y-4">
      {/* Name */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          {t('name') ?? '名称'}
        </label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('namePlaceholder') ?? '画风卡名称'}
          disabled={isLoading}
          className="border-border/60 bg-background"
        />
      </div>

      {/* Model selector */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          {t('selectModel') ?? '选择模型'}
        </label>
        <select
          value={selectedModelId}
          onChange={(e) => setSelectedModelId(e.target.value)}
          disabled={isLoading}
          className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
        >
          <option value="">
            {t('selectModelPlaceholder') ?? '— 不指定模型 —'}
          </option>
          {modelList.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id}
            </option>
          ))}
        </select>
      </div>

      {/* Style reference image */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          {t('sourceImage')}
        </label>
        <p className="text-2xs text-muted-foreground mb-2">
          {t('sourceImageHint')}
        </p>
        <ReferenceImageSection
          entries={imageUpload.referenceEntries}
          maxImages={1}
          isDragging={imageUpload.isDragging}
          fileInputRef={imageUpload.fileInputRef}
          onDrop={imageUpload.handleDrop}
          onDragEnter={imageUpload.handleDragEnter}
          onDragOver={imageUpload.handleDragOver}
          onDragLeave={imageUpload.handleDragLeave}
          onOpenFilePicker={imageUpload.openFilePicker}
          onInputChange={imageUpload.handleInputChange}
          onRemoveImage={imageUpload.removeReferenceImage}
          onClearAll={imageUpload.clearAllImages}
          previewAlt={t('sourceImage')}
          removeLabel={tv2('cancel')}
          uploadLabel={t('sourceImage')}
          formatsLabel="JPG · PNG · WEBP"
        />
      </div>

      {/* Style prompt */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          {t('prompt')}
        </label>
        <Textarea
          value={stylePrompt}
          onChange={(e) => setStylePrompt(e.target.value)}
          placeholder={t('promptPlaceholder')}
          rows={3}
          disabled={isLoading}
          className="resize-none border-border/60 bg-background text-sm"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 justify-end pt-2">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isLoading}
            className="border-border/60 text-muted-foreground"
          >
            {tv2('cancel') ?? '取消'}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          onClick={handleSubmit}
          disabled={isLoading || !name.trim() || !stylePrompt.trim()}
          className="bg-primary hover:bg-primary/90 text-white"
        >
          {isLoading ? <Spinner size="sm" /> : (tv2('save') ?? '保存')}
        </Button>
      </div>
    </div>
  )
}
