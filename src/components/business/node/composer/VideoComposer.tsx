'use client'

import { useCallback, useEffect, useState, type KeyboardEvent } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Dices,
  Film,
  KeyRound,
  Loader2,
  Lock,
  Sparkles,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { QuickSetupDialog } from '@/components/business/studio-shared/setup/QuickSetupDialog'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import type { AspectRatio } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  NODE_GENERATION_STATUS_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
  NODE_WORKFLOW_FIELD_IDS,
  type NodeWorkflowFieldId,
} from '@/constants/node-types'
import {
  getVideoModelCapabilities,
  videoModelSupportsSeed,
} from '@/constants/video-model-capabilities'
import {
  VIDEO_ASPECT_RATIOS,
  VIDEO_RESOLUTIONS,
  type VideoResolution,
} from '@/constants/video-options'
import { useVideoComposer } from '@/hooks/node/use-video-composer'
import {
  buildNodeWorkflowPrompt,
  getNodeWorkflowFieldValue,
} from '@/lib/node-workflow-prompt'
import {
  getBrandKeyStatus,
  getBrandProviders,
} from '@/lib/video-model-resolver'
import {
  computeVideoRebindPreview,
  hasIgnoredRebindings,
  type VideoRebindPreviewItem,
} from '@/lib/video-rebind-preview'
import { cn } from '@/lib/utils'
import type {
  NodeWorkflowModelOption,
  NodeWorkflowNodeData,
} from '@/types/node-workflow'

import { IMEAwareInput, IMEAwareTextarea } from '../inspector/IMEAwareField'
import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'

interface VideoComposerProps {
  id: string
  data: NodeWorkflowNodeData
  /** 'card' = compact (model chip + summary + generate); 'detail' = full B2
   *  composer hosted in the shared ⤢ detail panel. */
  density: 'card' | 'detail'
}

// fal Seedance duration enum: 'auto' or 4..15 seconds. The slider walks the
// model's supported seconds by index; this is the fallback set when a model
// doesn't declare `supportedDurations`.
const DURATION_SECONDS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const

// Draft b2: a single prompt field — camera/motion ("运镜") go in the prompt,
// not separate fields. This keeps the detail panel compact, not a long scroll.
const EXPAND_TEXT_FIELDS: readonly NodeWorkflowFieldId[] = [
  NODE_WORKFLOW_FIELD_IDS.prompt,
]

const PROVIDER_LABEL_KEYS: Partial<Record<AI_ADAPTER_TYPES, string>> = {
  [AI_ADAPTER_TYPES.FAL]: 'fal',
  [AI_ADAPTER_TYPES.VOLCENGINE]: 'volcengine',
}

function stopCanvasKey(event: KeyboardEvent<HTMLElement>) {
  event.stopPropagation()
}

const KEY_GUARD = {
  onKeyDownCapture: stopCanvasKey,
  onKeyUpCapture: stopCanvasKey,
} as const

function ComposerField({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1">
      <span className="text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
        {label}
      </span>
      {children}
    </label>
  )
}

/**
 * Model-aware video composer mounted on the node card (density='card') and, for
 * now, hosted in a slimmed inspector (density='expand'). Reuses the same
 * capability-driven controls the old SeedanceInspector had, restructured around
 * the two-tier switcher + provider picker. Writes the same `node.data.*` fields.
 */
