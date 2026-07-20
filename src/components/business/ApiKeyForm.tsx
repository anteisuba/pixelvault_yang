'use client'

import { useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Eye,
  EyeOff,
  Plus,
  SlidersHorizontal,
  XCircle,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { ACTIVE_API_KEY_ADAPTER_OPTIONS } from '@/constants/api-keys'
import { getAvailableModels, getModelMessageKey } from '@/constants/models'
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
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { validateKeyFormat } from '@/lib/validate-api-key'

type EntryMode = 'preset' | 'custom'

const DEFAULT_API_KEY_ADAPTER =
  ACTIVE_API_KEY_ADAPTER_OPTIONS[0] ?? AI_ADAPTER_TYPES.OPENAI

interface ApiKeyFormProps {
  onAdd: (data: CreateApiKeyRequest) => Promise<void>
  onCancel: () => void
  isSubmitting: boolean
}

export function ApiKeyForm({ onAdd, onCancel, isSubmitting }: ApiKeyFormProps) {
  const t = useTranslations('StudioApiKeys')
  const tModels = useTranslations('Models')
  const availableModels = getAvailableModels()
  // Narrowed to the API-key-eligible subset (excludes RUNNER, which has no
  // BYOK path) rather than the full AI_ADAPTER_TYPES enum — this form must
  // never be able to submit an adapterType CreateApiKeyRequest doesn't accept.
  const [adapterType, setAdapterType] = useState<
    CreateApiKeyRequest['adapterType']
  >(DEFAULT_API_KEY_ADAPTER)
  const [entryMode, setEntryMode] = useState<EntryMode>('preset')
  const modelsForAdapter = availableModels.filter(
    (model) => model.adapterType === adapterType,
  )
  const firstAdapterModelId = modelsForAdapter[0]?.id ?? ''
  const defaultProviderConfig = getDefaultProviderConfig(adapterType)
  const [presetModelId, setPresetModelId] =
    useState<string>(firstAdapterModelId)
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
  const [showAdvanced, setShowAdvanced] = useState(false)

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

  const handleAdapterChange = (
    nextAdapterType: CreateApiKeyRequest['adapterType'],
  ) => {
    setAdapterType(nextAdapterType)
    const nextProviderConfig = getDefaultProviderConfig(nextAdapterType)
    const nextModels = availableModels.filter(
      (model) => model.adapterType === nextAdapterType,
    )

    setProviderLabel(nextProviderConfig.label)
    setProviderBaseUrl(nextProviderConfig.baseUrl)
    setPresetModelId(nextModels[0]?.id ?? '')
    setEntryMode(nextModels.length > 0 ? 'preset' : 'custom')
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
      className="space-y-4 rounded-2xl border border-border/70 bg-card/80 p-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h3 className="font-display text-base font-medium text-foreground">
            {t('addForm.title')}
          </h3>
          <p className="text-sm leading-5 text-muted-foreground">
            {t('addForm.description')}
          </p>
        </div>
        <a
          href={guide.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/70 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary/60"
        >
          {t('tutorial.goToProvider', {
            provider: t(`providers.${adapterType}.label`),
          })}
          <ExternalLink className="size-3" />
        </a>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">
          {t('addForm.adapterLabel')}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ACTIVE_API_KEY_ADAPTER_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => handleAdapterChange(option)}
              className={cn(
                'rounded-xl border px-3 py-2 text-left text-sm font-medium transition-colors',
                adapterType === option
                  ? 'border-primary/30 bg-primary/10 text-foreground'
                  : 'border-border/70 bg-background/70 text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
              )}
            >
              {t(`providers.${option}.label`)}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border/70 bg-background/60 p-3">
        <div className="mb-3 flex flex-wrap gap-2 rounded-xl bg-secondary/40 p-1">
          {(['preset', 'custom'] as EntryMode[]).map((mode) => {
            const isDisabled =
              mode === 'preset' && modelsForAdapter.length === 0

            return (
              <button
                key={mode}
                type="button"
                disabled={isDisabled}
                onClick={() => setEntryMode(mode)}
                className={cn(
                  'rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                  entryMode === mode
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t(`addForm.modelModes.${mode}.label`)}
              </button>
            )
          })}
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
              onValueChange={setPresetModelId}
            >
              <SelectTrigger
                id="preset-model-select"
                className="h-11 rounded-xl border-border/70 bg-background/80"
              >
                <SelectValue
                  placeholder={t('addForm.presetModelPlaceholder')}
                />
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
              className="h-11 rounded-xl border-border/70 bg-background/80 font-mono"
              required
            />
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
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
            className="h-11 rounded-xl border-border/70 bg-background/80"
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
                'h-11 rounded-xl border-border/70 bg-background/80 pr-11 font-mono',
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

      <div className="rounded-2xl border border-border/70 bg-background/50">
        <button
          type="button"
          onClick={() => setShowAdvanced((value) => !value)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-foreground"
          aria-expanded={showAdvanced}
        >
          <span className="inline-flex items-center gap-2">
            <SlidersHorizontal className="size-4" />
            {t('addForm.advancedToggle')}
          </span>
          <ChevronDown
            className={cn(
              'size-4 text-muted-foreground transition-transform',
              showAdvanced && 'rotate-180',
            )}
          />
        </button>

        {showAdvanced ? (
          <div className="grid gap-3 border-t border-border/70 p-4 sm:grid-cols-2">
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
                className="h-11 rounded-xl border-border/70 bg-background/80"
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
                className="h-11 rounded-xl border-border/70 bg-background/80 font-mono"
                required
              />
              <p className="text-xs leading-5 text-muted-foreground">
                {t('addForm.providerBaseUrlHint')}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          disabled={isSubmitDisabled}
          className="rounded-full px-5"
        >
          {isSubmitting ? (
            <>
              <Spinner size="md" />
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
