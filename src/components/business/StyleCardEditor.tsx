'use client'

import { useState, useCallback } from 'react'
import { Wand2, Image as ImageIcon, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'
import { AI_MODELS, getAvailableImageModels } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type {
  StyleCardRecord,
  CreateStyleCardRequest,
  UpdateStyleCardRequest,
  AdvancedParams,
} from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

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
    }

    await onSave(data)
  }, [name, stylePrompt, selectedModelId, advancedParams, onSave])

  return (
    <div className="space-y-4">
      {/* Name */}
      <div>
        <label className="block text-xs font-medium text-[#7a7872] mb-1">
          {t('name') ?? '名称'}
        </label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('namePlaceholder') ?? '画风卡名称'}
          disabled={isLoading}
          className="border-[#e8e4dc] bg-[#faf9f5]"
        />
      </div>

      {/* Mode selector */}
      <div>
        <label className="block text-xs font-medium text-[#7a7872] mb-2">
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
                ? 'border-[#d97757] bg-[#fdf1ec] text-[#d97757]'
                : 'border-[#e8e4dc] text-[#7a7872] hover:bg-[#f0ede6]',
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
                ? 'border-[#d97757] bg-[#fdf1ec] text-[#d97757]'
                : 'border-[#e8e4dc] text-[#7a7872] hover:bg-[#f0ede6]',
            )}
          >
            <ImageIcon className="h-3.5 w-3.5" />
            {t('referenceMode') ?? '参考图模式'}
          </button>
        </div>
      </div>

      {/* Model selector */}
      <div>
        <label className="block text-xs font-medium text-[#7a7872] mb-1">
          {t('selectModel') ?? '选择模型'}
        </label>
        <select
          value={selectedModelId}
          onChange={(e) => setSelectedModelId(e.target.value)}
          disabled={isLoading}
          className="w-full rounded-lg border border-[#e8e4dc] bg-[#faf9f5] px-3 py-2 text-sm text-[#141413] focus:outline-none focus:border-[#d97757]"
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

      {/* LoRA list (LoRA mode only) */}
      {mode === 'lora' && (
        <div>
          <label className="block text-xs font-medium text-[#7a7872] mb-1">
            LoRA
          </label>
          <div className="space-y-1 mb-2">
            {(advancedParams.loras ?? []).map((lora, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded bg-[#f0ede6] px-2 py-1 text-xs"
              >
                <span className="flex-1 truncate text-[#141413]">
                  {lora.url}
                </span>
                <span className="text-[#7a7872]">×{lora.scale ?? 1}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveLora(i)}
                  className="text-[#7a7872] hover:text-red-500"
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
              className="flex-1 text-xs border-[#e8e4dc] bg-[#faf9f5]"
              disabled={isLoading}
            />
            <Input
              value={loraScale}
              onChange={(e) => setLoraScale(e.target.value)}
              placeholder="1.0"
              className="w-16 text-xs border-[#e8e4dc] bg-[#faf9f5]"
              disabled={isLoading}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddLora}
              disabled={isLoading || !loraUrl.trim()}
              className="text-xs border-[#e8e4dc] hover:border-[#d97757] hover:text-[#d97757]"
            >
              +
            </Button>
          </div>
        </div>
      )}

      {/* Style prompt */}
      <div>
        <label className="block text-xs font-medium text-[#7a7872] mb-1">
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
          className="resize-none border-[#e8e4dc] bg-[#faf9f5] text-sm"
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
            className="border-[#e8e4dc] text-[#7a7872]"
          >
            {tv2('cancel') ?? '取消'}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          onClick={handleSubmit}
          disabled={isLoading || !name.trim() || !stylePrompt.trim()}
          className="bg-[#d97757] hover:bg-[#c96645] text-white"
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