export function VideoComposer({ id, data, density }: VideoComposerProps) {
  const t = useTranslations('StudioNode.videoGeneration')
  const tFields = useTranslations('StudioNode.workflowFields')
  const tc = useTranslations('StudioNode.videoComposer')
  const {
    updateNodeData,
    generateMediaNode,
    enhanceSeedancePrompt,
    setExpandedNodeId,
  } = useNodeWorkflowActions()
  const composer = useVideoComposer(id, data)
  const [isEnhancing, setIsEnhancing] = useState(false)
  // Pending brand switch awaiting confirmation because it would ignore a bound
  // reference under the new model's capability contract (§5.1 不静默丢).
  const [pendingBrand, setPendingBrand] = useState<{
    brand: string
    preview: VideoRebindPreviewItem[]
  } | null>(null)
  // Brand awaiting an API key via QuickSetupDialog (Hard Rule #8): a needs-key
  // brand opens the dialog instead of going disabled.
  const [quickSetup, setQuickSetup] = useState<{
    open: boolean
    brand: string
    option: NodeWorkflowModelOption
  } | null>(null)
  // The options list refreshes async after a key is verified; select the brand
  // once it actually becomes ready.
  const [pendingSetupBrand, setPendingSetupBrand] = useState<string | null>(
    null,
  )

  const handleEnhance = useCallback(async () => {
    if (!enhanceSeedancePrompt || isEnhancing) return
    setIsEnhancing(true)
    try {
      await enhanceSeedancePrompt(id)
    } finally {
      setIsEnhancing(false)
    }
  }, [enhanceSeedancePrompt, id, isEnhancing])

  // Switch brand directly when every binding maps; otherwise stage a confirm
  // callout that previews 将映射 ✓ / 将忽略 ⚠ before committing.
  const handleSelectBrand = useCallback(
    (brand: string) => {
      if (brand === composer.state.brand) return
      const targetModelId = composer.previewBrandModelId(brand)
      const preview = computeVideoRebindPreview(
        composer.referenceKinds,
        targetModelId,
      )
      if (hasIgnoredRebindings(preview)) {
        setPendingBrand({ brand, preview })
        return
      }
      composer.selectBrand(brand)
    },
    [composer],
  )

  const confirmPendingBrand = useCallback(() => {
    setPendingBrand((pending) => {
      if (pending) composer.selectBrand(pending.brand)
      return null
    })
  }, [composer])

  const cancelPendingBrand = useCallback(() => setPendingBrand(null), [])

  // Brand row click: a ready brand selects (with rebind preview); a needs-key
  // brand opens QuickSetupDialog for its provider instead of disabling the row.
  const handleBrandClick = useCallback(
    (brand: string, status: ReturnType<typeof getBrandKeyStatus>) => {
      if (!status.ready) {
        if (status.setupOption) {
          setQuickSetup({ open: true, brand, option: status.setupOption })
        }
        return
      }
      handleSelectBrand(brand)
    },
    [handleSelectBrand],
  )

  // After QuickSetupDialog verifies a key, the option list refreshes a tick
  // later; apply the brand selection once it shows up as ready.
  const { options: composerOptions, selectBrand: composerSelectBrand } =
    composer
  useEffect(() => {
    if (!pendingSetupBrand) return
    if (getBrandKeyStatus(pendingSetupBrand, composerOptions).ready) {
      composerSelectBrand(pendingSetupBrand)
      setPendingSetupBrand(null)
    }
  }, [pendingSetupBrand, composerOptions, composerSelectBrand])

  const providers = composer.state.brand
    ? getBrandProviders(composer.state.brand, composer.options)
    : []

  const selectedModelId = data.model?.modelId
  const capabilities = selectedModelId
    ? getVideoModelCapabilities(selectedModelId)
    : null
  const supportsSeed = selectedModelId
    ? videoModelSupportsSeed(selectedModelId, composer.hasReferenceInputs)
    : false
  const resolutionOptions =
    capabilities?.supportedResolutions ?? VIDEO_RESOLUTIONS
  const aspectOptions =
    capabilities?.supportedAspectRatios ?? VIDEO_ASPECT_RATIOS

  const currentResolution =
    typeof data.resolution === 'string' &&
    (resolutionOptions as readonly string[]).includes(data.resolution)
      ? (data.resolution as VideoResolution)
      : undefined
  const currentAspect =
    typeof data.aspectRatio === 'string' &&
    (aspectOptions as readonly string[]).includes(data.aspectRatio)
      ? (data.aspectRatio as AspectRatio)
      : undefined
  const currentNegative =
    typeof data.negativePrompt === 'string' ? data.negativePrompt : ''

  const generationStatus =
    data.generationStatus ??
    (data.mediaUrl
      ? NODE_GENERATION_STATUS_IDS.success
      : NODE_GENERATION_STATUS_IDS.idle)
  const isPending =
    generationStatus === NODE_GENERATION_STATUS_IDS.pending ||
    data.status === NODE_STATUS_IDS.running
  const hasMedia = typeof data.mediaUrl === 'string' && data.mediaUrl.length > 0
  const prompt = buildNodeWorkflowPrompt(NODE_TYPE_IDS.seedance, data)

  const handleFieldChange = useCallback(
    (fieldId: NodeWorkflowFieldId, value: string) => {
      const nextData = { ...data, [fieldId]: value }
      updateNodeData(id, {
        [fieldId]: value,
        status: buildNodeWorkflowPrompt(NODE_TYPE_IDS.seedance, nextData).trim()
          ? NODE_STATUS_IDS.ready
          : NODE_STATUS_IDS.idle,
      })
    },
    [data, id, updateNodeData],
  )

  const handleResolutionToggle = useCallback(
    (value: VideoResolution) => {
      updateNodeData(id, {
        resolution: currentResolution === value ? undefined : value,
      })
    },
    [currentResolution, id, updateNodeData],
  )

  const handleAspectToggle = useCallback(
    (value: AspectRatio) => {
      updateNodeData(id, {
        aspectRatio: currentAspect === value ? undefined : value,
      })
    },
    [currentAspect, id, updateNodeData],
  )

  const handleNegativeChange = useCallback(
    (value: string) => {
      const trimmed = value.trim()
      updateNodeData(id, {
        negativePrompt: trimmed.length > 0 ? trimmed : undefined,
      })
    },
    [id, updateNodeData],
  )

  // Duration: a draggable slider that walks the model's supported seconds by
  // index (snaps to valid values, works for non-contiguous sets like Veo 4/6/8),
  // plus an 自动 toggle that hands duration back to the provider ('auto').
  const durationOptions = capabilities?.supportedDurations ?? DURATION_SECONDS
  const currentDurationRaw = getNodeWorkflowFieldValue(
    data,
    NODE_WORKFLOW_FIELD_IDS.duration,
  )
  const isAutoDuration =
    currentDurationRaw === '' || currentDurationRaw === 'auto'
  const parsedDuration = Number(currentDurationRaw)
  const currentDurationSeconds =
    !isAutoDuration && durationOptions.includes(parsedDuration)
      ? parsedDuration
      : (durationOptions[Math.floor(durationOptions.length / 2)] ??
        durationOptions[0] ??
        6)
  const durationIndex = Math.max(
    0,
    durationOptions.indexOf(currentDurationSeconds),
  )

  const handleDurationAuto = useCallback(
    (auto: boolean) => {
      handleFieldChange(
        NODE_WORKFLOW_FIELD_IDS.duration,
        auto ? 'auto' : String(currentDurationSeconds),
      )
    },
    [handleFieldChange, currentDurationSeconds],
  )

  const handleDurationSlide = useCallback(
    (index: number) => {
      const value = durationOptions[index]
      if (value !== undefined) {
        handleFieldChange(NODE_WORKFLOW_FIELD_IDS.duration, String(value))
      }
    },
    [durationOptions, handleFieldChange],
  )

  const handleGenerate = useCallback(() => {
    void generateMediaNode?.(id)
  }, [generateMediaNode, id])

  const disabledReason = isPending
    ? t('generating')
    : !data.model
      ? t('noModel')
      : !prompt.trim() && !composer.hasUpstreamInputs
        ? t('noInput')
        : null
  const generateLabel = hasMedia ? t('regenerate') : t('generate')

  const generateButton = (
    <Button
      type="button"
      {...KEY_GUARD}
      onClick={handleGenerate}
      disabled={Boolean(disabledReason)}
      className="h-10 w-full rounded-xl bg-node-success text-node-canvas hover:bg-node-success/90 disabled:bg-node-panel-inner disabled:text-node-subtle"
    >
      {isPending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Film className="size-4" />
      )}
      {disabledReason ?? generateLabel}
    </Button>
  )

  // Compact card (draft node-types-detail): model chip → opens the ⤢ detail
  // panel + read-only res·dur·aspect summary + ref chips + green generate. All
  // editing (two-tier switcher, params) lives in the detail panel.
  if (density === 'card') {
    const modelLabel = composer.state.brand
      ? composer.state.variant
        ? `${composer.state.brand} · ${tc(`variant.${composer.state.variant}`)}`
        : composer.state.brand
      : tc('pickModel')
    const durationValue = typeof data.duration === 'string' ? data.duration : ''
    const summaryParts = [
      typeof data.resolution === 'string' ? data.resolution : null,
      durationValue
        ? durationValue === 'auto'
          ? tFields('duration.auto')
          : `${durationValue}s`
        : null,
      typeof data.aspectRatio === 'string' ? data.aspectRatio : null,
    ].filter((part): part is string => Boolean(part))

    return (
      <div className="nodrag space-y-2">
        <button
          type="button"
          {...KEY_GUARD}
          onClick={() => setExpandedNodeId(id)}
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-node-panel-inner bg-node-panel-soft px-3 py-2 text-left text-xs font-semibold text-node-foreground transition-colors hover:border-node-edge"
        >
          <span className="truncate">{modelLabel}</span>
          <ChevronDown className="size-3.5 shrink-0 text-node-muted" />
        </button>
        {summaryParts.length > 0 ? (
          <p className="px-0.5 text-2xs text-node-muted">
            {summaryParts.join(' · ')}
          </p>
        ) : null}
        {composer.referenceKinds.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {composer.referenceKinds.map((kind) => (
              <span
                key={kind}
                className="rounded-md border border-node-panel-inner bg-node-panel px-1.5 py-0.5 text-2xs text-node-muted"
              >
                {tc(`refKind.${kind}`)}
              </span>
            ))}
          </div>
        ) : null}
        {generateButton}
      </div>
    )
  }

  return (
    <div className="nodrag space-y-4">
      <div className="space-y-2 rounded-xl border border-node-panel-inner bg-node-panel-soft p-2">
        <span className="px-0.5 text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
          {tc('modelRail.label')}
        </span>
        <div className="space-y-1">
          {composer.brands.map((brand) => {
            const isCurrent = composer.state.brand === brand
            const status = getBrandKeyStatus(brand, composer.options)
            return (
              <div
                key={brand}
                className={cn(
                  'overflow-hidden rounded-lg border transition-colors',
                  isCurrent
                    ? 'border-node-edge bg-node-panel'
                    : 'border-node-panel-inner',
                )}
              >
                <button
                  type="button"
                  {...KEY_GUARD}
                  onClick={() => handleBrandClick(brand, status)}
                  className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left"
                >
                  <span
                    className={cn(
                      'text-xs font-semibold',
                      isCurrent ? 'text-node-foreground' : 'text-node-muted',
                    )}
                  >
                    {brand}
                  </span>
                  {status.ready ? (
                    <span className="flex items-center gap-1.5 text-2xs text-node-subtle">
                      <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
                      <span className="max-w-24 truncate">
                        {status.keyLabel ?? tc('modelRail.ready')}
                      </span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-2xs font-semibold text-node-muted">
                      <KeyRound className="size-3 shrink-0" />
                      {tc('modelRail.needsKey')}
                    </span>
                  )}
                </button>
                {isCurrent && status.ready ? (
                  <div className="space-y-2 border-t border-node-panel-inner px-2.5 py-2">
                    {composer.variants.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {composer.variants.map((variant) => {
                          const on = composer.state.variant === variant
                          return (
                            <button
                              key={variant}
                              type="button"
                              {...KEY_GUARD}
                              onClick={() => composer.selectVariant(variant)}
                              className={cn(
                                'rounded-full border px-2.5 py-1 text-2xs font-semibold transition-colors',
                                on
                                  ? 'border-node-edge bg-node-panel-inner text-node-foreground'
                                  : 'border-node-panel-inner bg-node-panel-soft text-node-muted hover:border-node-edge hover:text-node-foreground',
                              )}
                            >
                              {tc(`variant.${variant}`)}
                            </button>
                          )
                        })}
                      </div>
                    ) : null}
                    {composer.isDualProvider ? (
                      <div className="flex flex-wrap gap-1.5">
                        {providers.map((provider) => {
                          const on = composer.state.provider === provider
                          return (
                            <button
                              key={provider}
                              type="button"
                              {...KEY_GUARD}
                              onClick={() => composer.selectProvider(provider)}
                              className={cn(
                                'rounded-full border px-2.5 py-1 text-2xs font-semibold transition-colors',
                                on
                                  ? 'border-node-edge bg-node-panel-inner text-node-foreground'
                                  : 'border-node-panel-inner bg-node-panel-soft text-node-muted hover:border-node-edge hover:text-node-foreground',
                              )}
                            >
                              {tc(
                                `provider.${PROVIDER_LABEL_KEYS[provider] ?? 'fal'}`,
                              )}
                            </button>
                          )
                        })}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
        {composer.hasReferenceInputs ? (
          <p className="px-0.5 text-2xs leading-4 text-node-subtle">
            {tc('referenceModeOn')}
          </p>
        ) : null}
      </div>

      {pendingBrand ? (
        <div className="space-y-2 rounded-lg border border-node-muted/50 bg-node-panel-soft p-2.5">
          <p className="flex items-center gap-1.5 text-2xs font-semibold text-node-foreground">
            <AlertTriangle className="size-3.5 shrink-0" />
            {tc('rebind.title', { brand: pendingBrand.brand })}
          </p>
          <ul className="space-y-1">
            {pendingBrand.preview.map((item) => (
              <li
                key={item.kind}
                className="flex items-center gap-1.5 text-2xs text-node-muted"
              >
                {item.status === 'map' ? (
                  <Check className="size-3 shrink-0 text-node-foreground" />
                ) : (
                  <AlertTriangle className="size-3 shrink-0 text-node-foreground" />
                )}
                <span className="text-node-foreground">
                  {tc(`refKind.${item.kind}`)}
                </span>
                <span>{tc(`rebind.${item.status}`)}</span>
              </li>
            ))}
          </ul>
          <div className="flex gap-1.5">
            <button
              type="button"
              {...KEY_GUARD}
              onClick={confirmPendingBrand}
              className="flex-1 rounded-lg bg-node-foreground px-2 py-1.5 text-2xs font-semibold text-node-canvas hover:bg-node-foreground/90"
            >
              {tc('rebind.confirm')}
            </button>
            <button
              type="button"
              {...KEY_GUARD}
              onClick={cancelPendingBrand}
              className="flex-1 rounded-lg border border-node-panel-inner px-2 py-1.5 text-2xs font-semibold text-node-muted transition-colors hover:text-node-foreground"
            >
              {tc('rebind.cancel')}
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-3">
          {enhanceSeedancePrompt ? (
            <button
              type="button"
              {...KEY_GUARD}
              onClick={handleEnhance}
              disabled={isEnhancing}
              className="nodrag flex w-full items-center justify-center gap-1.5 rounded-lg border border-node-panel-inner bg-node-panel-soft px-2.5 py-2 text-xs font-semibold text-node-foreground transition-colors hover:border-node-edge disabled:opacity-50"
            >
              {isEnhancing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              {isEnhancing ? tc('enhancing') : tc('enhancePrompt')}
            </button>
          ) : null}

          {EXPAND_TEXT_FIELDS.map((fieldId) => {
            const value = getNodeWorkflowFieldValue(data, fieldId)
            const isLong =
              fieldId === NODE_WORKFLOW_FIELD_IDS.prompt ||
              fieldId === NODE_WORKFLOW_FIELD_IDS.motion ||
              fieldId === NODE_WORKFLOW_FIELD_IDS.audioIntent
            return (
              <ComposerField key={fieldId} label={tFields(`${fieldId}.label`)}>
                {isLong ? (
                  <IMEAwareTextarea
                    value={value}
                    onValueChange={(next) => handleFieldChange(fieldId, next)}
                    aria-label={tFields(`${fieldId}.label`)}
                    placeholder={tFields(`${fieldId}.placeholder`)}
                    {...KEY_GUARD}
                    className="min-h-44 w-full resize-none rounded-lg border border-node-panel-inner bg-node-panel-soft px-2.5 py-2 text-xs leading-5 text-node-foreground outline-none placeholder:text-node-subtle focus-visible:border-node-edge"
                  />
                ) : (
                  <IMEAwareInput
                    value={value}
                    onValueChange={(next) => handleFieldChange(fieldId, next)}
                    aria-label={tFields(`${fieldId}.label`)}
                    placeholder={tFields(`${fieldId}.placeholder`)}
                    {...KEY_GUARD}
                    className="h-9 w-full rounded-lg border border-node-panel-inner bg-node-panel-soft px-2.5 text-xs leading-5 text-node-foreground outline-none placeholder:text-node-subtle focus-visible:border-node-edge"
                  />
                )}
              </ComposerField>
            )
          })}

          <p className="px-0.5 text-2xs leading-4 text-node-subtle">
            {tc('motionHint')}
          </p>

          <div className="space-y-1">
            <span className="text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
              {tc('references.label')}
            </span>
            {composer.referenceKinds.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {composer.referenceKinds.map((kind) => (
                  <span
                    key={kind}
                    className="rounded-md border border-node-panel-inner bg-node-panel px-1.5 py-0.5 text-2xs text-node-muted"
                  >
                    {tc(`refKind.${kind}`)}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-2xs leading-4 text-node-subtle">
                {tc('references.empty')}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-3 lg:col-span-2">
          <ComposerField label={tFields('duration.label')}>
            <div className="space-y-2.5 rounded-lg border border-node-panel-inner bg-node-panel-soft px-2.5 py-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold tabular-nums text-node-foreground">
                  {isAutoDuration
                    ? tFields('duration.auto')
                    : tFields('duration.seconds', {
                        value: String(currentDurationSeconds),
                      })}
                </span>
                <label className="flex cursor-pointer items-center gap-1.5 text-2xs text-node-muted">
                  {tFields('duration.auto')}
                  <Switch
                    checked={isAutoDuration}
                    onCheckedChange={handleDurationAuto}
                    aria-label={tFields('duration.auto')}
                  />
                </label>
              </div>
              <div className="node-duration-slider px-0.5" {...KEY_GUARD}>
                <Slider
                  min={0}
                  max={Math.max(0, durationOptions.length - 1)}
                  step={1}
                  value={[durationIndex]}
                  onValueChange={(vals) => handleDurationSlide(vals[0] ?? 0)}
                  disabled={isAutoDuration}
                  aria-label={tFields('duration.label')}
                />
              </div>
              <div className="flex justify-between text-2xs tabular-nums text-node-subtle">
                <span>{durationOptions[0]}</span>
                <span>{durationOptions[durationOptions.length - 1]}</span>
              </div>
            </div>
          </ComposerField>

          <ComposerField label={t('resolutionLabel')}>
            <div className="flex flex-wrap gap-1.5">
              {resolutionOptions.map((option) => {
                const isSelected = currentResolution === option
                return (
                  <button
                    key={option}
                    type="button"
                    {...KEY_GUARD}
                    onClick={() => handleResolutionToggle(option)}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-2xs font-semibold transition-colors',
                      isSelected
                        ? 'border-node-edge bg-node-panel-inner text-node-foreground'
                        : 'border-node-panel-inner bg-node-panel-soft text-node-muted hover:border-node-edge hover:text-node-foreground',
                    )}
                  >
                    {option}
                  </button>
                )
              })}
            </div>
          </ComposerField>

          <ComposerField label={t('aspectRatioLabel')}>
            <div className="flex flex-wrap gap-1.5">
              {aspectOptions.map((option) => {
                const isSelected = currentAspect === option
                return (
                  <button
                    key={option}
                    type="button"
                    {...KEY_GUARD}
                    onClick={() => handleAspectToggle(option)}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-2xs font-semibold transition-colors',
                      isSelected
                        ? 'border-node-edge bg-node-panel-inner text-node-foreground'
                        : 'border-node-panel-inner bg-node-panel-soft text-node-muted hover:border-node-edge hover:text-node-foreground',
                    )}
                  >
                    {option}
                  </button>
                )
              })}
            </div>
          </ComposerField>

          <ComposerField label={t('negativePromptLabel')}>
            <IMEAwareTextarea
              value={currentNegative}
              onValueChange={handleNegativeChange}
              aria-label={t('negativePromptLabel')}
              placeholder={t('negativePromptPlaceholder')}
              {...KEY_GUARD}
              className="min-h-16 w-full resize-none rounded-lg border border-node-panel-inner bg-node-panel-soft px-2.5 py-2 text-xs leading-5 text-node-foreground outline-none placeholder:text-node-subtle focus-visible:border-node-edge"
            />
          </ComposerField>

          <div
            className="nodrag nopan nowheel flex items-center justify-between gap-3 rounded-lg border border-node-panel-inner bg-node-panel-soft px-2.5 py-2"
            {...KEY_GUARD}
          >
            <span className="text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
              {tc('generateAudioLabel')}
            </span>
            <Switch
              checked={
                typeof data.generateAudio === 'boolean'
                  ? data.generateAudio
                  : true
              }
              onCheckedChange={(checked) =>
                updateNodeData(id, { generateAudio: checked })
              }
              aria-label={tc('generateAudioLabel')}
            />
          </div>

          {supportsSeed ? (
            <ComposerField label={tc('seedLabel')}>
              <div className="flex items-center gap-1.5">
                <IMEAwareInput
                  value={typeof data.seed === 'number' ? String(data.seed) : ''}
                  onValueChange={(next) => {
                    const trimmed = next.trim()
                    const parsed = Number(trimmed)
                    updateNodeData(id, {
                      seed:
                        trimmed && Number.isInteger(parsed) && parsed >= 0
                          ? Math.min(parsed, 2147483647)
                          : undefined,
                    })
                  }}
                  inputMode="numeric"
                  aria-label={tc('seedLabel')}
                  placeholder={tc('seedRandom')}
                  {...KEY_GUARD}
                  className="h-9 flex-1 rounded-lg border border-node-panel-inner bg-node-panel-soft px-2.5 text-xs leading-5 text-node-foreground outline-none placeholder:text-node-subtle focus-visible:border-node-edge"
                />
                <button
                  type="button"
                  {...KEY_GUARD}
                  onClick={() =>
                    updateNodeData(id, {
                      seed: Math.floor(Math.random() * 2147483647),
                    })
                  }
                  aria-label={tc('seedRandomize')}
                  title={tc('seedRandomize')}
                  className="nodrag flex size-9 shrink-0 items-center justify-center rounded-lg border border-node-panel-inner bg-node-panel-soft text-node-muted transition-colors hover:text-node-foreground"
                >
                  <Dices className="size-4" />
                </button>
              </div>
              {hasMedia && typeof data.lastSeed === 'number' ? (
                <button
                  type="button"
                  {...KEY_GUARD}
                  onClick={() => updateNodeData(id, { seed: data.lastSeed })}
                  className="nodrag mt-1 flex w-full items-center justify-between gap-2 rounded-lg border border-node-panel-inner bg-node-panel-soft px-2.5 py-1.5 text-2xs text-node-muted transition-colors hover:text-node-foreground"
                >
                  <span>
                    {tc('lastSeedLabel')}: {data.lastSeed}
                  </span>
                  <span className="flex items-center gap-1 text-node-foreground">
                    <Lock className="size-3" />
                    {tc('seedLock')}
                  </span>
                </button>
              ) : null}
            </ComposerField>
          ) : null}
        </div>
      </div>

      {data.generationError ? (
        <div className="rounded-lg border border-red-400/30 bg-red-500/10 p-2.5 text-2xs leading-4 text-red-100">
          {data.generationError}
        </div>
      ) : null}

      {generateButton}

      {quickSetup ? (
        <QuickSetupDialog
          open={quickSetup.open}
          onOpenChange={(open) =>
            setQuickSetup((prev) => (prev ? { ...prev, open } : prev))
          }
          modelId={quickSetup.option.modelId}
          modelLabel={quickSetup.brand}
          adapterType={quickSetup.option.adapterType as AI_ADAPTER_TYPES}
          optionId={quickSetup.option.optionId}
          onVerified={() => {
            setPendingSetupBrand(quickSetup.brand)
            setQuickSetup((prev) => (prev ? { ...prev, open: false } : prev))
          }}
        />
      ) : null}
    </div>
  )
}
