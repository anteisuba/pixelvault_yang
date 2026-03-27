'use client'

import { useState } from 'react'
import {
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  XCircle,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { API_KEY_ADAPTER_OPTIONS } from '@/constants/api-keys'
import {
  AI_MODELS,
  getAvailableModels,
  getModelMessageKey,
} from '@/constants/models'
import {
  ADAPTER_KEY_HINTS,
  AI_ADAPTER_TYPES,
  getAdapterApiGuide,
  getAdapterCustomModelExample,
  getAdapterKeyHint,
  getDefaultProviderConfig,
} from '@/constants/providers'
import type { CreateApiKeyRequest } from '@/types'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

type EntryMode = 'preset' | 'custom'

interface ApiKeyFormProps {
  onAdd: (data: CreateApiKeyRequest) => Promise<void>
  onCancel: () => void
  isSubmitting: boolean
}

/** Validate API key format based on adapter type prefix patterns */
function validateKeyFormat(
  adapterType: AI_ADAPTER_TYPES,
  key: string,
): 'valid' | 'invalid' | 'empty' {
  const trimmed = key.trim()
  if (!trimmed) return 'empty'

  switch (adapterType) {
    case AI_ADAPTER_TYPES.HUGGINGFACE:
      return trimmed.startsWith('hf_') ? 'valid' : 'invalid'
    case AI_ADAPTER_TYPES.GEMINI:
      return trimmed.startsWith('AIza') ? 'valid' : 'invalid'
    case AI_ADAPTER_TYPES.OPENAI:
      return trimmed.startsWith('sk-') ? 'valid' : 'invalid'
    case AI_ADAPTER_TYPES.FAL:
      return trimmed.length > 10 ? 'valid' : 'invalid'
    case AI_ADAPTER_TYPES.REPLICATE:
      return trimmed.startsWith('r8_') ? 'valid' : 'invalid'
    case AI_ADAPTER_TYPES.NOVELAI:
      // NovelAI persistent API tokens start with "pst-" or are JWT-like (eyJhbGci...)
      return trimmed.startsWith('pst-') || trimmed.startsWith('eyJhbGci')
        ? 'valid'
        : 'invalid'
    case AI_ADAPTER_TYPES.VOLCENGINE:
      // VolcEngine ARK API keys — Bearer token format
      return trimmed.length > 10 ? 'valid' : 'invalid'
  }
}

export function ApiKeyForm({ onAdd, onCancel, isSubmitting }: ApiKeyFormProps) {
  const t = useTranslations('StudioApiKeys')
  const tModels = useTranslations('Models')
  const availableModels = getAvailableModels()
  const [adapterType, setAdapterType] = useState<AI_ADAPTER_TYPES>(
    AI_ADAPTER_TYPES.HUGGINGFACE,
  )
  const [entryMode, setEntryMode] = useState<EntryMode>('preset')
  const modelsForAdapter = availableModels.filter(
    (model) => model.adapterType === adapterType,
  )
  const firstAdapterModelId = modelsForAdapter[0]?.id ?? AI_MODELS.SDXL
  const defaultProviderConfig = getDefaultProviderConfig(adapterType)
  const [presetModelId, setPresetModelId] =
    useState<AI_MODELS>(firstAdapterModelId)
  const [customModelId, setCustomModelId] = useState('')
  const [providerLabel, setProviderLabel] = useState(
    defaultProviderConfig.label,
  )
  const [providerBaseUrl, setProviderBaseUrl] = useState(
    defaultProviderConfig.baseUrl,
  )
  const [label, setLabel] = useState('')
  const [keyValue, setKeyValue] = useState('')
  const [showKey, setShowKey] = useState(false)

  const resolvedPresetModelId = modelsForAdapter.some(
    (model) => model.id === presetModelId,
  )
    ? presetModelId
    : firstAdapterModelId

  const resolvedModelId =
    entryMode === 'preset' ? resolvedPresetModelId : customModelId.trim()
  const resolvedProviderLabel =
    providerLabel.trim() || defaultProviderConfig.label
  const resolvedProviderBaseUrl =
    providerBaseUrl.trim() || defaultProviderConfig.baseUrl

  const keyValidation = validateKeyFormat(adapterType, keyValue)

  const isSubmitDisabled =
    isSubmitting ||
    !resolvedModelId ||
    !resolvedProviderLabel ||
    !resolvedProviderBaseUrl ||
    !label.trim() ||
    !keyValue.trim()

  const handleAdapterChange = (nextAdapterType: AI_ADAPTER_TYPES) => {
    setAdapterType(nextAdapterType)
    const nextProviderConfig = getDefaultProviderConfig(nextAdapterType)
    const nextModels = availableModels.filter(
      (model) => model.adapterType === nextAdapterType,
    )

    setProviderLabel(nextProviderConfig.label)
    setProviderBaseUrl(nextProviderConfig.baseUrl)
    setPresetModelId(nextModels[0]?.id ?? AI_MODELS.SDXL)
    setKeyValue('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitDisabled) return

    await onAdd({
      adapterType,
      providerConfig: {
        label: resolvedProviderLabel,
        baseUrl: resolvedProviderBaseUrl,
      },
      modelId: resolvedModelId,
      label: label.trim(),
      keyValue: keyValue.trim(),
    })
  }

  const guide = getAdapterApiGuide(adapterType)

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-3xl border border-border/70 bg-card/84 p-5"
    >
      <div className="space-y-1">
        <h3 className="font-display text-base font-medium text-foreground">
          {t('addForm.title')}
        </h3>
        <p className="font-serif text-sm leading-6 text-muted-foreground">
          {t('addForm.description')}
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">
          {t('addForm.adapterLabel')}
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {API_KEY_ADAPTER_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => handleAdapterChange(option)}
              className={cn(
                'rounded-2xl border px-4 py-3 text-left transition-colors',
                adapterType === option
                  ? 'border-primary/25 bg-primary/6'
                  : 'border-border/70 bg-background/72 hover:bg-secondary/24',
              )}
            >
              <p className="font-medium text-foreground">
                {t(`providers.${option}.label`)}
              </p>
              <p className="mt-1 font-serif text-xs leading-5 text-muted-foreground">
                {t(`providers.${option}.description`)}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* ── Provider tutorial card ─────────────────────────────── */}
      <div className="rounded-2xl border border-primary/15 bg-primary/4 p-4">
        <p className="mb-2 text-sm font-semibold text-foreground">
          {t('tutorial.title', {
            provider: t(`providers.${adapterType}.label`),
          })}
        </p>
        <ol className="mb-3 list-inside list-decimal space-y-1 font-serif text-sm leading-6 text-muted-foreground">
          {guide.steps.split('→').map((step, i) => (
            <li key={i}>{step.trim()}</li>
          ))}
        </ol>
        <a
          href={guide.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          {t('tutorial.goToProvider', {
            provider: t(`providers.${adapterType}.label`),
          })}
          <ExternalLink className="size-3" />
        </a>
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="space-y-2">
          <label
            htmlFor="provider-label"
            className="text-sm font-medium text-foreground"
          >
            {t('addForm.providerNameLabel')}
          </label>
          <Input
            id="provider-label"
            value={providerLabel}
            onChange={(e) => setProviderLabel(e.target.value)}
            placeholder={defaultProviderConfig.label}
            maxLength={60}
            className="h-11 rounded-2xl border-border/70 bg-background/80"
            required
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="provider-base-url"
            className="text-sm font-medium text-foreground"
          >
            {t('addForm.providerBaseUrlLabel')}
          </label>
          <Input
            id="provider-base-url"
            type="url"
            value={providerBaseUrl}
            onChange={(e) => setProviderBaseUrl(e.target.value)}
            placeholder={defaultProviderConfig.baseUrl}
            className="h-11 rounded-2xl border-border/70 bg-background/80 font-mono"
            required
          />
          <p className="text-xs leading-5 text-muted-foreground">
            {t('addForm.providerBaseUrlHint')}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">
          {t('addForm.modelModeLabel')}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(['preset', 'custom'] as EntryMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setEntryMode(mode)}
              className={cn(
                'rounded-2xl border px-4 py-3 text-left transition-colors',
                entryMode === mode
                  ? 'border-primary/25 bg-primary/6'
                  : 'border-border/70 bg-background/72 hover:bg-secondary/24',
              )}
            >
              <p className="font-medium text-foreground">
                {t(`addForm.modelModes.${mode}.label`)}
              </p>
              <p className="mt-1 font-serif text-xs leading-5 text-muted-foreground">
                {t(`addForm.modelModes.${mode}.description`)}
              </p>
            </button>
          ))}
        </div>
      </div>

      {entryMode === 'preset' ? (
        <div className="space-y-2">
          <label
            htmlFor="preset-model-select"
            className="text-sm font-medium text-foreground"
          >
            {t('addForm.presetModelLabel')}
          </label>
          <Select
            name="presetModelId"
            value={resolvedPresetModelId}
            onValueChange={(value) => setPresetModelId(value as AI_MODELS)}
          >
            <SelectTrigger
              id="preset-model-select"
              className="h-11 rounded-2xl border-border/70 bg-background/80"
            >
              <SelectValue placeholder={t('addForm.presetModelPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {modelsForAdapter.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {tModels(`${getModelMessageKey(model.id)}.label`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="space-y-2">
          <label
            htmlFor="custom-model-id"
            className="text-sm font-medium text-foreground"
          >
            {t('addForm.customModelLabel')}
          </label>
          <Input
            id="custom-model-id"
            value={customModelId}
            onChange={(e) => setCustomModelId(e.target.value)}
            placeholder={getAdapterCustomModelExample(adapterType)}
            className="h-11 rounded-2xl border-border/70 bg-background/80 font-mono"
            required
          />
          <p className="text-xs text-muted-foreground">
            {t('addForm.customModelHint', {
              provider: resolvedProviderLabel,
            })}
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label
            htmlFor="api-key-label"
            className="text-sm font-medium text-foreground"
          >
            {t('addForm.labelLabel')}
          </label>
          <Input
            id="api-key-label"
            placeholder={t('addForm.labelPlaceholder')}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={50}
            className="h-11 rounded-2xl border-border/70 bg-background/80"
            required
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="api-key-value"
            className="text-sm font-medium text-foreground"
          >
            {t('addForm.keyLabel')}
          </label>
          <div className="relative">
            <Input
              id="api-key-value"
              type={showKey ? 'text' : 'password'}
              placeholder={getAdapterKeyHint(adapterType)}
              value={keyValue}
              onChange={(e) => setKeyValue(e.target.value)}
              className={cn(
                'h-11 rounded-2xl border-border/70 bg-background/80 pr-11 font-mono',
                keyValidation === 'valid' &&
                  'border-chart-3/50 ring-1 ring-chart-3/20',
                keyValidation === 'invalid' &&
                  'border-destructive/50 ring-1 ring-destructive/20',
              )}
              required
            />
            <button
              type="button"
              onClick={() => setShowKey((value) => !value)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={showKey ? t('addForm.hideKey') : t('addForm.showKey')}
            >
              {showKey ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
          {/* Instant validation feedback */}
          {keyValidation === 'valid' && (
            <p className="flex items-center gap-1 text-xs text-chart-3">
              <CheckCircle2 className="size-3" />
              {t('addForm.keyFormatValid')}
            </p>
          )}
          {keyValidation === 'invalid' && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <XCircle className="size-3" />
              {t('addForm.keyFormatInvalid', {
                hint: ADAPTER_KEY_HINTS[adapterType],
              })}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          disabled={isSubmitDisabled}
          className="rounded-full px-5"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t('addForm.savingAction')}
            </>
          ) : (
            <>
              <Plus className="size-4" />
              {t('addForm.saveAction')}
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          className="rounded-full px-5"
        >
          {t('addForm.cancelAction')}
        </Button>
      </div>
    </form>
  )
}
