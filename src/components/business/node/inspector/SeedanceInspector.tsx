'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  type ChangeEvent,
  type ReactNode,
} from 'react'
import { useEdges, useNodes } from '@xyflow/react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Film,
  ImageIcon,
  Loader2,
  Mic2,
  Route,
  Video,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { WorkflowModelPicker } from '@/components/business/node/WorkflowModelPicker'
import { Button } from '@/components/ui/button'
import { IMEAwareInput, IMEAwareTextarea } from './IMEAwareField'
import type { AspectRatio } from '@/constants/config'
import { AI_MODELS } from '@/constants/models'
import {
  VIDEO_ASPECT_RATIOS,
  VIDEO_RESOLUTIONS,
  type VideoResolution,
} from '@/constants/video-options'
import {
  NODE_GENERATION_STATUS_IDS,
  NODE_MEDIA_KIND_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
  NODE_WORKFLOW_FIELD_IDS,
  type NodeWorkflowFieldId,
} from '@/constants/node-types'
import {
  getReferenceCapabilityMax,
  getVideoReferenceCapability,
} from '@/constants/reference-image-capabilities'
import {
  getVideoAudioCapability,
  getVideoModelCapabilities,
  type VideoAudioMode,
} from '@/constants/video-model-capabilities'
import {
  getNodeMediaUrl,
  getUpstreamNodes,
  isKeyframeNode,
  isShotTextNode,
  isVideoSourceNode,
  isVisualReferenceNode,
  isVoiceProfileNode,
} from '@/lib/node-workflow-graph'
import {
  buildNodeWorkflowPrompt,
  getNodeWorkflowFieldValue,
} from '@/lib/node-workflow-prompt'
import { cn } from '@/lib/utils'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'

import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { InspectorField } from './InspectorField'

interface SeedanceInspectorProps {
  node: NodeWorkflowNode
}

type AudioCalloutState = 'hidden' | 'ignored' | 'cloning'
type VideoAccentState = 'seedance' | 'ok'

interface UpstreamGroup {
  key: 'visual' | 'keyframe' | 'video' | 'text' | 'voice'
  icon: ReactNode
  nodes: NodeWorkflowNode[]
}

const AUDIO_CALLOUT_STATE_BY_MODE: Record<VideoAudioMode, AudioCalloutState> = {
  auto: 'ignored',
  reference: 'cloning',
}

const VOICE_GROUP_TINT_BY_STATE: Record<
  Exclude<AudioCalloutState, 'hidden'>,
  string
> = {
  ignored: 'border-node-danger/40 bg-node-danger/10',
  cloning: 'border-node-success/40 bg-node-success/10',
}

const VOICE_GROUP_PILL_BY_STATE: Record<
  Exclude<AudioCalloutState, 'hidden'>,
  string
> = {
  ignored: 'bg-node-danger/20 text-node-danger',
  cloning: 'bg-node-success/20 text-node-success',
}

const VIDEO_GENERATION_FIELDS = [
  NODE_WORKFLOW_FIELD_IDS.motion,
  NODE_WORKFLOW_FIELD_IDS.camera,
  NODE_WORKFLOW_FIELD_IDS.duration,
  NODE_WORKFLOW_FIELD_IDS.audioIntent,
  NODE_WORKFLOW_FIELD_IDS.prompt,
] as const

const VIDEO_ACCENT_STYLES: Record<
  VideoAccentState,
  {
    dot: string
    iconPlate: string
    chip: string
    button: string
  }
> = {
  seedance: {
    dot: 'bg-node-amber',
    iconPlate: 'bg-node-amber/15 text-node-amber',
    chip: 'border-node-amber/30 bg-node-amber/10 text-node-foreground',
    button: 'bg-node-amber text-node-canvas hover:bg-node-amber/90',
  },
  ok: {
    dot: 'bg-node-success',
    iconPlate: 'bg-node-success/15 text-node-success',
    chip: 'border-node-success/30 bg-node-success/10 text-node-success',
    button: 'bg-node-success text-node-canvas hover:bg-node-success/90',
  },
}

