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
  Eye,
  Film,
  KeyRound,
  Lock,
  Wand2,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { QuickSetupDialog } from '@/components/business/studio-shared/setup/QuickSetupDialog'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { PROMPT_ENHANCE, type AspectRatio } from '@/constants/config'
import { motionTransition } from '@/constants/motion'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  NODE_GENERATION_STATUS_IDS,
  NODE_IMAGE_ROLE_IDS,
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
  ReferenceManagerPanel,
  TOKEN_PORT_COLOR_VAR,
  type AddReferenceRequest,
} from './ReferenceManagerPanel'
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

// C5 参数 OSD 胶囊（v4 §4 C5 捞回，R3-8）: one segment of the collapsed
// model/duration/resolution/aspect summary row — 20-24px tall (h-6), shows
// the current value, `aria-label` carries the field's name for a11y (the
// visible label lives in the expanded `.node-collapsible` body below, not
// duplicated here to keep the pill single-line per the v4 spec).
// FB-6 极简修（2026-07-19，owner 真机实测"右栏空 / 自动自动哑胶囊读不懂"）:
// 从紧凑哑胶囊改为整宽「标签 · 当前值」设置行——与下方种子行同款解剖，四个参
// 数（模型/时长/分辨率/画幅）各占一行、标签与值恒可读、点行展开精调。竖排把稀
// 疏的右栏填满，去掉"自动 自动"两个无标签胶囊的困惑。纯 token 内重排，不新造视
// 觉隐喻（对齐 canvas-relationship-v3 §7b A6 的极简修口径 + 2026-07-19 皮肤限定）。
function OsdPill({
  label,
  value,
  active,
  onClick,
  icon,
}: {
  label: string
  value: string
  active: boolean
  onClick: () => void
  icon?: React.ReactNode
}) {
  return (
    <button
      type="button"
      {...KEY_GUARD}
      onClick={onClick}
      aria-expanded={active}
      aria-label={`${label}: ${value}`}
      className={cn(
        'flex w-full items-center justify-between gap-2 rounded-lg border bg-node-panel-soft px-3 py-2 text-left transition-colors',
        active
          ? 'border-node-edge'
          : 'border-node-panel-inner hover:border-node-edge',
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
          {label}
        </span>
        {icon}
        <span className="truncate text-xs font-semibold text-node-foreground">
          {value}
        </span>
      </span>
      <ChevronDown
        className={cn(
          'size-3.5 shrink-0 text-node-muted transition-transform',
          active && 'rotate-180',
        )}
      />
    </button>
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
// 预览统一走 videoThumbnailUrl 作 poster）。A6：详情态里升为面板顶部整宽 hero——
// aspect-video 定 16:9 基准，max-h-80（20rem）钳制上限，让下半区（prompt/设置）
// 默认可见而不必先滚过一整块 16:9；宽面板下监视器因而比 16:9 更矮更宽（C4 规格
// 本就写"≥16:9，全宽"），窄容器（@container 单列降级）宽度更小则钳制不生效，
// 天然保持 16:9。
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
    <div className="node-monitor-matte relative aspect-video max-h-80 overflow-hidden rounded-xl border border-node-panel-inner bg-node-canvas">
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
        <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
          {/* FB-6 极简修: 空态给一枚克制的胶片图标，让监视器读成"待录制"而非
              一块纯黑洞（owner 真机"监视器像黑洞"）——不新造视觉隐喻，只补占位。 */}
          <Film className="size-6 text-node-subtle/60" aria-hidden />
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
            <span className="size-1.5 animate-pulse rounded-full bg-node-status-failed" />
            {`${tc('monitor.rec')} ${formatTimecode(elapsedSeconds)}`}
          </span>
          <div className="node-canvas-progress-track pointer-events-none absolute inset-x-4 bottom-9 h-0.5 rounded-full bg-node-panel-inner" />
        </>
      ) : null}
    </div>
  )
}

