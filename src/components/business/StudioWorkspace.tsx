'use client'

import { useState, useCallback } from 'react'
import {
  Gift,
  ImageIcon,
  Film,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Key,
  KeyRound,
  Loader2,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'

import { CardDropdown } from '@/components/business/CardDropdown'
import { StudioToolbar } from '@/components/business/StudioToolbar'
import { OnboardingTooltip } from '@/components/business/OnboardingTooltip'
import { ProjectSelector } from '@/components/business/ProjectSelector'
import { HistoryPanel } from '@/components/business/HistoryPanel'
import { CharacterCardManager } from '@/components/business/CharacterCardManager'
import { SimpleCardManager } from '@/components/business/SimpleCardManager'
import { StyleCardManager } from '@/components/business/StyleCardManager'
import { ImageCard } from '@/components/business/ImageCard'
import { ApiKeyManager } from '@/components/business/ApiKeyManager'

const VideoGenerateForm = dynamic(
  () => import('@/components/business/VideoGenerateForm'),
)
const PromptEnhancer = dynamic(() =>
  import('@/components/business/PromptEnhancer').then(
    (mod) => mod.PromptEnhancer,
  ),
)
const ReverseEngineerPanel = dynamic(() =>
  import('@/components/business/ReverseEngineerPanel').then(
    (mod) => mod.ReverseEngineerPanel,
  ),
)
const AdvancedSettings = dynamic(() =>
  import('@/components/business/AdvancedSettings').then(
    (mod) => mod.AdvancedSettings,
  ),
)
const ReferenceImageSection = dynamic(() =>
  import('@/components/ui/reference-image-section').then(
    (mod) => mod.ReferenceImageSection,
  ),
)

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import { useOnboarding } from '@/hooks/use-onboarding'
import { useUsageSummary } from '@/hooks/use-usage-summary'
import { useProjects } from '@/hooks/use-projects'
import { useCharacterCards } from '@/hooks/use-character-cards'
import { useBackgroundCards } from '@/hooks/use-background-cards'
import { useStyleCards } from '@/hooks/use-style-cards'
import { useStudioGenerate } from '@/hooks/use-studio-generate'
import { useCivitaiToken } from '@/hooks/use-civitai-token'
import { usePromptEnhance } from '@/hooks/use-prompt-enhance'
import { useImageUpload } from '@/hooks/use-image-upload'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { modelSupportsLora } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { getMaxReferenceImages } from '@/constants/provider-capabilities'
import type { AdvancedParams } from '@/types'
import { cn } from '@/lib/utils'

type StudioMode = 'image' | 'video'
type AspectRatio = '1:1' | '16:9' | '9:16'

const ASPECT_RATIOS: AspectRatio[] = ['1:1', '16:9', '9:16']

export function StudioWorkspace() {
  const [mode, setMode] = useState<StudioMode>('image')
  const [freePrompt, setFreePrompt] = useState('')
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1')
  const [showCardManagement, setShowCardManagement] = useState(false)
  const [showProjectHistory, setShowProjectHistory] = useState(false)
  const [showCivitaiPanel, setShowCivitaiPanel] = useState(false)
  const [tokenInput, setTokenInput] = useState('')

  // Toolbar panel visibility
  const [showEnhancePanel, setShowEnhancePanel] = useState(false)
  const [showReversePanel, setShowReversePanel] = useState(false)
  const [showAdvancedPanel, setShowAdvancedPanel] = useState(false)
  const [showRefImagePanel, setShowRefImagePanel] = useState(false)

  // Advanced params from toolbar Advanced Settings
  const [advancedParamsOverride, setAdvancedParamsOverride] =
    useState<AdvancedParams>({})

  const t = useTranslations('StudioV2')
  const tStudio = useTranslations('StudioPage')
  const tBg = useTranslations('BackgroundCard')
  const tApiKeys = useTranslations('StudioApiKeys')

  const onboarding = useOnboarding()
  const { summary } = useUsageSummary()
  const freeRemaining =
    summary.freeGenerationLimit - summary.freeGenerationsToday

  // ── API Keys ──────────────────────────────────────────────────
  const { keys, isLoading: isLoadingKeys } = useApiKeysContext()
  const activeKeyCount = keys.filter((k) => k.isActive).length

  // ── Projects ──────────────────────────────────────────────────
  const {
    projects,
    activeProjectId,
    isLoading: isLoadingProjects,
    setActiveProjectId,
    create: createProject,
    update: updateProject,
    remove: removeProject,
    history,
    historyTotal,
    historyHasMore,
    isLoadingHistory,
    loadMoreHistory,
  } = useProjects()

  // ── Character cards ───────────────────────────────────────────
  const {
    cards: characterCards,
    activeCardIds,
    isLoading: isLoadingCharCards,
    toggleCardSelection,
    activeCards,
    create: createCharCard,
    update: updateCharCard,
    remove: removeCharCard,
  } = useCharacterCards()

  // ── Background cards ──────────────────────────────────────────
  const {
    cards: backgroundCards,
    activeCardId: selectedBgId,
    setActiveCardId: setSelectedBgId,
    isLoading: isLoadingBgCards,
    create: createBgCard,
    update: updateBgCard,
    remove: removeBgCard,
  } = useBackgroundCards(activeProjectId)

  // ── Style cards ───────────────────────────────────────────────
  const {
    cards: styleCards,
    activeCardId: selectedStyleId,
    setActiveCardId: setSelectedStyleId,
    isLoading: isLoadingStyleCards,
    create: createStyleCard,
    update: updateStyleCard,
    remove: removeStyleCard,
  } = useStyleCards(activeProjectId)

  // ── Generate + Civitai token ──────────────────────────────────
  const { generate, isGenerating, lastGeneration } = useStudioGenerate()
  const { hasToken, save: saveToken, remove: removeToken } = useCivitaiToken()

  // ── Prompt enhance ────────────────────────────────────────────
  const {
    isEnhancing,
    enhanced,
    original: enhancedOriginal,
    style: enhancedStyle,
    enhance,
    clearEnhancement,
  } = usePromptEnhance()

  // ── Reference image upload ────────────────────────────────────
  const {
    referenceImages,
    isDragging,
    fileInputRef,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    openFilePicker,
    handleInputChange,
    removeReferenceImage,
    clearAllImages,
  } = useImageUpload()

  // ── Derived ───────────────────────────────────────────────────
  const selectedCharId = activeCardIds.length > 0 ? activeCardIds[0] : null
  const selectedStyleCard =
    styleCards.find((c) => c.id === selectedStyleId) ?? null
  const canGenerate = !!selectedStyleId && !!selectedStyleCard?.modelId
  const adapterType =
    (selectedStyleCard?.adapterType as AI_ADAPTER_TYPES) ?? AI_ADAPTER_TYPES.FAL
  const maxRefImages = getMaxReferenceImages(adapterType)

  // ── Handlers ─────────────────────────────────────────────────
  const handleCharSelect = useCallback(
    (id: string | null) => {
      if (selectedCharId) toggleCardSelection(selectedCharId)
      if (id) toggleCardSelection(id)
    },
    [selectedCharId, toggleCardSelection],
  )

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return
    await generate({
      characterCardId: selectedCharId ?? undefined,
      backgroundCardId: selectedBgId ?? undefined,
      styleCardId: selectedStyleId!,
      freePrompt: freePrompt || undefined,
      aspectRatio,
      projectId: activeProjectId ?? undefined,
      referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
      advancedParams:
        Object.keys(advancedParamsOverride).length > 0
          ? advancedParamsOverride
          : undefined,
    })
  }, [
    canGenerate,
    generate,
    selectedCharId,
    selectedBgId,
    selectedStyleId,
    freePrompt,
    aspectRatio,
    activeProjectId,
    referenceImages,
    advancedParamsOverride,
  ])

  const handleEnhance = useCallback(
    (style: Parameters<typeof enhance>[1]) => {
      if (!freePrompt.trim()) return
      void enhance(freePrompt, style)
    },
    [freePrompt, enhance],
  )

  const handleUseEnhanced = useCallback(
    (text: string) => {
      setFreePrompt(text)
      clearEnhancement()
    },
    [clearEnhancement],
  )

  const handleSaveToken = useCallback(async () => {
    if (!tokenInput.trim()) return
    const ok = await saveToken(tokenInput.trim())
    if (ok) {
      setTokenInput('')
      setShowCivitaiPanel(false)
    }
  }, [tokenInput, saveToken])

  const handleRename = useCallback(
    async (id: string, name: string) => updateProject(id, { name }),
    [updateProject],
  )

  return (
    <div className="space-y-4">
      {/* ── Mode tabs ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div
          role="tablist"
          aria-label={tStudio('modeLabel')}
          className="flex gap-2"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'image'}
            onClick={() => setMode('image')}
            className={cn(
              'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors',
              mode === 'image'
                ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                : 'border border-border/60 bg-background/50 text-foreground hover:bg-primary/5 hover:border-primary/20',
            )}
          >
            <ImageIcon className="size-3.5" />
            {tStudio('modeImage')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'video'}
            onClick={() => setMode('video')}
            className={cn(
              'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors',
              mode === 'video'
                ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                : 'border border-border/60 bg-background/50 text-foreground hover:bg-primary/5 hover:border-primary/20',
            )}
          >
            <Film className="size-3.5" />
            {tStudio('modeVideo')}
          </button>
        </div>

        {/* Free quota */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Gift className="size-3.5 text-chart-3" />
          <span className="font-serif">
            {tStudio('freeQuota', {
              remaining: Math.max(0, freeRemaining),
              limit: summary.freeGenerationLimit,
            })}
          </span>
        </div>
      </div>

      {mode === 'image' ? (
        <>
          {/* ── Layer 1: Card dropdowns + API Keys ────────────── */}
          <div className="flex flex-wrap items-center gap-2">
            <CardDropdown
              label={t('character')}
              cards={characterCards.map((c) => ({
                id: c.id,
                name: c.name,
                sourceImageUrl: c.sourceImageUrl,
              }))}
              selectedId={selectedCharId}
              onSelect={handleCharSelect}
              onManage={() => setShowCardManagement(true)}
              isLoading={isLoadingCharCards}
            />
            <CardDropdown
              label={t('background')}
              cards={backgroundCards.map((c) => ({
                id: c.id,
                name: c.name,
                sourceImageUrl: c.sourceImageUrl ?? null,
              }))}
              selectedId={selectedBgId}
              onSelect={setSelectedBgId}
              onManage={() => setShowCardManagement(true)}
              isLoading={isLoadingBgCards}
            />
            <CardDropdown
              label={t('style')}
              cards={styleCards.map((c) => ({
                id: c.id,
                name: c.modelId
                  ? `${c.name} · ${modelSupportsLora(c.modelId) ? 'LoRA' : 'Ref'}`
                  : c.name,
                sourceImageUrl: c.sourceImageUrl ?? null,
              }))}
              selectedId={selectedStyleId}
              onSelect={setSelectedStyleId}
              onManage={() => setShowCardManagement(true)}
              isLoading={isLoadingStyleCards}
            />

            {/* API Routes quick access */}
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 px-2.5 text-xs text-[#7a7872] hover:bg-[#f0ede6] hover:text-[#141413]"
                  title={tApiKeys('triggerLabel')}
                >
                  <KeyRound className="size-3.5" />
                  <span className="hidden sm:inline">
                    {tApiKeys('triggerLabel')}
                  </span>
                  <Badge
                    variant="secondary"
                    className="rounded-full px-1.5 py-0 text-[10px]"
                  >
                    {isLoadingKeys
                      ? tApiKeys('triggerLoading')
                      : tApiKeys('triggerCount', { count: activeKeyCount })}
                  </Badge>
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full overflow-y-auto border-l bg-background/95 px-0 sm:max-w-xl">
                <SheetHeader className="gap-3 border-b px-6 pb-5 pt-6">
                  <SheetTitle className="flex items-center gap-2 font-display text-lg font-medium">
                    <KeyRound className="size-4" />
                    {tApiKeys('sheetTitle')}
                  </SheetTitle>
                  <SheetDescription className="max-w-md font-serif leading-6">
                    {tApiKeys('sheetDescription')}
                  </SheetDescription>
                </SheetHeader>
                <div className="px-6 py-6">
                  <ApiKeyManager />
                </div>
              </SheetContent>
            </Sheet>
          </div>

          {/* ── Free prompt ───────────────────────────────────── */}
          <textarea
            value={freePrompt}
            onChange={(e) => setFreePrompt(e.target.value)}
            placeholder={
              selectedStyleCard?.modelId &&
              modelSupportsLora(selectedStyleCard.modelId)
                ? t('freePromptPlaceholderLora')
                : t('freePromptPlaceholder')
            }
            className="w-full rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm font-serif text-foreground placeholder:text-muted-foreground/40 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
            rows={2}
          />

          {/* ── Aspect ratio + Generate ───────────────────────── */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-1.5">
              {ASPECT_RATIOS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setAspectRatio(r)}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                    aspectRatio === r
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border/60 text-muted-foreground hover:border-primary/30 hover:text-foreground',
                  )}
                >
                  {r}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating || !canGenerate}
              className={cn(
                'flex items-center gap-2 rounded-full px-6 py-2 text-sm font-medium transition-colors',
                canGenerate && !isGenerating
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm shadow-primary/20'
                  : 'bg-muted text-muted-foreground cursor-not-allowed',
              )}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t('generating')}
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  {t('generate')}
                </>
              )}
            </button>
          </div>

          {/* No-model warning */}
          {selectedStyleId && !selectedStyleCard?.modelId && (
            <p className="text-xs text-destructive/70 font-serif">
              {t('noModel')}
            </p>
          )}

          {/* ── Latest generation preview ─────────────────────── */}
          {lastGeneration && (
            <div className="rounded-xl overflow-hidden border border-border/40">
              <ImageCard generation={lastGeneration} />
            </div>
          )}

          {/* ── Layer 2: Toolbar ──────────────────────────────── */}
          <StudioToolbar
            onEnhance={() => setShowEnhancePanel((v) => !v)}
            isEnhancing={isEnhancing}
            onReverse={() => setShowReversePanel((v) => !v)}
            onAdvanced={() => setShowAdvancedPanel((v) => !v)}
            advancedOpen={showAdvancedPanel}
            onReferenceImage={() => setShowRefImagePanel((v) => !v)}
            referenceImageCount={referenceImages.length}
            onCivitaiToken={() => setShowCivitaiPanel((v) => !v)}
            hasToken={hasToken}
            disabled={isGenerating}
          />

          {/* Prompt enhance panel */}
          {showEnhancePanel && (
            <PromptEnhancer
              prompt={freePrompt}
              isEnhancing={isEnhancing}
              disabled={isGenerating}
              enhanced={enhanced}
              enhancedOriginal={enhancedOriginal}
              enhancedStyle={enhancedStyle}
              onEnhance={handleEnhance}
              onUseEnhanced={handleUseEnhanced}
              onDismiss={() => {
                clearEnhancement()
                setShowEnhancePanel(false)
              }}
            />
          )}

          {/* Reverse engineer panel */}
          {showReversePanel && (
            <div className="rounded-lg border border-border/60 overflow-hidden">
              <ReverseEngineerPanel
                onUsePrompt={(prompt) => {
                  setFreePrompt(prompt)
                  setShowReversePanel(false)
                }}
              />
            </div>
          )}

          {/* Advanced settings panel */}
          {showAdvancedPanel && selectedStyleCard?.adapterType && (
            <div className="rounded-lg border border-border/60 bg-background/60 p-3">
              <AdvancedSettings
                adapterType={adapterType}
                params={advancedParamsOverride}
                onChange={setAdvancedParamsOverride}
                hasReferenceImage={referenceImages.length > 0}
                disabled={isGenerating}
              />
            </div>
          )}

          {/* Reference image panel */}
          {showRefImagePanel && (
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
              previewAlt={t('referenceImage')}
              removeLabel={t('cancel')}
              uploadLabel={t('referenceImage')}
              formatsLabel="JPG · PNG · WEBP"
              counterLabel={`${referenceImages.length} / ${maxRefImages}`}
            />
          )}

          {/* Civitai token inline panel */}
          {showCivitaiPanel && (
            <div className="rounded-lg border border-border/60 bg-background/60 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Key className="size-3.5 text-primary" />
                  <span className="text-xs font-medium">
                    {t('civitaiToken')}
                  </span>
                  {hasToken && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                      {t('tokenSaved')}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowCivitaiPanel(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder={t('tokenPlaceholder')}
                  className="flex-1 rounded-md border border-border/60 bg-background px-2 py-1.5 text-xs font-mono focus:border-primary/40 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleSaveToken}
                  disabled={!tokenInput.trim()}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-40"
                >
                  {t('save')}
                </button>
                {hasToken && (
                  <button
                    type="button"
                    onClick={() => removeToken()}
                    className="rounded-md border border-destructive/40 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/5"
                  >
                    {t('removeToken')}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Layer 3: Card management ──────────────────────── */}
          <div className="rounded-xl border border-border/40 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowCardManagement((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/20 transition-colors"
            >
              <span className="font-display">{t('cardManagement')}</span>
              {showCardManagement ? (
                <ChevronUp className="size-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="size-4 text-muted-foreground" />
              )}
            </button>

            {showCardManagement && (
              <div className="border-t border-border/40 p-4 space-y-6">
                <CharacterCardManager
                  cards={characterCards}
                  activeCardIds={activeCardIds}
                  isLoading={isLoadingCharCards}
                  onToggleSelect={toggleCardSelection}
                  onCreate={createCharCard}
                  onUpdate={updateCharCard}
                  onDelete={removeCharCard}
                />

                <SimpleCardManager
                  cardType="BACKGROUND"
                  title={tBg('title')}
                  cards={backgroundCards.map((c) => ({
                    id: c.id,
                    name: c.name,
                    description: c.description,
                    sourceImageUrl: c.sourceImageUrl ?? null,
                    prompt: c.backgroundPrompt,
                    tags: c.tags,
                  }))}
                  activeCardId={selectedBgId}
                  isLoading={isLoadingBgCards}
                  onSelect={setSelectedBgId}
                  onCreate={async (data) => {
                    await createBgCard({
                      name: data.name,
                      description: data.description,
                      backgroundPrompt: data.prompt,
                      sourceImageData: data.sourceImageData,
                      tags: data.tags ?? [],
                      projectId: activeProjectId ?? undefined,
                    })
                  }}
                  onUpdate={async (id, data) =>
                    updateBgCard(id, {
                      ...(data.name ? { name: data.name } : {}),
                      ...(data.prompt ? { backgroundPrompt: data.prompt } : {}),
                    })
                  }
                  onDelete={removeBgCard}
                  supportsImageExtraction
                  showLoraConfig
                  promptLabel={tBg('prompt')}
                  promptPlaceholder={tBg('promptPlaceholder')}
                />

                <StyleCardManager
                  cards={styleCards}
                  activeCardId={selectedStyleId}
                  isLoading={isLoadingStyleCards}
                  onSelect={setSelectedStyleId}
                  onCreate={async (data) => {
                    await createStyleCard({
                      ...data,
                      projectId: activeProjectId ?? undefined,
                    })
                  }}
                  onUpdate={updateStyleCard}
                  onDelete={removeStyleCard}
                />
              </div>
            )}
          </div>

          {/* ── Layer 3: Project & History ────────────────────── */}
          <div className="rounded-xl border border-border/40 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowProjectHistory((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/20 transition-colors"
            >
              <span className="font-display">{t('projectHistory')}</span>
              {showProjectHistory ? (
                <ChevronUp className="size-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="size-4 text-muted-foreground" />
              )}
            </button>

            {showProjectHistory && (
              <div className="border-t border-border/40 p-4 space-y-4">
                <ProjectSelector
                  projects={projects}
                  activeProjectId={activeProjectId}
                  isLoading={isLoadingProjects}
                  onSelect={setActiveProjectId}
                  onCreate={createProject}
                  onRename={handleRename}
                  onDelete={removeProject}
                />
                <HistoryPanel
                  generations={history}
                  total={historyTotal}
                  hasMore={historyHasMore}
                  isLoading={isLoadingHistory}
                  onLoadMore={loadMoreHistory}
                />
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <VideoGenerateForm activeCharacterCards={activeCards} />
          <HistoryPanel
            generations={history}
            total={historyTotal}
            hasMore={historyHasMore}
            isLoading={isLoadingHistory}
            onLoadMore={loadMoreHistory}
          />
        </>
      )}

      <OnboardingTooltip
        active={onboarding.active}
        step={onboarding.currentStep}
        stepIndex={onboarding.currentIndex}
        totalSteps={onboarding.totalSteps}
        isLastStep={onboarding.isLastStep}
        isSkippable={onboarding.isSkippable}
        onNext={onboarding.next}
        onSkip={onboarding.skip}
        onDismiss={onboarding.dismiss}
      />
    </div>
  )
}
