'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Dices,
  Film,
  KeyRound,
  Loader2,
  Lock,
  Wand2,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { QuickSetupDialog } from '@/components/business/studio-shared/setup/QuickSetupDialog'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import type { AspectRatio } from '@/constants/config'
import { motionTransition } from '@/constants/motion'
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
import {
  useVideoComposer,
  type ComposerReferenceToken,
} from '@/hooks/node/use-video-composer'
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
import { formatTimecode } from '@/lib/video-utils'
import { cn } from '@/lib/utils'
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import type { GenerationRecord } from '@/types'
import type {
  NodeWorkflowModelOption,
  NodeWorkflowNodeData,
} from '@/types/node-workflow'

import { IMEAwareInput, IMEAwareTextarea } from '../inspector/IMEAwareField'
import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import {
  DepartmentStrip,
  TOKEN_PORT_COLOR_VAR,
  type AddReferenceRequest,
} from './DepartmentStrip'
import type { ReferenceTokenData } from './ReferenceTokenChip'
import {
  MentionInput,
  type MentionInputHandle,
  type MentionToken,
} from './MentionInput'
import { CameraGrammarButton } from './CameraGrammarButton'

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

// Aspect-ratio picker tiles render each option as a proportional preview rect
// (≤26px on the long edge) instead of a bare text pill — see the visual ratio
// picker in must-3 / fig4. Falls back to a square for a malformed ratio string.
function aspectBoxStyle(ratio: string): { width: number; height: number } {
  const [w, h] = ratio.split(':').map(Number)
  const max = 26
  if (!w || !h) return { width: max, height: max }
  return w >= h
    ? { width: max, height: Math.round((max * h) / w) }
    : { width: Math.round((max * w) / h), height: max }
}

const PROVIDER_LABEL_KEYS: Partial<Record<AI_ADAPTER_TYPES, string>> = {
  [AI_ADAPTER_TYPES.FAL]: 'fal',
  [AI_ADAPTER_TYPES.VOLCENGINE]: 'volcengine',
}

// §7.2 ⑥ 改名漂移: a reference was renamed after its @oldName was already typed
// into the prompt. Only tracked for character/background/shot (their anchor in
// text is the unambiguous `@name`) — voice's anchor is a bare name next to
// `(@AudioN)`, too easy to false-match against unrelated prose.
function findDriftReplacement(
  insertedNames: Record<string, string> | undefined,
  tokenId: string,
  currentLabel: string,
  promptText: string,
): string | undefined {
  const insertedName = insertedNames?.[tokenId]
  if (!insertedName || insertedName === currentLabel) return undefined
  return promptText.includes(`@${insertedName}`) ? insertedName : undefined
}

