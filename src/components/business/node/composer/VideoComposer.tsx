'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Dices,
  Film,
  Lock,
  SlidersHorizontal,
  Wand2,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { QuickSetupDialog } from '@/components/business/studio-shared/setup/QuickSetupDialog'
import { CanvasRoutePicker } from '@/components/business/studio-shared/pickers/CanvasRoutePicker'
import type { StudioModelOption } from '@/components/business/ModelSelector'
import { Button } from '@/components/ui/button'
import {
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
} from '@/components/ui/responsive-popover'
import { Slider } from '@/components/ui/slider'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { PROMPT_ENHANCE, type AspectRatio } from '@/constants/config'
import { getModelFamily } from '@/constants/models'
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
import { getVideoModelCapabilities } from '@/constants/video-model-capabilities'
import {
  VIDEO_NODE_MODES,
  getNodeModeForModel,
  modelSurvivesModeSwitch,
  type VideoNodeMode,
} from '@/constants/video-node-modes'
import {
  VIDEO_ASPECT_RATIOS,
  VIDEO_RESOLUTIONS,
  type VideoResolution,
} from '@/constants/video-options'
import {
  useVideoComposer,
  type ComposerReferenceToken,
} from '@/hooks/node/use-video-composer'
import { isRunnableModelOption } from '@/hooks/use-split-model-options'
import {
  buildNodeWorkflowPrompt,
  getNodeWorkflowFieldValue,
} from '@/lib/node-workflow-prompt'
import { getSeedanceReferenceKind } from '@/lib/node-workflow-graph'
import { resolveNodePresentationType } from '@/lib/node-presentation'
import {
  buildDisplayNamePatch,
  buildFallbackNodeNames,
  resolveNodeDisplayName,
} from '@/lib/node-display-name'
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
  NodeWorkflowNode,
  NodeWorkflowNodeData,
} from '@/types/node-workflow'

import { IMEAwareInput, IMEAwareTextarea } from '../inspector/IMEAwareField'
import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { CanvasSlotRack } from './CanvasSlotRack'
import { ReferenceAddBar, type AddReferenceRequest } from './ReferenceAddBar'
import {
  TOKEN_PORT_COLOR_VAR,
  type ReferenceTokenData,
} from './ReferenceTokenChip'
import {
  MentionInput,
  type MentionInputHandle,
  type MentionToken,
} from './MentionInput'
import { CameraGrammarButton } from './CameraGrammarButton'
import { useDownstreamUses } from '@/hooks/node/use-downstream-uses'
import { EvidenceDrawer } from '../node-detail/EvidenceDrawer'
import { RelationsStrip } from '../node-detail/RelationsStrip'
import { SpecSummaryButton } from '../node-detail/SpecSummaryButton'
import type { NodeDetailSlots } from '../node-detail/slots'

interface VideoComposerProps {
  id: string
  data: NodeWorkflowNodeData
  /** 'card' = compact right-sidecar composer; 'detail' = full model-aware
   * controls. Both consume the same persisted node data and generation path. */
  density: 'card' | 'detail'
  /**
   * 槽表渲染函数（S7）。`density='detail'` 时**必填** —— 详情面板的四段骨架由
   * `NodeDetailFrame` 拥有，这个组件只负责把自己的内容填进七个槽。
   * `density='card'` 分支不消费它（画布卡上的紧凑侧车不走槽骨架）。
   */
  children?: (slots: NodeDetailSlots) => ReactNode
  /** The node-attached sidecar keeps the video in the card on its left, so its
   * detailed state must not duplicate the historical slate/monitor. */
  showMonitor?: boolean
}

// fal Seedance duration enum: 'auto' or 4..15 seconds. The slider walks the
// model's supported seconds by index; this is the fallback set when a model
// doesn't declare `supportedDurations`.
const DURATION_SECONDS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const

// Aspect-ratio picker tiles render each option as a proportional preview rect
// (≤26px on the long edge) instead of a bare text pill — see the visual ratio
// picker in must-3 / fig4. Falls back to a square for a malformed ratio string.
// Exported: canvas-generate-composer.md §5/§7.5 names this function
// explicitly as the one to reuse verbatim for the image-mode aspect picker —
// "现状代码已做对...保留" — instead of a second implementation.
export function aspectBoxStyle(ratio: string): {
  width: number
  height: number
} {
  const [w, h] = ratio.split(':').map(Number)
  const max = 26
  if (!w || !h) return { width: max, height: max }
  return w >= h
    ? { width: max, height: Math.round((max * h) / w) }
    : { width: Math.round((max * w) / h), height: max }
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

// `getCanvasReferenceLabel` 已删（2026-08-08）：它的兜底直接返回 `node.id`，于是
// 没命名的节点在「从画布选择」里显示成一串 uuid，@ 候选里更是没法打字匹配。
// 现在两处共用 `buildFallbackNodeNames` 的「类型+序号」提议名。

const KEY_GUARD = {
  // React delegates capture handlers from the root. Stopping there prevents
  // Arrow/Home/End from ever reaching a contentEditable target, so its caret
  // stays at offset 0. Stop on the bubble phase instead: the native editor
  // receives the key first, while React Flow still never sees it.
  onKeyDown: stopCanvasKey,
  onKeyUp: stopCanvasKey,
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
  quiet = false,
}: {
  mediaUrl: string
  thumbnailUrl?: string
  isGenerating: boolean
  /**
   * 方向 E「静默」档（S7）。详情面板的主体台受契约 R2 约束：
   * 空态**只许一枚极淡字形**，禁四角取景框、禁「生成后在此预览」这类解释文案；
   * §5 还禁止媒体井深色。这三条与卡层监视器的「导演监视器」语言直接冲突，
   * 所以按落点分档，而不是把卡层也改了（那不是这轮改版的范围）。
   */
  quiet?: boolean
}) {
  const tc = useTranslations('StudioNode.videoComposer')
  const elapsedSeconds = useElapsedSeconds(isGenerating)

  return (
    <div
      className={cn(
        'relative aspect-video max-h-80 overflow-hidden rounded-xl',
        quiet
          ? // ⚠ 静默档**不挂** `node-monitor-matte`：那个类用两条 ::before/::after
            // 画 30px 的黑色遮幅（letterbox）。在浅色井上它就是两条纯黑横带，
            // 直接违反 §5「媒体井不得深色」——实拍到过。
            'canvas-detail-well'
          : 'node-monitor-matte border border-node-panel-inner bg-node-canvas',
      )}
      data-empty={mediaUrl ? undefined : 'true'}
      data-quiet={quiet || undefined}
    >
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
              一块纯黑洞（owner 真机"监视器像黑洞"）——不新造视觉隐喻，只补占位。
              ⚠ 静默档（详情面板）**只留字形**：R2 禁「生成后在此预览」这类解释文案。 */}
          <Film
            className={
              quiet
                ? 'canvas-detail-well-glyph size-12'
                : 'size-6 text-node-subtle/60'
            }
            strokeWidth={quiet ? 1.25 : undefined}
            aria-hidden
          />
          {quiet ? null : (
            <span className="text-3xs text-node-subtle">
              {tc('monitor.empty')}
            </span>
          )}
        </div>
      )}
      {/* 四角取景框：R2 点名禁止的四样之一，静默档不画。 */}
      {quiet ? null : (
        <>
          <span className="node-monitor-corner" data-pos="tl" aria-hidden />
          <span className="node-monitor-corner" data-pos="tr" aria-hidden />
          <span className="node-monitor-corner" data-pos="bl" aria-hidden />
          <span className="node-monitor-corner" data-pos="br" aria-hidden />
        </>
      )}
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

/**
 * Model-aware video composer mounted on the node card (density='card') and, for
 * now, hosted in a slimmed inspector (density='expand'). Reuses the same
 * capability-driven controls the old SeedanceInspector had, restructured around
 * the two-tier switcher + provider picker. Writes the same `node.data.*` fields.
 */
