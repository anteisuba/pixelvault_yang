'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Swords } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  API_USAGE,
  DEFAULT_ASPECT_RATIO,
  IMAGE_SIZES,
  type AspectRatio,
} from '@/constants/config'
import { getModelById, isBuiltInModel, MODEL_OPTIONS } from '@/constants/models'
import {
  hasCapability,
  getMaxReferenceImages,
} from '@/constants/provider-capabilities'
import { getProviderLabel } from '@/constants/providers'
import type {
  AdvancedParams,
  ApiKeyHealthStatus,
  ArenaModelSelection,
  UserApiKeyRecord,
} from '@/types'

import dynamic from 'next/dynamic'

import type { StudioModelOption } from '@/components/business/ModelSelector'

const CapabilityForm = dynamic(() =>
  import('@/components/business/CapabilityForm').then(
    (mod) => mod.CapabilityForm,
  ),
)
const ReverseEngineerPanel = dynamic(() =>
  import('@/components/business/ReverseEngineerPanel').then(
    (mod) => mod.ReverseEngineerPanel,
  ),
)
import { AspectRatioSelector } from '@/components/ui/aspect-ratio-selector'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CollapsiblePanel } from '@/components/ui/collapsible-panel'
import { ReferenceImageSection } from '@/components/ui/reference-image-section'
import { Textarea } from '@/components/ui/textarea'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import type { StartBattleInput } from '@/hooks/use-arena'
import { useImageUpload } from '@/hooks/use-image-upload'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { cn } from '@/lib/utils'

interface ArenaFormProps {
  isCreating: boolean
  onBattle: (input: StartBattleInput) => void
}

/** Status: green = key ready, yellow = no key, red = unavailable */
type ModelKeyStatus = 'ready' | 'nokey' | 'unavailable'

interface ArenaModelOption extends StudioModelOption {
  available: boolean
  keyStatus: ModelKeyStatus
}

function healthToKeyStatus(
  health: ApiKeyHealthStatus | undefined,
): ModelKeyStatus {
  if (!health) return 'nokey'
  if (health === 'available') return 'ready'
  if (health === 'no_key') return 'nokey'
  return 'unavailable'
}

function buildModelOptions(
  apiKeys: UserApiKeyRecord[],
  healthMap: Record<string, ApiKeyHealthStatus>,
): ArenaModelOption[] {
  const activeApiKeys = apiKeys.filter((key) => key.isActive)

  // Build a map: adapterType -> best health status among active keys
  const adapterBestStatus = new Map<string, ModelKeyStatus>()
  for (const key of activeApiKeys) {
    const status = healthToKeyStatus(healthMap[key.id])
    const current = adapterBestStatus.get(key.adapterType)
    // Priority: ready > nokey > unavailable
    if (
      !current ||
      status === 'ready' ||
      (status === 'nokey' && current === 'unavailable')
    ) {
      adapterBestStatus.set(key.adapterType, status)
    }
  }

  // Only image models for arena
  const imageModels = MODEL_OPTIONS.filter((m) => m.outputType === 'IMAGE')

  const builtInOptions: ArenaModelOption[] = imageModels.map((model) => {
    let keyStatus: ModelKeyStatus = 'nokey'
    if (!model.available) {
      keyStatus = 'unavailable'
    } else if (adapterBestStatus.has(model.adapterType)) {
      keyStatus = adapterBestStatus.get(model.adapterType)!
    }

    return {
      optionId: `workspace:${model.id}`,
      modelId: model.id,
      adapterType: model.adapterType,
      providerConfig: model.providerConfig,
      requestCount: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
      isBuiltIn: true,
      sourceType: 'workspace' as const,
      available: model.available,
      keyStatus,
    }
  })

  // Only include saved keys for image models in arena
  const imageApiKeys = activeApiKeys.filter((key) => {
    const model = getModelById(key.modelId)
    return !model || model.outputType === 'IMAGE'
  })

  const savedOptions: ArenaModelOption[] = imageApiKeys.map((key) => ({
    optionId: `key:${key.id}`,
    modelId: key.modelId,
    adapterType: key.adapterType as StudioModelOption['adapterType'],
    providerConfig: key.providerConfig as StudioModelOption['providerConfig'],
    requestCount: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
    isBuiltIn: isBuiltInModel(key.modelId),
    sourceType: 'saved' as const,
    keyId: key.id,
    keyLabel: key.label,
    maskedKey: key.maskedKey,
    available: true,
    keyStatus: healthToKeyStatus(healthMap[key.id]),
  }))

  // Sort: ready first, then nokey, then unavailable
  const STATUS_SORT_ORDER: Record<ModelKeyStatus, number> = {
    ready: 0,
    nokey: 1,
    unavailable: 2,
  }
  const all = [...builtInOptions, ...savedOptions]
  all.sort(
    (a, b) => STATUS_SORT_ORDER[a.keyStatus] - STATUS_SORT_ORDER[b.keyStatus],
  )
  return all
}