function getNonEmptyText(
  ...values: Array<string | null | undefined>
): string | undefined {
  return values.map((value) => value?.trim()).find(Boolean)
}

function getVoiceNodeLabel(node: NodeWorkflowNode, fallback: string): string {
  const name = getNonEmptyText(
    node.data.voiceName,
    node.data.voiceId,
    node.data.voiceReferenceAudioName,
  )
  const provider = getNonEmptyText(node.data.voiceProvider)

  if (name && provider && name !== provider) {
    return `${name} - ${provider}`
  }

  return name ?? provider ?? fallback
}

function getNodeLabel(node: NodeWorkflowNode, fallback: string): string {
  if (node.type === NODE_TYPE_IDS.voice) {
    return getVoiceNodeLabel(node, fallback)
  }

  return (
    getNonEmptyText(
      node.data.characterName,
      node.data.character?.name,
      node.data.mediaLabel,
      node.data.sourceLabel,
      node.data.breakdown?.title,
    ) ?? fallback
  )
}

function getStatusLabelKey(
  generationStatus: string | undefined,
  hasMedia: boolean,
): 'statusIdle' | 'statusPending' | 'statusSuccess' | 'statusError' {
  switch (generationStatus) {
    case NODE_GENERATION_STATUS_IDS.pending:
      return 'statusPending'
    case NODE_GENERATION_STATUS_IDS.success:
      return 'statusSuccess'
    case NODE_GENERATION_STATUS_IDS.error:
      return 'statusError'
    default:
      return hasMedia ? 'statusSuccess' : 'statusIdle'
  }
}

