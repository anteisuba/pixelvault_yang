'use client'

import { useCallback } from 'react'
import { ChevronDown, Key, KeyRound, Loader2, X } from 'lucide-react'
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
import {
  StudioModeSelector,
  StudioPromptArea,
  StudioGenerateBar,
  StudioErrorBoundary,
} from '@/components/business/studio'

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
import { AnimatedCollapse } from '@/components/ui/animated-collapse'

import {
  StudioProvider,
  useStudioForm,
  useStudioData,
  useStudioGen,
} from '@/contexts/studio-context'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { modelSupportsLora } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { getMaxReferenceImages } from '@/constants/provider-capabilities'
import { cn } from '@/lib/utils'

/**
 * StudioWorkspace — wrapped with StudioProvider for state management.
 * Sub-components consume split contexts (Form/Data/Gen) for optimal re-renders.
 */
export function StudioWorkspace() {
  return (
    <StudioProvider>
      <StudioWorkspaceInner />
    </StudioProvider>
  )
}

// ═══════════════════════════════════════════════════════════════════
// INNER — consumes the split contexts
// ═══════════════════════════════════════════════════════════════════

function StudioWorkspaceInner() {
  const { state, dispatch } = useStudioForm()
  const {
    characters,
    backgrounds,
    styles,
    projects,
    imageUpload,
    promptEnhance,
    civitai,
    onboarding,
  } = useStudioData()
  const { isGenerating, lastGeneration } = useStudioGen()

  const t = useTranslations('StudioV2')
  const tBg = useTranslations('BackgroundCard')
  const tApiKeys = useTranslations('StudioApiKeys')

  // ── API Keys ──────────────────────────────────────────────────
  const { keys, isLoading: isLoadingKeys } = useApiKeysContext()
  const activeKeyCount = keys.filter((k) => k.isActive).length

  // ── Derived ───────────────────────────────────────────────────
  const selectedCharId =
    characters.activeCardIds.length > 0 ? characters.activeCardIds[0] : null
  const selectedStyleCard = styles.activeCard
  const adapterType =
    (selectedStyleCard?.adapterType as AI_ADAPTER_TYPES) ?? AI_ADAPTER_TYPES.FAL
  const maxRefImages = getMaxReferenceImages(adapterType)

  // ── Handlers ──────────────────────────────────────────────────
  const handleCharSelect = useCallback(
    (id: string | null) => {
      if (selectedCharId) characters.toggleCardSelection(selectedCharId)
      if (id) characters.toggleCardSelection(id)
    },
    [selectedCharId, characters],
  )

  const handleEnhance = useCallback(
    (style: Parameters<typeof promptEnhance.enhance>[1]) => {
      if (!state.prompt.trim()) return
      void promptEnhance.enhance(state.prompt, style)
    },
    [state.prompt, promptEnhance],
  )

  const handleUseEnhanced = useCallback(
    (text: string) => {
      dispatch({ type: 'SET_PROMPT', payload: text })
      promptEnhance.clearEnhancement()
    },
    [dispatch, promptEnhance],
  )

  const handleSaveToken = useCallback(async () => {
    if (!state.tokenInput.trim()) return
    const ok = await civitai.save(state.tokenInput.trim())
    if (ok) {
      dispatch({ type: 'SET_TOKEN_INPUT', payload: '' })
      dispatch({ type: 'CLOSE_PANEL', payload: 'civitai' })
    }
  }, [state.tokenInput, civitai, dispatch])

  const handleRename = useCallback(
    async (id: string, name: string) => projects.update(id, { name }),
    [projects],
  )

  return (
    <div className="space-y-4">
      {/* ── Mode tabs (sub-component via FormContext) ───────────── */}
      <StudioModeSelector />

      {state.mode === 'image' ? (
        <div
          role="tabpanel"
          id="studio-panel-image"
          aria-labelledby="studio-tab-image"
          className="space-y-4"
        >
          {/* ── Layer 1: Card dropdowns + API Keys ────────────── */}
          <div className="flex flex-wrap items-center gap-2">
            <CardDropdown
              label={t('character')}
              cards={characters.cards.map((c) => ({
                id: c.id,
                name: c.name,
                sourceImageUrl: c.sourceImageUrl,
              }))}
              selectedId={selectedCharId}
              onSelect={handleCharSelect}
              onManage={() =>
                dispatch({ type: 'TOGGLE_PANEL', payload: 'cardManagement' })
              }
              isLoading={characters.isLoading}
            />
            <CardDropdown
              label={t('background')}
              cards={backgrounds.cards.map((c) => ({
                id: c.id,
                name: c.name,
                sourceImageUrl: c.sourceImageUrl ?? null,
              }))}
              selectedId={backgrounds.activeCardId}
              onSelect={backgrounds.setActiveCardId}
              onManage={() =>
                dispatch({ type: 'TOGGLE_PANEL', payload: 'cardManagement' })
              }
              isLoading={backgrounds.isLoading}
            />
            <CardDropdown
              label={t('style')}
              cards={styles.cards.map((c) => ({
                id: c.id,
                name: c.modelId
                  ? `${c.name} · ${modelSupportsLora(c.modelId) ? 'LoRA' : 'Ref'}`
                  : c.name,
                sourceImageUrl: c.sourceImageUrl ?? null,
              }))}
              selectedId={styles.activeCardId}
              onSelect={styles.setActiveCardId}
              onManage={() =>
                dispatch({ type: 'TOGGLE_PANEL', payload: 'cardManagement' })
              }
              isLoading={styles.isLoading}
            />

            {/* API Keys quick access */}
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:bg-muted/30 hover:text-foreground"
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

          {/* ── Free prompt (sub-component via FormContext) ─────── */}
          <StudioPromptArea />

          {/* ── Aspect ratio + Generate (sub-component) ────────── */}
          <StudioGenerateBar />

          {/* ── Generation status (aria-live for screen readers) ── */}
          <div aria-live="polite" aria-atomic="true" className="sr-only">
            {isGenerating
              ? t('generating')
              : lastGeneration
                ? t('generateSuccess')
                : null}
          </div>

          {/* ── Latest generation preview ─────────────────────── */}
          {isGenerating && !lastGeneration && (
            <div className="rounded-xl overflow-hidden border border-border/40 bg-muted/20">
              <div className="flex flex-col items-center justify-center gap-3 py-12">
                <div className="relative">
                  <div className="size-12 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                </div>
                <p className="text-sm text-muted-foreground font-serif animate-pulse">
                  {t('generating')}
                </p>
              </div>
            </div>
          )}
          {lastGeneration && (
            <div className="rounded-xl overflow-hidden border border-border/40">
              <ImageCard generation={lastGeneration} />
            </div>
          )}

          {/* ── Layer 2: Toolbar ──────────────────────────────── */}
          <StudioToolbar
            onEnhance={() =>
              dispatch({ type: 'TOGGLE_PANEL', payload: 'enhance' })
            }
            isEnhancing={promptEnhance.isEnhancing}
            onReverse={() =>
              dispatch({ type: 'TOGGLE_PANEL', payload: 'reverse' })
            }
            onAdvanced={() =>
              dispatch({ type: 'TOGGLE_PANEL', payload: 'advanced' })
            }
            advancedOpen={state.panels.advanced}
            onReferenceImage={() =>
              dispatch({ type: 'TOGGLE_PANEL', payload: 'refImage' })
            }
            referenceImageCount={imageUpload.referenceImages.length}
            onCivitaiToken={() =>
              dispatch({ type: 'TOGGLE_PANEL', payload: 'civitai' })
            }
            hasToken={civitai.hasToken}
            disabled={isGenerating}
          />

          {/* Prompt enhance panel */}
          {state.panels.enhance && (
            <PromptEnhancer
              prompt={state.prompt}
              isEnhancing={promptEnhance.isEnhancing}
              disabled={isGenerating}
              enhanced={promptEnhance.enhanced}
              enhancedOriginal={promptEnhance.original}
              enhancedStyle={promptEnhance.style}
              onEnhance={handleEnhance}
              onUseEnhanced={handleUseEnhanced}
              onDismiss={() => {
                promptEnhance.clearEnhancement()
                dispatch({ type: 'CLOSE_PANEL', payload: 'enhance' })
              }}
            />
          )}

          {/* Reverse engineer panel */}
          {state.panels.reverse && (
            <div className="rounded-lg border border-border/60 overflow-hidden">
              <ReverseEngineerPanel
                onUsePrompt={(prompt) => {
                  dispatch({ type: 'SET_PROMPT', payload: prompt })
                  dispatch({ type: 'CLOSE_PANEL', payload: 'reverse' })
                }}
              />
            </div>
          )}

          {/* Advanced settings panel */}
          {state.panels.advanced && selectedStyleCard?.adapterType && (
            <div
              aria-live="polite"
              className="rounded-lg border border-border/60 bg-background/60 p-3"
            >
              <AdvancedSettings
                adapterType={adapterType}
                params={state.advancedParams}
                onChange={(params) =>
                  dispatch({ type: 'SET_ADVANCED_PARAMS', payload: params })
                }
                hasReferenceImage={imageUpload.referenceImages.length > 0}
                disabled={isGenerating}
              />
            </div>
          )}

          {/* Reference image panel */}
          {state.panels.refImage && (
            <ReferenceImageSection
              referenceImages={imageUpload.referenceImages}
              maxImages={maxRefImages}
              isDragging={imageUpload.isDragging}
              fileInputRef={imageUpload.fileInputRef}
              onDrop={imageUpload.handleDrop}
              onDragOver={imageUpload.handleDragOver}
              onDragLeave={imageUpload.handleDragLeave}
              onOpenFilePicker={imageUpload.openFilePicker}
              onInputChange={imageUpload.handleInputChange}
              onRemoveImage={imageUpload.removeReferenceImage}
              onClearAll={imageUpload.clearAllImages}
              previewAlt={t('referenceImage')}
              removeLabel={t('cancel')}
              uploadLabel={t('referenceImage')}
              formatsLabel="JPG · PNG · WEBP"
              counterLabel={`${imageUpload.referenceImages.length} / ${maxRefImages}`}
            />
          )}

          {/* Civitai token inline panel */}
          {state.panels.civitai && (
            <div className="rounded-lg border border-border/60 bg-background/60 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Key className="size-3.5 text-primary" />
                  <span className="text-xs font-medium font-display">
                    {t('civitaiToken')}
                  </span>
                  {civitai.hasToken && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                      {t('tokenSaved')}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    dispatch({ type: 'CLOSE_PANEL', payload: 'civitai' })
                  }
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={state.tokenInput}
                  onChange={(e) =>
                    dispatch({
                      type: 'SET_TOKEN_INPUT',
                      payload: e.target.value,
                    })
                  }
                  placeholder={t('tokenPlaceholder')}
                  className="flex-1 rounded-md border border-border/60 bg-background px-2 py-1.5 text-xs font-mono focus:border-primary/40 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleSaveToken}
                  disabled={!state.tokenInput.trim()}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-40"
                >
                  {t('save')}
                </button>
                {civitai.hasToken && (
                  <button
                    type="button"
                    onClick={() => civitai.remove()}
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
              aria-expanded={state.panels.cardManagement}
              aria-controls="studio-card-management"
              onClick={() =>
                dispatch({ type: 'TOGGLE_PANEL', payload: 'cardManagement' })
              }
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/20 transition-colors"
            >
              <span className="font-display">{t('cardManagement')}</span>
              <ChevronDown
                className={cn(
                  'size-4 text-muted-foreground transition-transform duration-300',
                  state.panels.cardManagement && 'rotate-180',
                )}
              />
            </button>

            <AnimatedCollapse open={state.panels.cardManagement}>
              <StudioErrorBoundary section="Card Management">
                <div
                  id="studio-card-management"
                  className="border-t border-border/40 p-4 space-y-6"
                >
                  <CharacterCardManager
                    cards={characters.cards}
                    activeCardIds={characters.activeCardIds}
                    isLoading={characters.isLoading}
                    onToggleSelect={characters.toggleCardSelection}
                    onCreate={characters.create}
                    onUpdate={characters.update}
                    onDelete={characters.remove}
                  />

                  <SimpleCardManager
                    cardType="BACKGROUND"
                    title={tBg('title')}
                    cards={backgrounds.cards.map((c) => ({
                      id: c.id,
                      name: c.name,
                      description: c.description,
                      sourceImageUrl: c.sourceImageUrl ?? null,
                      prompt: c.backgroundPrompt,
                      tags: c.tags,
                    }))}
                    activeCardId={backgrounds.activeCardId}
                    isLoading={backgrounds.isLoading}
                    onSelect={backgrounds.setActiveCardId}
                    onCreate={async (data) => {
                      await backgrounds.create({
                        name: data.name,
                        description: data.description,
                        backgroundPrompt: data.prompt,
                        sourceImageData: data.sourceImageData,
                        tags: data.tags ?? [],
                        projectId: projects.activeProjectId ?? undefined,
                      })
                    }}
                    onUpdate={async (id, data) =>
                      backgrounds.update(id, {
                        ...(data.name ? { name: data.name } : {}),
                        ...(data.prompt
                          ? { backgroundPrompt: data.prompt }
                          : {}),
                      })
                    }
                    onDelete={backgrounds.remove}
                    supportsImageExtraction
                    showLoraConfig
                    promptLabel={tBg('prompt')}
                    promptPlaceholder={tBg('promptPlaceholder')}
                  />

                  <StyleCardManager
                    cards={styles.cards}
                    activeCardId={styles.activeCardId}
                    isLoading={styles.isLoading}
                    onSelect={styles.setActiveCardId}
                    onCreate={async (data) => {
                      await styles.create({
                        ...data,
                        projectId: projects.activeProjectId ?? undefined,
                      })
                    }}
                    onUpdate={styles.update}
                    onDelete={styles.remove}
                  />
                </div>
              </StudioErrorBoundary>
            </AnimatedCollapse>
          </div>

          {/* ── Layer 3: Project & History ────────────────────── */}
          <div className="rounded-xl border border-border/40 overflow-hidden">
            <button
              type="button"
              aria-expanded={state.panels.projectHistory}
              aria-controls="studio-project-history"
              onClick={() =>
                dispatch({ type: 'TOGGLE_PANEL', payload: 'projectHistory' })
              }
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/20 transition-colors"
            >
              <span className="font-display">{t('projectHistory')}</span>
              <ChevronDown
                className={cn(
                  'size-4 text-muted-foreground transition-transform duration-300',
                  state.panels.projectHistory && 'rotate-180',
                )}
              />
            </button>

            <AnimatedCollapse open={state.panels.projectHistory}>
              <div
                id="studio-project-history"
                className="border-t border-border/40 p-4 space-y-4"
              >
                <ProjectSelector
                  projects={projects.projects}
                  activeProjectId={projects.activeProjectId}
                  isLoading={projects.isLoading}
                  onSelect={projects.setActiveProjectId}
                  onCreate={projects.create}
                  onRename={handleRename}
                  onDelete={projects.remove}
                />
                <HistoryPanel
                  generations={projects.history}
                  total={projects.historyTotal}
                  hasMore={projects.historyHasMore}
                  isLoading={projects.isLoadingHistory}
                  onLoadMore={projects.loadMoreHistory}
                />
              </div>
            </AnimatedCollapse>
          </div>
        </div>
      ) : (
        <div
          role="tabpanel"
          id="studio-panel-video"
          aria-labelledby="studio-tab-video"
          className="space-y-4"
        >
          <VideoGenerateForm activeCharacterCards={characters.activeCards} />
          <HistoryPanel
            generations={projects.history}
            total={projects.historyTotal}
            hasMore={projects.historyHasMore}
            isLoading={projects.isLoadingHistory}
            onLoadMore={projects.loadMoreHistory}
          />
        </div>
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
