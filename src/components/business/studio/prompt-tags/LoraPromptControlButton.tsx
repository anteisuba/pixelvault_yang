'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUpRight,
  Check,
  Diamond,
  ExternalLink,
  Plus,
  SlidersHorizontal,
  Tags,
  Trash2,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import * as Toolbar from '@radix-ui/react-toolbar'

import {
  LORA_WORKBENCH_SEARCH_PARAM,
  LORA_WORKBENCH_SECTIONS,
} from '@/constants/lora'
import { ROUTES } from '@/constants/routes'
import { useStudioForm } from '@/contexts/studio-context'
import {
  LORA_STACK_MAX,
  useActiveLoraStack,
} from '@/hooks/use-active-lora-stack'
import { useIsMobile } from '@/hooks/use-mobile'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { usePromptTagStack } from '@/hooks/use-prompt-tag-stack'
import { useCivitaiMinedPrompts } from '@/hooks/prompts/use-civitai-mined-prompts'
import { Link } from '@/i18n/navigation'
import {
  findUsableRecommendedLoraRoute,
  getRecommendedLoraImageModelId,
  isImageModelCompatibleWithLoraFamily,
} from '@/lib/lora-model-compatibility'
import {
  buildSourceMatchedLoraPrompt,
  mergeNegativePrompt,
} from '@/lib/lora-source-match-prompt'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { promptIncludesTrigger } from '@/lib/prompt-text'
import { cn } from '@/lib/utils'
import {
  StudioToolPopoverContent,
  studioToolTriggerClass,
} from '@/components/business/studio-shared/primitives/tool-surface'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { Popover, PopoverTrigger } from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import type { AdvancedParams, LoraAssetRecord } from '@/types'

import { TagLibrary } from './TagLibrary'

interface LoraPromptControlButtonProps {
  disabled?: boolean
}

export function LoraPromptControlButton({
  disabled,
}: LoraPromptControlButtonProps) {
  const t = useTranslations('LoraPromptControl')
  const [open, setOpen] = useState(false)
  const isMobile = useIsMobile()
  const promptTags = usePromptTagStack()
  const loraStack = useActiveLoraStack()
  const { state } = useStudioForm()
  const negativeActive = state.advancedParams.negativePrompt?.trim().length
    ? 1
    : 0
  const count =
    promptTags.selectedCount + loraStack.items.length + negativeActive
  const active = open || count > 0

  const trigger = (
    <Toolbar.Button
      type="button"
      disabled={disabled}
      aria-label={count > 0 ? t('triggerWithCount', { count }) : t('trigger')}
      className={cn(
        studioToolTriggerClass,
        active ? 'bg-muted/30 text-primary' : 'text-muted-foreground',
      )}
    >
      <Diamond className="size-4" aria-hidden />
      <span className="hidden sm:inline">{t('label')}</span>
      {count > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-white">
          {count}
        </span>
      ) : null}
    </Toolbar.Button>
  )

  const panel = (
    <LoraPromptControlPanel
      disabled={disabled}
      onClose={() => setOpen(false)}
    />
  )

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent className="max-h-[88vh] overflow-hidden">
          <DrawerTitle className="sr-only">{t('title')}</DrawerTitle>
          <DrawerDescription className="sr-only">
            {t('description')}
          </DrawerDescription>
          {panel}
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <StudioToolPopoverContent
        side="top"
        align="end"
        size="medium"
        className="h-[min(680px,82vh)] w-[min(520px,calc(100vw-2rem))] overflow-hidden p-0"
      >
        {panel}
      </StudioToolPopoverContent>
    </Popover>
  )
}

interface LoraPromptControlPanelProps {
  disabled?: boolean
  onClose?: () => void
}

