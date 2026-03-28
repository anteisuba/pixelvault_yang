'use client'

import { useState, useCallback } from 'react'
import { Gift, ImageIcon, Film, Sparkles, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import dynamic from 'next/dynamic'

import { GenerateForm } from '@/components/business/GenerateForm'
import { OnboardingTooltip } from '@/components/business/OnboardingTooltip'
import { ProjectSelector } from '@/components/business/ProjectSelector'
import { HistoryPanel } from '@/components/business/HistoryPanel'
import { CharacterCardManager } from '@/components/business/CharacterCardManager'
import { SimpleCardManager } from '@/components/business/SimpleCardManager'

const VideoGenerateForm = dynamic(
  () => import('@/components/business/VideoGenerateForm'),
)
import { useOnboarding } from '@/hooks/use-onboarding'
import { useUsageSummary } from '@/hooks/use-usage-summary'
import { useProjects } from '@/hooks/use-projects'
import { useCharacterCards } from '@/hooks/use-character-cards'
import { useBackgroundCards } from '@/hooks/use-background-cards'
import { useStyleCards } from '@/hooks/use-style-cards'
import { useModelCards } from '@/hooks/use-model-cards'
import { MODEL_OPTIONS, modelSupportsLora } from '@/constants/models'
import type { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  hasCapability,
  getCapabilityConfig,
} from '@/constants/provider-capabilities'
import { cn } from '@/lib/utils'

type StudioMode = 'image' | 'video'

export function StudioWorkspace() {
  const [mode, setMode] = useState<StudioMode>('image')
  const t = useTranslations('StudioPage')
  const tBg = useTranslations('BackgroundCard')
  const tStyle = useTranslations('StyleCard')
  const tModel = useTranslations('ModelCard')
  const tRecipe = useTranslations('CardRecipe')
  const onboarding = useOnboarding()
  const { summary } = useUsageSummary()
  const freeRemaining =
    summary.freeGenerationLimit - summary.freeGenerationsToday

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

  const {
    cards: characterCards,
    activeCardIds,
    isLoading: isLoadingCards,
    toggleCardSelection,
    activeCards,
    create: createCard,
    update: updateCard,
    remove: removeCard,
  } = useCharacterCards()

  // ── Background / Style / Model card hooks ─────────────────────
  const {
    cards: backgroundCards,
    activeCardId: selectedBgId,
    setActiveCardId: setSelectedBgId,
    isLoading: isLoadingBgCards,
    create: createBgCard,
    update: updateBgCard,
    remove: removeBgCard,
  } = useBackgroundCards(activeProjectId)

  const {
    cards: styleCards,
    activeCardId: selectedStyleId,
    setActiveCardId: setSelectedStyleId,
    isLoading: isLoadingStyleCards,
    create: createStyleCard,
    update: updateStyleCard,
    remove: removeStyleCard,
  } = useStyleCards(activeProjectId)

  const {
    cards: modelCards,
    activeCardId: selectedModelId,
    setActiveCardId: setSelectedModelId,
    isLoading: isLoadingModelCards,
    create: createModelCard,
    update: updateModelCard,
    remove: removeModelCard,
  } = useModelCards(activeProjectId)

  // ── Model card create form state ───────────────────────────────
  const [mcSelectedModelId, setMcSelectedModelId] = useState('')
  const [mcLoras, setMcLoras] = useState<{ url: string; scale: number }[]>([])

  const mcSelectedModel = MODEL_OPTIONS.find((m) => m.id === mcSelectedModelId)
  const mcShowLora = mcSelectedModelId
    ? modelSupportsLora(mcSelectedModelId)
    : false
  const mcLoraConfig = mcSelectedModel
    ? getCapabilityConfig(mcSelectedModel.adapterType)
    : null
  const mcMaxLoras = mcLoraConfig?.maxLoras ?? 5

  // ── Recipe compile state ──────────────────────────────────────
  const [recipeFreePrompt, setRecipeFreePrompt] = useState('')
  const [compiledPrompt, setCompiledPrompt] = useState<string | null>(null)
  const [isCompiling, setIsCompiling] = useState(false)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)

  const selectedCharId = activeCardIds.length > 0 ? activeCardIds[0] : null

  const handleCompile = useCallback(async () => {
    if (!selectedModelId) return
    setIsCompiling(true)
    try {
      const { createCardRecipeAPI, compileCardRecipeAPI, deleteCardRecipeAPI } =
        await import('@/lib/api-client')

      const createResult = await createCardRecipeAPI({
        name: '_temp_compile',
        characterCardId: selectedCharId ?? undefined,
        backgroundCardId: selectedBgId ?? undefined,
        styleCardId: selectedStyleId ?? undefined,
        modelCardId: selectedModelId ?? undefined,
        freePrompt: recipeFreePrompt || undefined,
        projectId: activeProjectId ?? undefined,
      })

      if (!createResult.success || !createResult.data) return

      const compileResult = await compileCardRecipeAPI(createResult.data.id)
      if (compileResult.success && compileResult.data) {
        setCompiledPrompt(compileResult.data.compiledPrompt)
        setIsPreviewOpen(true)
      }

      await deleteCardRecipeAPI(createResult.data.id)
    } finally {
      setIsCompiling(false)
    }
  }, [
    selectedCharId,
    selectedBgId,
    selectedStyleId,
    selectedModelId,
    recipeFreePrompt,
    activeProjectId,
  ])

  const handleRename = useCallback(
    async (id: string, name: string) => {
      return updateProject(id, { name })
    },
    [updateProject],
  )

  return (
    <div className="space-y-6">
      {/* Project selector */}
      <ProjectSelector
        projects={projects}
        activeProjectId={activeProjectId}
        isLoading={isLoadingProjects}
        onSelect={setActiveProjectId}
        onCreate={createProject}
        onRename={handleRename}
        onDelete={removeProject}
      />

      {/* ── Card Managers (all collapsible) ───────────────────── */}

      {/* Character cards — existing full manager */}
      <CharacterCardManager
        cards={characterCards}
        activeCardIds={activeCardIds}
        isLoading={isLoadingCards}
        onToggleSelect={toggleCardSelection}
        onCreate={createCard}
        onUpdate={updateCard}
        onDelete={removeCard}
      />

      {/* Background cards */}
      <SimpleCardManager
        cardType="BACKGROUND"
        title={tBg('title')}
        cards={backgroundCards.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          sourceImageUrl: c.sourceImageUrl,
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
        onUpdate={async (id, data) => {
          return updateBgCard(id, {
            ...(data.name ? { name: data.name } : {}),
            ...(data.prompt ? { backgroundPrompt: data.prompt } : {}),
          })
        }}
        onDelete={removeBgCard}
        supportsImageExtraction
        showLoraConfig
        promptLabel={tBg('prompt')}
        promptPlaceholder={tBg('promptPlaceholder')}
      />

      {/* Style cards */}
      <SimpleCardManager
        cardType="STYLE"
        title={tStyle('title')}
        cards={styleCards.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          sourceImageUrl: c.sourceImageUrl,
          prompt: c.stylePrompt,
          tags: c.tags,
        }))}
        activeCardId={selectedStyleId}
        isLoading={isLoadingStyleCards}
        onSelect={setSelectedStyleId}
        onCreate={async (data) => {
          await createStyleCard({
            name: data.name,
            description: data.description,
            stylePrompt: data.prompt,
            sourceImageData: data.sourceImageData,
            tags: data.tags ?? [],
            projectId: activeProjectId ?? undefined,
          })
        }}
        onUpdate={async (id, data) => {
          return updateStyleCard(id, {
            ...(data.name ? { name: data.name } : {}),
            ...(data.prompt ? { stylePrompt: data.prompt } : {}),
          })
        }}
        onDelete={removeStyleCard}
        supportsImageExtraction
        showLoraConfig
        promptLabel={tStyle('prompt')}
        promptPlaceholder={tStyle('promptPlaceholder')}
      />

      {/* Model cards — with model selector + LoRA config */}
      <SimpleCardManager
        cardType="MODEL"
        title={tModel('title')}
        cards={modelCards.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          sourceImageUrl: null,
          prompt: `${c.modelId} (${c.adapterType})`,
          tags: c.tags,
        }))}
        activeCardId={selectedModelId}
        isLoading={isLoadingModelCards}
        onSelect={setSelectedModelId}
        hidePromptInput
        onCreate={async (data) => {
          if (!mcSelectedModel) return
          await createModelCard({
            name: data.name,
            description: data.description,
            modelId: mcSelectedModel.id as AI_MODELS,
            adapterType: mcSelectedModel.adapterType,
            advancedParams: mcLoras.length > 0 ? { loras: mcLoras } : undefined,
            tags: [],
            projectId: activeProjectId ?? undefined,
          })
          setMcSelectedModelId('')
          setMcLoras([])
        }}
        onUpdate={async (id, data) => {
          return updateModelCard(id, {
            ...(data.name ? { name: data.name } : {}),
          })
        }}
        onDelete={removeModelCard}
        promptLabel={tModel('selectModel')}
        createFormExtra={
          <div className="space-y-2">
            {/* Model selector dropdown */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                {tModel('selectModel')}
              </label>
              <select
                value={mcSelectedModelId}
                onChange={(e) => {
                  setMcSelectedModelId(e.target.value)
                  setMcLoras([])
                }}
                className="w-full rounded-md border border-border/60 bg-background px-3 py-1.5 text-sm focus:border-primary/40 focus:outline-none"
              >
                <option value="">-- Select Model --</option>
                {MODEL_OPTIONS.filter(
                  (m) => m.outputType === 'IMAGE' && m.available,
                ).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id} ({m.adapterType}){m.supportsLora ? ' [LoRA]' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* LoRA configuration — only when model supports it */}
            {mcShowLora && (
              <div className="space-y-2 rounded-md border border-primary/20 bg-primary/5 p-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-primary">LoRA</span>
                  {mcLoras.length < mcMaxLoras && (
                    <button
                      type="button"
                      onClick={() =>
                        setMcLoras((prev) => [...prev, { url: '', scale: 1.0 }])
                      }
                      className="text-xs text-primary hover:text-primary/80"
                    >
                      + Add LoRA
                    </button>
                  )}
                </div>
                {mcLoras.map((lora, i) => (
                  <div
                    key={i}
                    className="space-y-1 rounded border border-border/40 bg-background p-2"
                  >
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={lora.url}
                        onChange={(e) =>
                          setMcLoras((prev) =>
                            prev.map((l, j) =>
                              j === i ? { ...l, url: e.target.value } : l,
                            ),
                          )
                        }
                        placeholder="https://civitai.com/api/download/models/..."
                        className="flex-1 rounded border border-border/60 bg-background px-2 py-1 text-xs font-mono focus:border-primary/40 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setMcLoras((prev) => prev.filter((_, j) => j !== i))
                        }
                        className="shrink-0 p-1 text-red-400 hover:text-red-500"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground w-12">
                        Scale: {lora.scale.toFixed(2)}
                      </span>
                      <input
                        type="range"
                        min="0.1"
                        max="2"
                        step="0.05"
                        value={lora.scale}
                        onChange={(e) =>
                          setMcLoras((prev) =>
                            prev.map((l, j) =>
                              j === i
                                ? { ...l, scale: parseFloat(e.target.value) }
                                : l,
                            ),
                          )
                        }
                        className="flex-1"
                      />
                    </div>
                  </div>
                ))}
                {mcLoras.length === 0 && (
                  <p className="text-[10px] text-muted-foreground/60 text-center py-1">
                    No LoRA added. Click "+ Add LoRA" to configure.
                  </p>
                )}
              </div>
            )}
          </div>
        }
      />

      {/* ── Recipe Compile Section ────────────────────────────── */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium font-display text-foreground">
          {tRecipe('title')}
        </h3>

        {/* Free prompt (action/scene) */}
        <div className="space-y-1">
          <label
            htmlFor="recipe-free-prompt"
            className="text-xs font-medium text-muted-foreground"
          >
            {tRecipe('freePrompt')}
          </label>
          <textarea
            id="recipe-free-prompt"
            value={recipeFreePrompt}
            onChange={(e) => setRecipeFreePrompt(e.target.value)}
            placeholder={tRecipe('freePromptPlaceholder')}
            className="w-full rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm font-serif text-foreground placeholder:text-muted-foreground/40 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
            rows={2}
          />
        </div>

        {/* Compiled preview */}
        {compiledPrompt && isPreviewOpen && (
          <div className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="size-3 text-primary" />
              <span className="text-xs font-medium text-muted-foreground">
                {tRecipe('compiledPrompt')}
              </span>
            </div>
            <p className="text-xs font-serif text-foreground/80 whitespace-pre-wrap">
              {compiledPrompt}
            </p>
          </div>
        )}

        {/* Compile button */}
        <button
          type="button"
          onClick={handleCompile}
          disabled={isCompiling || !selectedModelId}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors',
            selectedModelId
              ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm'
              : 'bg-muted text-muted-foreground cursor-not-allowed',
          )}
        >
          {isCompiling ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {tRecipe('compiling')}
            </>
          ) : (
            <>
              <Sparkles className="size-4" />
              {tRecipe('compile')}
            </>
          )}
        </button>
      </div>

      {/* Mode switch + free quota */}
      <div className="flex items-center justify-between">
        {/* Free tier quota indicator */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Gift className="size-3.5 text-chart-3" />
          <span className="font-serif">
            {t('freeQuota', {
              remaining: Math.max(0, freeRemaining),
              limit: summary.freeGenerationLimit,
            })}
          </span>
          {freeRemaining <= 1 && freeRemaining >= 0 && (
            <span className="text-primary">·</span>
          )}
          {freeRemaining <= 1 && freeRemaining >= 0 && (
            <span className="font-serif text-primary/80">
              {t('freeQuotaLow')}
            </span>
          )}
        </div>
      </div>
      <div role="tablist" aria-label={t('modeLabel')} className="flex gap-2">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'image' ? 'true' : 'false'}
          onClick={() => setMode('image')}
          className={cn(
            'flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-colors',
            mode === 'image'
              ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
              : 'border border-border/60 bg-background/50 text-foreground hover:bg-primary/5 hover:border-primary/20',
          )}
        >
          <ImageIcon className="size-4" />
          {t('modeImage')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'video' ? 'true' : 'false'}
          onClick={() => setMode('video')}
          className={cn(
            'flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-colors',
            mode === 'video'
              ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
              : 'border border-border/60 bg-background/50 text-foreground hover:bg-primary/5 hover:border-primary/20',
          )}
        >
          <Film className="size-4" />
          {t('modeVideo')}
        </button>
      </div>

      {/* Form area */}
      {mode === 'image' ? (
        <GenerateForm
          activeCharacterCards={activeCards}
          activeProjectId={activeProjectId}
        />
      ) : (
        <VideoGenerateForm activeCharacterCards={activeCards} />
      )}

      {/* Project history panel */}
      <HistoryPanel
        generations={history}
        total={historyTotal}
        hasMore={historyHasMore}
        isLoading={isLoadingHistory}
        onLoadMore={loadMoreHistory}
      />

      {/* Onboarding tooltip */}
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
