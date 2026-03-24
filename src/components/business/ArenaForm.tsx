'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Swords,
  Upload,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  API_USAGE,
  DEFAULT_ASPECT_RATIO,
  GENERATION_LIMITS,
  IMAGE_SIZES,
  type AspectRatio,
} from '@/constants/config'
import {
  getModelMessageKey,
  isBuiltInModel,
  MODEL_OPTIONS,
} from '@/constants/models'
import { getProviderLabel } from '@/constants/providers'
import type {
  ApiKeyHealthStatus,
  ArenaModelSelection,
  UserApiKeyRecord,
} from '@/types'
import type { StudioModelOption } from '@/components/business/ModelSelector'
import { ReverseEngineerPanel } from '@/components/business/ReverseEngineerPanel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import type { StartBattleInput } from '@/hooks/use-arena'
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

  // Build a map: adapterType → best health status among active keys
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

  const savedOptions: ArenaModelOption[] = activeApiKeys.map((key) => ({
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

  return [...builtInOptions, ...savedOptions]
}

const STATUS_DOT_CLASSES: Record<ModelKeyStatus, string> = {
  ready: 'bg-emerald-500',
  nokey: 'bg-amber-400',
  unavailable: 'bg-red-500',
}

function getModelLabel(
  modelId: string,
  tModels: (key: string) => string,
): string {
  if (isBuiltInModel(modelId)) {
    return tModels(`${getModelMessageKey(modelId)}.label`)
  }
  return modelId
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

  const modelOptions = useMemo(
    () => buildModelOptions(apiKeys, healthMap),
    [apiKeys, healthMap],
  )

  // Deselect models whose key verification failed
  useEffect(() => {
    setSelectedOptionIds((prev) => {
      const unavailableIds = new Set(
        modelOptions
          .filter(
            (opt) => opt.keyStatus !== 'ready' && opt.keyStatus !== 'nokey',
          )
          .map((opt) => opt.optionId),
      )
      if (unavailableIds.size === 0) return prev

      const next = new Set<string>()
      for (const id of prev) {
        if (!unavailableIds.has(id)) {
          next.add(id)
        }
      }
      return next.size === prev.size ? prev : next
    })
  }, [modelOptions])

  const [prompt, setPrompt] = useState('')
  const [aspectRatio, setAspectRatio] =
    useState<AspectRatio>(DEFAULT_ASPECT_RATIO)
  const [selectedOptionIds, setSelectedOptionIds] = useState<Set<string>>(
    () =>
      new Set(
        MODEL_OPTIONS.filter(
          (m) => m.available && m.outputType === 'IMAGE',
        ).map((m) => `workspace:${m.id}`),
      ),
  )
  const [showModelPanel, setShowModelPanel] = useState(false)
  const [referenceImage, setReferenceImage] = useState<string | undefined>()
  const [showReferencePanel, setShowReferencePanel] = useState(false)
  const [showReversePanel, setShowReversePanel] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    .filter((opt) => selectedOptionIds.has(opt.optionId))
    .map((opt) => ({
      modelId: opt.modelId,
      apiKeyId: opt.keyId,
    }))

  const loadImageAsBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }, [])

  const handleFileChange = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) return
      const base64 = await loadImageAsBase64(file)
      setReferenceImage(base64)
    },
    [loadImageAsBase64],
  )

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) await handleFileChange(file)
    },
    [handleFileChange],
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!prompt.trim() || selectedModels.length < 2) return
    onBattle({
      prompt,
      aspectRatio,
      models: selectedModels,
      referenceImage,
    })
  }

  const canBattle = prompt.trim().length > 0 && selectedModels.length >= 2

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* ── Model Selection (collapsible) ─────────────────── */}
      <div className="rounded-2xl border border-border/70 bg-background/46 p-4">
        <button
          type="button"
          onClick={() => setShowModelPanel((v) => !v)}
          className="flex w-full items-center justify-between gap-4 text-left"
        >
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-foreground">
              {t('modelSelectLabel')}
            </p>
            <p className="font-serif text-xs text-muted-foreground">
              {t('modelSelectCount', { count: selectedModels.length })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selectedModels.length < 2 && (
              <Badge
                variant="destructive"
                className="rounded-full px-2 py-0 text-[11px]"
              >
                {t('modelSelectMinimum')}
              </Badge>
            )}
            {showModelPanel ? (
              <ChevronUp className="size-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="size-4 text-muted-foreground" />
            )}
          </div>
        </button>

        {showModelPanel && (
          <div className="mt-4 grid gap-2 border-t border-border/70 pt-4 sm:grid-cols-2">
            {modelOptions.map((option) => {
              const isSelected = selectedOptionIds.has(option.optionId)
              const label = getModelLabel(option.modelId, tModels)
              const provider = getProviderLabel(option.providerConfig)

              return (
                <button
                  key={option.optionId}
                  type="button"
                  onClick={() => toggleModel(option.optionId)}
                  disabled={isCreating || option.keyStatus === 'unavailable'}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all',
                    option.keyStatus === 'unavailable' &&
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
                      className="rounded-full px-2 py-0 text-[11px]"
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
        )}
      </div>

      {/* ── Aspect Ratio ───────────────────────────────────── */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-foreground">
          {t('aspectRatioLabel')}
        </label>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(IMAGE_SIZES) as AspectRatio[]).map((ratio) => (
            <button
              key={ratio}
              type="button"
              onClick={() => setAspectRatio(ratio)}
              disabled={isCreating}
              className={cn(
                'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
                ratio === aspectRatio
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border/75 text-muted-foreground hover:border-border hover:text-foreground',
              )}
            >
              {IMAGE_SIZES[ratio].label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Prompt ─────────────────────────────────────────── */}
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
          maxLength={GENERATION_LIMITS.PROMPT_MAX_LENGTH}
          disabled={isCreating}
          className="resize-none rounded-2xl border-border/75 bg-background/72 px-4 py-3 font-serif"
        />
      </div>

      {/* ── Reference Image ────────────────────────────────── */}
      <div className="rounded-2xl border border-border/70 bg-background/46 p-4">
        <button
          type="button"
          onClick={() => setShowReferencePanel((v) => !v)}
          className="flex w-full items-center justify-between gap-4 text-left"
        >
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-foreground">
              {t('referenceTitle')}
            </p>
            <p className="font-serif text-xs text-muted-foreground">
              {referenceImage ? t('referenceSelected') : t('referenceIdle')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {referenceImage && (
              <Badge variant="secondary" className="rounded-full px-3 py-1">
                {t('referenceBadge')}
              </Badge>
            )}
            {showReferencePanel ? (
              <ChevronUp className="size-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="size-4 text-muted-foreground" />
            )}
          </div>
        </button>

        {showReferencePanel && (
          <div className="mt-4 border-t border-border/70 pt-4">
            {referenceImage ? (
              <div className="relative inline-flex overflow-hidden rounded-2xl border border-border/75 bg-background">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={referenceImage}
                  alt={t('referencePreviewAlt')}
                  className="h-36 w-auto object-cover"
                />
                <button
                  type="button"
                  onClick={() => setReferenceImage(undefined)}
                  className="absolute right-3 top-3 rounded-full border border-border/75 bg-background/92 p-1.5 text-muted-foreground transition-colors hover:text-destructive"
                  aria-label={t('referenceRemoveLabel')}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                onDragOver={(e) => {
                  e.preventDefault()
                  setIsDragging(true)
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    fileInputRef.current?.click()
                  }
                }}
                className={cn(
                  'flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors',
                  isDragging
                    ? 'border-primary/60 bg-primary/5'
                    : 'border-border/80 bg-background/72 hover:border-primary/40 hover:bg-secondary/18',
                )}
              >
                <Upload className="size-5 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">
                  {t('referenceUpload')}
                </p>
                <p className="font-serif text-xs text-muted-foreground">
                  {t('referenceFormats')}
                </p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (file) await handleFileChange(file)
              }}
            />
          </div>
        )}
      </div>

      {/* ── Reverse Engineer ───────────────────────────────── */}
      <div className="rounded-2xl border border-border/70 bg-background/46 p-4">
        <button
          type="button"
          onClick={() => setShowReversePanel((v) => !v)}
          className="flex w-full items-center justify-between gap-4 text-left"
        >
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-foreground">
              {t('reverseTitle')}
            </p>
            <p className="font-serif text-xs text-muted-foreground">
              {t('reverseDescription')}
            </p>
          </div>
          {showReversePanel ? (
            <ChevronUp className="size-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground" />
          )}
        </button>

        {showReversePanel && (
          <div className="mt-4 border-t border-border/70 pt-4">
            <ReverseEngineerPanel
              onUsePrompt={(generatedPrompt) => setPrompt(generatedPrompt)}
            />
          </div>
        )}
      </div>

      {/* ── Submit ─────────────────────────────────────────── */}
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