export function SeedanceInspector({ node }: SeedanceInspectorProps) {
  const t = useTranslations('StudioNode.videoGeneration')
  const tFields = useTranslations('StudioNode.workflowFields')
  const tNodeTypes = useTranslations('StudioNode.nodeTypes')
  const allNodes = useNodes<NodeWorkflowNode>()
  const edges = useEdges<NodeWorkflowEdge>()
  const { generateMediaNode, modelOptionsByType, updateNodeData } =
    useNodeWorkflowActions()
  const mediaUrl =
    typeof node.data.mediaUrl === 'string' ? node.data.mediaUrl : null
  const modelOptions = useMemo(
    () => modelOptionsByType[NODE_TYPE_IDS.seedance] ?? [],
    [modelOptionsByType],
  )

  // Default new Seedance nodes to Fast Reference — same per-second price as
  // Fast text-to-video but unlocks multi-image / audio_urls / video_urls and
  // a 0.6x discount when a reference video is connected. Only auto-sets if
  // the user hasn't already chosen a model and Fast Reference is available
  // (workspace platform / user-saved key). Otherwise leaves model unset so
  // the picker can route through QuickSetupDialog as usual.
  useEffect(() => {
    if (node.data.model) return
    const preferred = modelOptions.find(
      (option) => option.modelId === AI_MODELS.SEEDANCE_20_FAST_REFERENCE,
    )
    if (!preferred) return
    updateNodeData(node.id, { model: preferred })
  }, [modelOptions, node.data.model, node.id, updateNodeData])

  const prompt = buildNodeWorkflowPrompt(NODE_TYPE_IDS.seedance, node.data)
  const generationStatus =
    node.data.generationStatus ??
    (mediaUrl
      ? NODE_GENERATION_STATUS_IDS.success
      : NODE_GENERATION_STATUS_IDS.idle)
  const isPending =
    generationStatus === NODE_GENERATION_STATUS_IDS.pending ||
    node.data.status === NODE_STATUS_IDS.running

  const incomingNodes = useMemo(() => {
    const sourceIds = new Set(
      edges
        .filter((edge) => edge.target === node.id)
        .map((edge) => edge.source),
    )

    return allNodes.filter((candidate) => sourceIds.has(candidate.id))
  }, [allNodes, edges, node.id])

  // The voice group has to mirror what the backend actually harvests
  // (see harvestUpstreamAudioBindings in node-workflow-graph). The
  // backend accepts voices through two paths: directly wired into
  // the seedance node, or one hop through a character node. The
  // Inspector previously only looked at the direct edges, so the
  // common "voice → character → seedance" pattern showed an empty
  // voice group even though the audio reference was actually included
  // in the generation request. We now collect both paths here and tag
  // each voice with the routing character (if any) for the chip label.
  const voiceUpstream = useMemo<
    Array<{ voiceNode: NodeWorkflowNode; routedThrough?: string }>
  >(() => {
    const seen = new Map<
      string,
      { voiceNode: NodeWorkflowNode; routedThrough?: string }
    >()

    // Pass 1: voice → character → seedance (named binding, priority)
    for (const characterNode of incomingNodes) {
      if (!isVisualReferenceNode(characterNode)) continue
      const characterName =
        characterNode.data.characterName ??
        characterNode.data.character?.name ??
        undefined
      const characterUpstream = getUpstreamNodes(
        characterNode.id,
        edges,
        allNodes,
      )
      for (const candidate of characterUpstream) {
        if (!isVoiceProfileNode(candidate)) continue
        if (seen.has(candidate.id)) continue
        seen.set(candidate.id, {
          voiceNode: candidate,
          routedThrough: characterName,
        })
      }
    }

    // Pass 2: voice → seedance (direct)
    for (const candidate of incomingNodes) {
      if (!isVoiceProfileNode(candidate)) continue
      if (seen.has(candidate.id)) continue
      seen.set(candidate.id, { voiceNode: candidate })
    }

    return Array.from(seen.values())
  }, [allNodes, edges, incomingNodes])

  const upstreamGroups = useMemo<UpstreamGroup[]>(
    () => [
      {
        key: 'visual',
        icon: <ImageIcon className="size-3.5 text-node-amber" />,
        nodes: incomingNodes.filter(isVisualReferenceNode),
      },
      {
        key: 'keyframe',
        icon: <Film className="size-3.5 text-node-amber" />,
        nodes: incomingNodes.filter(isKeyframeNode),
      },
      {
        key: 'video',
        icon: <Video className="size-3.5 text-node-amber" />,
        nodes: incomingNodes.filter(isVideoSourceNode),
      },
      {
        key: 'text',
        icon: <Route className="size-3.5 text-stone-200" />,
        nodes: incomingNodes.filter(isShotTextNode),
      },
      {
        key: 'voice',
        icon: <Mic2 className="size-3.5 text-node-amber" />,
        nodes: voiceUpstream.map((entry) => entry.voiceNode),
      },
    ],
    [incomingNodes, voiceUpstream],
  )

  // Lookup table so we can render "via {character}" on chips for
  // character-routed voices.
  const voiceRoutingByNodeId = useMemo(() => {
    const map = new Map<string, string | undefined>()
    for (const entry of voiceUpstream) {
      map.set(entry.voiceNode.id, entry.routedThrough)
    }
    return map
  }, [voiceUpstream])

  const selectedModelId = node.data.model?.modelId
  const videoCapabilities = selectedModelId
    ? getVideoModelCapabilities(selectedModelId)
    : null
  const referenceCapability = selectedModelId
    ? getVideoReferenceCapability(selectedModelId)
    : null
  const maxReferences = referenceCapability
    ? getReferenceCapabilityMax(referenceCapability)
    : 0
  const availableReferenceCount = upstreamGroups
    .filter((group) => group.key === 'visual' || group.key === 'keyframe')
    .flatMap((group) => group.nodes)
    .filter((upstreamNode) =>
      Boolean(getNodeMediaUrl(upstreamNode.data)),
    ).length

  const audioCapability = getVideoAudioCapability(selectedModelId)
  // Reference endpoints get the green accent (voice cloning capable);
  // every other mode keeps the brand amber.
  const videoAccentState: VideoAccentState =
    audioCapability.mode === 'reference' ? 'ok' : 'seedance'
  const videoAccent = VIDEO_ACCENT_STYLES[videoAccentState]
  const voiceUpstreamCount =
    upstreamGroups.find((group) => group.key === 'voice')?.nodes.length ?? 0
  const audioCalloutState: AudioCalloutState =
    voiceUpstreamCount === 0
      ? 'hidden'
      : AUDIO_CALLOUT_STATE_BY_MODE[audioCapability.mode]

  // Per-group "will this actually be consumed by the chosen model?" flag.
  // Mirrors the harvest rules in StudioNodeWorkbench.handleGenerateMediaNode
  // so users see what the picker really receives, not just what's connected.
  // Reference-to-video endpoints accept video_urls (the only place where
  // upstream video clips are consumed today).
  const isReferenceEndpoint = audioCapability.mode === 'reference'
  const groupEffectiveByKey: Record<UpstreamGroup['key'], boolean> = useMemo(
    () => ({
      visual:
        maxReferences > 0 &&
        upstreamGroups
          .find((g) => g.key === 'visual')
          ?.nodes.some((n) => Boolean(getNodeMediaUrl(n.data))) === true,
      keyframe:
        maxReferences > 0 &&
        upstreamGroups
          .find((g) => g.key === 'keyframe')
          ?.nodes.some((n) => Boolean(getNodeMediaUrl(n.data))) === true,
      video:
        isReferenceEndpoint &&
        upstreamGroups
          .find((g) => g.key === 'video')
          ?.nodes.some((n) =>
            typeof n.data.mediaUrl === 'string'
              ? n.data.mediaUrl.trim().length > 0
              : false,
          ) === true,
      text:
        upstreamGroups
          .find((g) => g.key === 'text')
          ?.nodes.some((n) =>
            Boolean(buildNodeWorkflowPrompt(n.type, n.data).trim()),
          ) === true,
      voice:
        isReferenceEndpoint &&
        upstreamGroups
          .find((g) => g.key === 'voice')
          ?.nodes.some((n) =>
            typeof n.data.voiceReferenceAudioUrl === 'string'
              ? n.data.voiceReferenceAudioUrl.trim().length > 0
              : false,
          ) === true,
    }),
    [isReferenceEndpoint, maxReferences, upstreamGroups],
  )

  const referenceSwitchOption = useMemo(() => {
    if (audioCalloutState !== 'ignored') return null
    // Prefer Fast Reference (default + cheaper); fall back to Standard if not
    // present in the user's available options.
    return (
      modelOptions.find(
        (option) => option.modelId === AI_MODELS.SEEDANCE_20_FAST_REFERENCE,
      ) ??
      modelOptions.find(
        (option) => option.modelId === AI_MODELS.SEEDANCE_20_REFERENCE,
      ) ??
      null
    )
  }, [audioCalloutState, modelOptions])

  const handleSwitchToReference = useCallback(() => {
    if (!referenceSwitchOption) return
    updateNodeData(node.id, { model: referenceSwitchOption })
  }, [node.id, updateNodeData, referenceSwitchOption])

  const disabledReason = isPending
    ? t('generating')
    : !node.data.model
      ? t('noModel')
      : !prompt.trim() && incomingNodes.length === 0
        ? t('noInput')
        : null
  const statusLabelKey = getStatusLabelKey(generationStatus, Boolean(mediaUrl))
  const generateButtonLabel = mediaUrl ? t('regenerate') : t('generate')

  const handleFieldChange = useCallback(
    (fieldId: NodeWorkflowFieldId, value: string) => {
      const nextData = {
        ...node.data,
        [fieldId]: value,
      }

      updateNodeData(node.id, {
        [fieldId]: value,
        status: buildNodeWorkflowPrompt(NODE_TYPE_IDS.seedance, nextData).trim()
          ? NODE_STATUS_IDS.ready
          : NODE_STATUS_IDS.idle,
      })
    },
    [node.data, node.id, updateNodeData],
  )

  // Resolution / aspect-ratio / negative-prompt controls mirror Studio's
  // VideoParams panel. We filter the option list by the picked model's
  // capabilities so a Volc-only model never offers 1080p, and so on.
  const resolutionOptions =
    videoCapabilities?.supportedResolutions ?? VIDEO_RESOLUTIONS
  const aspectRatioOptions =
    videoCapabilities?.supportedAspectRatios ?? VIDEO_ASPECT_RATIOS
  const currentResolution =
    typeof node.data.resolution === 'string' &&
    (resolutionOptions as readonly string[]).includes(node.data.resolution)
      ? (node.data.resolution as VideoResolution)
      : undefined
  const currentAspectRatio =
    typeof node.data.aspectRatio === 'string' &&
    (aspectRatioOptions as readonly string[]).includes(node.data.aspectRatio)
      ? (node.data.aspectRatio as AspectRatio)
      : undefined
  const currentNegativePrompt =
    typeof node.data.negativePrompt === 'string' ? node.data.negativePrompt : ''

  const handleResolutionToggle = useCallback(
    (value: VideoResolution) => {
      updateNodeData(node.id, {
        resolution: currentResolution === value ? undefined : value,
      })
    },
    [currentResolution, node.id, updateNodeData],
  )

  const handleAspectRatioToggle = useCallback(
    (value: AspectRatio) => {
      updateNodeData(node.id, {
        aspectRatio: currentAspectRatio === value ? undefined : value,
      })
    },
    [currentAspectRatio, node.id, updateNodeData],
  )

  const handleNegativePromptChange = useCallback(
    (value: string) => {
      const trimmed = value.trim()
      updateNodeData(node.id, {
        negativePrompt: trimmed.length > 0 ? trimmed : undefined,
      })
    },
    [node.id, updateNodeData],
  )

  const handleGenerate = useCallback(() => {
    void generateMediaNode?.(node.id)
  }, [generateMediaNode, node.id])

  // fal Seedance duration enum: 'auto' or 4..15 seconds (13 options).
  // Reference: https://fal.ai/models/bytedance/seedance-2.0/reference-to-video
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

  const renderField = (fieldId: NodeWorkflowFieldId) => {
    const value = getNodeWorkflowFieldValue(node.data, fieldId)
    const isLongField =
      fieldId === NODE_WORKFLOW_FIELD_IDS.motion ||
      fieldId === NODE_WORKFLOW_FIELD_IDS.audioIntent ||
      fieldId === NODE_WORKFLOW_FIELD_IDS.prompt
    const isDurationField = fieldId === NODE_WORKFLOW_FIELD_IDS.duration

    return (
      <InspectorField
        key={fieldId}
        label={tFields(`${fieldId}.label`)}
        statusDotClassName={videoAccent.dot}
      >
        {isDurationField ? (
          <select
            value={
              DURATION_OPTIONS.includes(
                value as (typeof DURATION_OPTIONS)[number],
              )
                ? value
                : 'auto'
            }
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              handleFieldChange(fieldId, event.target.value)
            }
            aria-label={tFields(`${fieldId}.label`)}
            className="h-10 w-full rounded-xl border border-node-panel-inner bg-node-panel-soft px-3 text-sm leading-6 text-node-foreground outline-none focus-visible:border-node-amber focus-visible:ring-2 focus-visible:ring-node-amber/20"
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
        ) : isLongField ? (
          <IMEAwareTextarea
            value={value}
            onValueChange={(next) => handleFieldChange(fieldId, next)}
            aria-label={tFields(`${fieldId}.label`)}
            placeholder={tFields(`${fieldId}.placeholder`)}
            className="min-h-20 w-full resize-none rounded-xl border border-node-panel-inner bg-node-panel-soft px-3 py-2 text-sm leading-6 text-node-foreground shadow-none outline-none placeholder:text-node-subtle focus-visible:border-node-amber focus-visible:ring-2 focus-visible:ring-node-amber/30"
          />
        ) : (
          <IMEAwareInput
            value={value}
            onValueChange={(next) => handleFieldChange(fieldId, next)}
            aria-label={tFields(`${fieldId}.label`)}
            placeholder={tFields(`${fieldId}.placeholder`)}
            className="h-10 w-full rounded-xl border border-node-panel-inner bg-node-panel-soft px-3 text-sm leading-6 text-node-foreground outline-none placeholder:text-node-subtle focus-visible:border-node-amber focus-visible:ring-2 focus-visible:ring-node-amber/20"
          />
        )}
      </InspectorField>
    )
  }

  return (
    <div className="space-y-4">
      <div className="relative aspect-video overflow-hidden rounded-xl border border-node-panel-inner bg-node-panel-soft">
        {mediaUrl ? (
          <video
            src={mediaUrl}
            className="h-full w-full object-cover"
            controls
            muted
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
            <span
              className={cn(
                'flex size-11 items-center justify-center rounded-xl',
                videoAccent.iconPlate,
              )}
            >
              <Video className="size-5" />
            </span>
            <p className="text-xs leading-5 text-node-muted">
              {t('emptyPreview')}
            </p>
          </div>
        )}
        {isPending ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-node-canvas/70 text-node-foreground backdrop-blur-sm">
            <Loader2 className="size-5 animate-spin text-node-amber" />
            <span className="text-xs font-semibold">{t('generating')}</span>
          </div>
        ) : null}
      </div>

      <div className="space-y-2 rounded-xl border border-node-panel-inner bg-node-panel-soft p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-node-foreground">
              {t('upstreamTitle')}
            </p>
            <p className="mt-1 text-xs leading-5 text-node-muted">
              {t('upstreamDescription')}
            </p>
          </div>
          <span className="rounded-full border border-node-panel-inner bg-node-panel px-2 py-1 text-2xs font-semibold text-node-muted">
            {t('referenceCount', {
              count: availableReferenceCount,
              max: maxReferences,
            })}
          </span>
        </div>
        <div className="grid gap-2">
          {upstreamGroups.map((group) => (
            <div
              key={group.key}
              className={cn(
                'rounded-xl border p-2',
                group.key === 'voice' && audioCalloutState !== 'hidden'
                  ? VOICE_GROUP_TINT_BY_STATE[audioCalloutState]
                  : 'border-node-panel-inner bg-node-panel',
              )}
            >
              <div className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
                {group.icon}
                <span className="flex-1">
                  {t(`upstreamGroups.${group.key}`)}
                </span>
                {group.nodes.length > 0 && groupEffectiveByKey[group.key] ? (
                  <span
                    className="inline-flex size-4 items-center justify-center rounded-full bg-node-success/20 text-node-success"
                    title={t('upstreamGroupsEffective')}
                    aria-label={t('upstreamGroupsEffective')}
                  >
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                ) : null}
                {group.key === 'voice' && audioCalloutState !== 'hidden' ? (
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-2xs font-semibold normal-case tracking-normal',
                      VOICE_GROUP_PILL_BY_STATE[audioCalloutState],
                    )}
                  >
                    {t(`audioCallout.${audioCalloutState}.statusPill`)}
                  </span>
                ) : null}
                {group.key === 'video' && groupEffectiveByKey.video ? (
                  <span
                    className="rounded-full bg-node-success/20 px-2 py-0.5 text-2xs font-semibold normal-case tracking-normal text-node-success"
                    title={t('videoDiscount.tooltip')}
                  >
                    {t('videoDiscount.badge')}
                  </span>
                ) : null}
              </div>
              {group.nodes.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {group.nodes.map((upstreamNode) => {
                    const routedThrough =
                      group.key === 'voice'
                        ? voiceRoutingByNodeId.get(upstreamNode.id)
                        : undefined
                    const baseLabel = getNodeLabel(
                      upstreamNode,
                      tNodeTypes(upstreamNode.type),
                    )
                    return (
                      <span
                        key={upstreamNode.id}
                        title={
                          routedThrough
                            ? t('voiceRoutedTooltip', {
                                voice: baseLabel,
                                character: routedThrough,
                              })
                            : undefined
                        }
                        className={cn(
                          'max-w-full truncate rounded-full border px-2 py-1 text-2xs font-semibold',
                          getNodeMediaUrl(upstreamNode.data) ||
                            upstreamNode.data.voiceId ||
                            upstreamNode.data.voiceReferenceAudioUrl
                            ? videoAccent.chip
                            : 'border-node-panel-inner bg-node-panel-soft text-node-muted',
                        )}
                      >
                        {routedThrough
                          ? t('voiceRoutedChip', {
                              voice: baseLabel,
                              character: routedThrough,
                            })
                          : baseLabel}
                      </span>
                    )
                  })}
                </div>
              ) : (
                <p className="mt-2 text-xs leading-5 text-node-subtle">
                  {t(`upstreamEmpty.${group.key}`)}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-node-panel-inner bg-node-panel-soft p-2">
        <WorkflowModelPicker
          value={node.data.model}
          options={modelOptions}
          onChange={(model) => updateNodeData(node.id, { model })}
          kind={NODE_MEDIA_KIND_IDS.video}
        />
        <p className="mt-1 truncate px-1 text-2xs font-medium text-node-subtle">
          {t(statusLabelKey)}
        </p>
      </div>

      <div className="grid gap-2">
        <div className="rounded-xl border border-node-panel-inner bg-node-panel-soft p-3 text-xs leading-5 text-node-muted">
          <p className="font-semibold text-node-foreground">
            {t('capabilities.referenceTitle')}
          </p>
          <p className="mt-1">
            {videoCapabilities?.requiresReferenceImage
              ? t('capabilities.referenceRequired')
              : t('capabilities.referenceOptional')}
          </p>
        </div>
        {audioCalloutState !== 'hidden' ? (
          <AudioCallout
            state={audioCalloutState}
            onSwitch={
              referenceSwitchOption ? handleSwitchToReference : undefined
            }
          />
        ) : null}
      </div>

      <div className="space-y-3">
        {VIDEO_GENERATION_FIELDS.map((fieldId) => renderField(fieldId))}

        <InspectorField
          label={t('resolutionLabel')}
          statusDotClassName={videoAccent.dot}
        >
          <div className="flex flex-wrap gap-1.5">
            {resolutionOptions.map((option) => {
              const isSelected = currentResolution === option
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleResolutionToggle(option)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                    isSelected
                      ? 'border-node-amber bg-node-amber text-node-canvas'
                      : 'border-node-panel-inner bg-node-panel-soft text-node-muted hover:border-node-amber/40 hover:text-node-foreground',
                  )}
                >
                  {option}
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 text-2xs leading-4 text-node-subtle">
            {t('resolutionHint')}
          </p>
        </InspectorField>

        <InspectorField
          label={t('aspectRatioLabel')}
          statusDotClassName={videoAccent.dot}
        >
          <div className="flex flex-wrap gap-1.5">
            {aspectRatioOptions.map((option) => {
              const isSelected = currentAspectRatio === option
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleAspectRatioToggle(option)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                    isSelected
                      ? 'border-node-amber bg-node-amber text-node-canvas'
                      : 'border-node-panel-inner bg-node-panel-soft text-node-muted hover:border-node-amber/40 hover:text-node-foreground',
                  )}
                >
                  {option}
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 text-2xs leading-4 text-node-subtle">
            {t('aspectRatioHint')}
          </p>
        </InspectorField>

        <InspectorField
          label={t('negativePromptLabel')}
          statusDotClassName={videoAccent.dot}
        >
          <IMEAwareTextarea
            value={currentNegativePrompt}
            onValueChange={handleNegativePromptChange}
            aria-label={t('negativePromptLabel')}
            placeholder={t('negativePromptPlaceholder')}
            className="min-h-20 w-full resize-none rounded-xl border border-node-panel-inner bg-node-panel-soft px-3 py-2 text-sm leading-6 text-node-foreground shadow-none outline-none placeholder:text-node-subtle focus-visible:border-node-amber focus-visible:ring-2 focus-visible:ring-node-amber/30"
          />
        </InspectorField>
      </div>

      {Array.isArray(node.data.timeline) && node.data.timeline.length > 0 ? (
        <div className="space-y-2 rounded-xl border border-node-panel-inner bg-node-panel-soft p-3">
          <p className="text-sm font-semibold text-node-foreground">
            {t('timeline.title')}
          </p>
          <ol className="space-y-2">
            {node.data.timeline.map((segment, index) => (
              <li
                key={`${segment.startSecond}-${segment.endSecond}-${index}`}
                className="rounded-xl border border-node-panel-inner bg-node-panel p-2.5"
              >
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-node-amber/15 px-2 py-0.5 text-2xs font-semibold text-node-amber">
                    {t('timeline.secondsRange', {
                      start: segment.startSecond,
                      end: segment.endSecond,
                    })}
                  </span>
                  <span className="text-2xs font-semibold uppercase tracking-nav-dense text-node-subtle">
                    {t('timeline.beatLabel', { index: index + 1 })}
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-5 text-node-foreground">
                  {segment.action}
                </p>
                <p className="mt-1 text-2xs leading-4 text-node-muted">
                  <span className="font-semibold text-node-subtle">
                    {t('timeline.cameraLabel')}
                  </span>{' '}
                  {segment.camera}
                </p>
                {segment.composition ? (
                  <p className="mt-0.5 text-2xs leading-4 text-node-muted">
                    <span className="font-semibold text-node-subtle">
                      {t('timeline.compositionLabel')}
                    </span>{' '}
                    {segment.composition}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {node.data.generationError ? (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-xs leading-5 text-red-100">
          {node.data.generationError}
        </div>
      ) : null}

      <Button
        type="button"
        onClick={handleGenerate}
        disabled={Boolean(disabledReason)}
        className={cn(
          'h-11 w-full rounded-xl disabled:bg-node-panel-inner disabled:text-node-subtle',
          videoAccent.button,
        )}
      >
        {isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Film className="size-4" />
        )}
        {disabledReason ?? generateButtonLabel}
      </Button>
    </div>
  )
}

interface AudioCalloutProps {
  state: Exclude<AudioCalloutState, 'hidden'>
  onSwitch?: () => void
}

const AUDIO_CALLOUT_STYLES: Record<
  AudioCalloutProps['state'],
  {
    container: string
    title: string
    icon: ReactNode
    action: string
  }
> = {
  ignored: {
    container:
      'border-node-danger/40 bg-node-danger/10 [&_p[data-callout-body]]:text-node-danger/80',
    title: 'text-node-danger',
    icon: <AlertTriangle className="size-4 text-node-danger" />,
    action:
      'bg-node-danger/15 border-node-danger/35 text-node-danger hover:bg-node-danger/20',
  },
  cloning: {
    container:
      'border-node-success/40 bg-node-success/10 [&_p[data-callout-body]]:text-node-success/80',
    title: 'text-node-success',
    icon: <CheckCircle2 className="size-4 text-node-success" />,
    action: '',
  },
}

function AudioCallout({ state, onSwitch }: AudioCalloutProps) {
  const t = useTranslations('StudioNode.videoGeneration.audioCallout')
  const styles = AUDIO_CALLOUT_STYLES[state]

  return (
    <div
      className={cn(
        'flex flex-col gap-2.5 rounded-xl border p-3 text-xs leading-5',
        styles.container,
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 shrink-0">{styles.icon}</div>
        <div className="flex flex-col gap-1.5">
          <p className={cn('text-sm font-semibold leading-5', styles.title)}>
            {t(`${state}.title`)}
          </p>
          <p data-callout-body className="whitespace-pre-line">
            {t(`${state}.body`)}
          </p>
        </div>
      </div>
      {state === 'ignored' && onSwitch ? (
        <button
          type="button"
          onClick={onSwitch}
          className={cn(
            'flex items-center justify-center rounded-xl border px-3 py-2 text-xs font-semibold transition-colors',
            styles.action,
          )}
        >
          {t('ignored.switchAction')}
        </button>
      ) : null}
    </div>
  )
}
