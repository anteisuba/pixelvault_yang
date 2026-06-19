'use client'

import { useCallback, type KeyboardEvent } from 'react'
import { Film, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import type { AspectRatio } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  NODE_GENERATION_STATUS_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
  NODE_WORKFLOW_FIELD_IDS,
  type NodeWorkflowFieldId,
} from '@/constants/node-types'
import { getVideoModelCapabilities } from '@/constants/video-model-capabilities'
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
import { getBrandProviders } from '@/lib/video-model-resolver'
import { cn } from '@/lib/utils'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'

import { IMEAwareInput, IMEAwareTextarea } from '../inspector/IMEAwareField'
import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { VideoModelSwitcher } from './VideoModelSwitcher'
import { VideoProviderPicker } from './VideoProviderPicker'

interface VideoComposerProps {
  id: string
  data: NodeWorkflowNodeData
  density: 'card' | 'expand'
}

// fal Seedance duration enum: 'auto' or 4..15 seconds.
const DURATION_OPTIONS = [
  'auto',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
] as const

const EXPAND_TEXT_FIELDS: readonly NodeWorkflowFieldId[] = [
  NODE_WORKFLOW_FIELD_IDS.prompt,
  NODE_WORKFLOW_FIELD_IDS.motion,
  NODE_WORKFLOW_FIELD_IDS.camera,
  NODE_WORKFLOW_FIELD_IDS.audioIntent,
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
  const { updateNodeData, generateMediaNode } = useNodeWorkflowActions()
  const composer = useVideoComposer(id, data)

  const providers = composer.state.brand
    ? getBrandProviders(composer.state.brand, composer.options)
    : []

  const selectedModelId = data.model?.modelId
  const capabilities = selectedModelId
    ? getVideoModelCapabilities(selectedModelId)
    : null
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
  // Compact card carries only the essentials (brand + generate); ⤢ expand
  // reveals the full param set in the same composer.
  const isExpand = density === 'expand'

  return (
    <div className="nodrag space-y-3">
      <div className="space-y-1.5 rounded-xl border border-node-panel-inner bg-node-panel-soft p-2">
        <VideoModelSwitcher
          brands={composer.brands}
          currentBrand={composer.state.brand}
          brandLabel={(brand) => brand}
          variants={isExpand ? composer.variants : []}
          currentVariant={composer.state.variant}
          variantLabel={(variant) => tc(`variant.${variant}`)}
          variantAriaLabel={tc('variantAriaLabel')}
          onSelectBrand={composer.selectBrand}
          onSelectVariant={composer.selectVariant}
        />
        {isExpand && composer.isDualProvider ? (
          <VideoProviderPicker
            providers={providers}
            currentProvider={composer.state.provider}
            providerLabel={(provider) =>
              tc(`provider.${PROVIDER_LABEL_KEYS[provider] ?? 'fal'}`)
            }
            ariaLabel={tc('providerAriaLabel')}
            onSelectProvider={composer.selectProvider}
          />
        ) : null}
        {isExpand && composer.hasReferenceInputs ? (
          <p className="px-0.5 text-2xs leading-4 text-node-subtle">
            {tc('referenceModeOn')}
          </p>
        ) : null}
      </div>

      {isExpand ? (
        <>
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
                    className="min-h-16 w-full resize-none rounded-lg border border-node-panel-inner bg-node-panel-soft px-2.5 py-2 text-xs leading-5 text-node-foreground outline-none placeholder:text-node-subtle focus-visible:border-node-edge"
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

          <ComposerField label={tFields('duration.label')}>
            <select
              value={
                DURATION_OPTIONS.includes(
                  getNodeWorkflowFieldValue(
                    data,
                    NODE_WORKFLOW_FIELD_IDS.duration,
                  ) as (typeof DURATION_OPTIONS)[number],
                )
                  ? getNodeWorkflowFieldValue(
                      data,
                      NODE_WORKFLOW_FIELD_IDS.duration,
                    )
                  : 'auto'
              }
              aria-label={tFields('duration.label')}
              {...KEY_GUARD}
              onChange={(event) =>
                handleFieldChange(
                  NODE_WORKFLOW_FIELD_IDS.duration,
                  event.target.value,
                )
              }
              className="h-9 w-full rounded-lg border border-node-panel-inner bg-node-panel-soft px-2.5 text-xs leading-5 text-node-foreground outline-none focus-visible:border-node-edge"
            >
              <option value="auto">{tFields('duration.auto')}</option>
              {DURATION_OPTIONS.filter((option) => option !== 'auto').map(
                (option) => (
                  <option key={option} value={option}>
                    {tFields('duration.seconds', { value: option })}
                  </option>
                ),
              )}
            </select>
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
        </>
      ) : null}

      {data.generationError ? (
        <div className="rounded-lg border border-red-400/30 bg-red-500/10 p-2.5 text-2xs leading-4 text-red-100">
          {data.generationError}
        </div>
      ) : null}

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
    </div>
  )
}