function LoraPromptControlPanel({
  disabled,
  onClose,
}: LoraPromptControlPanelProps) {
  const t = useTranslations('LoraPromptControl')

  return (
    <div className="flex min-h-0 flex-col">
      <div className="border-b border-border/60 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {t('title')}
            </p>
          </div>
          <Link
            href={`${ROUTES.STUDIO_LORA}?${LORA_WORKBENCH_SEARCH_PARAM}=${LORA_WORKBENCH_SECTIONS.COMMUNITY}`}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border/70 px-2.5 text-xs font-semibold text-foreground hover:bg-muted"
            onClick={onClose}
          >
            {t('openLibraryShort')}
            <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      </div>

      <Tabs defaultValue="generate" className="min-h-0 flex-1 gap-0">
        <div className="border-b border-border/60 px-3 py-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="generate">
              <SlidersHorizontal className="size-4" aria-hidden />
              {t('tabs.generate')}
            </TabsTrigger>
            <TabsTrigger value="tags">
              <Tags className="size-4" aria-hidden />
              {t('tabs.tags')}
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="generate" className="min-h-0 overflow-y-auto p-3">
          <GenerateControlTab disabled={disabled} onClose={onClose} />
        </TabsContent>
        <TabsContent value="tags" className="min-h-0 overflow-hidden">
          <TagLibrary onClose={onClose} className="h-full" />
        </TabsContent>
      </Tabs>
    </div>
  )
}

interface GenerateControlTabProps {
  disabled?: boolean
  onClose?: () => void
}

function GenerateControlTab({ disabled, onClose }: GenerateControlTabProps) {
  const t = useTranslations('LoraPromptControl.generate')
  const tModels = useTranslations('Models')
  const { state, dispatch } = useStudioForm()
  const loraStack = useActiveLoraStack()
  const { modelOptions, selectedModel } = useImageModelOptions()
  const lastAutoSwitchKey = useRef<string | null>(null)
  const primaryLora = loraStack.items[0] ?? null
  const primaryLoraId = primaryLora?.asset.id ?? null
  const primaryLoraBaseModel = primaryLora?.asset.baseModelFamily ?? null
  const primaryLoraKey =
    primaryLoraId && primaryLoraBaseModel
      ? `${primaryLoraId}:${primaryLoraBaseModel}`
      : null

  const recommendedRoute = useMemo(
    () =>
      primaryLoraBaseModel
        ? findUsableRecommendedLoraRoute(modelOptions, primaryLoraBaseModel)
        : null,
    [modelOptions, primaryLoraBaseModel],
  )
  const recommendedModelId = useMemo(
    () =>
      primaryLoraBaseModel
        ? getRecommendedLoraImageModelId(primaryLoraBaseModel)
        : null,
    [primaryLoraBaseModel],
  )
  const isCurrentModelCompatible = primaryLoraBaseModel
    ? isImageModelCompatibleWithLoraFamily(
        selectedModel?.modelId ?? null,
        primaryLoraBaseModel,
      )
    : true
  const modelMatchName =
    isCurrentModelCompatible && selectedModel
      ? getTranslatedModelLabel(tModels, selectedModel.modelId)
      : recommendedModelId
        ? getTranslatedModelLabel(tModels, recommendedModelId)
        : (primaryLoraBaseModel ?? '')

  useEffect(() => {
    if (!primaryLoraKey) {
      lastAutoSwitchKey.current = null
      return
    }
    if (lastAutoSwitchKey.current === primaryLoraKey) return
    if (isCurrentModelCompatible || !recommendedRoute) return

    if (state.selectedOptionId !== recommendedRoute.optionId) {
      dispatch({ type: 'SET_OPTION_ID', payload: recommendedRoute.optionId })
    }
    lastAutoSwitchKey.current = primaryLoraKey
  }, [
    dispatch,
    isCurrentModelCompatible,
    primaryLoraKey,
    recommendedRoute,
    state.selectedOptionId,
  ])

  const setPrompt = useCallback(
    (value: string) => {
      dispatch({ type: 'SET_PROMPT', payload: value })
    },
    [dispatch],
  )

  const setNegativePrompt = useCallback(
    (value: string) => {
      const next: AdvancedParams = { ...state.advancedParams }
      if (value.trim()) {
        next.negativePrompt = value
      } else {
        delete next.negativePrompt
      }
      dispatch({ type: 'SET_ADVANCED_PARAMS', payload: next })
    },
    [dispatch, state.advancedParams],
  )

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('promptLabel')}
        </label>
        <Textarea
          value={state.prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={t('promptPlaceholder')}
          disabled={disabled}
          className="min-h-24 resize-none text-sm"
        />
      </section>

      <section className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('negativeLabel')}
        </label>
        <Textarea
          value={state.advancedParams.negativePrompt ?? ''}
          onChange={(event) => setNegativePrompt(event.target.value)}
          placeholder={t('negativePlaceholder')}
          disabled={disabled}
          className="min-h-20 resize-none text-sm"
        />
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('loraStack')}
          </h3>
          <span className="text-2xs font-semibold text-muted-foreground">
            {loraStack.items.length}/{LORA_STACK_MAX}
          </span>
        </div>

        {loraStack.items.length > 0 ? (
          <div className="space-y-2">
            {primaryLoraBaseModel ? (
              <ModelMatchNotice
                canSwitch={Boolean(recommendedRoute)}
                isCompatible={isCurrentModelCompatible}
                modelName={modelMatchName}
              />
            ) : null}
            {loraStack.items.map((entry) => (
              <LoraGenerateRow
                key={entry.asset.id}
                asset={entry.asset}
                scale={entry.scale ?? entry.asset.defaultScale}
                prompt={state.prompt}
                negativePrompt={state.advancedParams.negativePrompt}
                disabled={disabled}
                onPromptChange={setPrompt}
                onNegativePromptChange={setNegativePrompt}
                onRemove={loraStack.remove}
                onSetScale={loraStack.setScale}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-4 text-center">
            <Diamond
              className="mx-auto size-5 text-muted-foreground"
              aria-hidden
            />
            <p className="mt-2 text-sm font-medium">{t('emptyTitle')}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('emptyDescription')}
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link
                href={`${ROUTES.STUDIO_LORA}?${LORA_WORKBENCH_SEARCH_PARAM}=${LORA_WORKBENCH_SECTIONS.COMMUNITY}`}
                onClick={onClose}
              >
                <ExternalLink className="size-4" aria-hidden />
                {t('openLibrary')}
              </Link>
            </Button>
          </div>
        )}

        {loraStack.items.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground"
            onClick={loraStack.clear}
            disabled={disabled}
          >
            <Trash2 className="size-4" aria-hidden />
            {t('clearAll')}
          </Button>
        ) : null}
      </section>
    </div>
  )
}