// C1 场记条（v4 §4 C1 捞回，R3-8）：视频详情 body 顶部一条 44px 结构条，读现有字
// 段——项目名走 actions context（NodeWorkflowActionsContext.projectName，即
// CanvasTopBar 已经在用的同一个 `workflow.currentProjectName`）、上游镜头名走
// composer 的 shot 引用 token、模式=有无参考输入、状态=data.status。任一段缺席
// （没挂镜头图 / 项目名未知）诚实省略，不留白凑数、不编造。与 NodeDetailPanel
// 头部的面包屑（画布 / 节点名）不重复：面包屑答"这是哪个节点"，本条答"归哪个
// 项目 · 接哪个镜头 · 什么生成模式"——所以本条不再复述节点类型名。
function VideoSlateStrip({
  projectName,
  shotName,
  isReferenceMode,
  status,
}: {
  projectName?: string
  shotName?: string
  isReferenceMode: boolean
  status: NodeWorkflowNodeData['status']
}) {
  const t = useTranslations('StudioNode.statuses')
  const tc = useTranslations('StudioNode.videoComposer')
  const isRunning = status === NODE_STATUS_IDS.running
  const isFailed = status === NODE_STATUS_IDS.failed

  return (
    <div className="flex h-11 shrink-0 items-center gap-3 rounded-lg border border-node-panel-inner bg-node-panel-soft px-3">
      {/* 三道斜纹场记记号 — 结构表达，纯 CSS，不是插画资产。 */}
      <span className="flex shrink-0 items-center gap-0.5" aria-hidden="true">
        <span className="h-6 w-1 -skew-x-12 bg-node-foreground/50" />
        <span className="h-6 w-1 -skew-x-12 bg-node-foreground/50" />
        <span className="h-6 w-1 -skew-x-12 bg-node-foreground/50" />
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {projectName ? (
          <span className="truncate text-sm font-semibold text-node-foreground">
            {projectName}
          </span>
        ) : null}
        {shotName ? (
          <span className="truncate text-xs text-node-muted">{shotName}</span>
        ) : null}
        <span className="shrink-0 text-3xs text-node-subtle">
          {isReferenceMode ? tc('slate.modeReference') : tc('slate.modeText')}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span
          aria-hidden="true"
          className={cn(
            'size-1.5 rounded-full',
            isRunning
              ? 'animate-pulse bg-node-paint'
              : isFailed
                ? 'bg-node-status-failed'
                : 'bg-node-muted',
          )}
        />
        <span className="font-mono text-3xs uppercase text-node-muted">
          {t(status)}
        </span>
      </div>
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
    updateEdgeData,
    generateMediaNode,
    setExpandedNodeId,
    focusNode,
    deleteEdge,
    spawnReference,
    projectName,
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
  // C5 参数 OSD（v4 §4 C5 捞回，R3-8）: the settings column collapses model /
  // duration / resolution / aspect behind one capsule row — `openSection`
  // is the single accordion driving all four (same `.node-collapsible`
  // grid-rows mechanism the model rail already used pre-R3-8, just shared
  // across the four segments instead of owned by one). Default open only
  // when no brand is committed yet, so first-run users still land on the
  // model rail; it collapses after a brand is committed (ready-key click or
  // rebind confirm) — same rule the old standalone `pickerOpen` had.
  const [openSection, setOpenSection] = useState<
    'model' | 'duration' | 'resolution' | 'aspect' | null
  >(() => (composer.state.brand ? null : 'model'))
  // Seed's collapsed summary row is intentionally its own toggle, not a 5th
  // OSD segment — §4 C5 keeps 生成音频/种子 out of the OSD capsule group and
  // gives seed its own "另起常驻空间" entry, so it doesn't fight the OSD
  // accordion for the open slot.
  const [seedOpen, setSeedOpen] = useState(false)
  const toggleSection = useCallback(
    (section: 'model' | 'duration' | 'resolution' | 'aspect') => {
      setOpenSection((current) => (current === section ? null : section))
    },
    [],
  )
  // R3-6b §2 发送图例预览: closed by default (diagnostic, not primary flow) —
  // "查看发送内容" opens a read-only mirror of `composer.sendPreview`.
  const [sendPreviewOpen, setSendPreviewOpen] = useState(false)
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
    // Collapse the OSD model section on a confirmed rebind, matching the
    // ready-key brand-pick path (so every commit route collapses).
    setOpenSection(null)
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
  // V-3b 容量护栏 (设计稿 §3.6) / R3-6b §1: the manager panel warns when 已引用图
  // exceeds the CURRENT model's actual cap (Seedance ≤9) rather than a
  // hardcoded number — undefined model = unknown cap = warning suppressed,
  // not guessed. Resolved once inside `useVideoComposer` (single source,
  // also feeds `sendPreview`'s capping) instead of a second independent copy
  // of the same `getMaxReferenceImages` ternary.
  const maxReferenceImages = composer.maxReferenceImages
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
  // C1 场记条「镜头」段: the upstream shot-image reference feeding this video,
  // if any — same `kind: 'shot'` token the reference strip already resolves
  // (name or auto-numbered @镜头N). No shot upstream / unnamed with no slot ⇒
  // empty label ⇒ honestly omitted, not a new field.
  const shotReferenceLabel =
    composer.referenceTokens.find((token) => token.kind === 'shot')?.label ||
    undefined
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

  // ＋特写 on a character slot (§9 B): open the image library and target the
  // CHARACTER so the spawned image wires `closeup → character` — a face-detail
  // sub-reference that rides image_urls behind its subject (harvest 1-hop).
  const handleAddCloseup = (characterNodeId: string) => {
    setPendingAdd({
      nodeType: NODE_TYPE_IDS.image,
      role: NODE_IMAGE_ROLE_IDS.closeup,
      mediaType: 'image',
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

  // R3-6b §3 每镜覆写: toggling a gallery thumbnail's checkbox writes the
  // collector→video edge's `stageOverrideUrls` — the FIRST toggle on an
  // inherited (no-override) card seeds the override from the CURRENT
  // effective stage set (`galleryAssets[].stagedForVideo`, already
  // override-aware) so a single click only changes the one asset the user
  // touched, not the whole set.
  const handleToggleStage = useCallback(
    (token: ComposerReferenceToken, assetUrl: string, checked: boolean) => {
      if (!token.edgeId || !updateEdgeData) return
      const effective = new Set(
        (token.galleryAssets ?? [])
          .filter((asset) => asset.stagedForVideo)
          .map((asset) => asset.url),
      )
      if (checked) effective.add(assetUrl)
      else effective.delete(assetUrl)
      updateEdgeData(token.edgeId, {
        stageOverrideUrls: Array.from(effective),
      })
    },
    [updateEdgeData],
  )

  const handleRestoreDefaultStage = useCallback(
    (token: ComposerReferenceToken) => {
      if (!token.edgeId || !updateEdgeData) return
      updateEdgeData(token.edgeId, { stageOverrideUrls: undefined })
    },
    [updateEdgeData],
  )

  // R3-6b §1 容量透明: `imageOverflow` is `sendPreview.overflow` reshaped into
  // a Map for O(1) per-thumbnail lookups — same fact, no recomputation.
  const imageOverflow = new Map(
    composer.sendPreview.overflow.map((entry) => [entry.url, entry.name]),
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
  // C5 OSD 摘要文案 — all three derive from state already computed above for
  // the 1:1 controls; the OSD pill just renders the same fact as one line
  // instead of a full field. Resolution/aspect unset both mean "provider
  // decides", so they share the existing `aspectAuto` copy rather than
  // inventing a second "unset" string for the same concept.
  const durationSummary = isAutoDuration
    ? tFields('duration.auto')
    : tFields('duration.seconds', { value: String(currentDurationSeconds) })
  const resolutionSummary = currentResolution ?? tc('aspectAuto')
  const aspectSummary = currentAspect ?? tc('aspectAuto')

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
      className="h-10 w-full rounded-xl bg-node-paint text-node-canvas hover:bg-node-paint/90 disabled:bg-node-panel-inner disabled:text-node-subtle"
    >
      {isPending ? <Spinner size="md" /> : <Film className="size-4" />}
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
    <div className="nodrag relative space-y-4">
      {/* A6 骨架：监视器 hero 顶部整宽，下方 prompt(左·写作) / 设置(右·调参) 双栏。
          @container 窄断点降级为单列，DOM 顺序即视觉顺序：监视器 → 提示词 → 设置。
          A5: relative 是「管理素材」右半覆盖层的定位锚——ReferenceManagerPanel 深
          嵌在下方左列里，但它的覆盖层用 absolute inset-y-0 right-0，靠 CSS 的"就近
          已定位祖先"规则直接贴到这层，覆盖监视器→双栏→生成键的整个可见高度，不
          用把状态提升到这里、也不用穿透传 ref。 */}
      <VideoSlateStrip
        projectName={projectName}
        shotName={shotReferenceLabel}
        isReferenceMode={composer.hasReferenceInputs}
        status={data.status}
      />
      <VideoMonitor
        mediaUrl={hasMedia ? (data.mediaUrl as string) : ''}
        thumbnailUrl={
          typeof data.videoThumbnailUrl === 'string'
            ? data.videoThumbnailUrl
            : undefined
        }
        isGenerating={isPending}
      />

      {/* Two-pane layout below the monitor: left = text inputs (references +
          prompt + negative), right = model + render settings. 3:2 列宽比照顾
          提示词书写密度（textarea/管理素材条更需要横向空间，设置区都是紧凑
          chips/滑杆）。The @container collapses to one column when the panel
          narrows; the generate button spans full width below. */}
      <div className="@container">
        <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-5">
          <div className="space-y-3 @2xl:col-span-3">
            {/* V-3a 管理素材面板 — 取代五分区部门条：始终可见的「已引用」条
                （点击重新插入 / hover × 删连线）+「管理素材」抽屉（已连接 N 全量列
                + 类型 tab + 搜索 + 每行插入/已引用状态 + ⋮ 定位/断连/加音色/加特写）。
                部门条原有的 ＋添加位 能力搬进抽屉的 tab 工具条，无功能回退。 */}
            <ReferenceManagerPanel
              tokens={composer.referenceTokens}
              referencedTokenIds={composer.referencedTokenIds}
              onInsert={handleTokenInsert}
              onLocate={focusNode}
              onRemove={handleRemoveReference}
              onAddReference={spawnReference ? handleAddReference : undefined}
              onAddVoice={spawnReference ? handleAddVoice : undefined}
              onAddCloseup={spawnReference ? handleAddCloseup : undefined}
              maxReferenceImages={maxReferenceImages}
              imageOverflow={imageOverflow}
              assembledImageCount={composer.sendPreview.assembledImageCount}
              onToggleStage={updateEdgeData ? handleToggleStage : undefined}
              onRestoreDefaultStage={
                updateEdgeData ? handleRestoreDefaultStage : undefined
              }
            />
            {composer.hasReferenceInputs ? (
              <p className="px-0.5 text-2xs leading-4 text-node-subtle">
                {tc('referenceModeOn')}
              </p>
            ) : null}

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
              {/* V-3a 创意指令区底部计数（设计稿 §4）: 已引用/已连接 与 prompt 编辑
                  同屏可见，字数复用现有 PROMPT_ENHANCE.MAX_INPUT_LENGTH（无新增
                  magic number）。 */}
              <div className="flex items-center justify-between gap-2 px-0.5 text-3xs tabular-nums text-node-subtle">
                <span>
                  {tc('references.counter', {
                    referenced: composer.referencedTokenIds.size,
                    connected: composer.referenceTokens.length,
                  })}
                </span>
                <span
                  className={cn(
                    promptFieldValue.length > PROMPT_ENHANCE.MAX_INPUT_LENGTH &&
                      'text-node-status-failed',
                  )}
                >
                  {tc('references.charCount', {
                    length: promptFieldValue.length,
                    max: PROMPT_ENHANCE.MAX_INPUT_LENGTH,
                  })}
                </span>
              </div>
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

          <div className="space-y-3 @2xl:col-span-2">
            {/* C5 参数设置（v4 §4 C5，R3-8 起；FB-6 极简修 2026-07-19）: 模型/时
                长/分辨率/画幅各一整宽「标签 · 值」行，点击展开下方 1:1 现有控件
                （同一 openSection 手风琴，点新段自动收起上一段）。竖排让右设置栏
                不再稀疏、四个值恒可读。生成音频/种子刻意不在这组里（见下方两处
                独立区块），与 v4 §4 C5 原文一致。 */}
            <div className="space-y-1.5">
              <OsdPill
                label={tc('modelRail.label')}
                value={pickerLabel}
                icon={
                  pickerStatus ? (
                    pickerStatus.ready ? (
                      <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
                    ) : (
                      <KeyRound className="size-3 shrink-0" />
                    )
                  ) : null
                }
                active={openSection === 'model'}
                onClick={() => toggleSection('model')}
              />
              <OsdPill
                label={tFields('duration.label')}
                value={durationSummary}
                active={openSection === 'duration'}
                onClick={() => toggleSection('duration')}
              />
              <OsdPill
                label={t('resolutionLabel')}
                value={resolutionSummary}
                active={openSection === 'resolution'}
                onClick={() => toggleSection('resolution')}
              />
              <OsdPill
                label={t('aspectRatioLabel')}
                value={aspectSummary}
                active={openSection === 'aspect'}
                onClick={() => toggleSection('aspect')}
              />
            </div>

            <div
              className="node-collapsible"
              data-open={openSection === 'model' || undefined}
            >
              <div>
                <div className="mt-2 space-y-2 rounded-xl border border-node-panel-inner bg-node-panel-soft p-2">
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
                            onClick={() => {
                              handleBrandClick(brand, status)
                              if (status.ready) setOpenSection(null)
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

            <div
              className="node-collapsible"
              data-open={openSection === 'duration' || undefined}
            >
              <div>
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
                        onValueChange={(vals) =>
                          handleDurationSlide(vals[0] ?? 0)
                        }
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
              </div>
            </div>

            <div
              className="node-collapsible"
              data-open={openSection === 'resolution' || undefined}
            >
              <div>
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
              </div>
            </div>

            <div
              className="node-collapsible"
              data-open={openSection === 'aspect' || undefined}
            >
              <div>
                <ComposerField label={t('aspectRatioLabel')}>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      {...KEY_GUARD}
                      onClick={() =>
                        updateNodeData(id, { aspectRatio: undefined })
                      }
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
              </div>
            </div>

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
              <div className="space-y-2">
                {/* 种子 — v4 §4 C5: 生成音频+种子不进 OSD 摘要，另起常驻空间；种
                    子默认收起为可点摘要行「种子 · 随机/数值」，独立于上面的 OSD
                    手风琴（不抢它的展开位）。 */}
                <button
                  type="button"
                  {...KEY_GUARD}
                  onClick={() => setSeedOpen((open) => !open)}
                  aria-expanded={seedOpen}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-node-panel-inner bg-node-panel-soft px-3 py-2 text-left text-xs font-semibold text-node-foreground transition-colors hover:border-node-edge"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
                      {tc('seedLabel')}
                    </span>
                    <span className="truncate font-mono tabular-nums">
                      {typeof data.seed === 'number'
                        ? data.seed
                        : tc('seedRandom')}
                    </span>
                  </span>
                  <ChevronDown
                    className={cn(
                      'size-3.5 shrink-0 text-node-muted transition-transform',
                      seedOpen && 'rotate-180',
                    )}
                  />
                </button>
                <div
                  className="node-collapsible"
                  data-open={seedOpen || undefined}
                >
                  <div>
                    {/* No ComposerField label here — the trigger row above
                        already reads "种子 · 随机/数值", so repeating the
                        "种子(seed)" heading in the expanded body would just be
                        the same fact twice; the 1:1 controls (input/dice/
                        lastSeed) are otherwise untouched. */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <IMEAwareInput
                          value={
                            typeof data.seed === 'number'
                              ? String(data.seed)
                              : ''
                          }
                          onValueChange={(next) => {
                            const trimmed = next.trim()
                            const parsed = Number(trimmed)
                            updateNodeData(id, {
                              seed:
                                trimmed &&
                                Number.isInteger(parsed) &&
                                parsed >= 0
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
                          onClick={() =>
                            updateNodeData(id, { seed: data.lastSeed })
                          }
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
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {data.generationError ? (
        <div className="rounded-lg border border-red-400/30 bg-red-500/10 p-2.5 text-2xs leading-4 text-red-100">
          {data.generationError}
        </div>
      ) : null}

      {/* R3-6b §2 发送图例预览（防黑盒）: read-only mirror of
          `composer.sendPreview` — same finalPrompt/legend/image_urls pipeline
          `handleGenerateMediaNode` assembles for real, recomputed live off the
          same graph state, so it never lies about the覆写/截断-adjusted set
          that will actually ship. */}
      <div className="space-y-2">
        <button
          type="button"
          {...KEY_GUARD}
          onClick={() => setSendPreviewOpen((open) => !open)}
          aria-expanded={sendPreviewOpen}
          className="nodrag flex w-full items-center justify-between gap-2 rounded-lg border border-node-panel-inner bg-node-panel-soft px-3 py-2 text-left text-2xs font-semibold text-node-muted transition-colors hover:border-node-edge hover:text-node-foreground"
        >
          <span className="flex items-center gap-1.5">
            <Eye className="size-3.5 shrink-0" />
            {tc('sendPreview.toggle')}
          </span>
          <ChevronDown
            className={cn(
              'size-3.5 shrink-0 transition-transform',
              sendPreviewOpen && 'rotate-180',
            )}
          />
        </button>
        <div
          className="node-collapsible"
          data-open={sendPreviewOpen || undefined}
        >
          <div>
            <div className="space-y-2.5 rounded-lg border border-node-panel-inner bg-node-panel-soft p-2.5 text-2xs leading-5 text-node-foreground">
              <div>
                <p className="text-3xs font-semibold uppercase tracking-nav-dense text-node-muted">
                  {tc('sendPreview.promptLabel')}
                </p>
                <p className="whitespace-pre-wrap font-mono text-3xs text-node-foreground">
                  {composer.sendPreview.translatedPrompt ||
                    tc('sendPreview.empty')}
                </p>
              </div>

              {composer.sendPreview.legend ? (
                <div>
                  <p className="text-3xs font-semibold uppercase tracking-nav-dense text-node-muted">
                    {tc('sendPreview.legendLabel')}
                  </p>
                  <p className="whitespace-pre-wrap font-mono text-3xs text-node-foreground">
                    {composer.sendPreview.legend}
                  </p>
                </div>
              ) : null}

              {composer.sendPreview.images.length > 0 ? (
                <div>
                  <p className="text-3xs font-semibold uppercase tracking-nav-dense text-node-muted">
                    {tc('sendPreview.imagesLabel', {
                      count: composer.sendPreview.images.length,
                    })}
                  </p>
                  <ol className="mt-1 flex flex-wrap gap-1.5">
                    {composer.sendPreview.images.map((image) => (
                      <li
                        key={image.url}
                        className="flex w-16 flex-col items-center gap-1"
                      >
                        <span className="node-card-window relative aspect-square w-full overflow-hidden rounded-md border border-node-panel-inner bg-node-card-window">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={image.url}
                            alt=""
                            className="size-full object-cover"
                          />
                          <span className="absolute left-0.5 top-0.5 rounded-full bg-node-canvas/80 px-1 text-3xs font-semibold text-node-foreground">
                            {tc('sendPreview.imageBadge', {
                              index: image.index,
                            })}
                          </span>
                        </span>
                        <span className="w-full truncate text-center text-3xs text-node-subtle">
                          {image.name ?? tc('sendPreview.unnamed')}
                          {image.category ? `（${image.category}）` : ''}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}

              {composer.sendPreview.videoUrls.length > 0 ||
              composer.sendPreview.audioEntries.length > 0 ? (
                <div>
                  <p className="text-3xs font-semibold uppercase tracking-nav-dense text-node-muted">
                    {tc('sendPreview.avLabel')}
                  </p>
                  <ul className="mt-1 space-y-0.5 text-3xs text-node-subtle">
                    {composer.sendPreview.videoUrls.map((url, index) => (
                      <li key={url}>
                        {tc('sendPreview.videoBadge', { index: index + 1 })}
                      </li>
                    ))}
                    {composer.sendPreview.audioEntries.map((entry) => (
                      <li key={entry.index}>
                        {tc('sendPreview.audioBadge', {
                          index: entry.index,
                        })}
                        {` · ${entry.label}`}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

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
                    flyingToken.kind === 'shot' ||
                    flyingToken.kind === 'closeup'
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
