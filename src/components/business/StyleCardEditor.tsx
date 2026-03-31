'use client'

import { useState, useCallback } from 'react'
import { Wand2, Image as ImageIcon, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'
import { AI_MODELS, getAvailableImageModels } from '@/constants/models'
import type {
  StyleCardRecord,
  CreateStyleCardRequest,
  UpdateStyleCardRequest,
  AdvancedParams,
} from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ReferenceImageSection } from '@/components/ui/reference-image-section'
import { useImageUpload } from '@/hooks/use-image-upload'

// ─── Types ──────────────────────────────────────────────────────

type GenerateMode = 'lora' | 'reference'

interface StyleCardEditorProps {
  /** Existing card (edit mode) or undefined (create mode) */
  card?: StyleCardRecord
  onSave: (
    data: CreateStyleCardRequest | UpdateStyleCardRequest,
  ) => Promise<boolean>
  onCancel?: () => void
  isLoading?: boolean
}

// ─── Helpers ────────────────────────────────────────────────────

function detectMode(card?: StyleCardRecord): GenerateMode {
  if (!card?.modelId) return 'lora'
  const model = getAvailableImageModels().find((m) => m.id === card.modelId)
  return model?.supportsLora ? 'lora' : 'reference'
}

// ─── Component ──────────────────────────────────────────────────

/**
 * Unified style card editor supporting both LoRA mode and reference image mode.
 * Replaces the old ModelCard + StyleCard split workflow.
 */
export function StyleCardEditor({
  card,
  onSave,
  onCancel,
  isLoading = false,
}: StyleCardEditorProps) {
  const t = useTranslations('StyleCard')
  const tv2 = useTranslations('StudioV2')

  const [name, setName] = useState(card?.name ?? '')
  const [stylePrompt, setStylePrompt] = useState(card?.stylePrompt ?? '')
  const [mode, setMode] = useState<GenerateMode>(() => detectMode(card))
  const [selectedModelId, setSelectedModelId] = useState<string>(
    card?.modelId ?? '',
  )
  const [advancedParams, setAdvancedParams] = useState<AdvancedParams>(
    card?.advancedParams ?? {},
  )
  const [loraUrl, setLoraUrl] = useState('')
  const [loraScale, setLoraScale] = useState('1.0')
  const imageUpload = useImageUpload()

  // Filtered model lists
  const loraModels = getAvailableImageModels().filter((m) => m.supportsLora)
  const referenceModels = getAvailableImageModels().filter(
    (m) => !m.supportsLora && m.outputType === 'IMAGE',
  )
  const modelList = mode === 'lora' ? loraModels : referenceModels

  const handleModeChange = useCallback((newMode: GenerateMode) => {
    setMode(newMode)
    setSelectedModelId('')
  }, [])

  const handleAddLora = useCallback(() => {
    if (!loraUrl.trim()) return
    const scale = parseFloat(loraScale) || 1.0
    setAdvancedParams((prev) => ({
      ...prev,
      loras: [...(prev.loras ?? []), { url: loraUrl.trim(), scale }],
    }))
    setLoraUrl('')
    setLoraScale('1.0')
  }, [loraUrl, loraScale])

  const handleRemoveLora = useCallback((index: number) => {
    setAdvancedParams((prev) => ({
      ...prev,
      loras: prev.loras?.filter((_, i) => i !== index),
    }))
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!name.trim() || !stylePrompt.trim()) return

    const selectedModel = getAvailableImageModels().find(
      (m) => m.id === selectedModelId,
    )

    const data: CreateStyleCardRequest | UpdateStyleCardRequest = {
      name: name.trim(),
      stylePrompt: stylePrompt.trim(),
      modelId: (selectedModelId as AI_MODELS) || undefined,
      adapterType: selectedModel?.adapterType ?? undefined,
      advancedParams:
        advancedParams && Object.keys(advancedParams).length > 0
          ? advancedParams
          : undefined,
      sourceImageData:
        mode === 'reference' ? imageUpload.referenceImage : undefined,
    }

    await onSave(data)
  }, [
    name,
    stylePrompt,
    selectedModelId,
    advancedParams,
    imageUpload.referenceImage,
    mode,
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

      {/* Mode selector */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-2">
          {t('generateMethod') ?? '生成方式'}
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleModeChange('lora')}
            disabled={isLoading}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors',
              mode === 'lora'
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-border/60 text-muted-foreground hover:bg-muted/30',
            )}
          >
            <Wand2 className="h-3.5 w-3.5" />
            {t('loraMode') ?? 'LoRA 模式'}
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('reference')}
            disabled={isLoading}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors',
              mode === 'reference'
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-border/60 text-muted-foreground hover:bg-muted/30',
            )}
          >
            <ImageIcon className="h-3.5 w-3.5" />
            {t('referenceMode') ?? '参考图模式'}
          </button>
        </div>
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

      {/* Reference image upload (reference mode only) */}
      {mode === 'reference' && (
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            {t('sourceImage')}
          </label>
          <p className="text-2xs text-muted-foreground mb-2">
            {t('sourceImageHint')}
          </p>
          <ReferenceImageSection
            referenceImages={imageUpload.referenceImages}
            maxImages={1}
            isDragging={imageUpload.isDragging}
            fileInputRef={imageUpload.fileInputRef}
            onDrop={imageUpload.handleDrop}
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
      )}

      {/* LoRA list (LoRA mode only) */}
      {mode === 'lora' && (
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            LoRA
          </label>
          <div className="space-y-1 mb-2">
            {(advancedParams.loras ?? []).map((lora, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded bg-muted/30 px-2 py-1 text-xs"
              >
                <span className="flex-1 truncate text-foreground">
                  {lora.url}
                </span>
                <span className="text-muted-foreground">
                  ×{lora.scale ?? 1}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveLora(i)}
                  className="text-muted-foreground hover:text-red-500"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={loraUrl}
              onChange={(e) => setLoraUrl(e.target.value)}
              placeholder="LoRA URL (Civitai / HuggingFace)"
              className="flex-1 text-xs border-border/60 bg-background"
              disabled={isLoading}
            />
            <Input
              value={loraScale}
              onChange={(e) => setLoraScale(e.target.value)}
              placeholder="1.0"
              className="w-16 text-xs border-border/60 bg-background"
              disabled={isLoading}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddLora}
              disabled={isLoading || !loraUrl.trim()}
              className="text-xs border-border/60 hover:border-primary hover:text-primary"
            >
              +
            </Button>
          </div>
        </div>
      )}

      {/* Style prompt */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          {t('prompt')}
        </label>
        <Textarea
          value={stylePrompt}
          onChange={(e) => setStylePrompt(e.target.value)}
          placeholder={
            mode === 'lora'
              ? (t('promptPlaceholderLora') ??
                'anime style, cel shading, vibrant colors...')
              : (t('promptPlaceholder') ?? t('promptPlaceholder'))
          }
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
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            (tv2('save') ?? '保存')
          )}
        </Button>
      </div>
    </div>
  )
}
