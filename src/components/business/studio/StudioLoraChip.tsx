'use client'

import { useCallback, useMemo, useState } from 'react'
import * as Toolbar from '@radix-ui/react-toolbar'
import { toast } from 'sonner'
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  CircleSlash,
  Palette,
  Share2,
  Wand2,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  LORA_WORKBENCH_SEARCH_PARAM,
  LORA_WORKBENCH_SECTIONS,
} from '@/constants/lora'
import { AI_MODELS } from '@/constants/models'
import { IMAGE_MODEL_OPTIONS } from '@/constants/models/image'
import { AI_ADAPTER_TYPES, getProviderLabel } from '@/constants/providers'
import { ROUTES } from '@/constants/routes'
import { useStudioForm } from '@/contexts/studio-context'
import { useActiveLoraStack } from '@/hooks/use-active-lora-stack'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { Link } from '@/i18n/navigation'
import { buildLoraPromptTemplate } from '@/lib/lora-prompt-template'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { QuickSetupDialog } from '@/components/business/studio/QuickSetupDialog'
import { Popover, PopoverTrigger } from '@/components/ui/popover'
import {
  StudioToolPopoverContent,
  studioToolTriggerClass,
} from '@/components/business/studio/tool-surface'
import { Slider } from '@/components/ui/slider'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const SCALE_MIN = 0
const SCALE_MAX = 1.5
const SCALE_STEP = 0.05

/**
 * Whole-word, case-insensitive check for whether the user has already
 * written the LoRA's trigger word in their prompt. Without this we'd
 * insert "concept" on every click and end up with "concept, concept,
 * concept, a girl" — Civitai-style triggers are common English words
 * so substring matching would over-fire ("concept" in "conceptual").
 */