export function VideoComposer({
  id,
  data,
  density,
  showMonitor = true,
  children,
}: VideoComposerProps) {
  const t = useTranslations('StudioNode.videoGeneration')
  const tFields = useTranslations('StudioNode.workflowFields')
  const tc = useTranslations('StudioNode.videoComposer')
  const {
    updateNodeData,
    generateMediaNode,
    focusNode,
    deleteEdge,
    listConnectableReferences,
    connectReferenceNode,
    spawnReference,
  } = useNodeWorkflowActions()
  const composer = useVideoComposer(id, data)
  const downstreamUses = useDownstreamUses(id)
  const tDetail = useTranslations('StudioNode.nodeDetail')
  const tTypes = useTranslations('StudioNode.nodeTypes')
  const reducedMotion = useReducedMotion()
  // Ref to the prompt MentionInput so clickable @reference chips can insert an
  // atomic token chip at the caret (§6 S2). Exposes insertToken / focus /
  // getBoundingClientRect (the flying-animation target).
  const promptRef = useRef<MentionInputHandle>(null)
  // §8.4 插入动效 — a transient ghost thumbnail flying from the clicked token
  // to the prompt, cleared once its fly+glow finishes. null when idle.
  const [flyingToken, setFlyingToken] = useState<FlyingTokenState | null>(null)
  // Seed's collapsed summary row is intentionally its own toggle, not a 5th
  // OSD segment — §4 C5 keeps 生成音频/种子 out of the OSD capsule group and
  // gives seed its own "另起常驻空间" entry, so it doesn't fight the OSD
  // accordion for the open slot.
  const [seedOpen, setSeedOpen] = useState(false)
  const [modePickerOpen, setModePickerOpen] = useState(false)
  // The shared picker returns an exact route. Keep the existing rebind preview
  // before committing that route so switching models never silently drops a
  // connected reference capability.
  const [pendingSharedModel, setPendingSharedModel] = useState<{
    option: StudioModelOption
    preview: VideoRebindPreviewItem[]
  } | null>(null)
  // Model awaiting an API key via QuickSetupDialog (Hard Rule #8): a needs-key
  // model opens the dialog instead of going disabled.
  const [quickSetup, setQuickSetup] = useState<{
    open: boolean
    label: string
    option: NodeWorkflowModelOption
  } | null>(null)
  // The options list refreshes async after a key is verified; apply the model
  // once it actually becomes runnable.
  //
  // ⚠ 这里原先记的是**系列**，验完 key 之后调 `selectBrand(brand)` 重挑 —— 于是
  // 用户点的是「Seedance 2.5（火山方舟）」，配完 key 落到的却是该系列里解析器随手
  // 挑的另一条。记 optionId 就能落回他真正点的那一个。
  const [pendingSetupOptionId, setPendingSetupOptionId] = useState<
    string | null
  >(null)

  // 模式的事实源在 `useVideoComposer` 里（存量节点从模型反推的逻辑也在那）——
  // 提交链路与容量计算读的是同一份，组件不再自己算第二遍。
  const videoMode = composer.videoMode

  /**
   * 切档（§9.3）：不符合新模式的模型**直接消失并清空选择**，模型相关的参数档一并
   * 回默认（新模型未必支持旧档位）。**用户已传的素材一律保留在数据层** —— 素材是
   * 用户的劳动，模式是可来回切的视图状态，切回来还在，只是当前模式下不发送。
   */
  const selectVideoMode = useCallback(
    (next: VideoNodeMode) => {
      if (next === videoMode) return
      const keepModel = modelSurvivesModeSwitch(
        data.model?.modelId,
        data.model?.adapterType,
        next,
      )
      updateNodeData(id, {
        videoMode: next,
        ...(keepModel
          ? {}
          : { model: undefined, duration: undefined, resolution: undefined }),
      })
    },
    [
      id,
      videoMode,
      data.model?.modelId,
      data.model?.adapterType,
      updateNodeData,
    ],
  )

  /**
   * 模型列表按模式收窄 —— 不符合当前模式的模型**直接消失**（owner 拍板：不是置灰。
   * 置灰仍是在用状态解释「你不能用」，不出现才让人一眼看出这一档能选什么）。
   *
   * ⚠ 必须 memo：谓词的引用每次 render 变一次的话，选择器拿到的 `options` 数组身份
   * 也跟着变 —— 那正是 `BaseModelPickerPanel` 注释里记的那个坑（视图被重置回第一层）。
   * 那边有 `wasOpenRef` 兜着，但没理由主动去撞它。
   */
  const filterModelByMode = useCallback(
    (option: StudioModelOption) =>
      getNodeModeForModel(option.modelId, option.adapterType) === videoMode,
    [videoMode],
  )

  /**
   * 每一档到底有没有模型可跑。
   *
   * ⚠ **这是「不可用档位」在本仓唯一成立的判据**（owner 2026-08-10 拍板）。契约
   * 里记的两句示范文案 —— 「已连接媒体输入，无法使用纯文生视频」「需要连接图片
   * 节点（1~2 个）」—— 抄自 LibTV 的**五档**（文生视频 / 全能参考 / 图生视频 /
   * 首尾帧 / 图片参考）。我们是三档，且直接是端点形态的用户视角命名：
   *
   *   keyframe        → text-or-first-frame   （这一档本身就能纯文生）
   *   image-reference → image-content-array
   *   multimodal      → multimodal-reference
   *
   * 三档都能接素材，区别是端点与容量，不是「能不能用」。所以「连了素材所以某档
   * 不可用」在我们这儿不成立，照抄那两句会是编一个不存在的约束。
   *
   * 真正的不可用只有一种：这一档一个模型都没有 —— 选了也没得跑。
   */
  const modeAvailability = useMemo(() => {
    const available = {} as Record<VideoNodeMode, boolean>
    for (const mode of VIDEO_NODE_MODES) {
      available[mode] = composer.options.some(
        (option) =>
          getNodeModeForModel(option.modelId, option.adapterType) === mode,
      )
    }
    return available
  }, [composer.options])

  /**
   * 收起态触发器读「型号 · 渠道」，**不带端点**。
   *
   * 端点（参考 / 非参考）是模式的职责，不该在模型名里再说一遍 —— 否则模式 tab 写着
   * 「全能参考」、按钮又写一遍「（参考…）」，同一件事说两遍，还把这套设计刚藏起来的
   * 概念重新抖出来（cleanup §8.2）。渠道保留：用户选的就是型号 + 渠道这两层。
   */
  const triggerLabelForOption = useCallback(
    ({
      variantLabel,
      channelLabel,
    }: {
      variantLabel: string
      channelLabel: string
    }) => `${variantLabel} · ${channelLabel}`,
    [],
  )

  const commitSharedVideoModel = useCallback(
    (option: StudioModelOption) => {
      updateNodeData(id, {
        model: {
          optionId: option.optionId,
          modelId: option.modelId,
          adapterType: option.adapterType,
          providerConfig: option.providerConfig,
          apiKeyId: option.keyId,
        },
      })
    },
    [id, updateNodeData],
  )

  const selectSharedVideoModel = useCallback(
    (option: StudioModelOption) => {
      if (data.model?.optionId === option.optionId) return
      const preview = computeVideoRebindPreview(
        composer.referenceKinds,
        option.modelId,
      )
      if (hasIgnoredRebindings(preview)) {
        setPendingSharedModel({ option, preview })
        return
      }
      commitSharedVideoModel(option)
    },
    [commitSharedVideoModel, composer.referenceKinds, data.model?.optionId],
  )

  const confirmPendingSharedModel = useCallback(() => {
    setPendingSharedModel((pending) => {
      if (pending) commitSharedVideoModel(pending.option)
      return null
    })
  }, [commitSharedVideoModel])

  const cancelPendingSharedModel = useCallback(
    () => setPendingSharedModel(null),
    [],
  )

  const requestSharedVideoModelSetup = useCallback(
    (option: StudioModelOption) => {
      const model: NodeWorkflowModelOption = {
        optionId: option.optionId,
        modelId: option.modelId,
        adapterType: option.adapterType,
        providerConfig: option.providerConfig,
        apiKeyId: option.keyId,
        requestCount: option.requestCount,
        sourceType: option.sourceType,
        freeTier: option.freeTier,
        keyLabel: option.keyLabel,
        maskedKey: option.maskedKey,
      }
      const label =
        option.displayLabel ?? getModelFamily(option.modelId) ?? option.modelId
      setQuickSetup({ open: true, label, option: model })
    },
    [],
  )

  // After QuickSetupDialog verifies a key, the option list refreshes a tick
  // later; apply the model once it shows up as runnable.
  const { options: composerOptions } = composer
  useEffect(() => {
    if (!pendingSetupOptionId) return
    const ready = composerOptions.find(
      (option) =>
        option.optionId === pendingSetupOptionId &&
        isRunnableModelOption(option),
    )
    if (!ready) return
    commitSharedVideoModel({
      optionId: ready.optionId,
      modelId: ready.modelId,
      adapterType: ready.adapterType,
      providerConfig: ready.providerConfig,
      keyId: ready.apiKeyId,
    } as StudioModelOption)
    // One-shot reset: consume the pending signal exactly once when the
    // async-refreshed options report the model runnable (not a render-cascade).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingSetupOptionId(null)
  }, [pendingSetupOptionId, composerOptions, commitSharedVideoModel])

  // ⚠ 这里曾拼一个 "brand · variant"（`Seedance · 快速`）。它其实**从来没被显示
  // 过**：`triggerLabel` 映射到 `triggerEmptyLabel`，那是「没选模型时的占位」，
  // 选中之后触发器显示的是模型自己的标签。唯一的实际效果是把它当成了触发器的
  // aria-label —— 于是读屏念「Seedance · 快速」而画面写「Seedance 2.0（火山方
  // 舟）」，两者对不上。而且那个 variant 是从 qualityTier 推的，连 2.0 和 2.5
  // 都分不开。占位就只写占位。
  const pickerLabel = tc('pickModel')
  const selectedModelId = data.model?.modelId
  const capabilities = selectedModelId
    ? getVideoModelCapabilities(selectedModelId)
    : null
  const parameterSupport = composer.sendPreview.contract?.parameters ?? {
    duration: true,
    aspectRatio: true,
    resolution: true,
    negativePrompt: true,
    generateAudio: true,
    seed: true,
  }
  const supportsSeed = parameterSupport.seed
  // 2.5 的关键帧档一旦带图，`ratio` 就被上游钉死成 `adaptive`（传具体宽高比会 400）。
  // 这时候还摆一个比例选择器，等于让用户设一个不会被采纳的值 —— 与「不支持就不渲染」
  // 同一个处理（下面 parameterSupport.* 那批）。判据必须带上「真有图吗」：同一个模型
  // 纯文生视频不受这条限制，比例照常可选。
  const aspectRatioLockedByImages =
    Boolean(composer.sendPreview.contract?.imageAspectRatioLock) &&
    composer.sendPreview.images.length > 0
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

  /**
   * 在光标处插入一个引用。
   *
   * ⚠ 走 `insertToken`（`MentionInput` 用 Range 直接改 DOM），**不走「改 value
   * 再重渲染」** —— 后者会重建整个编辑器内容并把光标扔回开头。
   *
   * 曾经这里要分两条路：紧凑档是原生 textarea，得自己算 selectionStart 再用
   * `setSelectionRange` 把光标放回去。两档统一成同一个编辑器后那一支整个没了 ——
   * 顺带说明「两档对齐」省掉的不只是外观分叉，还有一整条平行逻辑。
   */
  const insertMentionAtCaret = useCallback((name: string) => {
    if (!name) return
    promptRef.current?.insertToken(name)
  }, [])

  // §6 S2 的完整插入：在 `insertMentionAtCaret` 之外还记 `insertedReferenceNames`
  // （改名漂移检测用）并放一枚 §8.4 飞入替身。
  //
  // ⚠ 暂时没有调用方（2026-08-09）：槽位单击走的是上面那个精简版 —— 引用只标位置，
  // 不需要 drift 记账。**但这套飞入替身不是过时资产**：契约 §十一-2 的「@ 落槽：
  // 替身飞入 250 + 内嵌环确认闪 420」要复用的正是它，只是落点从「正文光标处」变成
  // 「槽位」。阶段 4 接 `@` 全局时在这里接回去，别当死代码删掉重写。
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 见上：阶段 4 的接入点
  const handleTokenInsert = useCallback(
    (refToken: ReferenceTokenData, originEl: HTMLElement) => {
      const name = refToken.token.replace(/^@/, '')
      if (!name) return
      insertMentionAtCaret(name)

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
    [
      data.insertedReferenceNames,
      id,
      insertMentionAtCaret,
      reducedMotion,
      updateNodeData,
    ],
  )

  /**
   * 单击槽位 → 在正文光标处插入一个引用胶囊。
   *
   * ⚠ 复用 `insertToken`（`MentionInput` 用 Range 直接改 DOM，**不走「改 value
   * 再重渲染」**）—— 后者会重建整个编辑器内容并把光标扔回开头，正是 1.4 修掉的
   * 那个 bug。这条路径不碰 `data.prompt` 的外部改写，光标留在原地。
   *
   * 胶囊存 `@名字`、显示「图 N」（见 `MentionToken.slotLabel`），且**只标位置
   * 不决定发不发** —— 范围归槽架（`filterReferencedImages` 已于同轮退役）。
   */
  const handleSlotInsert = useCallback(
    (token: ComposerReferenceToken) => {
      insertMentionAtCaret(token.token.replace(/^@/, ''))
    },
    [insertMentionAtCaret],
  )

  /**
   * URL → 这张图在本次载荷里的位置（1-based）。
   *
   * 事实源是 `sendPreview.images` —— 发送预览与真正发出去的载荷同一份（那正是
   * 这个模块存在的意义），所以胶囊上的「图 3」和模型收到的 `@Image3` 永远是同
   * 一个位置。
   */
  const slotIndexByUrl = useMemo(
    () =>
      new Map(
        composer.sendPreview.images.map((image) => [image.url, image.index]),
      ),
    [composer.sendPreview.images],
  )

  // Reference names the prompt editor should render as atomic chips — the
  // insertable tokens (character/background/shot @name, voice @AudioN). Unnamed
  // / projection-only refs (empty token) contribute no chip.
  // ⚠ 文本节点**不在这里** —— 它粘的是原文，正文里没有可渲染成 chip 的东西。
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
      // 位置标注：显示这张图在**本次载荷**里的第几位。序号实时取自
      // `sendPreview.images`（发送预览与真正发出去的是同一份），所以槽位增删后
      // 下一次渲染自动更新，不会指错。取不到就退回 `@名字`（还没进载荷的素材，
      // 比如超出上限那几张 —— 它们本来就没有位置可标）。
      ...(refToken.mediaUrl && slotIndexByUrl.has(refToken.mediaUrl)
        ? {
            slotLabel: tc('references.slotLabel', {
              index: slotIndexByUrl.get(refToken.mediaUrl) as number,
            }),
          }
        : {}),
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
  const [canvasPickerOpen, setCanvasPickerOpen] = useState(false)
  const [addPickerOpen, setAddPickerOpen] = useState(false)

  // Plain handlers (not useCallback): they close over the derived `pendingAdd`
  // state, which the React Compiler can't reconcile with a manual dep array —
  // same reason the duration handlers below drop useCallback. The compiler
  // memoizes them for us.
  const handleAddReference = (request: AddReferenceRequest) => {
    setPendingAdd(request)
  }

  // ⚠ ＋配音 / ＋特写（原本在退役的 `ReferenceManagerPanel` 行菜单里）已搬到
  // **角色卡自己的详情面板**（`CharacterDetailBody`，与「绑定音色」并排）。
  // 理由是职责：素材槽架只回答「这次挂了什么、满没满、会不会发」，而「这个角色
  // 的音色/特写是什么」是**角色身份**，在 A 的界面里改 B 正是旧件 1084 行的病因。
  // 搬迁不是删除 —— ＋特写此前是全仓唯一入口（添加菜单里没有 closeup 项）。

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

  // ⚠ 出场组覆写（R3-6b §3 `stageOverrideUrls`）与它的「恢复默认」随退役的
  // `ReferenceManagerPanel` 一并撤下（2026-08-09，owner 拍板）。撤的理由不是职责
  // ——「这条边带哪几张」确实是槽架该回答的「会发什么」——而是**载体**：它依附
  // 「收集器卡 = 文件夹」这个模型，而阶段 3「参考图一律落散图节点 + 自动连线」
  // 正是要拆掉那条隐形附件通道；届时「带哪几张」就等于「连了哪几条边」，用槽位
  // 的移除即可表达，不需要第二套勾选 UI。
  // 边上的 `stageOverrideUrls` 数据与读取它的收割链**一行未动**，存量覆写照旧
  // 生效；撤掉的只是写入它的那个 UI。

  // cleanup §8.6：当前模式**没有**的素材区，添加入口真的不渲染。判据取自发送契约的
  // 槽位数 —— 与发送路径、预览层同一个真相，不另立一套「哪些模式有视频区」的表。
  const contractSlots = composer.sendPreview.contract?.slots
  const availableMediaKinds = {
    image: true,
    voice: (contractSlots?.audio ?? 1) > 0,
    video: (contractSlots?.videos ?? 1) > 0,
  } as const

  // §8.7 第三行：切模式不销毁素材，那就必须标出来「这条当前发不出去」。
  // ⚠ 只取容量以外的丢弃理由；容量那部分已经由 `imageOverflow` 驱动，两边都算会让
  // 面板顶部的容量计数虚高。
  const unsendableUrls = new Set(
    composer.sendPreview.dropped
      .filter((entry) => entry.reason === 'unsupported')
      .map((entry) => entry.url),
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
  // parseFloat 而不是 Number（2026-08-02 修，台账 D2）：这个字段的值不全是
  // 我们自己写的 —— 助手的 prompt 计划把 `plan.duration` 原样落库，而那是个
  // 自由字符串（schema 只约束长度），LLM 惯常写 '12s'；ScriptDoc 的
  // targetDuration 注释里给的例子也是 "8s" / "12-15s"。
  // Number('12s') 是 NaN，于是校验失败、滑条静默回落到中位数 —— 用户设的 12
  // 秒看着像被忽略了。parseFloat 能把这类带单位的值取出前导数字；真正解不出
  // 的（'auto' 已由上面的 isAutoDuration 拦掉）仍然走回落。
  const parsedDuration = Number.parseFloat(currentDurationRaw)
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
  const handleDurationCustom = (custom: boolean) => {
    handleFieldChange(
      NODE_WORKFLOW_FIELD_IDS.duration,
      custom ? String(currentDurationSeconds) : 'auto',
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
        : composer.sendPreview.blockers?.includes('execution-not-migrated')
          ? t('executionNotMigrated')
          : composer.sendPreview.blockers?.includes('audio-requires-visual')
            ? t('audioRequiresVisual')
            : null
  const generateLabel = hasMedia ? t('regenerate') : t('generate')

  const generateButton = (
    <Button
      type="button"
      {...KEY_GUARD}
      onClick={handleGenerate}
      disabled={Boolean(disabledReason)}
      // ⚠ 无障碍名带原因，**可见文字不带**：坞里左边那行已经在说原因了，
      // 按钮再写一遍就是同一屏说两遍（实拍到过）。按钮的可见文字应当恒是
      // 「这一屏的那件主事」。
      aria-label={disabledReason ?? generateLabel}
      className="canvas-video-object-studio-generate h-10 rounded-xl bg-node-paint text-node-canvas hover:bg-node-paint/90 disabled:bg-node-panel-inner disabled:text-node-subtle"
    >
      {isPending ? <Spinner size="md" /> : <Film className="size-4" />}
      {generateLabel}
    </Button>
  )

  const connectableReferences = listConnectableReferences?.(id) ?? []

  /**
   * @ 候选 = **画布上任意可连的节点**，与「从画布选择」同一份数据源。
   *
   * owner 2026-08-08 定的是 B 方案：@ 不只是插一个名字，选中就**新建一条边**，等于
   * 「从画布选择」的打字版。所以候选不能只列已连进来的那些。
   * ⚠ @ 只绑节点，**不绑模型** —— 模型有它自己的选择器（cleanup §9.4：模型选择在
   * 节点面板内，不做第二个入口）。
   */
  // ⚠ 参考类用 refKind（角色/镜头/参考视频…），**其余用节点类型**。此前一律
  // `?? 'video'`，于是镜头文本这种结构类节点被叫成「参考视频1」并按这个名字落了库
  // —— 名字一旦盖上去就是错的。
  const mentionKindOf = (node: NodeWorkflowNode) => {
    const refKind = getSeedanceReferenceKind(node)
    return refKind
      ? tc(`refKind.${refKind}`)
      : tTypes(resolveNodePresentationType(node))
  }
  // 没起过名字的节点在这里拿一个「类型+序号」的**提议名**（uuid 是没法打字匹配的）。
  const mentionNames = buildFallbackNodeNames(
    connectableReferences,
    mentionKindOf,
  )
  /**
   * 文本节点也进 `@` 菜单 —— 但**落法按物种**（契约 §5.2）：素材落槽（连线，
   * 正文里留 `@名字`），文本**把内容原文粘进正文**（不连线、不留占位符）。
   * 一个菜单两种落法，而不是给文本再造一个触发字符 —— 用户要找的东西在一处。
   *
   * ⚠ 2026-08-10 owner 拍板从「插 `▤` 胶囊」改成「粘原文」。理由是他一直想的就
   * 是「文本自动放到输入框中」，而胶囊是**引用**：多一层间接、多一套字面量、多
   * 一条成环检测，换来的「改源节点跟着变」他并不需要。粘进来之后就是普通文字，
   * 可以直接接着改 —— 这也是原来那三个胶囊动作（跳源/展开/移除）一起消失的原因。
   */
  const textNodeCandidates = composer.textNodes.map((entry) => ({
    id: entry.id,
    name: entry.name,
    groupLabel: tTypes('shotText'),
    group: 'text',
    // hover 到这一条就把内容摊开给用户看 —— 名字（「开场设定」）说不出里面写了
    // 什么，而点下去是**不可撤销地往正文里倒一段字**，看一眼再点是最低成本的闸。
    preview: entry.text,
  }))
  const textCandidateIds = new Set(textNodeCandidates.map((c) => c.id))

  /**
   * **已经在槽里的素材也要能 `@`**（owner 2026-08-10，交接 §0-2「已有则不重复加，
   * 且不报错」；契约 §5.4 的「已引用置顶」也一直是这么写的）。
   *
   * ⚠ 它们**不在** `listConnectableReferences` 里 —— 那个函数把 duplicate 过滤
   * 掉了，理由写在它自己的注释里：「重复连接才是真的选不了：点了也没用」。那句话
   * 在「`@` 只落槽不留字」的时代成立；现在选中它会**在正文插字**，就不再是没用。
   * 2026-08-10 真机撞到这条：刚 `@` 进来的素材，第二次 `@` 它菜单直接空掉 ——
   * 用户没法在句子里再提它一次。
   *
   * 两份名单回答的是两个问题，所以不去改那个函数：菜单问「我能提谁」，
   * 「从画布选择」问「我能加谁」。已在槽里的素材属于前者不属于后者。
   */
  const referencedCandidates = composer.referenceTokens
    .filter(
      (refToken) =>
        Boolean(refToken.token) &&
        refToken.kind !== 'keyframe' &&
        refToken.insertable !== false,
    )
    .map((refToken) => ({
      id: refToken.id,
      name: refToken.token.replace(/^@/, ''),
      groupLabel: tc(`refKind.${refToken.kind}`),
      group: 'referenced',
    }))

  const mentionCandidates = [
    /**
     * 已引用置顶（契约 §5.4）—— 用户找「刚才那张」时不该翻到列表底下。
     *
     * ⚠ **置顶 ≠ 独占**。这一族可以有十几条（槽架上限 15），而菜单一次只显示 8
     * 条：不分名额的话它会把整张表吃光，下面两族一条都露不出来。owner 2026-08-10
     * 实拍到的正是这一幕 —— 槽里 8 个素材，文本候选彻底消失。名额按族分的逻辑在
     * `MentionInput.matches`，这里只负责给每条打上族标。
     */
    ...referencedCandidates,
    /**
     * ⚠ **文本节点要从可连那半里剔掉**，否则它在菜单里出现**两次** ——
     * 它既是 `listConnectableReferences` 的合法上游（连线喂 upstreamText 这条
     * 老机制还在），又是这里的文本候选。2026-08-10 真机撞到：菜单里两行一模一样
     * 的「开场设定 / 镜头文本」，控制台一条 React duplicate key。
     *
     * 剔的是**菜单**不是能力：文本节点照样可以在画布上拉一条边进来。菜单里只留
     * 一种落法，是因为契约 §5.2 的「落法按物种」要求一个候选只有一个归宿。
     */
    ...connectableReferences
      .filter((node) => !textCandidateIds.has(node.id))
      .map((node) => ({
        id: node.id,
        name: mentionNames.get(node.id) ?? node.id,
        groupLabel: mentionKindOf(node),
        group: 'connectable',
      })),
    ...textNodeCandidates,
  ].filter(
    // 三份名单合流，**按 id 去重收在一处**（保留先出现的，所以「已引用」的口径赢）。
    // ⚠ 不靠「三份互不相交」这个当下成立的巧合：`key={candidate.id}` 一旦撞上就是
    // 一条 React duplicate key + 一行看起来重复的候选，而那正是本轮真机抓到的缺陷。
    (candidate, index, all) =>
      all.findIndex((other) => other.id === candidate.id) === index,
  )

  const handleMentionSelect = (candidate: { id: string; name: string }) => {
    /**
     * 文本节点 → **把内容原文粘进光标处**，不连线、不留占位符（契约 §5.2）。
     *
     * 粘完它就是普通文字：用户可以就地改、可以拆开、可以只留半句 —— 这正是
     * owner 要的（「文本自动放到输入框中」）。代价是**副本**，源节点之后再改
     * 不会跟着变；换来的是没有第二套字面量语法要学、要维护。
     *
     * ⚠ 走 `insertText` 不是 `insertToken`：后者建的是原子 chip，而这里落的
     * 就是一段可编辑的字。两者都用 `insertNodeAtCaret`（Range 直插 DOM，不改
     * `value`），所以光标不会被扔回开头。
     */
    const textCandidate = textNodeCandidates.find((c) => c.id === candidate.id)
    if (textCandidate) {
      promptRef.current?.insertText(textCandidate.preview)
      return
    }
    const node = connectableReferences.find((n) => n.id === candidate.id)
    // ⚠ 引用即命名：提议名是按列表顺序算的，会随增删重新编号，而 @ 存进 prompt 的是
    // **字面文本** —— 不落库的话，以后 `@参考视频2` 会静默指向另一个节点。所以选中
    // 的这一刻就把名字盖回节点，此后它就是真名字，素材条/从画布选择/图例全都一致。
    if (node && !resolveNodeDisplayName(node.data)) {
      updateNodeData(
        node.id,
        buildDisplayNamePatch(
          { role: node.data.role, type: node.type },
          candidate.name,
        ),
      )
    }
    /**
     * **落槽 + 正文留字**（owner 2026-08-10 拍板，交接 §0-1，就地推翻契约 §5.1
     * 的「`@` 只落槽不留字」）。
     *
     * ── 为什么现在加回 `insertToken` 是安全的 ────────────────────────────
     * 阶段 1 删它，是因为当时**两条路都在插**：`handleIngestConnect` 往
     * `data.prompt` 追加一次、这里再插一次，而那边的去重 `prompt.includes(token)`
     * 读的是连线前的旧值，拦不住同一次操作里的第二次 —— 实拍正文里的
     * `@镜头1 @镜头1 @镜头1` 就是这么来的。那条追加路**已经整个删掉**，现在只剩
     * 这一处在插。⛔ 别把 `handleIngestConnect` 里的追加也一并加回来，那才是根因。
     *
     * 第二个旧 bug「光标跳回开头」也不会回来：`insertToken` 走
     * `insertNodeAtCaret`（Range 直插 DOM）**不改 `value`**，不触发
     * `MentionInput` 那次重建。
     *
     * ── 为什么要看返回值 ────────────────────────────────────────────────
     * 只在**素材确实在槽里**时才留字。重复引用返回 `true`（它本来就在，
     * §0-2「已有则不重复加、且不报错」）；被容量闸或类型闸拒掉返回 `false` ——
     * 那时候插 `@名字` 就是在正文里写一句载荷里不存在的引用，又回到几本账
     * 对不齐（横切纪律 3「不许静默」的反面：也不许谎报成功）。
     */
    const landedInRack = connectReferenceNode?.(candidate.id, id) ?? false
    if (landedInRack) insertMentionAtCaret(candidate.name)
  }
  const referenceAssetDialog = (
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
  )

  /**
   * 模式下拉 —— 参数条顺序：模型 → **模式** → 参数 →（工具）→ 用模板
   * （report §8.15 owner 拍板）。
   *
   * ⚠ **两档都要有**（2026-08-10 owner 真机发现「展开态没有关键帧 ↔ 全能参考
   * 的切换」）：阶段 2 第一版只做了紧凑档，完整档的编排台仍只有 模型 / 参数 /
   * 运镜语法 三颗 chip，模式在左下角只是一行**只读状态字**。于是同一个节点，
   * 收起来能切档、展开反而切不了 —— 展开本该是「同一件事的更全形态」。
   * 抽成函数而不是复制一遍：两档的可用性判据与置灰理由必须是同一份。
   *
   * ⚠ 不可用档位用**置灰 + 说出原因**，不是让它消失：模式是固定三档的骨架，
   * 少一档会让骨架变形、用户不知道自己少了什么。判据取自 `modeAvailability`
   * （该档一个模型都没有），不是照抄 LibTV 那两句针对五档写的约束。
   */
  const renderModePicker = (triggerClassName: string) => (
    <ResponsivePopover open={modePickerOpen} onOpenChange={setModePickerOpen}>
      <ResponsivePopoverTrigger asChild>
        <button
          type="button"
          {...KEY_GUARD}
          className={triggerClassName}
          aria-label={tc('sidecar.modeLabel')}
        >
          <span>{tc(`sidecar.mode.${videoMode}`)}</span>
          <ChevronDown className="size-3 shrink-0" aria-hidden />
        </button>
      </ResponsivePopoverTrigger>
      <ResponsivePopoverContent
        label={tc('sidecar.modeLabel')}
        side="top"
        align="start"
        sideOffset={6}
        className="w-60 space-y-0.5 rounded-xl p-1.5"
      >
        {VIDEO_NODE_MODES.map((mode) => {
          const usable = modeAvailability[mode]
          return (
            <button
              key={mode}
              type="button"
              disabled={!usable}
              aria-current={mode === videoMode ? 'true' : undefined}
              onClick={() => {
                selectVideoMode(mode)
                setModePickerOpen(false)
              }}
              className={cn(
                'flex w-full flex-col items-start gap-0.5 rounded-lg px-2.5 py-1.5 text-left text-xs',
                usable
                  ? 'text-node-foreground hover:bg-node-panel-soft'
                  : 'cursor-default text-node-subtle',
                mode === videoMode && 'bg-node-panel-soft',
              )}
            >
              <span>{tc(`sidecar.mode.${mode}`)}</span>
              {/* 置灰必须给原因 —— 否则用户只知道点不动，不知道为什么。 */}
              {usable ? null : (
                <span className="text-3xs text-node-subtle">
                  {tc('sidecar.modeNoModel')}
                </span>
              )}
            </button>
          )
        })}
      </ResponsivePopoverContent>
    </ResponsivePopover>
  )

  // Compact right-sidecar: a spacious prompt surface with a truthful connected
  // reference strip and a single bottom dock. Editing model-specific details
  // expands this same sidecar; it no longer lives inside the video card.
  if (density === 'card') {
    // 同 `pickerLabel`：这是占位/aria-label，不是选中后的显示名。见上方注释。
    const modelLabel = tc('pickModel')
    // ⚠ 这里**不能**直接把 data.duration 拼上 's'（2026-08-02 修，台账 D2）。
    // 那样写有两个后果，实拍图里的 `12ss` 是第一个：
    //   ① 助手写进来的值本身就带单位（node-assistant 的 prompt 计划里是
    //      '12s'），再拼一次就成了 `12ss`；
    //   ② 更隐蔽的是它**绕过了整套解析** —— 下面那条 OSD 与滑条走的是
    //      `currentDurationSeconds`（Number() 解析 + durationOptions 校验，
    //      解不出就回落中位数）。于是同一个 '12s' 会让摘要显示 12ss、滑条
    //      显示 6 秒、真正送给 provider 的又是第三个值，三处互不一致。
    // 统一走同一个已解析的事实源，单位由 i18n 模板给（zh 是「N 秒」而不是
    // 「Ns」，硬拼 's' 连语言都不对）。
    const durationValue = typeof data.duration === 'string' ? data.duration : ''
    const summaryParts = [
      typeof data.resolution === 'string' ? data.resolution : null,
      // 「没设过就不显示这一项」的既有行为保留；有值时才渲染，且渲染的是
      // 已解析的那个事实源。
      durationValue ? durationSummary : null,
      typeof data.aspectRatio === 'string' ? data.aspectRatio : null,
    ].filter((part): part is string => Boolean(part))

    return (
      <>
        <div className="canvas-video-composer-compact">
          {/* ⚠ 顶部三档 tab 已退役（owner 2026-08-09 拍板，report §8.15）——
              模式改挂底部参数条的下拉，顺序统一为 模型 → 模式 → 参数 → 工具。
              这里只留「已连接 N」这个读数：它是状态不是控件，和模式挤在一行时
              会被读成第四个档位。 */}
          <div className="canvas-video-composer-mode">
            <span className="canvas-video-composer-mode-count">
              {tc('sidecar.connectedCount', {
                count: composer.referenceTokens.length,
              })}
            </span>
          </div>

          <div className="canvas-video-composer-helper">
            <span>
              {composer.hasReferenceInputs
                ? tc('sidecar.referenceHelper')
                : tc('sidecar.textHelper')}
            </span>
            <ResponsivePopover
              open={canvasPickerOpen}
              onOpenChange={setCanvasPickerOpen}
            >
              <ResponsivePopoverTrigger asChild>
                <button type="button" {...KEY_GUARD}>
                  {tc('sidecar.chooseFromCanvas')}
                </button>
              </ResponsivePopoverTrigger>
              <ResponsivePopoverContent
                label={tc('sidecar.chooseFromCanvas')}
                side="bottom"
                align="end"
                sideOffset={6}
                className="w-64 space-y-1 rounded-xl p-2"
              >
                {connectableReferences.length > 0 ? (
                  connectableReferences.map((node) => {
                    const kind = getSeedanceReferenceKind(node) ?? 'video'
                    // 与 @ 候选**同一份名字**（`mentionNames`）：两处若各算各的，
                    // 同一个没命名的节点会在两个入口叫不同的名字。
                    const label = mentionNames.get(node.id) ?? node.id
                    return (
                      <button
                        key={node.id}
                        type="button"
                        className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-node-panel-soft"
                        onClick={() => {
                          connectReferenceNode?.(node.id, id)
                          setCanvasPickerOpen(false)
                        }}
                      >
                        <span className="truncate font-semibold">{label}</span>
                        <span className="shrink-0 text-2xs text-node-muted">
                          {tc(`refKind.${kind}`)}
                        </span>
                      </button>
                    )
                  })
                ) : (
                  <p className="px-2 py-3 text-xs text-node-muted">
                    {tc('references.managerEmpty')}
                  </p>
                )}
              </ResponsivePopoverContent>
            </ResponsivePopover>
          </div>

          <div className="canvas-video-composer-assets">
            {composer.referenceTokens.length > 0 ? (
              /* 紧凑档 = 同一个槽架默认折起（契约 §4.3）。
                 ⚠ 这里原先是 `referenceTokens.slice(0, 5)` 的一条独立 strip ——
                 12 个素材只显示 5 个，用户在紧凑档看到的从来不是全部，两档的账
                 因此永远对不上。那正是本轮要消灭的「第二套渲染」。 */
              <CanvasSlotRack
                tokens={composer.referenceTokens}
                slotLimits={composer.sendPreview.slotLimits}
                defaultExpanded={false}
                unsendableUrls={unsendableUrls}
                slotIndexByUrl={slotIndexByUrl}
                onLocate={focusNode}
                onInsert={handleSlotInsert}
                onRemove={handleRemoveReference}
              />
            ) : (
              <p className="canvas-video-composer-assets-empty">
                {tc('sidecar.noReferences')}
              </p>
            )}
            <ResponsivePopover
              open={addPickerOpen}
              onOpenChange={setAddPickerOpen}
            >
              <ResponsivePopoverTrigger asChild>
                <button
                  type="button"
                  {...KEY_GUARD}
                  className="canvas-video-composer-asset-add"
                  aria-label={tc('sidecar.addReference')}
                  title={tc('sidecar.addReference')}
                >
                  +
                </button>
              </ResponsivePopoverTrigger>
              <ResponsivePopoverContent
                label={tc('sidecar.addReference')}
                side="bottom"
                align="end"
                sideOffset={6}
                className="w-52 space-y-1 rounded-xl p-2"
              >
                {(
                  [
                    {
                      key: 'image',
                      request: {
                        nodeType: NODE_TYPE_IDS.image,
                        role: NODE_IMAGE_ROLE_IDS.shot,
                        mediaType: 'image',
                      },
                    },
                    {
                      key: 'voice',
                      request: {
                        nodeType: NODE_TYPE_IDS.voice,
                        mediaType: 'voice',
                      },
                    },
                    {
                      key: 'video',
                      request: {
                        nodeType: NODE_TYPE_IDS.videoReference,
                        mediaType: 'video',
                      },
                    },
                  ] as const
                ).map(({ key, request }) => (
                  <button
                    key={key}
                    type="button"
                    className="w-full rounded-lg px-2.5 py-2 text-left text-xs font-semibold hover:bg-node-panel-soft"
                    onClick={() => {
                      handleAddReference(request)
                      setAddPickerOpen(false)
                    }}
                  >
                    {tc(`references.addGroups.${key}`)}
                  </button>
                ))}
              </ResponsivePopoverContent>
            </ResponsivePopover>
          </div>

          {/* 输入框 + 字数计数打包成一个 flex 项：父层 .canvas-video-composer-
              compact 的列间距是 10px，计数直接当兄弟会被推开一整格，读起来
              不像属于这个框。 */}
          <div className="canvas-video-composer-prompt-group">
            <div className="canvas-video-composer-prompt">
              {/* ⚠ 两档用**同一个编辑器**（2026-08-09 owner 定「紧凑档和完整档
                  对齐」）。此前紧凑档是原生 textarea，于是同一条引用在画布卡上
                  是一串裸名字 `@漂泊者_全身_官方_0016`、在详情面板里却是「图 2」
                  胶囊 —— 同一份正文两个样子。
                  换成 `MentionInput` 后胶囊、`@` 候选、IME 处理全都两档一致，
                  `insertMentionAtCaret` 也不必再分两条路。 */}
              <MentionInput
                ref={promptRef}
                value={promptFieldValue}
                onValueChange={(next) =>
                  handleFieldChange(NODE_WORKFLOW_FIELD_IDS.prompt, next)
                }
                tokens={mentionTokens}
                mentionCandidates={mentionCandidates}
                onMentionSelect={handleMentionSelect}
                aria-label={tFields('prompt.label')}
                placeholder={tc('sidecar.promptPlaceholder')}
                className="canvas-video-composer-prompt-input"
              />
            </div>
            {/* 台账 D2：计数搬到框**外**。原先它 absolute 压在框内右下角，而
              textarea 会滚动，正文一长就从它底下穿过去。 */}
            <span
              className={cn(
                'canvas-video-composer-count',
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

          <div
            className="canvas-video-composer-dock"
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <CanvasRoutePicker
              variant="media"
              mediaModality="video"
              value={data.model?.optionId ?? null}
              onChange={selectSharedVideoModel}
              onRequestSetup={requestSharedVideoModelSetup}
              triggerLabel={modelLabel}
              filterOption={filterModelByMode}
              triggerLabelForOption={triggerLabelForOption}
              className="canvas-video-composer-model"
            />

            {/* 模式下拉（两档共用同一个 `renderModePicker`，见它的头注）。 */}
            {renderModePicker('canvas-video-composer-summary')}

            <ResponsivePopover>
              <ResponsivePopoverTrigger asChild>
                <button
                  type="button"
                  {...KEY_GUARD}
                  className="canvas-video-composer-summary"
                  aria-label={tc('sidecar.editParameters')}
                >
                  <SlidersHorizontal
                    className="size-3.5 shrink-0"
                    aria-hidden
                  />
                  <span>
                    {summaryParts.length > 0
                      ? summaryParts.join(' / ')
                      : tc('sidecar.editParameters')}
                  </span>
                  <ChevronDown className="size-3.5 shrink-0" aria-hidden />
                </button>
              </ResponsivePopoverTrigger>
              <ResponsivePopoverContent
                label={tc('sidecar.editParameters')}
                side="top"
                align="end"
                sideOffset={8}
                className="w-80 space-y-4 rounded-2xl p-3"
                mobileClassName="space-y-4"
              >
                {parameterSupport.duration ? (
                  <ComposerField label={tFields('duration.label')}>
                    <div className="space-y-2.5">
                      <p className="text-right text-xs font-semibold tabular-nums text-node-foreground">
                        {durationSummary}
                      </p>
                      <Slider
                        min={0}
                        max={Math.max(0, durationOptions.length - 1)}
                        step={1}
                        value={[durationIndex]}
                        onValueChange={(values) =>
                          handleDurationSlide(values[0] ?? 0)
                        }
                        aria-label={tFields('duration.label')}
                      />
                    </div>
                  </ComposerField>
                ) : null}

                {parameterSupport.aspectRatio && !aspectRatioLockedByImages ? (
                  <ComposerField label={t('aspectRatioLabel')}>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          updateNodeData(id, { aspectRatio: undefined })
                        }
                        aria-pressed={currentAspect === undefined}
                        className={cn(
                          'flex w-12 flex-col items-center gap-1 rounded-lg border py-1.5 text-2xs font-semibold',
                          currentAspect === undefined
                            ? 'border-node-foreground bg-node-panel-inner'
                            : 'border-node-panel-inner text-node-muted',
                        )}
                      >
                        <Wand2 className="size-4" />
                        {tc('aspectAuto')}
                      </button>
                      {aspectOptions.map((option) => {
                        const box = aspectBoxStyle(option)
                        const selected = currentAspect === option
                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={() => handleAspectToggle(option)}
                            aria-pressed={selected}
                            className={cn(
                              'flex w-12 flex-col items-center gap-1 rounded-lg border py-1.5 text-2xs font-semibold',
                              selected
                                ? 'border-node-foreground bg-node-panel-inner'
                                : 'border-node-panel-inner text-node-muted',
                            )}
                          >
                            <span
                              aria-hidden
                              style={{ width: box.width, height: box.height }}
                              className="rounded-sm border border-current"
                            />
                            {option}
                          </button>
                        )
                      })}
                    </div>
                  </ComposerField>
                ) : null}

                {parameterSupport.resolution ? (
                  <ComposerField label={t('resolutionLabel')}>
                    <div className="grid grid-cols-3 gap-1.5">
                      {resolutionOptions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => handleResolutionToggle(option)}
                          aria-pressed={currentResolution === option}
                          className={cn(
                            'rounded-lg border px-2 py-2 text-2xs font-semibold',
                            currentResolution === option
                              ? 'border-node-foreground bg-node-panel-inner'
                              : 'border-node-panel-inner text-node-muted',
                          )}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </ComposerField>
                ) : null}

                {parameterSupport.generateAudio ? (
                  <div className="flex items-center justify-between rounded-lg bg-node-panel-soft px-2.5 py-2">
                    <span className="text-2xs font-semibold text-node-foreground">
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
                ) : null}
              </ResponsivePopoverContent>
            </ResponsivePopover>
            <button
              type="button"
              {...KEY_GUARD}
              onClick={handleGenerate}
              disabled={Boolean(disabledReason)}
              className="canvas-video-composer-generate"
              aria-label={disabledReason ?? generateLabel}
              title={disabledReason ?? generateLabel}
            >
              {isPending ? <Spinner size="sm" /> : <span aria-hidden>↑</span>}
            </button>
          </div>
          {disabledReason ? (
            <p className="canvas-video-composer-disabled-reason">
              {disabledReason}
            </p>
          ) : null}
        </div>
        {referenceAssetDialog}
      </>
    )
  }

  // ── 方向 E · 七槽（S7，2026-08-04）────────────────────────────────
  // seedance 是十族里最后一个、也是最重的一个。它没有单独的 detail body 文件 ——
  // 全部状态与 handler 都住在这个组件里，把它们搬去别处只会制造第二个家。
  // 这里只做**重排**：同一批 JSX 换个槽落位，逻辑一行不动。
  //
  // ⚠ 六个 `.node-collapsible` 全部消失（契约 §8）：模型 rail 进「模型」浮层，
  // 时长/分辨率/画幅/生成音频/种子进「参数」浮层，发送预览进证据抽屉。
  // 连带解掉它们用 `grid-template-rows` 做过渡（布局属性，违反「合成层只动
  // transform/opacity」）的问题。
  //
  // 模型选择复用全站通用两级 picker；引用重绑预览仍在提交前显式确认。
  const paramsSummaryParts = [
    parameterSupport.resolution && typeof data.resolution === 'string'
      ? data.resolution
      : '',
    parameterSupport.duration && typeof data.duration === 'string'
      ? durationSummary
      : '',
    // 同上：比例被钉死时，摘要里还写「16:9」就是在说一件不会发生的事。
    parameterSupport.aspectRatio &&
    !aspectRatioLockedByImages &&
    typeof data.aspectRatio === 'string'
      ? data.aspectRatio
      : '',
  ].filter(Boolean)

  const slots: NodeDetailSlots = {
    stage: showMonitor ? (
      <>
        <div className="canvas-detail-stage">
          <VideoMonitor
            quiet
            mediaUrl={hasMedia ? (data.mediaUrl as string) : ''}
            thumbnailUrl={
              typeof data.videoThumbnailUrl === 'string'
                ? data.videoThumbnailUrl
                : undefined
            }
            isGenerating={isPending}
          />
        </div>
        {/* 台座：原来是监视器上方那行槽标题的 `meta`（R1 要删标题）。
            规格本身是有用的只读派生值，降成井下一行纯文本（R6）。
            ⚠ **只在有片时出现**：它说的是「监视器里这条片的规格」，而编排台那颗
            参数 chip 说的是「下次要发什么」。没片的时候两者是同一串值，
            实拍里就是同一屏把「自动 · 自动 · 自动」说了两遍。 */}
        {hasMedia ? (
          <div className="canvas-detail-pedestal">
            {tc('studio.filmMeta', {
              duration: durationSummary,
              aspect: aspectSummary,
              resolution: resolutionSummary,
            })}
          </div>
        ) : null}
      </>
    ) : undefined,

    rack: (
      <div className="canvas-detail-stack">
        {/* 完整档 = 同一个槽架默认展开（契约 §4.3）。紧凑档在 density='card'
            分支里用的是**同一个组件**，只是 defaultExpanded=false —— 此前那边
            自己画了一条 slice(0,5) 的 strip，正是「两档计数对不上」的来源。 */}
        <CanvasSlotRack
          tokens={composer.referenceTokens}
          slotLimits={composer.sendPreview.slotLimits}
          defaultExpanded={true}
          unsendableUrls={unsendableUrls}
          slotIndexByUrl={slotIndexByUrl}
          onLocate={focusNode}
          onInsert={handleSlotInsert}
          onRemove={handleRemoveReference}
        />
        {spawnReference ? (
          <ReferenceAddBar
            availableMediaKinds={availableMediaKinds}
            onAddReference={handleAddReference}
          />
        ) : null}
        {composer.hasReferenceInputs ? (
          <p className="px-0.5 text-2xs leading-4 text-node-subtle">
            {tc('referenceModeOn')}
          </p>
        ) : null}
      </div>
    ),

    desk: (
      <div className="canvas-detail-stack">
        {/* R7：长文本整宽、无标签、无边框。**prompt 不配独立标签行** ——
            原来那一行「提示词」标签只是为了给 运镜语法 按钮找个落脚点，
            按钮已经移进下面的 chip 行。 */}
        <div className="canvas-detail-prompt-block">
          <MentionInput
            ref={promptRef}
            value={promptFieldValue}
            onValueChange={(next) =>
              handleFieldChange(NODE_WORKFLOW_FIELD_IDS.prompt, next)
            }
            tokens={mentionTokens}
            mentionCandidates={mentionCandidates}
            onMentionSelect={handleMentionSelect}
            aria-label={tFields('prompt.label')}
            placeholder={tFields('prompt.placeholder')}
            className="min-h-40 w-full border-none bg-transparent px-2.5 py-2 text-xs leading-5 text-node-foreground"
          />
        </div>
        {/* ⚠ 这一行只留字数。「已引用 N / 已连接 N」由素材架那一行负责 ——
            实拍里两处并存，同一屏说了两遍。 */}
        <div className="flex items-center justify-end gap-2 px-0.5 text-3xs tabular-nums text-node-subtle">
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

        {parameterSupport.negativePrompt ? (
          <div className="canvas-detail-krow">
            <span className="canvas-detail-krow-key">
              {t('negativePromptLabel')}
            </span>
            <div className="canvas-detail-prompt-block min-w-0 flex-1">
              <IMEAwareTextarea
                value={currentNegative}
                onValueChange={handleNegativeChange}
                aria-label={t('negativePromptLabel')}
                placeholder={t('negativePromptPlaceholder')}
                {...KEY_GUARD}
                className="min-h-16 w-full resize-none border-none bg-transparent px-2.5 py-2 text-xs leading-5 text-node-foreground outline-none"
              />
            </div>
          </div>
        ) : null}

        {/* R1 表：编排台 = 整宽 prompt 块 + 一行 chip（模型 / **模式** / 参数 /
            运镜语法）。模式 2026-08-10 补进来 —— 此前完整档只有三颗 chip，模式
            在左下角是只读状态字，于是**收起来能切档、展开反而切不了**。 */}
        <div className="flex flex-wrap items-center gap-2">
          <CanvasRoutePicker
            variant="media"
            mediaModality="video"
            value={data.model?.optionId ?? null}
            onChange={selectSharedVideoModel}
            onRequestSetup={requestSharedVideoModelSetup}
            triggerLabel={pickerLabel}
            filterOption={filterModelByMode}
            triggerLabelForOption={triggerLabelForOption}
            className="canvas-detail-model-picker h-10 w-full rounded-xl"
          />

          {/* 与旁边的「编辑参数 / 运镜语法」同一颗 chip 形态（`canvas-detail-chip`
              是 `SpecSummaryButton` 用的那一个），不给模式发明第二种长相。 */}
          {renderModePicker('canvas-detail-chip')}

          {pendingSharedModel ? (
            <div className="space-y-2 rounded-xl border border-node-muted/50 bg-node-panel-soft p-3">
              <p className="flex items-center gap-1.5 text-2xs font-semibold text-node-foreground">
                <AlertTriangle className="size-3.5 shrink-0" />
                {tc('rebind.title', {
                  brand:
                    pendingSharedModel.option.displayLabel ??
                    pendingSharedModel.option.modelId,
                })}
              </p>
              <ul className="space-y-1">
                {pendingSharedModel.preview.map((item) => (
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
              <div className="flex gap-2">
                <button
                  type="button"
                  {...KEY_GUARD}
                  onClick={confirmPendingSharedModel}
                  className="flex-1 rounded-lg bg-node-foreground px-2 py-2 text-2xs font-semibold text-node-canvas"
                >
                  {tc('rebind.confirm')}
                </button>
                <button
                  type="button"
                  {...KEY_GUARD}
                  onClick={cancelPendingSharedModel}
                  className="flex-1 rounded-lg border border-node-panel-inner px-2 py-2 text-2xs font-semibold text-node-muted"
                >
                  {tc('rebind.cancel')}
                </button>
              </div>
            </div>
          ) : null}

          <SpecSummaryButton
            parts={paramsSummaryParts}
            emptyLabel={tDetail('editParams')}
            label={tDetail('editParams')}
          >
            <div className="space-y-3">
              {parameterSupport.duration ? (
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
                        {tFields('duration.custom')}
                        <Switch
                          checked={!isAutoDuration}
                          onCheckedChange={handleDurationCustom}
                          aria-label={tFields('duration.custom')}
                        />
                      </label>
                    </div>
                    {/* ⚠ 滑条**不再随「自动」禁用**（owner 2026-08-04 报「这边无法
                        自定义时间」）。
                        原来是 `disabled={isAutoDuration}`：默认档是自动，于是滑条
                        一进来就是灰的，用户必须先找到右上角那颗开关、点开、
                        才轮得到拖。一个「点一下就能用」的控件不是不可用，把它画成
                        灰的等于骗人。而且画布卡上的同一根滑条从来就没有这道闸 ——
                        同一个控件在两处两种行为。
                        现在**拖动本身就是自定义**：写进一个具体秒数 ⟹ isAutoDuration
                        变 false ⟹ 那颗开关自己亮起来，正是 owner 说的
                        「自定义时间的时候，自定义按钮会同时激活」。开关退回它真正的
                        职责：把时长交还给模型。
                        ⚠ `onValueCommit` 是必需的：按住不动直接松手时 Radix 不发
                        `onValueChange`（值没变），那一下就会「拖了但还是自动」。 */}
                    <div className="node-duration-slider px-0.5" {...KEY_GUARD}>
                      <Slider
                        min={0}
                        max={Math.max(0, durationOptions.length - 1)}
                        step={1}
                        value={[durationIndex]}
                        onValueChange={(vals) =>
                          handleDurationSlide(vals[0] ?? 0)
                        }
                        onValueCommit={(vals) =>
                          handleDurationSlide(vals[0] ?? durationIndex)
                        }
                        aria-label={tFields('duration.label')}
                      />
                    </div>
                    <div className="flex justify-between text-2xs tabular-nums text-node-subtle">
                      <span>{durationOptions[0]}</span>
                      <span>{durationOptions[durationOptions.length - 1]}</span>
                    </div>
                  </div>
                </ComposerField>
              ) : null}
              {parameterSupport.resolution ? (
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
              ) : null}
              {parameterSupport.aspectRatio ? (
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
              ) : null}
              {parameterSupport.generateAudio ? (
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
              ) : null}
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
          </SpecSummaryButton>

          <CameraGrammarButton
            onInsert={(phrase) => promptRef.current?.insertText(`${phrase} `)}
          />
        </div>
      </div>
    ),

    relations: (
      <RelationsStrip
        uses={downstreamUses}
        emptyLabel={tDetail('relationsEmptyVideo')}
        labelOf={(use) => use.name ?? tTypes(use.type)}
        ariaOf={(name) => tDetail('focusOnCanvas', { name })}
      />
    ),

    evidence: (
      <EvidenceDrawer
        label={tc('sendPreview.toggle')}
        count={composer.referenceTokens.length}
      >
        <div className="space-y-2.5 rounded-lg border border-node-panel-inner bg-node-panel-soft p-2.5 text-2xs leading-5 text-node-foreground">
          <div>
            <p className="text-3xs font-semibold uppercase tracking-nav-dense text-node-muted">
              {tc('sendPreview.promptLabel')}
            </p>
            <p className="whitespace-pre-wrap font-mono text-3xs text-node-foreground">
              {composer.sendPreview.translatedPrompt || tc('sendPreview.empty')}
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
      </EvidenceDrawer>
    ),

    dock: (
      <div className="canvas-detail-dock-bar">
        {/* ⚠ **模式名从这里撤了**（2026-08-10）。原注释写着「切换器放哪个槽还没定，
            定了之前这里只显示不可改」—— 现在定了：模式是编排台那行 chip 的第二颗
            （模型 → 模式 → 参数 → 运镜语法）。控件落位之后这行纯文本就成了同一
            句话的第二遍，正是本页契约点名要删的那类重复（实拍抓到过 7 处）。
            坞里留「N 个输入 · M 个丢弃」与失败原因即可 —— 那是这一屏别处没有的话。 */}
        <p
          className="canvas-detail-dock-reason"
          data-tone={!isPending && disabledReason ? 'error' : undefined}
        >
          {disabledReason ??
            tc('studio.sendSummary', {
              inputs: composer.referenceTokens.length,
              dropped: composer.sendPreview.dropped.length,
            })}
        </p>
        {generateButton}
      </div>
    ),

    overlays: (
      <>
        {quickSetup ? (
          <QuickSetupDialog
            open={quickSetup.open}
            onOpenChange={(open) =>
              setQuickSetup((prev) => (prev ? { ...prev, open } : prev))
            }
            modelId={quickSetup.option.modelId}
            modelLabel={quickSetup.label}
            adapterType={quickSetup.option.adapterType as AI_ADAPTER_TYPES}
            optionId={quickSetup.option.optionId}
            onVerified={() => {
              setPendingSetupOptionId(quickSetup.option.optionId)
              setQuickSetup((prev) => (prev ? { ...prev, open: false } : prev))
            }}
          />
        ) : null}

        {/* §7.1 ＋添加位 asset library — one dialog for all three cards; the
          pending request's mediaType picks the library (voice → audio). */}
        {referenceAssetDialog}

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
      </>
    ),
  }

  // ⚠ 类型上 `children` 是可选的（card 分支不需要它），运行时在 detail 分支
  // 必然有 —— `SeedanceDetailBody` 是唯一的调用方，且它自己就是槽表提供者。
  // 这里不做静默兜底：给不出槽就说不出话，比渲染一个空面板诚实。
  if (!children) {
    throw new Error('VideoComposer(density="detail") requires a slots renderer')
  }
  return <>{children(slots)}</>
}