interface LoraGenerateRowProps {
  asset: LoraAssetRecord
  scale: number
  prompt: string
  negativePrompt?: string
  disabled?: boolean
  onPromptChange: (value: string) => void
  onNegativePromptChange: (value: string) => void
  onRemove: (assetId: string) => void
  onSetScale: (assetId: string, scale: number) => void
}

interface ModelMatchNoticeProps {
  canSwitch: boolean
  isCompatible: boolean
  modelName: string
}

function ModelMatchNotice({
  canSwitch,
  isCompatible,
  modelName,
}: ModelMatchNoticeProps) {
  const t = useTranslations('LoraPromptControl.generate')
  const tone = isCompatible
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
    : 'border-amber-400/30 bg-amber-400/10 text-amber-100'
  const message = isCompatible
    ? t('modelMatched', { model: modelName })
    : canSwitch
      ? t('modelSwitching', { model: modelName })
      : t('modelUnavailable', { model: modelName })

  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-xs',
        tone,
      )}
    >
      {isCompatible ? (
        <Check className="size-3.5 shrink-0" aria-hidden />
      ) : (
        <SlidersHorizontal className="size-3.5 shrink-0" aria-hidden />
      )}
      <span className="truncate font-medium">{message}</span>
    </div>
  )
}

function LoraGenerateRow({
  asset,
  scale,
  prompt,
  negativePrompt,
  disabled,
  onPromptChange,
  onNegativePromptChange,
  onRemove,
  onSetScale,
}: LoraGenerateRowProps) {
  const t = useTranslations('LoraPromptControl.generate')
  const minedPrompts = useCivitaiMinedPrompts(asset)
  const sourceMatch = useMemo(
    () => buildSourceMatchedLoraPrompt(asset, minedPrompts.outfits),
    [asset, minedPrompts.outfits],
  )
  const triggerInPrompt = useMemo(
    () => promptIncludesTrigger(prompt, asset.triggerWord),
    [asset.triggerWord, prompt],
  )

  // Mining may still resolve a reliable source prompt — keep the button in a
  // loading state instead of "unavailable" until the fetch settles.
  const sourceMatchLoading = minedPrompts.isLoading
  const sourceMatchUnavailable = !sourceMatch.reliable && !sourceMatchLoading

  const handleInsertTrigger = useCallback(() => {
    const trimmed = asset.triggerWord.trim()
    if (!trimmed || triggerInPrompt) return
    onPromptChange(prompt.trim() ? `${trimmed}, ${prompt.trim()}` : trimmed)
  }, [asset.triggerWord, onPromptChange, prompt, triggerInPrompt])

  const handleUseStarter = useCallback(() => {
    const starterPrompt = asset.recommendedPrompt?.trim()
    if (!starterPrompt) return
    onPromptChange(starterPrompt)
  }, [asset.recommendedPrompt, onPromptChange])

  const handleApplySourceMatch = useCallback(() => {
    // Guard: never apply an unreliable (bare-trigger) result — it would just
    // ship a generic image unrelated to the source. The button is disabled in
    // this state, but guard here too so a stray call can't degrade the prompt.
    if (!sourceMatch.reliable) return
    onPromptChange(sourceMatch.prompt)
    if (sourceMatch.negativePrompt) {
      onNegativePromptChange(
        mergeNegativePrompt(negativePrompt, sourceMatch.negativePrompt),
      )
    }
    onSetScale(asset.id, sourceMatch.scale)
  }, [
    asset.id,
    negativePrompt,
    onNegativePromptChange,
    onPromptChange,
    onSetScale,
    sourceMatch,
  ])

  return (
    <article className="rounded-lg border border-border/70 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <Diamond
              className="size-3.5 shrink-0 fill-current text-violet-600"
              aria-hidden
            />
            <h4 className="truncate text-sm font-semibold text-foreground">
              {asset.name}
            </h4>
          </div>
          <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
            {asset.triggerWord}
          </p>
          <p className="mt-0.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            {asset.baseModelFamily}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => onRemove(asset.id)}
          disabled={disabled}
          aria-label={t('remove')}
        >
          <X className="size-3.5" aria-hidden />
        </Button>
      </div>

      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-medium text-muted-foreground">
            {t('scale')}
          </span>
          <span className="font-mono text-muted-foreground">
            {scale.toFixed(2)}
          </span>
        </div>
        <Slider
          value={[scale]}
          min={0}
          max={1.5}
          step={0.05}
          disabled={disabled}
          onValueChange={(value) => {
            const next = value[0]
            if (typeof next === 'number') {
              onSetScale(asset.id, Number(next.toFixed(2)))
            }
          }}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Button
          type="button"
          variant="default"
          size="xs"
          onClick={handleApplySourceMatch}
          disabled={disabled || sourceMatchLoading || !sourceMatch.reliable}
          title={
            sourceMatchLoading
              ? t('sourceMatch.loading')
              : sourceMatch.reliable
                ? t(`sourceMatch.${sourceMatch.source}`)
                : t('sourceMatch.unavailable')
          }
        >
          <SparklesIcon />
          {t('useSourceMatch')}
        </Button>
        <Button
          type="button"
          variant={triggerInPrompt ? 'secondary' : 'outline'}
          size="xs"
          onClick={handleInsertTrigger}
          disabled={disabled || triggerInPrompt}
        >
          {triggerInPrompt ? (
            <Check className="size-3.5" aria-hidden />
          ) : (
            <Plus className="size-3.5" aria-hidden />
          )}
          {triggerInPrompt ? t('inPrompt') : t('insertTrigger')}
        </Button>
        {asset.recommendedPrompt?.trim() ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={handleUseStarter}
            disabled={disabled}
          >
            {t('useStarter')}
          </Button>
        ) : null}
        {sourceMatchLoading ? (
          <span className="inline-flex h-6 items-center rounded-md px-1.5 text-2xs font-medium text-muted-foreground">
            {t('sourceMatch.loading')}
          </span>
        ) : null}
        {sourceMatchUnavailable ? (
          <span className="inline-flex h-6 items-center rounded-md px-1.5 text-2xs font-medium text-amber-300/90">
            {t('sourceMatch.unavailable')}
          </span>
        ) : null}
      </div>
    </article>
  )
}

function SparklesIcon() {
  return <Diamond className="size-3.5 fill-current" aria-hidden />
}