function promptIncludesTrigger(prompt: string, trigger: string): boolean {
  const escaped = trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(^|[^A-Za-z0-9_])${escaped}([^A-Za-z0-9_]|$)`, 'i')
  return re.test(prompt)
}

type CompatibilityKind =
  | 'ok' // model supports LoRA and family matches (or stack is empty)
  | 'family-mismatch' // model supports LoRA but stack family does not match
  | 'unsupported' // current model has supportsLora: false
  | 'no-model' // user has not picked a model yet

interface QuickSetupTarget {
  modelId: string
  modelLabel: string
  adapterType: AI_ADAPTER_TYPES
  optionId: string
}

interface Compatibility {
  kind: CompatibilityKind
  /** What family the loaded LoRAs need (e.g. "Flux.1 D", "SDXL 1.0"). */
  neededFamily: string | null
  /**
   * Concrete route to switch to. `optionId` is the keyId+modelId composite
   * the studio reducer expects; we only fill this when the user actually
   * has a usable route (saved key OR free-tier). If null but
   * `quickSetupTarget` is set, the user needs to add an API key — we
   * open QuickSetupDialog instead of dispatching a placeholder route.
   */
  recommendedOptionId: string | null
  recommendedModelName: string | null
  /** Provider label ("FAL", "Replicate") of the recommended model — shown
   *  in the "needs API key" hint so users know what to configure. */
  recommendedProviderLabel: string | null
  /** When the user has no saved key for the recommended model but the
   *  model itself exists, this carries the modelId + adapter info needed
   *  to launch QuickSetupDialog directly from the "切到 X" button — no
   *  intermediate "needs API key" copy step. */
  quickSetupTarget: QuickSetupTarget | null
  currentModelName: string | null
}

/**
 * Group Civitai's many base-model strings into the two PixelVault model
 * families we actually have generation paths for. Used to answer "can this
 * model run this LoRA?" The Civitai LoRA library returns things like
 * "Flux.1 D", "SDXL 1.0", "Illustrious", "Pony", "SD 1.5", etc.
 */
type FamilyBucket = 'flux' | 'sdxl' | 'anima' | 'other'

function familyBucket(raw: string): FamilyBucket {
  const v = raw.toLowerCase()
  if (v.includes('flux')) return 'flux'
  if (v.includes('anima')) return 'anima'
  if (
    v.includes('sdxl') ||
    v.includes('illustrious') ||
    v.includes('pony') ||
    v.includes('noobai')
  ) {
    return 'sdxl'
  }
  return 'other'
}

function modelBucket(modelId: string | null): FamilyBucket | null {
  if (!modelId) return null
  const option = IMAGE_MODEL_OPTIONS.find((m) => m.id === modelId)
  if (!option?.supportsLora) return 'other'
  if (option.id === AI_MODELS.FLUX_2_DEV || option.id === AI_MODELS.FLUX_LORA) {
    return 'flux'
  }
  if (option.id === AI_MODELS.ILLUSTRIOUS_XL) return 'sdxl'
  if (option.id === AI_MODELS.ANIMA_PENCIL_XL) return 'anima'
  return 'other'
}

interface StudioLoraChipProps {
  disabled?: boolean
}

export function StudioLoraChip({ disabled }: StudioLoraChipProps) {
  const t = useTranslations('StudioLoraChip')
  const tModels = useTranslations('Models')
  const { state, dispatch } = useStudioForm()
  const { modelOptions, selectedModel } = useImageModelOptions()
  const { items, setScale, remove, clear, getShareUrl } = useActiveLoraStack()

  const handleShare = useCallback(async () => {
    const url = getShareUrl()
    if (!url) {
      toast.info(t('shareEmpty'))
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t('shareCopied'))
    } catch {
      toast.error(t('shareCopyFailed'))
    }
  }, [getShareUrl, t])

  const handleInsertTrigger = useCallback(
    (triggerWord: string) => {
      const trimmed = triggerWord.trim()
      if (!trimmed) return
      if (promptIncludesTrigger(state.prompt, trimmed)) return
      const next = state.prompt.trim()
        ? `${trimmed}, ${state.prompt.trim()}`
        : trimmed
      dispatch({ type: 'SET_PROMPT', payload: next })
      toast.success(t('triggerInserted', { word: trimmed }))
    },
    [dispatch, state.prompt, t],
  )

  const handleUseTemplate = useCallback(
    (asset: {
      triggerWord: string
      type: 'subject' | 'style'
      name: string
      // Author-recommended prompt from Civitai trainedWords / description
      // code blocks. When present buildLoraPromptTemplate prefers it over
      // our generic "portrait, dynamic pose, …" scaffold — passing this
      // through is the difference between LoRAs actually activating (the
      // wuthering-waves Denia case) and the user copying a useless template.
      recommendedPrompt?: string | null
    }) => {
      const template = buildLoraPromptTemplate(asset)
      dispatch({ type: 'SET_PROMPT', payload: template })
      toast.success(t('templateApplied', { name: asset.name }))
    },
    [dispatch, t],
  )
  const count = items.length
  const open = state.panels.loraSelector

  const compatibility = useMemo<Compatibility>(() => {
    // Selected model is resolved via the studio's own route resolver
    // (workspace + saved keys + free tier). If it's null the user has not
    // picked one yet — treat that as 'no-model'.
    const currentImageModel = selectedModel
      ? (IMAGE_MODEL_OPTIONS.find((m) => m.id === selectedModel.modelId) ??
        null)
      : null
    const currentModelName = currentImageModel
      ? getTranslatedModelLabel(tModels, currentImageModel.id)
      : null

    if (items.length === 0) {
      return {
        kind: currentImageModel ? 'ok' : 'no-model',
        neededFamily: null,
        recommendedOptionId: null,
        recommendedModelName: null,
        recommendedProviderLabel: null,
        quickSetupTarget: null,
        currentModelName,
      }
    }

    const family = familyBucket(items[0]!.asset.baseModelFamily)
    // Flux LoRAs go to fal-ai/flux-lora, the canonical FLUX.1 LoRA
    // endpoint — flux-2-dev's LoRA injection is less reliable.
    const recommendedModelId =
      family === 'flux'
        ? AI_MODELS.FLUX_LORA
        : family === 'sdxl'
          ? AI_MODELS.ILLUSTRIOUS_XL
          : family === 'anima'
            ? AI_MODELS.ANIMA_PENCIL_XL
            : null

    // The model itself (label + provider label) is always known from the
    // static IMAGE_MODEL_OPTIONS table — we want to show "推荐 X (需要 Y key)"
    // even when the user has no route configured yet.
    const recommendedStaticOption = recommendedModelId
      ? (IMAGE_MODEL_OPTIONS.find(
          (m) => m.id === recommendedModelId && m.available,
        ) ?? null)
      : null
    const recommendedModelName = recommendedStaticOption
      ? getTranslatedModelLabel(tModels, recommendedStaticOption.id)
      : null
    const recommendedProviderLabel = recommendedStaticOption
      ? getProviderLabel(recommendedStaticOption.providerConfig)
      : null

    // Find a route the user can actually generate with: saved API key first,
    // then free-tier. We deliberately do NOT fall back to a workspace
    // placeholder because that route has no key and `dispatch SET_OPTION_ID`
    // to it leaves the user staring at a "fake selected" model that silently
    // fails on generate.
    const candidates = recommendedModelId
      ? modelOptions.filter((o) => o.modelId === recommendedModelId)
      : []
    const recommendedRoute =
      candidates.find((o) => o.sourceType === 'saved') ??
      candidates.find((o) => o.freeTier) ??
      null

    const recommended = recommendedRoute
      ? {
          optionId: recommendedRoute.optionId,
          name: recommendedModelName ?? recommendedRoute.modelId,
        }
      : null

    // If there's no usable route (no saved key, no free tier) but the model
    // exists as a workspace placeholder, capture enough info to launch
    // QuickSetupDialog directly from the "切到 X" button — skip the
    // intermediate "needs API key" copy step the user reported.
    const quickSetupTarget: QuickSetupTarget | null =
      !recommended && recommendedStaticOption && recommendedModelName
        ? (() => {
            const placeholder = candidates[0]
            if (!placeholder) return null
            return {
              modelId: recommendedStaticOption.id,
              modelLabel: recommendedModelName,
              adapterType: recommendedStaticOption.adapterType,
              optionId: placeholder.optionId,
            }
          })()
        : null

    if (!currentImageModel) {
      return {
        kind: 'no-model',
        neededFamily: items[0]!.asset.baseModelFamily,
        recommendedOptionId: recommended?.optionId ?? null,
        recommendedModelName: recommendedModelName ?? null,
        recommendedProviderLabel,
        quickSetupTarget,
        currentModelName: null,
      }
    }

    if (!currentImageModel.supportsLora) {
      return {
        kind: 'unsupported',
        neededFamily: items[0]!.asset.baseModelFamily,
        recommendedOptionId: recommended?.optionId ?? null,
        recommendedModelName: recommendedModelName ?? null,
        recommendedProviderLabel,
        quickSetupTarget,
        currentModelName,
      }
    }

    if (modelBucket(currentImageModel.id) !== family) {
      return {
        kind: 'family-mismatch',
        neededFamily: items[0]!.asset.baseModelFamily,
        recommendedOptionId: recommended?.optionId ?? null,
        recommendedModelName: recommendedModelName ?? null,
        recommendedProviderLabel,
        quickSetupTarget,
        currentModelName,
      }
    }

    return {
      kind: 'ok',
      neededFamily: items[0]!.asset.baseModelFamily,
      recommendedOptionId: null,
      recommendedModelName: null,
      recommendedProviderLabel: null,
      quickSetupTarget: null,
      currentModelName,
    }
  }, [items, modelOptions, selectedModel, tModels])

  const [quickSetup, setQuickSetup] = useState<{
    open: boolean
    target: QuickSetupTarget | null
  }>({ open: false, target: null })

  const handlePickRecommended = () => {
    // Prefer dispatching a real route the user already has (saved key /
    // free tier). If none exists but the model is wired up, jump straight
    // into QuickSetupDialog so the user can paste their key + auto-select
    // the model in one step (skipping the old "needs API key" copy block).
    if (compatibility.recommendedOptionId) {
      dispatch({
        type: 'SET_OPTION_ID',
        payload: compatibility.recommendedOptionId,
      })
      return
    }
    if (compatibility.quickSetupTarget) {
      setQuickSetup({ open: true, target: compatibility.quickSetupTarget })
    }
  }

  return (
    <>
      {quickSetup.target ? (
        <QuickSetupDialog
          open={quickSetup.open}
          onOpenChange={(open) => setQuickSetup((prev) => ({ ...prev, open }))}
          modelId={quickSetup.target.modelId}
          modelLabel={quickSetup.target.modelLabel}
          adapterType={quickSetup.target.adapterType}
          optionId={quickSetup.target.optionId}
        />
      ) : null}
      <Popover
        open={open}
        onOpenChange={(nextOpen) =>
          dispatch({
            type: nextOpen ? 'OPEN_PANEL' : 'CLOSE_PANEL',
            payload: 'loraSelector',
          })
        }
      >
        <PopoverTrigger asChild>
          <Toolbar.Button
            type="button"
            disabled={disabled}
            aria-label={
              count > 0 ? t('triggerWithCount', { count }) : t('trigger')
            }
            className={cn(
              studioToolTriggerClass,
              count > 0 || open
                ? 'bg-muted/30 text-primary'
                : 'text-muted-foreground',
            )}
          >
            <Palette className="size-4" aria-hidden />
            <span className="hidden sm:inline">{t('label')}</span>
            {count > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-white">
                {count}
              </span>
            ) : null}
          </Toolbar.Button>
        </PopoverTrigger>
        <StudioToolPopoverContent
          size="action"
          className="max-h-[min(560px,72vh)] w-80 space-y-3 overflow-y-auto p-4"
          align="end"
          side="top"
        >
          <CompatibilityBanner
            compatibility={compatibility}
            loadedCount={items.length}
            onPickRecommended={handlePickRecommended}
          />

          {items.length === 0 ? (
            <div className="rounded-lg border border-border/60 bg-card/45 p-3">
              <div className="flex items-start gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Palette className="size-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {t('emptyTitle')}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {t('emptyHint')}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid gap-2">
                <Link
                  href={`${ROUTES.STUDIO_LORA}?${LORA_WORKBENCH_SEARCH_PARAM}=${LORA_WORKBENCH_SECTIONS.COMMUNITY}`}
                  className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-semibold text-background transition-colors hover:bg-foreground/90"
                >
                  {t('emptyAction')}
                  <ArrowUpRight className="size-3.5" aria-hidden />
                </Link>
                <Link
                  href={`${ROUTES.STUDIO_LORA}?${LORA_WORKBENCH_SEARCH_PARAM}=${LORA_WORKBENCH_SECTIONS.TRAIN}`}
                  className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-muted px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted/80"
                >
                  {t('emptyTrainAction')}
                </Link>
              </div>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {items.map((entry) => {
                const scale = entry.scale ?? entry.asset.defaultScale
                const triggerInPrompt = promptIncludesTrigger(
                  state.prompt,
                  entry.asset.triggerWord,
                )
                return (
                  <li
                    key={entry.asset.id}
                    className="rounded-lg border border-border/60 bg-card/40 p-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {entry.asset.name}
                        </p>
                        <p className="truncate text-2xs text-muted-foreground">
                          {entry.asset.baseModelFamily}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(entry.asset.id)}
                        className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label={t('removeAria', { name: entry.asset.name })}
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        handleInsertTrigger(entry.asset.triggerWord)
                      }
                      disabled={triggerInPrompt}
                      className={cn(
                        'mt-2 inline-flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1 text-2xs font-mono transition-colors',
                        triggerInPrompt
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : 'border-border/60 text-foreground hover:bg-muted',
                      )}
                      aria-label={
                        triggerInPrompt
                          ? t('triggerAlreadyInPrompt')
                          : t('insertTrigger', {
                              word: entry.asset.triggerWord,
                            })
                      }
                      title={
                        triggerInPrompt
                          ? t('triggerAlreadyInPrompt')
                          : t('insertTriggerHint')
                      }
                    >
                      <span className="truncate">
                        {entry.asset.triggerWord}
                      </span>
                      <span className="shrink-0 text-2xs">
                        {triggerInPrompt
                          ? t('triggerInPromptBadge')
                          : t('insertTriggerBadge')}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handleUseTemplate({
                          triggerWord: entry.asset.triggerWord,
                          type: entry.asset.type,
                          name: entry.asset.name,
                          recommendedPrompt: entry.asset.recommendedPrompt,
                        })
                      }
                      className="mt-1.5 inline-flex w-full items-center justify-between gap-2 rounded-md border border-border/60 px-2 py-1 text-2xs transition-colors hover:bg-muted"
                      aria-label={t('useTemplate', { name: entry.asset.name })}
                      title={t('useTemplateHint')}
                    >
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Wand2 className="size-3" aria-hidden />
                        {t('useTemplate', { name: entry.asset.name })}
                      </span>
                      <span className="shrink-0 text-2xs text-muted-foreground">
                        {t('useTemplateBadge')}
                      </span>
                    </button>

                    <div className="mt-2 flex items-center gap-3">
                      <Slider
                        min={SCALE_MIN}
                        max={SCALE_MAX}
                        step={SCALE_STEP}
                        value={[scale]}
                        onValueChange={(next) => {
                          const v = next[0]
                          if (typeof v === 'number') {
                            setScale(entry.asset.id, v)
                          }
                        }}
                        className="flex-1"
                      />
                      <span className="w-12 shrink-0 text-right font-mono text-xs">
                        ×{scale.toFixed(2)}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {items.length > 0 ? (
            <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
              <Link
                href={`${ROUTES.STUDIO_LORA}?${LORA_WORKBENCH_SEARCH_PARAM}=${LORA_WORKBENCH_SECTIONS.COMMUNITY}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:text-primary"
              >
                <ArrowUpRight className="size-3.5" aria-hidden />
                {t('openLibrary')}
              </Link>
              <div className="flex items-center gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => void handleShare()}
                  className="inline-flex items-center gap-1 font-medium text-foreground hover:text-primary"
                  aria-label={t('share')}
                  title={t('share')}
                >
                  <Share2 className="size-3.5" aria-hidden />
                  {t('share')}
                </button>
                <button
                  type="button"
                  onClick={clear}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {t('clearAll')}
                </button>
              </div>
            </div>
          ) : null}
        </StudioToolPopoverContent>
      </Popover>
    </>
  )
}