interface FlyingTokenState {
  kind: ReferenceTokenData['kind']
  thumbUrl?: string
  glyph: string
  from: { x: number; y: number; size: number }
  to: { x: number; y: number }
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

// Seconds since `active` last flipped to true, ticking every second. Resets to
// 0 when generation stops. Client-observed elapsed time (not a backend-tracked
// duration — F7 real progress/cancel is P2, out of scope here); the REC dot
// itself already reflects real generation state, so this is truthful about
// what it shows, not fabricated.
function useElapsedSeconds(active: boolean): number {
  const [wasActive, setWasActive] = useState(active)
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef<number | null>(null)

  // Reset to 0 the render `active` flips, before the effect below re-arms the
  // timer (adjust-state-during-render pattern — same as NodeDetailPanel's
  // trackedNodeId reset). This branch stays pure — no Date.now() here; that
  // only happens inside the effect/interval below, never during render.
  if (active !== wasActive) {
    setWasActive(active)
    setElapsed(0)
  }

  useEffect(() => {
    if (!active) {
      startRef.current = null
      return
    }
    startRef.current = Date.now()
    const interval = setInterval(() => {
      const start = startRef.current
      if (start !== null) {
        setElapsed(Math.floor((Date.now() - start) / 1000))
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [active])

  return elapsed
}

// C4 监视器：预览升级为"导演监视器"语言——四角取景框、生成中 REC+TC、无媒体时的
// 空态提示。取代 VideoDetailBody 里原先裸的 aspect-video 预览块（§9.3：所有视频
// 预览统一走 videoThumbnailUrl 作 poster）。
function VideoMonitor({
  mediaUrl,
  thumbnailUrl,
  isGenerating,
}: {
  mediaUrl: string
  thumbnailUrl?: string
  isGenerating: boolean
}) {
  const tc = useTranslations('StudioNode.videoComposer')
  const elapsedSeconds = useElapsedSeconds(isGenerating)

  return (
    <div className="node-monitor-matte relative aspect-video overflow-hidden rounded-xl border border-node-panel-inner bg-node-canvas">
      {mediaUrl ? (
        <video
          src={mediaUrl}
          poster={thumbnailUrl}
          className="h-full w-full object-contain"
          controls
          muted
          playsInline
          preload="metadata"
        />
      ) : (
        <div className="flex h-full items-center justify-center px-4 text-center">
          <span className="text-3xs text-node-subtle">
            {tc('monitor.empty')}
          </span>
        </div>
      )}
      <span className="node-monitor-corner" data-pos="tl" aria-hidden />
      <span className="node-monitor-corner" data-pos="tr" aria-hidden />
      <span className="node-monitor-corner" data-pos="bl" aria-hidden />
      <span className="node-monitor-corner" data-pos="br" aria-hidden />
      {isGenerating ? (
        <>
          <span className="pointer-events-none absolute right-4 top-9 flex items-center gap-1.5 font-mono text-3xs tabular-nums text-node-muted">
            <span className="size-1.5 animate-pulse rounded-full bg-node-danger" />
            {`${tc('monitor.rec')} ${formatTimecode(elapsedSeconds)}`}
          </span>
          <div className="node-canvas-progress-track pointer-events-none absolute inset-x-4 bottom-9 h-0.5 rounded-full bg-node-panel-inner" />
        </>
      ) : null}
    </div>
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
    setExpandedNodeId,
    focusNode,
    deleteEdge,
    spawnReference,
  } = useNodeWorkflowActions()
  const composer = useVideoComposer(id, data)
  const reducedMotion = useReducedMotion()
  // Ref to the prompt MentionInput so clickable @reference chips can insert an
  // atomic token chip at the caret (§6 S2). Exposes insertToken / focus /
  // getBoundingClientRect (the flying-animation target).
  const promptRef = useRef<MentionInputHandle>(null)
  // §8.4 插入动效 — a transient ghost thumbnail flying from the clicked token
  // to the prompt, cleared once its fly+glow finishes. null when idle.
  const [flyingToken, setFlyingToken] = useState<FlyingTokenState | null>(null)
  // In-composer disclosure for the compact model picker (detail mode). Default
  // open only when no brand is committed yet, so first-run users see the list;
  // it collapses after a brand is committed (ready-key click or rebind confirm).
  const [pickerOpen, setPickerOpen] = useState(() => !composer.state.brand)
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
    // Collapse the compact picker on a confirmed rebind, matching the
    // ready-key brand-pick path (so every commit route collapses).
    setPickerOpen(false)
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
      // One-shot reset: consume the pending signal exactly once when the
      // async-refreshed options report the brand ready (not a render-cascade).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPendingSetupBrand(null)
    }
  }, [pendingSetupBrand, composerOptions, composerSelectBrand])

  const providers = composer.state.brand
    ? getBrandProviders(composer.state.brand, composer.options)
    : []

  // Collapsed-picker summary: "brand · variant" (or just brand), falling back to
  // the pick-model prompt; plus the key status for the inline dot/needs-key icon.
  const pickerLabel = composer.state.brand
    ? composer.state.variant
      ? `${composer.state.brand} · ${tc(`variant.${composer.state.variant}`)}`
      : composer.state.brand
    : tc('pickModel')
  const pickerStatus = composer.state.brand
    ? getBrandKeyStatus(composer.state.brand, composer.options)
    : null

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
  const promptFieldValue = getNodeWorkflowFieldValue(
    data,
    NODE_WORKFLOW_FIELD_IDS.prompt,
  )

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

  // §6 S2: insert the reference as an ATOMIC chip at the caret (MentionInput
  // owns the DOM + serialization back to plain-text @name). Also records
  // `insertedReferenceNames` for visual kinds so a later rename can be detected
  // as drift (§7.2 ⑥) — a stale @oldName degrades to plain text and the drift
  // affordance offers to replace it. Plus the §8.4 flying-thumbnail overlay.
  const handleTokenInsert = useCallback(
    (refToken: ReferenceTokenData, originEl: HTMLElement) => {
      const name = refToken.token.replace(/^@/, '')
      if (!name) return
      promptRef.current?.insertToken(name)

      if (refToken.kind !== 'voice') {
        updateNodeData(id, {
          insertedReferenceNames: {
            ...(data.insertedReferenceNames ?? {}),
            [refToken.id]: refToken.label,
          },
        })
      }

      if (reducedMotion) return
      const fromRect = originEl.getBoundingClientRect()
      const toRect = promptRef.current?.getBoundingClientRect()
      setFlyingToken({
        kind: refToken.kind,
        thumbUrl:
          refToken.kind === 'voice' ? refToken.coverImage : refToken.mediaUrl,
        glyph: (refToken.label || refToken.token).slice(0, 1),
        from: {
          x: fromRect.left,
          y: fromRect.top,
          size: fromRect.width,
        },
        to: toRect
          ? { x: toRect.left + 20, y: toRect.top + 20 }
          : { x: fromRect.left, y: fromRect.top },
      })
      window.setTimeout(() => setFlyingToken(null), 440)
    },
    [data.insertedReferenceNames, id, reducedMotion, updateNodeData],
  )

  // Reference names the prompt editor should render as atomic chips — the
  // insertable tokens (character/background/shot @name, voice @AudioN). Unnamed
  // / projection-only refs (empty token) contribute no chip.
  const mentionTokens: MentionToken[] = composer.referenceTokens
    .filter(
      // keyframe is projection-only (empty token) — never an insertable mention,
      // so excluding it also narrows kind to MentionToken's insertable union.
      (
        refToken,
      ): refToken is ComposerReferenceToken & {
        kind: MentionToken['kind']
      } => Boolean(refToken.token) && refToken.kind !== 'keyframe',
    )
    .map((refToken) => ({
      name: refToken.token.replace(/^@/, ''),
      kind: refToken.kind,
      // The chip's 16px thumbnail: voices show their cover, everything else its
      // own image / video frame — same source ReferenceTokenChip picks (§9 V2-2).
      thumbnailUrl:
        refToken.kind === 'voice' ? refToken.coverImage : refToken.mediaUrl,
    }))

  // V2-1 改名静默自动回写: when a referenced node is renamed, its @oldName sits
  // stale in the prompt. Rather than surface a manual "replace" affordance
  // (removed), detect drift and rewrite @oldName → @currentName automatically,
  // re-anchoring `insertedReferenceNames` so it self-terminates next render.
  // Voice anchors are ambiguous (bare name), so they're never tracked. The
  // persisted value stays plain-text @name — the generate path is untouched.
  useEffect(() => {
    const insertedNames = data.insertedReferenceNames
    if (!insertedNames) return
    let nextPrompt = promptFieldValue
    const nextInserted = { ...insertedNames }
    let changed = false
    for (const refToken of composer.referenceTokens) {
      if (refToken.kind === 'voice') continue
      const stale = findDriftReplacement(
        insertedNames,
        refToken.id,
        refToken.label,
        nextPrompt,
      )
      if (stale) {
        nextPrompt = nextPrompt.split(`@${stale}`).join(`@${refToken.label}`)
        nextInserted[refToken.id] = refToken.label
        changed = true
      }
    }
    if (!changed) return
    updateNodeData(id, {
      [NODE_WORKFLOW_FIELD_IDS.prompt]: nextPrompt,
      insertedReferenceNames: nextInserted,
    })
  }, [
    composer.referenceTokens,
    promptFieldValue,
    data.insertedReferenceNames,
    id,
    updateNodeData,
  ])

  // §7.1 ＋添加位: the card's ＋ emits a (nodeType, role, mediaType) intent; we
  // open the matching asset library, and on pick autospawn the upstream node +
  // wire it via the context's spawnReference. Upload-local / paste are a
  // follow-up (per-modality upload endpoints differ) — library covers the core
  // "add an existing asset" flow uniformly across all three cards.
  const [pendingAdd, setPendingAdd] = useState<AddReferenceRequest | null>(null)

  // Plain handlers (not useCallback): they close over the derived `pendingAdd`
  // state, which the React Compiler can't reconcile with a manual dep array —
  // same reason the duration handlers below drop useCallback. The compiler
  // memoizes them for us.
  const handleAddReference = (request: AddReferenceRequest) => {
    setPendingAdd(request)
  }

  // ＋配音 on a character slot: open the audio library, but target the CHARACTER
  // node so the spawned voice wires `voice → character` (its 音色), not into the
  // video node.
  const handleAddVoice = (characterNodeId: string) => {
    setPendingAdd({
      nodeType: NODE_TYPE_IDS.voice,
      mediaType: 'voice',
      targetNodeId: characterNodeId,
    })
  }

  const handleSelectAssetForAdd = (generation: GenerationRecord) => {
    if (!pendingAdd || !generation.url) {
      setPendingAdd(null)
      return
    }
    spawnReference?.({
      targetNodeId: pendingAdd.targetNodeId ?? id,
      nodeType: pendingAdd.nodeType,
      role: pendingAdd.role,
      media: {
        url: generation.url,
        generationId: generation.id,
        thumbnailUrl: generation.thumbnailUrl ?? undefined,
        name: generation.prompt || generation.model || undefined,
      },
    })
    setPendingAdd(null)
  }

  // §7.1 删除槽位 = 删连线：the slot is only a projection of the edge, so ×
  // removes the edge and the upstream node survives — the toast says exactly
  // that, so it never reads as a destructive delete.
  const handleRemoveReference = useCallback(
    (refToken: ComposerReferenceToken) => {
      if (!refToken.edgeId) return
      deleteEdge(refToken.edgeId)
      toast.info(
        tc('references.removedToast', {
          name:
            refToken.label || refToken.token || tc(`refKind.${refToken.kind}`),
        }),
      )
    },
    [deleteEdge, tc],
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

  // Plain handlers (not useCallback): under the current hook graph the React
  // Compiler can't preserve a manual memoization that closes over the derived
  // `currentDurationSeconds` / `durationOptions`, so it memoizes these for us.
  const handleDurationAuto = (auto: boolean) => {
    handleFieldChange(
      NODE_WORKFLOW_FIELD_IDS.duration,
      auto ? 'auto' : String(currentDurationSeconds),
    )
  }

  const handleDurationSlide = (index: number) => {
    const value = durationOptions[index]
    if (value !== undefined) {
      handleFieldChange(NODE_WORKFLOW_FIELD_IDS.duration, String(value))
    }
  }

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
      {/* Two-pane layout: left = text inputs (references + prompt + negative),
          right = model + render settings. The @container collapses to one column
          when the panel narrows; the generate button spans full width below. */}
      <div className="@container">
        <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2">
          <div className="space-y-3">
            {/* §7 部门条 — the four production departments (选角/置景/镜头/
                配音) sitting right above the prompt their slots insert into.
                Slots project the current canvas edges; click = insert @token,
                hover × = delete the edge (node kept). */}
            <div className="space-y-1">
              <span className="text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
                {tc('references.label')}
              </span>
              <DepartmentStrip
                tokens={composer.referenceTokens}
                onInsert={handleTokenInsert}
                onLocate={focusNode}
                onRemove={handleRemoveReference}
                onAddReference={spawnReference ? handleAddReference : undefined}
                onAddVoice={spawnReference ? handleAddVoice : undefined}
              />
              {composer.referenceTokens.length > 0 ? (
                <p className="px-0.5 text-2xs leading-4 text-node-subtle">
                  {tc('references.insertHint')}
                </p>
              ) : null}
              {composer.hasReferenceInputs ? (
                <p className="px-0.5 text-2xs leading-4 text-node-subtle">
                  {tc('referenceModeOn')}
                </p>
              ) : null}
            </div>

            {/* Prompt — the composer's hero field. @references render as atomic
                chips (§6 S2 MentionInput); the persisted value stays plain-text
                @name for the generate path. The 运镜语法 button (§5 L1) inserts
                film-language phrases at the caret. */}
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
                  {tFields('prompt.label')}
                </span>
                <CameraGrammarButton
                  onInsert={(phrase) =>
                    promptRef.current?.insertText(`${phrase} `)
                  }
                />
              </div>
              <MentionInput
                ref={promptRef}
                value={promptFieldValue}
                onValueChange={(next) =>
                  handleFieldChange(NODE_WORKFLOW_FIELD_IDS.prompt, next)
                }
                tokens={mentionTokens}
                aria-label={tFields('prompt.label')}
                placeholder={tFields('prompt.placeholder')}
                {...KEY_GUARD}
                className="min-h-52 w-full rounded-lg border border-node-panel-inner bg-node-panel-soft px-2.5 py-2 text-xs leading-5 text-node-foreground focus-visible:border-node-edge"
              />
            </div>

            {/* Negative prompt — grouped with the other text inputs. */}
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
          </div>

          <div className="space-y-3">
            {/* C4 监视器 — 右列第一个区块，"看片"先于"调参"。 */}
            <VideoMonitor
              mediaUrl={hasMedia ? (data.mediaUrl as string) : ''}
              thumbnailUrl={
                typeof data.videoThumbnailUrl === 'string'
                  ? data.videoThumbnailUrl
                  : undefined
              }
              isGenerating={isPending}
            />

            {/* Compact model picker — collapsed chip below the prompt; expands the
          full brand/variant/provider rail and collapses again after a commit. */}
            <div className="space-y-2">
              <button
                type="button"
                {...KEY_GUARD}
                onClick={() => setPickerOpen((open) => !open)}
                aria-expanded={pickerOpen}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-node-panel-inner bg-node-panel-soft px-3 py-2 text-left text-xs font-semibold text-node-foreground transition-colors hover:border-node-edge"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {pickerStatus ? (
                    pickerStatus.ready ? (
                      <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
                    ) : (
                      <KeyRound className="size-3 shrink-0 text-node-muted" />
                    )
                  ) : null}
                  <span className="truncate">{pickerLabel}</span>
                </span>
                <ChevronDown
                  className={cn(
                    'size-3.5 shrink-0 text-node-muted transition-transform',
                    pickerOpen && 'rotate-180',
                  )}
                />
              </button>

              <div
                className="node-collapsible"
                data-open={pickerOpen || undefined}
              >
                <div>
                  <div className="mt-2 space-y-2 rounded-xl border border-node-panel-inner bg-node-panel-soft p-2">
                    <span className="px-0.5 text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
                      {tc('modelRail.label')}
                    </span>
                    <div className="space-y-1">
                      {composer.brands.map((brand) => {
                        const isCurrent = composer.state.brand === brand
                        const status = getBrandKeyStatus(
                          brand,
                          composer.options,
                        )
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
                              onClick={() => {
                                handleBrandClick(brand, status)
                                if (status.ready) setPickerOpen(false)
                              }}
                              className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left"
                            >
                              <span
                                className={cn(
                                  'text-xs font-semibold',
                                  isCurrent
                                    ? 'text-node-foreground'
                                    : 'text-node-muted',
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
                                      const on =
                                        composer.state.variant === variant
                                      return (
                                        <button
                                          key={variant}
                                          type="button"
                                          {...KEY_GUARD}
                                          onClick={() =>
                                            composer.selectVariant(variant)
                                          }
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
                                      const on =
                                        composer.state.provider === provider
                                      return (
                                        <button
                                          key={provider}
                                          type="button"
                                          {...KEY_GUARD}
                                          onClick={() =>
                                            composer.selectProvider(provider)
                                          }
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
                  </div>
                </div>
              </div>
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
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  {...KEY_GUARD}
                  onClick={() => updateNodeData(id, { aspectRatio: undefined })}
                  aria-pressed={currentAspect === undefined}
                  className={cn(
                    'flex w-12 flex-col items-center gap-1.5 rounded-lg border py-1.5 transition-colors',
                    currentAspect === undefined
                      ? 'border-node-foreground/70 bg-node-panel-inner text-node-foreground'
                      : 'border-node-panel-inner bg-node-panel-soft text-node-muted hover:border-node-edge hover:text-node-foreground',
                  )}
                >
                  <Wand2 className="size-4" />
                  <span className="text-2xs font-semibold">
                    {tc('aspectAuto')}
                  </span>
                </button>
                {aspectOptions.map((option) => {
                  const isSelected = currentAspect === option
                  const box = aspectBoxStyle(option)
                  return (
                    <button
                      key={option}
                      type="button"
                      {...KEY_GUARD}
                      onClick={() => handleAspectToggle(option)}
                      aria-pressed={isSelected}
                      className={cn(
                        'flex w-12 flex-col items-center gap-1.5 rounded-lg border py-1.5 transition-colors',
                        isSelected
                          ? 'border-node-foreground/70 bg-node-panel-inner text-node-foreground'
                          : 'border-node-panel-inner bg-node-panel-soft text-node-muted hover:border-node-edge hover:text-node-foreground',
                      )}
                    >
                      <span
                        aria-hidden
                        style={{ width: box.width, height: box.height }}
                        className={cn(
                          'rounded-sm border',
                          isSelected
                            ? 'border-node-foreground'
                            : 'border-node-muted',
                        )}
                      />
                      <span className="text-2xs font-semibold tabular-nums">
                        {option}
                      </span>
                    </button>
                  )
                })}
              </div>
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
                    value={
                      typeof data.seed === 'number' ? String(data.seed) : ''
                    }
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

      {/* §7.1 ＋添加位 asset library — one dialog for all three cards; the
          pending request's mediaType picks the library (voice → audio). */}
      <AssetSelectorDialog
        open={pendingAdd !== null}
        onOpenChange={(open) => {
          if (!open) setPendingAdd(null)
        }}
        onSelect={handleSelectAssetForAdd}
        title={tc('references.addDialogTitle')}
        description={tc('references.addDialogDescription')}
        mediaType={
          pendingAdd?.mediaType === 'voice' ? 'audio' : pendingAdd?.mediaType
        }
      />

      {flyingToken && typeof document !== 'undefined'
        ? createPortal(
            <AnimatePresence>
              <motion.div
                key={`${flyingToken.kind}-fly`}
                initial={{
                  x: flyingToken.from.x,
                  y: flyingToken.from.y,
                  scale: 1,
                  opacity: 1,
                }}
                animate={{
                  x: flyingToken.to.x,
                  y: flyingToken.to.y,
                  scale: 16 / flyingToken.from.size,
                  opacity: 0,
                }}
                transition={motionTransition('base')}
                style={{
                  position: 'fixed',
                  left: 0,
                  top: 0,
                  width: flyingToken.from.size,
                  height: flyingToken.from.size,
                  transformOrigin: 'top left',
                  pointerEvents: 'none',
                  zIndex: 60,
                  overflow: 'hidden',
                  borderRadius:
                    flyingToken.kind === 'background' ||
                    flyingToken.kind === 'shot'
                      ? 8
                      : 9999,
                }}
              >
                {flyingToken.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={flyingToken.thumbUrl}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <span
                    className="flex size-full items-center justify-center text-2xs font-semibold text-node-canvas"
                    style={{
                      background: TOKEN_PORT_COLOR_VAR[flyingToken.kind],
                    }}
                  >
                    {flyingToken.glyph}
                  </span>
                )}
              </motion.div>
              <motion.div
                key={`${flyingToken.kind}-glow`}
                initial={{ opacity: 0.55, scale: 0.6 }}
                animate={{ opacity: 0, scale: 2.2 }}
                transition={motionTransition('base')}
                style={{
                  position: 'fixed',
                  left: 0,
                  top: 0,
                  width: 16,
                  height: 16,
                  x: flyingToken.to.x,
                  y: flyingToken.to.y,
                  borderRadius: 9999,
                  pointerEvents: 'none',
                  zIndex: 60,
                  background: TOKEN_PORT_COLOR_VAR[flyingToken.kind],
                }}
              />
            </AnimatePresence>,
            document.body,
          )
        : null}
    </div>
  )
}
