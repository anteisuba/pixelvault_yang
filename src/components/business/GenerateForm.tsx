'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import {
  ImageIcon,
  Loader2,
  Sparkles,
  User,
  Check,
  ImagePlus,
  Wand2,
  Save,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import {
  API_USAGE,
  GENERATION_LIMITS,
  IMAGE_SIZES,
  type AspectRatio,
} from '@/constants/config'
import {
  AI_MODELS,
  getModelMessageKey,
  isBuiltInModel,
  MODEL_OPTIONS,
} from '@/constants/models'
import { PROMPT_PRESETS } from '@/constants/prompt-presets'
import { getProviderLabel } from '@/constants/providers'
import { isCjkLocale } from '@/i18n/routing'

import dynamic from 'next/dynamic'

import type { CharacterCardRecord } from '@/types'
import {
  hasCapability,
  getMaxReferenceImages,
} from '@/constants/provider-capabilities'
import {
  ModelSelector,
  type StudioModelOption,
} from '@/components/business/ModelSelector'

const AdvancedSettings = dynamic(() =>
  import('@/components/business/AdvancedSettings').then(
    (mod) => mod.AdvancedSettings,
  ),
)
const PromptEnhancer = dynamic(() =>
  import('@/components/business/PromptEnhancer').then(
    (mod) => mod.PromptEnhancer,
  ),
)
const PromptFeedbackButton = dynamic(() =>
  import('@/components/business/PromptFeedbackPanel').then(
    (mod) => mod.PromptFeedbackButton,
  ),
)
const PromptFeedbackPanel = dynamic(() =>
  import('@/components/business/PromptFeedbackPanel').then(
    (mod) => mod.PromptFeedbackPanel,
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
import { ErrorAlert } from '@/components/ui/error-alert'
import { ReferenceImageSection } from '@/components/ui/reference-image-section'
import { Textarea } from '@/components/ui/textarea'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { useGenerateImage } from '@/hooks/use-generate'
import { useGenerationForm } from '@/hooks/use-generation-form'
import { usePromptFeedback } from '@/hooks/use-prompt-feedback'
import { useGenerationFeedback } from '@/hooks/use-generation-feedback'
import {
  buildSavedModelOptions,
  findSelectedModel,
  getTranslatedModelLabel,
} from '@/lib/model-options'
import { updateCharacterCardAPI } from '@/lib/api-client'
import { cn } from '@/lib/utils'

function getTranslatedModelDescription(
  t: (key: string, values?: Record<string, string | number>) => string,
  tModels: (key: string, values?: Record<string, string | number>) => string,
  model: StudioModelOption,
): string {
  if (isBuiltInModel(model.modelId)) {
    return tModels(`${getModelMessageKey(model.modelId)}.description`)
  }
  return t('modelCustomDescription', {
    provider: getProviderLabel(model.providerConfig),
  })
}

interface GenerateFormProps {
  activeCharacterCards?: CharacterCardRecord[]
}

export function GenerateForm({ activeCharacterCards = [] }: GenerateFormProps) {
  const hasCards = activeCharacterCards.length > 0
  const [selectedOptionId, setSelectedOptionId] = useState<string>(
    `workspace:${AI_MODELS.GEMINI_FLASH_IMAGE}`,
  )
  const {
    prompt,
    setPrompt,
    aspectRatio,
    setAspectRatio,
    referenceImage,
    referenceImages,
    addReferenceImage,
    removeReferenceImage,
    clearAllImages,
    advancedParams,
    setAdvancedParams,
    isDragging,
    fileInputRef,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    openFilePicker,
    handleInputChange,
    isEnhancing,
    enhanced,
    enhancedOriginal,
    enhancedStyle,
    enhancePrompt,
    clearEnhancement,
    applyEnhancedPrompt,
  } = useGenerationForm()
  const { isGenerating, error, generatedGeneration, generate } =
    useGenerateImage()
  const searchParams = useSearchParams()
  const { keys: apiKeys, healthMap } = useApiKeysContext()
  const locale = useLocale()
  const isDenseLocale = isCjkLocale(locale)
  const t = useTranslations('StudioForm')
  const tCommon = useTranslations('Common')
  const tModels = useTranslations('Models')
  const tPresets = useTranslations('PromptPresets')
  const tCard = useTranslations('StudioForm.characterCard')
  const [appliedCardIds, setAppliedCardIds] = useState<string[]>([])
  const {
    isLoading: isFeedbackLoading,
    feedback,
    requestFeedback,
    clearFeedback,
  } = usePromptFeedback()
  const {
    isLoading: isConversationLoading,
    messages: conversationMessages,
    refinedPrompt: conversationRefinedPrompt,
    negativeAdditions: conversationNegatives,
    done: conversationDone,
    startConversation,
    sendReply,
    reset: resetConversation,
  } = useGenerationFeedback()
  const tGenFeedback = useTranslations('GenerationFeedback')
  const [showConversation, setShowConversation] = useState(false)
  const [replyInput, setReplyInput] = useState('')
  const [isSavingToCard, setIsSavingToCard] = useState(false)
  const [savedToCard, setSavedToCard] = useState(false)
  const activeApiKeys = apiKeys.filter((key) => key.isActive)

  const verifiedAdapterTypes = new Set(
    activeApiKeys
      .filter((key) => healthMap[key.id] === 'available')
      .map((key) => key.adapterType),
  )

  const builtInOptions: StudioModelOption[] = MODEL_OPTIONS.filter(
    (model) => model.freeTier || verifiedAdapterTypes.has(model.adapterType),
  ).map((model) => ({
    optionId: `workspace:${model.id}`,
    modelId: model.id,
    adapterType: model.adapterType,
    providerConfig: model.providerConfig,
    requestCount: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
    isBuiltIn: true,
    freeTier: model.freeTier,
    sourceType: 'workspace',
  }))
  const savedOptions = buildSavedModelOptions(
    activeApiKeys,
    (key) => healthMap[key.id] === 'available',
  )
  const modelOptions = [...builtInOptions, ...savedOptions]
  const selectedModel = findSelectedModel(modelOptions, selectedOptionId)

  // Prefill from URL params (?prompt=...&model=...)
  useEffect(() => {
    const urlPrompt = searchParams.get('prompt')
    const urlModel = searchParams.get('model')
    if (urlPrompt && !prompt) {
      setPrompt(urlPrompt)
    }
    if (urlModel) {
      const match = modelOptions.find(
        (o) => o.modelId === urlModel && o.sourceType === 'workspace',
      )
      if (match) setSelectedOptionId(match.optionId)
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reset applied state when selected cards change
  useEffect(() => {
    if (!hasCards) {
      setAppliedCardIds([])
    } else {
      // Remove applied IDs that are no longer in activeCharacterCards
      const activeIds = new Set(activeCharacterCards.map((c) => c.id))
      setAppliedCardIds((prev) => prev.filter((id) => activeIds.has(id)))
    }
  }, [activeCharacterCards, hasCards])

  const handleApplyCharacterCards = useCallback(() => {
    if (!hasCards) return
    // Clear user prompt — they will type action/expression only
    setPrompt('')
    // Add source images from all cards as reference images
    clearAllImages()
    for (const card of activeCharacterCards) {
      const images = card.sourceImages?.length
        ? card.sourceImages
        : [card.sourceImageUrl]
      for (const img of images) {
        addReferenceImage(img)
      }
    }
    setAppliedCardIds(activeCharacterCards.map((c) => c.id))
  }, [
    activeCharacterCards,
    hasCards,
    setPrompt,
    clearAllImages,
    addReferenceImage,
  ])

  // Whether the character cards' base prompts are being auto-injected
  const isCardApplied = appliedCardIds.length > 0
  const appliedCards = activeCharacterCards.filter((c) =>
    appliedCardIds.includes(c.id),
  )

  const generatedModelLabel = generatedGeneration
    ? getTranslatedModelLabel(tModels, generatedGeneration.model)
    : null

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (isGenerating || !selectedModel) return

      // Reset feedback state for new generation
      setShowConversation(false)
      resetConversation()
      setReplyInput('')
      setSavedToCard(false)

      // Combine base prompts (from character cards) + user action prompt
      let finalPrompt = prompt.trim()
      if (isCardApplied && appliedCards.length > 0) {
        const basePrompts = appliedCards
          .map((c) => c.characterPrompt.trim())
          .filter(Boolean)
        const base =
          basePrompts.length === 1
            ? basePrompts[0]
            : basePrompts
                .map(
                  (p, i) =>
                    `[Character ${i + 1}: ${appliedCards[i].name}]\n${p}`,
                )
                .join('\n\n')
        const action = prompt.trim()
        finalPrompt = action ? `${base}\n\n${action}` : base
      }
      if (!finalPrompt) return

      const hasAdvanced = Object.values(advancedParams).some(
        (v) => v !== undefined,
      )
      await generate({
        prompt: finalPrompt,
        modelId: selectedModel.modelId,
        aspectRatio,
        referenceImage,
        referenceImages:
          referenceImages.length > 1 ? referenceImages : undefined,
        apiKeyId: selectedModel.keyId,
        advancedParams: hasAdvanced ? advancedParams : undefined,
        characterCardIds:
          appliedCardIds.length > 0 ? appliedCardIds : undefined,
      })
    },
    [
      prompt,
      isGenerating,
      selectedModel,
      isCardApplied,
      appliedCards,
      appliedCardIds,
      advancedParams,
      generate,
      aspectRatio,
      referenceImage,
      referenceImages,
      resetConversation,
    ],
  )

  const maxRefImages = selectedModel
    ? getMaxReferenceImages(selectedModel.adapterType)
    : 1

  if (!selectedModel) return null

  const selectedModelLabel = getTranslatedModelLabel(
    tModels,
    selectedModel.modelId,
  )
  const selectedModelDescription = getTranslatedModelDescription(
    t,
    tModels,
    selectedModel,
  )

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6"
      aria-label={t('formLabel')}
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <section className="min-w-0 overflow-hidden rounded-3xl border border-border/60 bg-card/82 p-5 shadow-sm sm:p-6">
          <ModelSelector
            value={selectedModel.optionId}
            onChange={setSelectedOptionId}
            options={modelOptions}
          />
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h3 className="font-display text-base font-medium tracking-tight text-foreground">
              {selectedModelLabel}
            </h3>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge
                variant="outline"
                className="rounded-full border-border/70 bg-background/70 px-2.5 py-0.5 text-xs"
              >
                {getProviderLabel(selectedModel.providerConfig)}
              </Badge>
              <Badge
                variant="secondary"
                className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-foreground"
              >
                {tCommon('creditCount', { count: selectedModel.requestCount })}
              </Badge>
              {!selectedModel.isBuiltIn && (
                <Badge
                  variant="outline"
                  className="rounded-full border-border/70 bg-background/70 px-2.5 py-0.5 text-xs"
                >
                  {t('customModelBadge')}
                </Badge>
              )}
            </div>
          </div>
          <p className="mt-1.5 font-serif text-sm leading-6 text-muted-foreground">
            {selectedModelDescription}
          </p>
        </section>

        <section className="min-w-0 overflow-hidden rounded-3xl border border-border/60 bg-card/82 p-5 shadow-sm sm:p-6">
          {/* Character card indicator (multi-card) */}
          {hasCards && (
            <div
              className={cn(
                'mb-5 rounded-2xl border p-3 transition-colors',
                isCardApplied
                  ? 'border-emerald-500/40 bg-emerald-500/5'
                  : 'border-primary/30 bg-primary/5',
              )}
            >
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2">
                  {activeCharacterCards.slice(0, 4).map((card) => (
                    <div
                      key={card.id}
                      className="relative size-10 shrink-0 overflow-hidden rounded-lg border-2 border-background"
                    >
                      <Image
                        src={card.sourceImageUrl}
                        alt={card.name}
                        fill
                        className="object-cover"
                        sizes="40px"
                        unoptimized
                      />
                    </div>
                  ))}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {activeCharacterCards.map((c) => c.name).join(' × ')}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {isCardApplied
                      ? tCard('appliedMulti', {
                          count: appliedCards.length,
                        })
                      : tCard('hintMulti', {
                          count: activeCharacterCards.length,
                        })}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isGenerating || isCardApplied}
                  onClick={handleApplyCharacterCards}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                    isCardApplied
                      ? 'bg-emerald-500/10 text-emerald-600'
                      : 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50',
                  )}
                >
                  {isCardApplied ? (
                    <>
                      <Check className="size-3" />
                      {tCard('appliedButton')}
                    </>
                  ) : (
                    <>
                      <User className="size-3" />
                      {tCard('applyButton')}
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <label
                htmlFor="prompt"
                className="text-sm font-semibold text-foreground"
              >
                {isCardApplied ? tCard('actionPromptLabel') : t('promptLabel')}
              </label>
              <p className="font-serif text-sm leading-6 text-muted-foreground">
                {isCardApplied ? tCard('actionPromptHint') : t('promptHint')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <PromptFeedbackButton
                prompt={prompt}
                isLoading={isFeedbackLoading}
                disabled={isGenerating}
                onRequest={() => {
                  const context =
                    isCardApplied && appliedCards.length > 0
                      ? `This is an ACTION/SCENE prompt for ${appliedCards.length} character(s): ${appliedCards.map((c) => `"${c.name}"`).join(', ')}. The characters' base appearance prompts are already auto-injected. Focus feedback on pose, expression, scene composition, lighting, and atmosphere — not on character description.`
                      : undefined
                  requestFeedback(prompt, context, selectedModel?.keyId)
                }}
              />
              <PromptEnhancer
                prompt={prompt}
                isEnhancing={isEnhancing}
                disabled={isGenerating}
                enhanced={enhanced}
                enhancedOriginal={enhancedOriginal}
                enhancedStyle={enhancedStyle}
                onEnhance={(style) =>
                  enhancePrompt(prompt, style, selectedModel?.keyId)
                }
                onUseEnhanced={applyEnhancedPrompt}
                onDismiss={clearEnhancement}
              />
              <p className="text-xs font-medium text-muted-foreground">
                {t('promptCounter', {
                  current: prompt.length,
                  max: GENERATION_LIMITS.PROMPT_MAX_LENGTH,
                })}
              </p>
            </div>
          </div>

          {/* Prompt presets */}
          {!prompt && (
            <div className="mt-3 flex flex-wrap gap-2">
              {PROMPT_PRESETS.map((preset) => {
                const workspaceOptionId = `workspace:${preset.suggestedModelId}`
                const hasModel = modelOptions.some(
                  (o) => o.optionId === workspaceOptionId,
                )
                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={isGenerating}
                    onClick={() => {
                      setPrompt(preset.prompt)
                      setAspectRatio(preset.aspectRatio)
                      if (hasModel) {
                        setSelectedOptionId(workspaceOptionId)
                      }
                    }}
                    className="rounded-full border border-border/60 bg-background/50 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/20 hover:bg-primary/5 hover:text-foreground disabled:opacity-50"
                  >
                    {tPresets(`${preset.messageKey}.label`)}
                  </button>
                )
              })}
            </div>
          )}

          {/* Base prompt indicator (hidden, auto-injected) */}
          {isCardApplied && appliedCards.length > 0 && (
            <div className="mt-3 space-y-2">
              {appliedCards.map((card) => (
                <div
                  key={card.id}
                  className="rounded-xl border border-border/50 bg-muted/30 p-3"
                >
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {appliedCards.length > 1
                      ? `${tCard('basePromptLabel')} — ${card.name}`
                      : tCard('basePromptLabel')}
                  </p>
                  <p className="line-clamp-2 text-xs text-foreground/60">
                    {card.characterPrompt}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4">
            <Textarea
              id="prompt"
              data-onboarding="prompt"
              placeholder={
                isCardApplied
                  ? tCard('actionPromptPlaceholder')
                  : t('promptPlaceholder')
              }
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={isCardApplied ? 3 : 5}
              maxLength={GENERATION_LIMITS.PROMPT_MAX_LENGTH}
              disabled={isGenerating}
              className="min-h-32 resize-none rounded-2xl border-border/75 bg-background/72 px-4 py-3 font-serif"
            />
          </div>

          {/* Prompt feedback panel */}
          {feedback && (
            <PromptFeedbackPanel
              feedback={feedback}
              onApplyImproved={(text) => {
                setPrompt(text)
                clearFeedback()
              }}
              onDismiss={clearFeedback}
            />
          )}

          <div className="mt-5">
            <CollapsiblePanel
              title={t('referenceTitle')}
              description={
                referenceImages.length > 0
                  ? t('referenceSelectedDescription')
                  : t('referenceIdleDescription')
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
                maxImages={maxRefImages}
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
                uploadLabel={t('referenceUploadAction')}
                formatsLabel={t('referenceUploadFormats')}
                inputAriaLabel={t('referenceImageLabel')}
                counterLabel={t('referenceCounter', {
                  current: referenceImages.length,
                  max: maxRefImages,
                })}
              />
            </CollapsiblePanel>
          </div>

          <div className="mt-5 rounded-2xl border border-border/50 bg-background/40 p-4">
            <p
              className={cn(
                'mb-3 text-xs font-semibold text-muted-foreground',
                isDenseLocale
                  ? 'tracking-normal normal-case'
                  : 'uppercase tracking-[0.18em]',
              )}
            >
              {t('aspectRatioLabel')}
            </p>
            <AspectRatioSelector
              options={Object.keys(IMAGE_SIZES) as AspectRatio[]}
              value={aspectRatio}
              onChange={setAspectRatio}
            />
          </div>

          <div className="mt-5">
            <AdvancedSettings
              adapterType={selectedModel.adapterType}
              params={advancedParams}
              onChange={setAdvancedParams}
              hasReferenceImage={referenceImages.length > 0}
              disabled={isGenerating}
            />
          </div>

          {hasCapability(selectedModel.adapterType, 'imageAnalysis') && (
            <div className="mt-5 rounded-2xl border border-border/50 bg-background/40 p-4">
              <ReverseEngineerPanel
                selectedModels={
                  selectedModel
                    ? [
                        {
                          modelId: selectedModel.modelId,
                          apiKeyId: selectedModel.keyId,
                        },
                      ]
                    : undefined
                }
              />
            </div>
          )}
        </section>
      </div>

      <section className="rounded-3xl border border-primary/15 bg-primary/5 p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <p
              className={cn(
                'text-xs font-semibold text-muted-foreground',
                isDenseLocale
                  ? 'tracking-normal normal-case'
                  : 'uppercase tracking-[0.18em]',
              )}
            >
              {t('ctaSectionLabel')}
            </p>
            <p className="max-w-2xl font-serif text-sm leading-6 text-foreground">
              {t('ctaSectionDescription')}
            </p>
          </div>
          <Button
            type="submit"
            size="lg"
            disabled={(!prompt.trim() && !isCardApplied) || isGenerating}
            className="h-11 rounded-full px-6"
            data-onboarding="generate"
          >
            {isGenerating ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t('ctaLoadingLabel')}
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                {t('ctaLabel')}
              </>
            )}
          </Button>
        </div>
      </section>

      {error && (
        <ErrorAlert title={t('errorTitle')} message={error}>
          {(error.includes('Free tier limit') ||
            error.includes('bind your own API key') ||
            error.includes('API key')) && (
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">
                {t('freeQuotaGuide.title')}
              </p>
              <ol className="list-inside list-decimal space-y-0.5">
                <li>
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-2 hover:text-primary/80"
                  >
                    {t('freeQuotaGuide.step1')}
                  </a>
                </li>
                <li>{t('freeQuotaGuide.step2')}</li>
              </ol>
            </div>
          )}
        </ErrorAlert>
      )}

      <section className="space-y-3">
        <div className="space-y-1">
          <p
            className={cn(
              'text-xs font-semibold text-muted-foreground',
              isDenseLocale
                ? 'tracking-normal normal-case'
                : 'uppercase tracking-[0.18em]',
            )}
          >
            {t('resultLabel')}
          </p>
          <p className="text-sm leading-6 text-muted-foreground">
            {t('resultDescription')}
          </p>
        </div>

        {generatedGeneration ? (
          <div className="animate-in fade-in-0 zoom-in-95 overflow-hidden rounded-3xl border border-border/60 bg-card/86 shadow-sm duration-500">
            <Image
              src={generatedGeneration.url}
              alt={generatedGeneration.prompt}
              width={generatedGeneration.width}
              height={generatedGeneration.height}
              sizes="(max-width: 768px) 100vw, 50vw"
              className="h-auto w-full object-cover"
              unoptimized
            />
            <div className="space-y-4 border-t border-border/75 p-5 sm:p-6">
              <div className="space-y-2">
                <p
                  className={cn(
                    'text-xs font-semibold text-muted-foreground',
                    isDenseLocale
                      ? 'tracking-normal normal-case'
                      : 'uppercase tracking-[0.18em]',
                  )}
                >
                  {t('resultPromptLabel')}
                </p>
                <p className="font-serif text-sm leading-6 text-foreground">
                  {generatedGeneration.prompt}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant="outline"
                  className="rounded-full border-border/75 bg-background/72 px-3 py-1"
                >
                  {t('resultModelLabel')}: {generatedModelLabel}
                </Badge>
                <Badge
                  variant="outline"
                  className="rounded-full border-border/75 bg-background/72 px-3 py-1"
                >
                  {t('resultProviderLabel')}: {generatedGeneration.provider}
                </Badge>
                <Badge
                  variant="secondary"
                  className="rounded-full bg-primary/10 px-3 py-1 text-foreground"
                >
                  {t('resultCreditLabel')}:{' '}
                  {tCommon('creditCount', {
                    count: generatedGeneration.requestCount,
                  })}
                </Badge>
              </div>
              <p className="font-serif text-sm text-muted-foreground">
                {t('resultStorageNote')}
              </p>
              {selectedModel?.freeTier &&
                selectedModel.sourceType === 'workspace' && (
                  <p className="font-serif text-xs text-muted-foreground/70">
                    {t('upgradeHint')}
                  </p>
                )}

              {/* ── Action Buttons ── */}
              <div className="flex flex-wrap gap-2 border-t border-border/50 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 rounded-full"
                  onClick={() => {
                    addReferenceImage(generatedGeneration.url)
                  }}
                >
                  <ImagePlus className="size-3.5" />
                  {tGenFeedback('useAsReference')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 rounded-full"
                  disabled={isConversationLoading}
                  onClick={() => {
                    if (showConversation) {
                      setShowConversation(false)
                      resetConversation()
                      setReplyInput('')
                    } else {
                      setShowConversation(true)
                      startConversation(
                        generatedGeneration.url,
                        generatedGeneration.prompt,
                        locale,
                        selectedModel?.keyId,
                      )
                    }
                  }}
                >
                  <Wand2 className="size-3.5" />
                  {tGenFeedback('refinePrompt')}
                </Button>
                {appliedCards.length === 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 rounded-full"
                    disabled={isSavingToCard || savedToCard}
                    onClick={async () => {
                      setIsSavingToCard(true)
                      setSavedToCard(false)
                      const res = await updateCharacterCardAPI(
                        appliedCards[0].id,
                        {
                          characterPrompt: generatedGeneration.prompt,
                        },
                      )
                      setIsSavingToCard(false)
                      if (res.success) setSavedToCard(true)
                    }}
                  >
                    {savedToCard ? (
                      <Check className="size-3.5" />
                    ) : isSavingToCard ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Save className="size-3.5" />
                    )}
                    {savedToCard
                      ? tGenFeedback('savedToCard')
                      : tGenFeedback('saveToCard')}
                  </Button>
                )}
              </div>

              {/* ── Conversational Refinement Panel ── */}
              {showConversation && (
                <div className="animate-in fade-in-0 slide-in-from-top-2 space-y-3 rounded-2xl border border-border/60 bg-background/80 p-4 duration-300">
                  {/* Chat Messages */}
                  <div className="max-h-64 space-y-2.5 overflow-y-auto">
                    {conversationMessages.map((msg, i) => (
                      <div
                        key={i}
                        className={cn(
                          'flex',
                          msg.role === 'user' ? 'justify-end' : 'justify-start',
                        )}
                      >
                        <div
                          className={cn(
                            'max-w-[85%] rounded-2xl px-3.5 py-2.5 font-serif text-sm leading-6',
                            msg.role === 'user'
                              ? 'bg-primary/10 text-foreground'
                              : 'bg-muted/60 text-foreground',
                          )}
                        >
                          {msg.content}
                        </div>
                      </div>
                    ))}
                    {isConversationLoading && (
                      <div className="flex justify-start">
                        <div className="flex items-center gap-1.5 rounded-2xl bg-muted/60 px-3.5 py-2.5 text-sm text-muted-foreground">
                          <Loader2 className="size-3.5 animate-spin" />
                          {tGenFeedback('thinking')}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Refined Prompt Result */}
                  {conversationDone && conversationRefinedPrompt && (
                    <div className="animate-in fade-in-0 space-y-3 border-t border-border/50 pt-3 duration-300">
                      <p className="text-xs font-semibold text-primary">
                        {tGenFeedback('conversationDone')}
                      </p>
                      <p className="rounded-xl bg-primary/5 p-3 font-serif text-sm leading-6 text-foreground">
                        {conversationRefinedPrompt}
                      </p>
                      {conversationNegatives.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-muted-foreground">
                            {tGenFeedback('negativeAdditions')}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {conversationNegatives.map((neg) => (
                              <Badge
                                key={neg}
                                variant="outline"
                                className="rounded-full border-destructive/30 bg-destructive/5 px-2.5 py-0.5 text-xs text-destructive"
                              >
                                {neg}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          className="gap-1.5 rounded-full"
                          onClick={() => {
                            setPrompt(conversationRefinedPrompt)
                            if (conversationNegatives.length > 0) {
                              const currentNeg =
                                advancedParams.negativePrompt || ''
                              const additions = conversationNegatives.join(', ')
                              setAdvancedParams({
                                ...advancedParams,
                                negativePrompt: currentNeg
                                  ? `${currentNeg}, ${additions}`
                                  : additions,
                              })
                            }
                            setShowConversation(false)
                            resetConversation()
                          }}
                        >
                          <Check className="size-3.5" />
                          {tGenFeedback('apply')}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5 rounded-full"
                          onClick={() => {
                            setPrompt(conversationRefinedPrompt)
                            if (conversationNegatives.length > 0) {
                              const currentNeg =
                                advancedParams.negativePrompt || ''
                              const additions = conversationNegatives.join(', ')
                              setAdvancedParams({
                                ...advancedParams,
                                negativePrompt: currentNeg
                                  ? `${currentNeg}, ${additions}`
                                  : additions,
                              })
                            }
                            addReferenceImage(generatedGeneration.url)
                            setShowConversation(false)
                            resetConversation()
                          }}
                        >
                          <ImagePlus className="size-3.5" />
                          {tGenFeedback('applyAndReference')}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Reply Input — only show when conversation is not done */}
                  {!conversationDone && conversationMessages.length > 0 && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="flex-1 rounded-full border border-border/75 bg-background px-4 py-2 font-serif text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/30"
                        placeholder={tGenFeedback('inputPlaceholder')}
                        value={replyInput}
                        onChange={(e) => setReplyInput(e.target.value)}
                        disabled={isConversationLoading}
                        onKeyDown={(e) => {
                          if (
                            e.key === 'Enter' &&
                            !e.shiftKey &&
                            replyInput.trim() &&
                            !isConversationLoading
                          ) {
                            e.preventDefault()
                            sendReply(
                              generatedGeneration.url,
                              generatedGeneration.prompt,
                              replyInput.trim(),
                              locale,
                              selectedModel?.keyId,
                            )
                            setReplyInput('')
                          }
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        className="rounded-full"
                        disabled={!replyInput.trim() || isConversationLoading}
                        onClick={() => {
                          sendReply(
                            generatedGeneration.url,
                            generatedGeneration.prompt,
                            replyInput.trim(),
                            locale,
                            selectedModel?.keyId,
                          )
                          setReplyInput('')
                        }}
                      >
                        {tGenFeedback('send')}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-primary/20 bg-primary/3 p-6">
            <div className="flex items-start gap-4">
              <span className="rounded-2xl bg-primary/10 p-3 text-primary">
                <ImageIcon className="size-5" />
              </span>
              <div className="space-y-1">
                <h3 className="font-display text-lg font-medium text-foreground">
                  {t('resultEmptyTitle')}
                </h3>
                <p className="font-serif text-sm leading-6 text-muted-foreground">
                  {t('resultEmptyDescription')}
                </p>
              </div>
            </div>
          </div>
        )}
      </section>
    </form>
  )
}