interface CompatibilityBannerProps {
  compatibility: Compatibility
  loadedCount: number
  onPickRecommended: () => void
}

function CompatibilityBanner({
  compatibility,
  loadedCount,
  onPickRecommended,
}: CompatibilityBannerProps) {
  const t = useTranslations('StudioLoraChip')
  // Either path leads through onPickRecommended — directly dispatch when
  // recommendedOptionId is set (saved key / free tier), otherwise open
  // QuickSetupDialog via quickSetupTarget. UI label differs based on which.
  const isReadyToSwitch = Boolean(compatibility.recommendedOptionId)
  const canTakeAction =
    (isReadyToSwitch || Boolean(compatibility.quickSetupTarget)) &&
    Boolean(compatibility.recommendedModelName)

  if (loadedCount === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <Palette className="size-3.5 shrink-0" aria-hidden />
        <span>{t('bannerEmpty')}</span>
      </div>
    )
  }

  if (compatibility.kind === 'ok') {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          {t('bannerOk', {
            model: compatibility.currentModelName ?? '',
          })}
        </span>
      </div>
    )
  }

  const Icon =
    compatibility.kind === 'unsupported' ? CircleSlash : AlertTriangle
  const tone =
    compatibility.kind === 'unsupported'
      ? 'bg-destructive/10 text-destructive'
      : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'

  return (
    <div
      className={cn('flex flex-col gap-2 rounded-lg px-3 py-2 text-xs', tone)}
    >
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          {compatibility.kind === 'no-model'
            ? t('bannerNoModel', {
                family: compatibility.neededFamily ?? '',
              })
            : compatibility.kind === 'unsupported'
              ? t('bannerUnsupported', {
                  model: compatibility.currentModelName ?? '',
                  family: compatibility.neededFamily ?? '',
                })
              : t('bannerFamilyMismatch', {
                  model: compatibility.currentModelName ?? '',
                  family: compatibility.neededFamily ?? '',
                })}
        </span>
      </div>
      {canTakeAction ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onPickRecommended}
              className="self-start rounded-md border border-current px-2 py-0.5 text-2xs font-medium hover:bg-current/10"
            >
              {isReadyToSwitch
                ? t('pickModel', {
                    model: compatibility.recommendedModelName ?? '',
                  })
                : t('pickModelSetup', {
                    model: compatibility.recommendedModelName ?? '',
                  })}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {isReadyToSwitch ? t('pickModelHint') : t('pickModelSetupHint')}
          </TooltipContent>
        </Tooltip>
      ) : compatibility.neededFamily ? (
        // No recommended model wired up for this family at all (e.g. SD 1.5).
        // Tell users it's a platform-side gap, not a misconfiguration.
        <p className="self-start rounded-md border border-current/50 bg-current/5 px-2 py-1 text-2xs leading-snug">
          {t('bannerNoEndpoint', {
            family: compatibility.neededFamily,
          })}
        </p>
      ) : null}
    </div>
  )
}
