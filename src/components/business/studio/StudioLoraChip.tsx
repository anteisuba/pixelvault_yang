'use client'

import { useCallback, useMemo } from 'react'
import Link from 'next/link'
import * as Toolbar from '@radix-ui/react-toolbar'
import { toast } from 'sonner'
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  CircleSlash,
  Palette,
  Share2,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  LORA_WORKBENCH_SEARCH_PARAM,
  LORA_WORKBENCH_SECTIONS,
} from '@/constants/lora'
import { IMAGE_MODEL_OPTIONS } from '@/constants/models/image'
import { ROUTES } from '@/constants/routes'
import { useStudioForm } from '@/contexts/studio-context'
import { useActiveLoraStack } from '@/hooks/use-active-lora-stack'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { getTranslatedModelLabel } from '@/lib/model-options'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
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

interface Compatibility {
  kind: CompatibilityKind
  /** What family the loaded LoRAs need (e.g. "Flux.1 D", "SDXL 1.0"). */
  neededFamily: string | null
  /**
   * Concrete route to switch to. `optionId` is the keyId+modelId composite
   * the studio reducer expects; `modelName` is for display. Null when the
   * user has no configured route for the recommended model — they need to
   * add an API key themselves.
   */
  recommendedOptionId: string | null
  recommendedModelName: string | null
  currentModelName: string | null
}

/**
 * Group Civitai's many base-model strings into the two PixelVault model
 * families we actually have generation paths for. Used to answer "can this
 * model run this LoRA?" The Civitai LoRA library returns things like
 * "Flux.1 D", "SDXL 1.0", "Illustrious", "Pony", "SD 1.5", etc.
 */
function familyBucket(raw: string): 'flux' | 'sdxl' | 'other' {
  const v = raw.toLowerCase()
  if (v.includes('flux')) return 'flux'
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

function modelBucket(modelId: string | null): 'flux' | 'sdxl' | 'other' | null {
  if (!modelId) return null
  const option = IMAGE_MODEL_OPTIONS.find((m) => m.id === modelId)
  if (!option?.supportsLora) return 'other'
  // FLUX_2_DEV + FLUX_LORA → flux; ILLUSTRIOUS_XL → sdxl
  if (option.id === 'flux-2-dev' || option.id === 'flux-lora') return 'flux'
  if (option.id === 'illustrious-xl') return 'sdxl'
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
  const count = items.length

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
        currentModelName,
      }
    }

    const family = familyBucket(items[0]!.asset.baseModelFamily)
    const recommendedModelId =
      family === 'flux'
        ? 'flux-2-dev'
        : family === 'sdxl'
          ? 'illustrious-xl'
          : null

    // Find a configured route the user can actually use (saved key OR free).
    // Workspace routes without a saved key won't generate, so prefer 'saved'
    // first, then any 'workspace' option as a last resort. This way the
    // "Switch to X" button only fires when it leads somewhere generateable.
    const candidates = recommendedModelId
      ? modelOptions.filter((o) => o.modelId === recommendedModelId)
      : []
    const recommendedRoute =
      candidates.find((o) => o.sourceType === 'saved') ??
      candidates.find((o) => o.freeTier) ??
      candidates[0] ??
      null

    const recommended = recommendedRoute
      ? {
          optionId: recommendedRoute.optionId,
          name: getTranslatedModelLabel(tModels, recommendedRoute.modelId),
        }
      : null

    if (!currentImageModel) {
      return {
        kind: 'no-model',
        neededFamily: items[0]!.asset.baseModelFamily,
        recommendedOptionId: recommended?.optionId ?? null,
        recommendedModelName: recommended?.name ?? null,
        currentModelName: null,
      }
    }

    if (!currentImageModel.supportsLora) {
      return {
        kind: 'unsupported',
        neededFamily: items[0]!.asset.baseModelFamily,
        recommendedOptionId: recommended?.optionId ?? null,
        recommendedModelName: recommended?.name ?? null,
        currentModelName,
      }
    }

    if (modelBucket(currentImageModel.id) !== family) {
      return {
        kind: 'family-mismatch',
        neededFamily: items[0]!.asset.baseModelFamily,
        recommendedOptionId: recommended?.optionId ?? null,
        recommendedModelName: recommended?.name ?? null,
        currentModelName,
      }
    }

    return {
      kind: 'ok',
      neededFamily: items[0]!.asset.baseModelFamily,
      recommendedOptionId: null,
      recommendedModelName: null,
      currentModelName,
    }
  }, [items, modelOptions, selectedModel, tModels])

  const handlePickRecommended = () => {
    if (compatibility.recommendedOptionId) {
      dispatch({
        type: 'SET_OPTION_ID',
        payload: compatibility.recommendedOptionId,
      })
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Toolbar.Button
          type="button"
          disabled={disabled}
          aria-label={
            count > 0 ? t('triggerWithCount', { count }) : t('trigger')
          }
          className={cn(
            'relative inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm transition-all duration-200',
            'hover:bg-muted/30 hover:text-foreground hover:scale-[1.03] active:scale-[0.95]',
            'focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none',
            count > 0 ? 'bg-muted/30 text-primary' : 'text-muted-foreground',
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
      <PopoverContent className="w-80 space-y-3" align="end" side="top">
        <CompatibilityBanner
          compatibility={compatibility}
          loadedCount={items.length}
          onPickRecommended={handlePickRecommended}
        />

        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground">
            {t('emptyHint')}
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
                    onClick={() => handleInsertTrigger(entry.asset.triggerWord)}
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
                    <span className="truncate">{entry.asset.triggerWord}</span>
                    <span className="shrink-0 text-2xs">
                      {triggerInPrompt
                        ? t('triggerInPromptBadge')
                        : t('insertTriggerBadge')}
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
                        if (typeof v === 'number') setScale(entry.asset.id, v)
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

        <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
          <Link
            href={`${ROUTES.STUDIO_LORA}?${LORA_WORKBENCH_SEARCH_PARAM}=${LORA_WORKBENCH_SECTIONS.COMMUNITY}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:text-primary"
          >
            <ArrowUpRight className="size-3.5" aria-hidden />
            {t('openLibrary')}
          </Link>
          <div className="flex items-center gap-3 text-xs">
            {items.length > 0 ? (
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
            ) : null}
            {items.length > 0 ? (
              <button
                type="button"
                onClick={clear}
                className="text-muted-foreground hover:text-foreground"
              >
                {t('clearAll')}
              </button>
            ) : null}
          </div>
        </div>
      </PopoverContent>
    </Popover>
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
      {compatibility.recommendedOptionId &&
      compatibility.recommendedModelName ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onPickRecommended}
              className="self-start rounded-md border border-current px-2 py-0.5 text-2xs font-medium hover:bg-current/10"
            >
              {t('pickModel', { model: compatibility.recommendedModelName })}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('pickModelHint')}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  )
}