const STATUS_DOT_CLASSES: Record<ModelKeyStatus, string> = {
  ready: 'bg-emerald-500',
  nokey: 'bg-amber-400',
  unavailable: 'bg-red-500',
}

export function ArenaForm({ isCreating, onBattle }: ArenaFormProps) {
  const t = useTranslations('ArenaPage')
  const tModels = useTranslations('Models')
  const { keys: apiKeys, healthMap, verify } = useApiKeysContext()

  // Auto-verify active keys on mount
  useEffect(() => {
    const activeKeys = apiKeys.filter((k) => k.isActive)
    for (const key of activeKeys) {
      if (!healthMap[key.id]) {
        void verify(key.id)
      }
    }
  }, [apiKeys, healthMap, verify])

  const [prompt, setPrompt] = useState('')
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false)
  const [aspectRatio, setAspectRatio] =
    useState<AspectRatio>(DEFAULT_ASPECT_RATIO)
  const [selectedOptionIds, setSelectedOptionIds] = useState<Set<string>>(
    () => new Set(),
  )

  const modelOptions = useMemo(
    () => buildModelOptions(apiKeys, healthMap),
    [apiKeys, healthMap],
  )

  // Filter out not-ready models from selection (derived state, no useEffect needed)
  const readyOptionIds = useMemo(() => {
    const readyIds = new Set(
      modelOptions
        .filter((opt) => opt.keyStatus === 'ready')
        .map((opt) => opt.optionId),
    )
    const filtered = new Set<string>()
    for (const id of selectedOptionIds) {
      if (readyIds.has(id)) {
        filtered.add(id)
      }
    }
    return filtered
  }, [modelOptions, selectedOptionIds])

  const [advancedParams, setAdvancedParams] = useState<AdvancedParams>({})
  const {
    referenceImage,
    referenceImages,
    removeReferenceImage,
    clearAllImages,
    isDragging,
    fileInputRef,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    openFilePicker,
    handleInputChange,
  } = useImageUpload()

  // Use the minimum maxReferenceImages across all selected models
  const arenaMaxRefImages = useMemo(() => {
    const selectedAdapters = modelOptions
      .filter((opt) => readyOptionIds.has(opt.optionId))
      .map((opt) => opt.adapterType)
    if (selectedAdapters.length === 0) return 1
    return Math.min(...selectedAdapters.map((a) => getMaxReferenceImages(a)))
  }, [modelOptions, readyOptionIds])

  const toggleModel = useCallback((optionId: string) => {
    setSelectedOptionIds((prev) => {
      const next = new Set(prev)
      if (next.has(optionId)) {
        next.delete(optionId)
      } else {
        next.add(optionId)
      }
      return next
    })
  }, [])

  const selectedModels: ArenaModelSelection[] = modelOptions
    .filter((opt) => readyOptionIds.has(opt.optionId))
    .map((opt) => ({
      modelId: opt.modelId,
      apiKeyId: opt.keyId,
    }))

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      setHasAttemptedSubmit(true)
      if (!prompt.trim() || selectedModels.length < 2) return
      const hasAdvanced = Object.values(advancedParams).some(
        (v) => v !== undefined,
      )
      onBattle({
        prompt,
        aspectRatio,
        models: selectedModels,
        referenceImage,
        advancedParams: hasAdvanced ? advancedParams : undefined,
      })
    },
    [
      prompt,
      selectedModels,
      advancedParams,
      onBattle,
      aspectRatio,
      referenceImage,
    ],
  )

  const canBattle = prompt.trim().length > 0 && selectedModels.length >= 2

  const aspectRatioOptions = (Object.keys(IMAGE_SIZES) as AspectRatio[]).map(
    (ratio) => ({
      value: ratio,
      label: IMAGE_SIZES[ratio].label,
    }),
  )

  return (
    <form onSubmit={handleSubmit} aria-label={t('title')} className="space-y-6">
      {/* Model Selection */}
      <CollapsiblePanel
        title={t('modelSelectLabel')}
        description={t('modelSelectCount', { count: selectedModels.length })}
        badge={
          selectedModels.length < 2 ? (
            hasAttemptedSubmit ? (
              <Badge
                variant="destructive"
                className="rounded-full px-2 py-0 text-2xs"
              >
                {t('modelSelectMinimum')}
              </Badge>
            ) : (
              <span className="text-xs text-muted-foreground">
                {t('modelSelectMinimum')}
              </span>
            )
          ) : undefined
        }
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {modelOptions.map((option) => {
            const isSelected = readyOptionIds.has(option.optionId)
            const label = getTranslatedModelLabel(tModels, option.modelId)
            const provider = getProviderLabel(option.providerConfig)

            return (
              <button
                key={option.optionId}
                type="button"
                onClick={() => toggleModel(option.optionId)}
                disabled={isCreating || option.keyStatus !== 'ready'}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all',
                  option.keyStatus !== 'ready' &&
                    'cursor-not-allowed opacity-50',
                  isSelected
                    ? 'border-primary/60 bg-primary/5 ring-1 ring-primary/20'
                    : 'border-border/75 bg-background/72 hover:border-border',
                )}
              >
                {/* Checkbox */}
                <div
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors',
                    isSelected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-muted-foreground/40',
                  )}
                >
                  {isSelected && (
                    <svg
                      className="size-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </div>

                {/* Model info */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {label}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {provider}
                  </p>
                </div>

                {/* Status dot + badge */}
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={cn(
                      'size-2.5 rounded-full',
                      STATUS_DOT_CLASSES[option.keyStatus],
                    )}
                    title={t(`keyStatus.${option.keyStatus}`)}
                  />
                  <Badge
                    variant={
                      option.sourceType === 'saved' ? 'secondary' : 'outline'
                    }
                    className="rounded-full px-2 py-0 text-2xs"
                  >
                    {option.sourceType === 'saved'
                      ? t('modelBadgeSaved')
                      : t('modelBadgeWorkspace')}
                  </Badge>
                </div>
              </button>
            )
          })}
        </div>
      </CollapsiblePanel>

      {/* Aspect Ratio */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-foreground">
          {t('aspectRatioLabel')}
        </label>
        <AspectRatioSelector
          options={aspectRatioOptions}
          value={aspectRatio}
          onChange={(v) => setAspectRatio(v as AspectRatio)}
          disabled={isCreating}
        />
      </div>

      {/* Prompt */}
      <div className="space-y-2">
        <label
          htmlFor="arena-prompt"
          className="text-sm font-semibold text-foreground"
        >
          {t('promptLabel')}
        </label>
        <Textarea
          id="arena-prompt"
          placeholder={t('promptPlaceholder')}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          disabled={isCreating}
          className="resize-none rounded-2xl border-border/75 bg-background/72 px-4 py-3 font-serif"
        />
      </div>

      {/* Reference Image */}
      <CollapsiblePanel
        title={t('referenceTitle')}
        description={
          referenceImages.length > 0
            ? t('referenceSelected')
            : t('referenceIdle')
        }
        badge={
          referenceImages.length > 0 ? (
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              {t('referenceBadge')}
            </Badge>
          ) : undefined
        }
      >
        <ReferenceImageSection
          referenceImages={referenceImages}
          maxImages={arenaMaxRefImages}
          isDragging={isDragging}
          fileInputRef={fileInputRef}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onOpenFilePicker={openFilePicker}
          onInputChange={handleInputChange}
          onRemoveImage={removeReferenceImage}
          onClearAll={clearAllImages}
          previewAlt={t('referencePreviewAlt')}
          removeLabel={t('referenceRemoveLabel')}
          uploadLabel={t('referenceUpload')}
          formatsLabel={t('referenceFormats')}
          counterLabel={t('referenceCounter', {
            current: referenceImages.length,
            max: arenaMaxRefImages,
          })}
        />
      </CollapsiblePanel>

      {/* Advanced Settings — use the first selected model's adapter type */}
      {(() => {
        const firstSelected = modelOptions.find((opt) =>
          readyOptionIds.has(opt.optionId),
        )
        if (!firstSelected) return null
        return (
          <CapabilityForm
            adapterType={firstSelected.adapterType}
            params={advancedParams}
            onChange={setAdvancedParams}
            hasReferenceImage={referenceImages.length > 0}
            disabled={isCreating}
          />
        )
      })()}

      {/* Reverse Engineer — hidden when no selected model supports image analysis */}
      {modelOptions.some(
        (opt) =>
          readyOptionIds.has(opt.optionId) &&
          hasCapability(opt.adapterType, 'imageAnalysis'),
      ) && (
        <CollapsiblePanel
          title={t('reverseTitle')}
          description={t('reverseDescription')}
        >
          <ReverseEngineerPanel
            onUsePrompt={(generatedPrompt) => setPrompt(generatedPrompt)}
            selectedModels={selectedModels}
          />
        </CollapsiblePanel>
      )}

      {/* Submit */}
      <Button
        type="submit"
        size="lg"
        disabled={!canBattle || isCreating}
        className="w-full gap-2 rounded-full"
      >
        {isCreating ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {t('creating')}
          </>
        ) : (
          <>
            <Swords className="size-4" />
            {t('battleButton')}
          </>
        )}
      </Button>
    </form>
  )
}
