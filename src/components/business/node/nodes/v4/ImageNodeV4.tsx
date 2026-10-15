'use client'

/**
 * 图片节点（v3 spec §3，画板 `ImageStates` / `ImageSelected` / `ImageToolbar` /
 * `PromptBar` / `ImageNodeFrame`）。
 *
 * 五态：**空卡**（虚线框 + 加号 + 一句提示，⌘V / 拖入都落进这张卡）· **有图收起**
 * （卡即图、按真实比例、名字在卡外，⛔ 无角标、无槽、无卡头）· **选中**（工具条浮
 * 在卡上、提示词栏浮在卡下、版本点在中间）· **生成中**（边即进度 + 栏变灰可取消）
 * · **画中框**（双击，原比例图片 + 参考 + 提示词 + 生成页脚）。
 *
 * ── 三条纪律 ────────────────────────────────────────────────────────────
 * ① **壳全部来自 `chrome/`**：卡骨架 / 工具条 / 提示词栏 / chip 弹层 / 版本点 /
 *    边即进度 / 画中框。⛔ 这里不复制任何一件的形态。
 * ② **语义写入走 op**（`canvas.onApplyOp`）；媒体回填走 `canvas.onSetMedia`
 *    （上传与生成都是用户的动作，⛔ 助手不许塞 URL —— op 表 §5 纪律 1）。
 * ③ **参数与模型走 `onSetParams` / `onSetModel`**，⛔ 不在组件里存一份影子状态。
 *
 * ── S3b 补上的三处（原来的缺口）────────────────────────────────────────
 * · **产出版本**有了数据层落点（`outputs.versions`）：小点读 `imageVersions()`、
 *   切版本发 `set_output_version`。⛔ 组件里不再存一份影子 `versionIndex`——
 *   那会与卡上真正显示的那一版漂开。
 * · **「设为角色卡」**走 `set_subtype`（撤销回原来的子型，不是一个恰好同名的字段值）。
 * · **「生镜头」**是**一批**：`[add_node video.shot(ref), connect this→ref.firstFrame]`
 *   —— 批内别名表让第二条认得出刚建的那张，且两条合成一个撤销条目。
 */

import { Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { AnimatePresence } from 'motion/react'
import { useTranslations } from 'next-intl'
import { Spinner } from '@/components/ui/spinner'

import { useModelChannelGate } from '@/hooks/use-model-channel-gate'
import { isMissingKeyModelOption } from '@/hooks/use-split-model-options'
import {
  findModelChannelSiblings,
  findRunnableSiblingChannel,
  pickCheapestChannel,
} from '@/lib/model-channel-fallback'
import { useApiKeysContextOptional } from '@/contexts/api-keys-context'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Clapperboard,
  Download,
  MoreHorizontal,
  Pencil,
  Upload,
  ImageIcon,
  X,
} from '@/components/icons'

import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { NODE_SLOT_IDS } from '@/constants/node-slots'
import { PROGRESS_TICK_MS } from '@/constants/generation-progress'
import { formatUnitPriceAmount } from '@/constants/models/unit-prices'
import { supportsSearchGrounding } from '@/constants/models'
import {
  NODE_STUDIO_DOCK,
  NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS,
  NODE_V4_CARD,
} from '@/constants/node-studio'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_IMAGE_SUBTYPE_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'
import { useNodeMediaGenerationV4 } from '@/hooks/node/use-node-media-generation-v4'
import { useNodeUploadV4 } from '@/hooks/node/use-node-upload-v4'
import { useNodeSearchGrounding } from '@/hooks/node/use-node-search-grounding'
import { resolveGeneratingStageKey } from '@/lib/generation-progress'
import { getGenerationErrorMessage } from '@/lib/api-error-message'
import { cancelGenerationsAPI } from '@/lib/api-client'
import {
  hasPendingMediaJob,
  pendingJobPatch,
  settledJobPatch,
  type NodeGenerationShot,
} from '@/lib/node-media-patch'
import { renameStableNodeName } from '@/lib/node-display-name'
import { pickDefaultModelOption } from '@/lib/pick-default-model-option'
import { getTranslatedModelLabel } from '@/lib/model-options'
import {
  IMAGE_PROMPT_TEMPLATE_IDS,
  type ImagePromptTemplateId,
} from '@/constants/image-prompt-templates'
import {
  imageSubmitCount,
  isImagePromptTemplateId,
} from '@/lib/image-prompt-templates'
import type { ReadyCanvasImageEditCapabilityId } from '@/types/canvas-image-edit'
import type {
  NodeV4,
  NodeV4GenerationParams,
  NodeV4ImageData,
  NodeWorkflowModelSelection,
  NodeWorkflowNodeData,
} from '@/types/node-workflow'

import { useKeySettingsAction } from '../../workbench-v4/shell/ShellKeySettings'
import { CanvasImageEditWorkspace } from '../../CanvasImageEditWorkspace'
import {
  NodeChromeLayer,
  NodeCardShell,
  portSpecOf,
  NodeFrameProgress,
  useNodeGenerationFinish,
  useNodeProgressNarrow,
  NodeMediaMissing,
  NodePromptBar,
  NodeToolbar,
  QuickLook,
  VersionStrip,
  ConnectToShotPopover,
  flashNodeCard,
  useMediaProblem,
  type NodeToolbarGroup,
} from './chrome'
import {
  buildConnectToShotOps,
  buildConnectToShotTargets,
} from './connect-to-shot-targets'
import { ImageAdvancedChip } from './image/ImageAdvancedChip'
import { ImageFrameChip } from './image/ImageFrameChip'
import { ImageSendReadout } from './image/ImageSendReadout'
import { ImageNodeFrame } from './image/ImageNodeFrame'
import {
  ImageAddMenuItems,
  ImageEditMenuItems,
  ImageMoreMenuItems,
} from './image/ImageNodeMenus'
import { readOutputIndex, readOutputVersions } from '@/lib/node-output-versions'
import {
  nextPromptDraft,
  sameVideoRailOrder,
  type VideoRailEntry,
} from '@/lib/video-node-rail'

import { ImageSearchGroundingSide } from './image/ImageSearchGroundingSide'
import { SearchGroundingSlot } from '@/components/business/studio-shared/search-grounding/SearchGroundingSlot'
import { ImageRefRail } from './image/ImageRefRail'
import { useImageRefBinding } from './image/use-image-ref-binding'
import { useStoryboardLanding } from './image/use-storyboard-landing'
import {
  collapsedImageHeight,
  collapsedImageWidth,
  formatSizeBytes,
  imageCostEstimate,
  imageNodeAcceptsReferences,
  imageVersions,
  toNodeModelSelection,
  toStudioModelOption,
} from './image/image-node-model'
import { CharacterMentionRail } from './character/CharacterMentionRail'
import { useImagePromptMentions } from './image/use-image-prompt-mentions'
import { cn } from '@/lib/utils'
import { ModelPickerPopover } from '../../../studio-shared/pickers/ModelPickerPopover'
import { QuickSetupDialog } from '../../../studio-shared/setup/QuickSetupDialog'
import { splitVersionOp, useNodeV4Canvas } from './NodeV4Context'
import { NodeV4ContextMenu } from './NodeV4ContextMenu'
import { triggerNodeV4Download } from './NodeV4SelectionToolbar'

export { collapsedImageWidth, formatSizeBytes }

/** 「生镜头」那一批里指代新建镜头的别名（只在这一批之内有效）。 */
const SHOT_BATCH_REF = 'shot'

/** 一次发送（张数 N = 并行 N 枪）。取消只认这一份，⛔ 认「卡上现在的 job」。 */
interface ImageSubmission {
  cancelled: boolean
  /** 这一次建好、还没落地的 job（`onJobCreated` 进、`onEach` 出），连同是哪一枪。 */
  readonly inFlight: Map<string, NodeGenerationShot>
  /** 这一次要出几张（九宫格模板钉 1）。 */
  readonly expected: number
  /** 已回来几枪（成功失败都算）。 */
  settled: number
  /** 成功落了几版：都是追加在 `firstVersion` 之后的。 */
  landed: number
  /** 发送那一刻卡上已有几版 = 这一批第一张的版本号。 */
  readonly firstVersion: number
}

/** 图上这张卡现在有几版（读 `readGraph()` 的结果，不读渲染闭包）。 */
function liveVersionCount(nodes: readonly NodeV4[], id: string): number {
  const node = nodes.find((item) => item.id === id)
  return node?.data.kind === NODE_MEDIA_KIND_IDS.image
    ? imageVersions(node.data).length
    : 0
}

/** 一批多张出完后卡面上那张 2×2 挑图（spec §3 A1）：这一批落在哪几版。 */
interface ImageBatchPick {
  readonly from: number
  readonly count: number
}

/** 空卡高：16:9（画板 280×200 那张的同一档比例）。 */
function emptyCardHeight(width: number): number {
  return Math.round((width * 9) / 16)
}

export function ImageNodeV4({ id, data, selected }: NodeProps) {
  const t = useTranslations('StudioNode.v4')
  const tImage = useTranslations('StudioNode.v4.image')
  const tStage = useTranslations('StudioV3')
  const tPicker = useTranslations('ModelPicker')
  const tErrors = useTranslations('Errors')
  // 这张卡自己的「未选渠道」闸（gateId = 节点 id，与卡上那颗 chip 同一对）。
  const channelGate = useModelChannelGate(NODE_MEDIA_KIND_IDS.image, id)
  const canvas = useNodeV4Canvas()
  const openKeySettings = useKeySettingsAction()
  const generation = useNodeMediaGenerationV4()
  const upload = useNodeUploadV4()
  const imageData = data as unknown as NodeV4ImageData
  const modelOptions = useMemo(
    () => canvas.modelOptionsByKind[NODE_MEDIA_KIND_IDS.image] ?? [],
    [canvas.modelOptionsByKind],
  )
  const defaultModel = useMemo<NodeWorkflowModelSelection | undefined>(() => {
    const picked = pickDefaultModelOption(modelOptions.map(toStudioModelOption))
    const source = picked
      ? modelOptions.find((option) => option.optionId === picked.optionId)
      : undefined
    return source ? toNodeModelSelection(source) : undefined
  }, [modelOptions])
  const effectiveModel = imageData.model ?? defaultModel
  // 缺 key 闸（Hard Rule 8）：名单回来、而这张卡的型号确定跑不起来 —— 发送键左边写
  // 「先配 key」，点发送就地开 `QuickSetupDialog`，验证过才发。
  const apiKeys = useApiKeysContextOptional()
  const selectedOption = effectiveModel
    ? modelOptions.find((option) => option.optionId === effectiveModel.optionId)
    : undefined
  const missingKey = selectedOption
    ? isMissingKeyModelOption(
        toStudioModelOption(selectedOption),
        apiKeys?.hasLoaded ?? false,
      )
    : false
  // 卡上那家没 key、同型号另一家配好了：发送键旁写「fal 没 key，改走 火山」，
  // 点一下才切（owner 2026-10-15：⛔ 偷偷换厂商）。
  const studioModelOptions = useMemo(
    () => modelOptions.map(toStudioModelOption),
    [modelOptions],
  )
  const channelFallback =
    missingKey && selectedOption
      ? findRunnableSiblingChannel(studioModelOptions, selectedOption.optionId)
      : null
  const switchToFallback = () => {
    const target = channelFallback
      ? modelOptions.find(
          (option) => option.optionId === channelFallback.fallback.channelId,
        )
      : undefined
    if (target) canvas.onSetModel(id, toNodeModelSelection(target))
  }
  // 多厂商一家都没配：配 key 弹窗顶上让他挑配哪家，默认单价最低的那家。
  const keySetupChoices = useMemo(() => {
    if (!missingKey || !selectedOption || channelFallback) return null
    const siblings = findModelChannelSiblings(
      studioModelOptions,
      selectedOption.optionId,
    )
    return siblings && siblings.channels.length > 1 ? siblings.channels : null
  }, [missingKey, selectedOption, channelFallback, studioModelOptions])
  const [keySetupOpen, setKeySetupOpen] = useState(false)
  /** 弹窗里挑的那一家；null = 卡上那一家。 */
  const [keySetupChannelId, setKeySetupChannelId] = useState<string | null>(
    null,
  )
  const keySetupOption = (() => {
    if (!selectedOption) return undefined
    const channelId =
      keySetupChannelId ??
      (keySetupChoices
        ? pickCheapestChannel(keySetupChoices)?.channelId
        : undefined)
    return (
      modelOptions.find((option) => option.optionId === channelId) ??
      selectedOption
    )
  })()
  const openKeySetup = () => {
    setKeySetupChannelId(null)
    setKeySetupOpen(true)
  }
  const tModels = useTranslations('Models')
  // 「先搜再画」跟卡存（`params.searchGrounding`），只对支持的型号出现。
  const searchGroundingAvailable = Boolean(
    effectiveModel?.modelId && supportsSearchGrounding(effectiveModel.modelId),
  )
  const searchGroundingOn =
    searchGroundingAvailable && imageData.params?.searchGrounding === true
  const searchGroundingState = useNodeSearchGrounding(id)
  const setSearchGrounding = (on: boolean) =>
    canvas.onSetParams(id, { ...imageData.params, searchGrounding: on })
  const pendingUpload = canvas.pendingUploads?.find((item) => item.id === id)

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  /** ⋯「重命名这张图」触发卡外那行名字进入编辑（`NodeCardShell.renameRequest`）。 */
  const [renameRequest, setRenameRequest] = useState(0)
  const [quickLook, setQuickLook] = useState(false)
  // 源文件没了（素材库删了）/ 暂时读不到：换成灰底一句话，⛔ 不露裂图。
  const media = useMediaProblem(imageData.url)
  const [assetPicker, setAssetPicker] = useState(false)
  const [emptyDragging, setEmptyDragging] = useState(false)
  const [editTask, setEditTask] =
    useState<ReadyCanvasImageEditCapabilityId | null>(null)
  const [draft, setDraft] = useState(imageData.prompt ?? '')
  const [syncedPrompt, setSyncedPrompt] = useState(imageData.prompt ?? '')
  /** 上一次同步时的参考轨（`null` = 还没同步过）—— 轨变了草稿里的号跟着走。 */
  const [syncedRail, setSyncedRail] = useState<
    readonly VideoRailEntry[] | null
  >(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const submissionRef = useRef<ImageSubmission | null>(null)
  // 这一批还没回来的张数：版本条末尾的转圈占位。
  const [pendingShots, setPendingShots] = useState(0)
  const [batchPick, setBatchPick] = useState<ImageBatchPick | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const promptInputRef = useRef<HTMLTextAreaElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const acceptsRefs = imageNodeAcceptsReferences(imageData.subtype)
  const refs = useImageRefBinding({
    id,
    displayName: imageData.name,
    model: effectiveModel,
    disabled: Boolean(imageData.mediaJobId),
  })

  // 助手 `set_prompt` 落下来时草稿跟上 —— 渲染期同步，⛔ 不放 effect 里。
  // 参考轨变了（owner 09-28）：与视频卡同一条（`use-video-composer`）—— 已保存正文
  // 的变化正好就是图引擎那次对号时，只给草稿对号，⛔ 不整段盖掉没发出去的字。
  const currentPrompt = imageData.prompt ?? ''
  const railItems = refs.railProps.items
  const [railMountState, setRailMountState] = useState({
    count: railItems.length,
    animate: false,
  })
  if (railMountState.count !== railItems.length) {
    setRailMountState({
      count: railItems.length,
      animate: railMountState.count === 0 && railItems.length > 0,
    })
  }
  useEffect(() => {
    if (!railMountState.animate) return
    const timer = window.setTimeout(() => {
      setRailMountState((state) => ({ ...state, animate: false }))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [railMountState.animate])
  if (
    syncedPrompt !== currentPrompt ||
    syncedRail === null ||
    !sameVideoRailOrder(syncedRail, railItems)
  ) {
    const nextDraft = nextPromptDraft({
      draft,
      syncedPrompt,
      currentPrompt,
      syncedRail,
      rail: railItems,
    })
    if (nextDraft !== draft) setDraft(nextDraft)
    setSyncedPrompt(currentPrompt)
    setSyncedRail(railItems)
  }

  const generating = hasPendingMediaJob(imageData) || startedAt !== null
  const failureMessage =
    !generating &&
    (imageData.generationFailure || imageData.status === 'failed')
      ? getGenerationErrorMessage(
          tErrors,
          imageData.generationFailure ?? {},
          tErrors('generation.unknown'),
        )
      : undefined

  // 计时只在生成中跑：边即进度的百分比是**估算曲线**读它算的
  // （`generation-progress`），⛔ 不常驻一个每 500ms 醒一次的定时器。
  useEffect(() => {
    // ⚠ 不生成时**不清零**：清零要在 effect 里 setState，那是一次级联渲染，而这个
    // 值在不生成时根本没有读者。下一轮生成挂上来时第一次 `tick()` 就把它盖掉了。
    if (!generating) return
    const begin = startedAt ?? Date.now()
    const tick = () => setElapsed((Date.now() - begin) / 1000)
    tick()
    const timer = window.setInterval(tick, PROGRESS_TICK_MS)
    return () => window.clearInterval(timer)
  }, [generating, startedAt])

  /**
   * 上传落这张卡。⚠ 走「最新值 ref」而不是把依赖列进 `useCallback`：
   * `useNodeUploadV4()` 每次渲染都返回一个新对象，列进去等于每渲染一次就把粘贴
   * 监听拆装一遍（`WorkbenchDndV4` 里的同一条模式）。
   */
  const latest = useRef({
    upload,
    canvas,
    id,
    name: imageData.name,
    hasUrl: Boolean(imageData.url),
    hasNaturalSize: Boolean(imageData.mediaWidth && imageData.mediaHeight),
    acceptsRefs,
    attachRef: refs.attachFile,
  })
  useEffect(() => {
    latest.current = {
      upload,
      canvas,
      id,
      name: imageData.name,
      hasUrl: Boolean(imageData.url),
      hasNaturalSize: Boolean(imageData.mediaWidth && imageData.mediaHeight),
      acceptsRefs,
      attachRef: refs.attachFile,
    }
  })
  const sizeBackfillLock = useRef(false)
  useEffect(() => {
    sizeBackfillLock.current = false
  }, [imageData.url])
  const rememberImageSize = useCallback((image: HTMLImageElement) => {
    const bound = latest.current
    if (bound.hasNaturalSize || sizeBackfillLock.current) return
    const width = image.naturalWidth
    const height = image.naturalHeight
    if (width <= 0 || height <= 0) return
    sizeBackfillLock.current = true
    bound.canvas.onSetMedia(bound.id, {
      mediaWidth: width,
      mediaHeight: height,
    })
  }, [])
  const runUpload = useCallback((file: File) => {
    const bound = latest.current
    void bound.upload.upload('image', file, bound.name).then((patch) => {
      if (!patch) return
      bound.canvas.onSetMedia(bound.id, {
        ...patch,
        imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing,
      })
    })
  }, [])

  /**
   * ⌘V 落进**这张卡**（spec §1.3「粘贴不做按钮」）。
   *
   * ⚠ 捕获阶段挂在 `window` 上并 `stopPropagation`：工作台那条粘贴路径
   * （`useWorkbenchDndV4`）是「在鼠标处**新建**一张卡」，选中态下两条都跑会同时
   * 落进这张卡又多出一张。选中的卡优先，⛔ 不让两条路都生效。
   */
  useEffect(() => {
    if (
      !selected ||
      canvas.selectedNodeIds.length >= 2 ||
      canvas.expandedNodeId === id
    )
      return
    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((item) =>
        item.type.startsWith('image/'),
      )
      if (!file) return
      event.preventDefault()
      event.stopPropagation()
      if (latest.current.acceptsRefs && latest.current.hasUrl) {
        latest.current.attachRef(file)
      } else {
        runUpload(file)
      }
    }
    window.addEventListener('paste', onPaste, true)
    return () => window.removeEventListener('paste', onPaste, true)
  }, [
    selected,
    canvas.selectedNodeIds.length,
    canvas.expandedNodeId,
    id,
    runUpload,
  ])

  useEffect(() => {
    if (
      !selected ||
      !imageData.url ||
      media.problem ||
      canvas.expandedNodeId === id
    )
      return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat) return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.closest('input, textarea, [contenteditable="true"]') ||
          target.closest('[role="dialog"]'))
      )
        return
      event.preventDefault()
      setQuickLook(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selected, imageData.url, media.problem, canvas.expandedNodeId, id])

  const node = canvas.nodes.find((item) => item.id === id) as NodeV4 | undefined
  // 卡在屏幕上窄没窄（画布缩放）—— 在提前返回之前取：hook 不能跟着 `node` 有无走。
  const progressNarrow = useNodeProgressNarrow(
    imageData.url
      ? collapsedImageWidth(imageData)
      : NODE_V4_CARD.collapsedWidth,
  )
  const genFinish = useNodeGenerationFinish({
    generating,
    failed: Boolean(failureMessage),
    mediaUrl: imageData.url,
  })

  // @ 候选与胶囊（参考轨 · 角色库里的她 · 画布上的图）：与手机抽屉同一份。
  const promptMentions = useImagePromptMentions({
    id,
    draft,
    setDraft,
    imageData,
    refs,
    acceptsRefs,
  })

  // 九宫格切开后，这一格从原图上它那一格的位置飞过来（§3）。
  useStoryboardLanding(cardRef, {
    nodeId: id,
    cell: imageData.storyboardCell,
    landing: canvas.storyboard?.landing,
    nodes: canvas.nodes,
  })

  if (!node) return null

  const versions = imageVersions(imageData)
  // 2×2 挑图只活在这次选中里：点外取消选中 = 保持最新一张（A1）。
  if (batchPick && !selected) setBatchPick(null)
  const pickUrls = batchPick
    ? versions.slice(
        batchPick.from,
        batchPick.from + Math.min(batchPick.count, 4),
      )
    : []
  const showBatchPick = pickUrls.length > 1 && !generating
  // ⚠ 当前版**从数据读**（`outputs.cur`），⛔ 不在组件里存一份 useState：
  // 助手发 `set_output_version` 时组件那份不会跟，卡上显示的图与小点会对不上。
  const versionIndex = readOutputIndex(imageData)
  const selectVersion = (index: number) =>
    void canvas.onApplyOp({
      op: NODE_ASSISTANT_OP_V4_IDS.setOutputVersion,
      target: id,
      index,
    })
  const width = imageData.url
    ? collapsedImageWidth(imageData)
    : NODE_V4_CARD.collapsedWidth
  const expanded = canvas.expandedNodeId === id
  const showChrome =
    Boolean(selected) && canvas.selectedNodeIds.length < 2 && !expanded
  // 九宫格分镜（§3）：宿主接了切开能力才出开关、⋯ 里的「切宫格」和卡上那一句。
  const storyboard = canvas.storyboard
  const storyboardIssue = storyboard?.issues[id]
  const storyboardBusy = storyboard?.splitting.has(id) ?? false
  const sourceLabel = readOutputVersions(imageData)[versionIndex]?.source?.label
  const renameNode = (next: string): boolean => {
    const taken = new Set(
      canvas.nodes
        .filter((item) => item.id !== id)
        .map((item) => item.data.name),
    )
    const result = renameStableNodeName(imageData.name, next, taken)
    if (!result.ok) return false
    void canvas.onApplyOp({
      op: NODE_ASSISTANT_OP_V4_IDS.setField,
      target: id,
      field: 'name',
      value: result.name,
    })
    return true
  }

  /**
   * 取消这一次还在飞的几单（尽力而为，同视频卡）：服务端停掉 job、卡上各自的
   * 「在飞」标记摘掉。已经出完的那几张照常落卡 —— 钱已经花了。
   * 只认 `inFlight` 里**还没发过取消**的：job id 晚回来的那几单由 `onJobCreated` 补刀。
   */
  const cancelSubmission = (
    submission: ImageSubmission,
    jobs: readonly [string, NodeGenerationShot][],
  ) => {
    if (jobs.length === 0) return
    for (const [jobId, shot] of jobs) {
      submission.inFlight.delete(jobId)
      canvas.onSetMedia(id, settledJobPatch(shot))
    }
    void cancelGenerationsAPI(jobs.map(([jobId]) => jobId))
  }

  /** 这一枪发几张（模板钉死）—— 发送读数与 `submitPrompt` 同一个数。 */
  const submitCount = imageSubmitCount(imageData.params ?? {})
  const promptTemplate = imageData.params?.promptTemplate
  /** `/` 模板挂上 / 摘掉（§3）：存在卡的参数上，⛔ 模板文本进正文。 */
  const setPromptTemplate = (next: ImagePromptTemplateId | undefined) => {
    const rest = Object.fromEntries(
      Object.entries(imageData.params ?? {}).filter(
        ([key]) => key !== 'promptTemplate',
      ),
    ) as NodeV4GenerationParams
    canvas.onSetParams(id, next ? { ...rest, promptTemplate: next } : rest)
  }
  const templateOptions = IMAGE_PROMPT_TEMPLATE_IDS.map((templateId) => ({
    id: templateId,
    name: tImage(`template.${templateId}.name`),
    hint: tImage(`template.${templateId}.hint`),
    groupLabel: tImage('template.group'),
  }))
  const templateChip = promptTemplate ? (
    <span
      data-prompt-template-chip={promptTemplate}
      className="inline-flex h-5 items-center gap-0.5 rounded-md bg-surface-fill-track pr-0.5 pl-1.5 text-xs font-medium text-foreground"
    >
      {tImage(`template.${promptTemplate}.name`)}
      <button
        type="button"
        aria-label={tImage('template.remove')}
        title={tImage('template.remove')}
        disabled={generating}
        onClick={() => {
          setPromptTemplate(undefined)
          promptInputRef.current?.focus()
        }}
        className="nodrag nopan flex size-4 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none"
      >
        <X aria-hidden className="size-3" />
      </button>
    </span>
  ) : null

  /**
   * `keyVerified`：刚在 `QuickSetupDialog` 里配好 key —— 渲染闭包里的 `missingKey`
   * 还没刷新。`model`：弹窗里换了一家，这一枪走那一家（闭包里的还是旧的）。
   */
  const submitPrompt = (
    options: {
      readonly keyVerified?: boolean
      readonly model?: NodeWorkflowModelSelection
    } = {},
  ) => {
    if (draft.trim().length === 0 || generating) return
    if (missingKey && !options.keyVerified) {
      openKeySetup()
      return
    }
    const sendModel = options.model ?? effectiveModel
    if (draft !== currentPrompt) canvas.onSetPrompt(id, draft)
    if (sendModel && (options.model || !imageData.model))
      canvas.onSetModel(id, sendModel)
    // 读 op 之后的图：上面那句 `set_prompt` 刚把正文里新写的 @ 落成连线，渲染闭包里
    // 的 `canvas.edges` 还没有它们 —— 用旧的会让这一枪漏掉刚 @ 的参考图。
    const graph = canvas.readGraph()
    const nodes = graph.nodes.map((item) =>
      item.id === id && sendModel
        ? ({
            ...item,
            data: { ...item.data, model: sendModel },
          } as NodeV4)
        : item,
    )
    const expected = submitCount
    const submission: ImageSubmission = {
      cancelled: false,
      inFlight: new Map(),
      expected,
      settled: 0,
      landed: 0,
      // 从刚读的图里数，⛔ 用渲染闭包里的 `versions`（与上面 edges 同一个理由）。
      firstVersion: liveVersionCount(graph.nodes, id),
    }
    submissionRef.current = submission
    setBatchPick(null)
    setPendingShots(expected)
    canvas.onSetMedia(id, { generationFailure: undefined })
    setStartedAt(Date.now())
    void generation
      .generateNode(
        id,
        { nodes, edges: graph.edges },
        {
          prompt: draft,
          // 落 job id = 持久化「有一单在飞」：刷新之后由回填 hook 取回结果。
          // 一批里的几单各记一格（`pendingJobPatch`），⛔ 互相盖掉。
          onJobCreated: (jobId, shot) => {
            if (submissionRef.current !== submission) return
            submission.inFlight.set(jobId, shot)
            canvas.onSetMedia(id, pendingJobPatch(shot, jobId))
            // 取消落在「请求已发、job id 还没回来」之间：拿到 id 立刻补一刀。
            if (submission.cancelled)
              cancelSubmission(submission, [[jobId, shot]])
          },
          // ⚠ 回填写在 `onEach` 里而不是 `.then`：张数 > 1 时是并行的 N 枪，
          // `.then` 只拿得到一枪 —— 其余几张会一张都不落。每一枪各追加一个
          // 产出版本（S3b §1.8），先回来的先进版本条。
          onEach: (result, shot) => {
            if (submissionRef.current !== submission) return
            // 取消时已经摘过标记的那一单，⛔ 再摘一次（会把别的卡状态改回去）。
            const stillTracked =
              shot.jobId === undefined || submission.inFlight.delete(shot.jobId)
            const settle = stillTracked ? settledJobPatch(shot) : {}
            submission.settled += 1
            setPendingShots(
              Math.max(submission.expected - submission.settled, 0),
            )
            if (result.success) submission.landed += 1
            if (!result.success) {
              if (!result.pending) {
                canvas.onSetMedia(id, {
                  ...settle,
                  generationFailure:
                    result.cancelled || submission.cancelled
                      ? undefined
                      : {
                          error: result.error,
                          ...(result.errorCode
                            ? { errorCode: result.errorCode }
                            : {}),
                          ...(result.i18nKey
                            ? { i18nKey: result.i18nKey }
                            : {}),
                        },
                })
              }
              return
            }
            canvas.onSetMedia(id, {
              url: result.mediaUrl,
              generationId: result.generation.id,
              ...settle,
              imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.generated,
            })
          },
        },
      )
      .then((result) => {
        if (
          submissionRef.current === submission &&
          !submission.cancelled &&
          !result.success &&
          result.error === 'noPlan'
        ) {
          canvas.onSetMedia(id, {
            mediaJobId: undefined,
            generationFailure: { error: t('generateDesk.noModel') },
          })
        }
      })
      .finally(() => {
        if (submissionRef.current !== submission) return
        setStartedAt(null)
        setPendingShots(0)
        // 一次出了不止一张：卡面临时铺成 2×2 让你挑一张作当前（A1）。取消了就不挑。
        if (!submission.cancelled && submission.landed > 1) {
          setBatchPick({
            from: submission.firstVersion,
            count: submission.landed,
          })
        }
      })
  }

  /** 「连到镜头」列表 = 画布上的视频卡，按镜头带顺序（spec §1.13）。 */
  const shotTargets = buildConnectToShotTargets({
    nodes: canvas.nodes,
    edges: canvas.edges,
    formatDuration: (seconds) => `${Math.round(seconds)}s`,
  })

  const toolbarGroups: readonly NodeToolbarGroup[] = [
    [
      {
        // 原「生镜头」（图标不变）——现在先开弹层选目标镜头与 首帧 / 尾帧
        // （spec §1.13）。顶行「新建镜头」保留原来那一批两条。
        id: 'shot',
        // 主动作带字（§1 第 4 条 · 方向 B）：写「生镜头」—— 弹层里既能新建也能连到已有的。
        label: tImage('toolbar.shot'),
        icon: Clapperboard,
        primary: true,
        onSelect: () => {},
        panel: (
          <ConnectToShotPopover
            sourceNodeId={id}
            sourceKind={NODE_MEDIA_KIND_IDS.image}
            targets={shotTargets}
            // ⚠ **一批两条**：建镜头 + 把这张图连成它的首帧。批内别名（`ref`）让第二
            // 条认得出刚建的那张，⛔ 循环发两条 `onApplyOp` 做不到（第二条时那个
            // 节点还不在闭包里的 state 上），且撤销会碎成两步。
            onNew={() =>
              void canvas.onApplyBatch([
                {
                  op: NODE_ASSISTANT_OP_V4_IDS.addNode,
                  kind: NODE_MEDIA_KIND_IDS.video,
                  subtype: NODE_V4_VIDEO_SUBTYPE_IDS.shot,
                  ref: SHOT_BATCH_REF,
                  ...(imageData.shotNo === undefined
                    ? {}
                    : { shotNo: imageData.shotNo }),
                },
                {
                  op: NODE_ASSISTANT_OP_V4_IDS.connect,
                  source: id,
                  target: SHOT_BATCH_REF,
                  slot: NODE_SLOT_IDS.firstFrame,
                },
              ])
            }
            onConnect={(targetId, slot) => {
              void Promise.resolve(
                canvas.onApplyBatch(
                  buildConnectToShotOps({
                    sourceId: id,
                    targetId,
                    slot,
                    edges: canvas.edges,
                  }),
                ),
              ).then(() => {
                canvas.onFocusNode(targetId)
                flashNodeCard(targetId, NODE_STUDIO_DOCK.focusDurationMs)
              })
            }}
          />
        ),
      },
      {
        id: 'edit',
        label: tImage('toolbar.edit'),
        icon: Pencil,
        disabled: !imageData.url,
        onSelect: () => {},
        menu: <ImageEditMenuItems onPick={setEditTask} />,
      },
    ],
    [
      {
        id: 'download',
        label: t('toolbar.download'),
        icon: Download,
        disabled: !imageData.url,
        onSelect: () => imageData.url && triggerNodeV4Download(imageData.url),
      },
      {
        id: 'more',
        label: tImage('toolbar.more'),
        icon: MoreHorizontal,
        onSelect: () => {},
        menu: (
          <ImageMoreMenuItems
            onQuickLook={
              imageData.url && !media.problem
                ? () => setQuickLook(true)
                : undefined
            }
            onRename={() => setRenameRequest((count) => count + 1)}
            onSplitGrid={
              storyboard && imageData.url
                ? (size) => storyboard.split(id, size)
                : undefined
            }
            splitGridBusy={storyboardBusy}
            sourceLabel={sourceLabel}
            onSplitVersion={
              // 只有一版时拆无可拆 —— ⛔ 不摆一个按了什么都不变的项。
              versions.length > 1
                ? () =>
                    void canvas.onApplyOp(
                      splitVersionOp(canvas, id, imageData, versionIndex),
                    )
                : undefined
            }
            onSetCharacter={
              imageData.subtype === NODE_V4_IMAGE_SUBTYPE_IDS.character
                ? undefined
                : () =>
                    void canvas.onApplyOp({
                      op: NODE_ASSISTANT_OP_V4_IDS.setSubtype,
                      target: id,
                      subtype: NODE_V4_IMAGE_SUBTYPE_IDS.character,
                    })
            }
            onDuplicate={() =>
              void canvas.onApplyOp({
                op: NODE_ASSISTANT_OP_V4_IDS.addNode,
                kind: NODE_MEDIA_KIND_IDS.image,
                subtype: imageData.subtype,
                ...(imageData.shotNo === undefined
                  ? {}
                  : { shotNo: imageData.shotNo }),
              })
            }
            onDelete={() =>
              void canvas.onApplyOp({
                op: NODE_ASSISTANT_OP_V4_IDS.delete,
                target: id,
              })
            }
          />
        ),
      },
    ],
  ]

  // 失败就地说（加载态 A · owner「画布与工作台都就地说」）：线停住变灰，中间一句
  // 原因 +「重试」—— ⛔ 红框。草稿是空的就不给重试键（发不出去的键 = 死按钮）。
  // ⚠ 条件用这个布尔；带重试回调的那个对象只在传给进度层时现拼（回调读 ref，
  //   ⛔ 拿它当渲染期的判断条件）。
  const failed = Boolean(
    failureMessage && !pendingUpload && !upload.isUploading,
  )
  const empty =
    !imageData.url &&
    !failed &&
    !pendingUpload &&
    !upload.isUploading &&
    !generating
  const hasAttachedRefs =
    refs.railProps.items.length > 0 ||
    Boolean(refs.railProps.pending?.length) ||
    promptMentions.characterMentions.length > 0
  const refAddMenu = (
    <ImageAddMenuItems
      onUpload={
        acceptsRefs ? refs.openFilePicker : () => fileRef.current?.click()
      }
      onLibrary={
        acceptsRefs ? refs.railProps.onLibrary : () => setAssetPicker(true)
      }
      {...(acceptsRefs
        ? {
            canvasCandidates: refs.candidates.map((candidate) => {
              const attached = refs.items.some(
                (item) => item.sourceNodeId === candidate.id,
              )
              const occupied =
                refs.items.length +
                (refs.railProps.pending?.filter((item) => !item.error).length ??
                  0)
              return {
                ...candidate,
                attached,
                ...(attached || occupied < refs.capacity
                  ? {}
                  : {
                      blockedReason: tImage('rail.full', {
                        limit: refs.capacity,
                      }),
                    }),
              }
            }),
            onPickCanvas: refs.railProps.onPickFromCanvas,
          }
        : {})}
      {...(searchGroundingAvailable
        ? {
            searchGrounding: {
              checked: searchGroundingOn,
              onChange: setSearchGrounding,
            },
          }
        : {})}
    />
  )
  const paramsChip = (
    <ImageFrameChip
      key="frame"
      aspectRatio={imageData.params?.aspectRatio}
      modelId={effectiveModel?.modelId}
      model={effectiveModel}
      quality={imageData.params?.quality}
      resolution={imageData.params?.resolution}
      count={imageData.params?.count}
      disabled={generating}
      onAspectRatioChange={(aspectRatio) =>
        canvas.onSetParams(id, { ...imageData.params, aspectRatio })
      }
      onResolutionChange={(resolution) =>
        canvas.onSetParams(id, { ...imageData.params, resolution })
      }
      onCountChange={(count) =>
        canvas.onSetParams(id, { ...imageData.params, count })
      }
      {...(promptTemplate ? { promptTemplate } : {})}
    />
  )
  const advancedChip = (
    <ImageAdvancedChip
      key="advanced"
      model={effectiveModel}
      params={imageData.params}
      onParamsChange={(next) => canvas.onSetParams(id, next)}
      hasReferenceImage={refs.railProps.items.length > 0}
      disabled={generating}
    />
  )
  const modelChip = (
    <ModelPickerPopover
      key="model"
      options={modelOptions.map(toStudioModelOption)}
      value={effectiveModel?.optionId ?? null}
      memoryScope={NODE_MEDIA_KIND_IDS.image}
      gateId={id}
      canvasNodeId={id}
      canvasSafeLeftPx={canvas.safeLeftPx}
      disabled={generating}
      {...(openKeySettings ? { onManageChannels: openKeySettings } : {})}
      onChange={(option) => {
        const picked = modelOptions.find(
          (item) => item.optionId === option.optionId,
        )
        if (!picked) return
        canvas.onSetModel(id, {
          optionId: picked.optionId,
          modelId: picked.modelId,
          adapterType: picked.adapterType,
          providerConfig: picked.providerConfig,
          ...(picked.apiKeyId ? { apiKeyId: picked.apiKeyId } : {}),
        })
      }}
    />
  )

  return (
    <div
      ref={cardRef}
      data-node-kind={NODE_MEDIA_KIND_IDS.image}
      data-node-subtype={imageData.subtype}
      data-generating={generating ? 'true' : 'false'}
      className="relative"
      onContextMenu={(event) => {
        event.preventDefault()
        setMenu({ x: event.nativeEvent.offsetX, y: event.nativeEvent.offsetY })
      }}
      onDragOver={(event) => {
        event.preventDefault()
        event.stopPropagation()
        event.dataTransfer.dropEffect = 'copy'
        if (empty && Array.from(event.dataTransfer.types).includes('Files')) {
          setEmptyDragging(true)
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setEmptyDragging(false)
        }
      }}
      onDrop={(event) => {
        setEmptyDragging(false)
        const file = Array.from(event.dataTransfer?.files ?? []).find((item) =>
          item.type.startsWith('image/'),
        )
        if (!file) return
        event.preventDefault()
        event.stopPropagation()
        if (acceptsRefs && imageData.url) refs.attachFile(file)
        else runUpload(file)
      }}
      onDoubleClick={() => {
        if (imageData.url && !media.problem) canvas.onToggleExpanded(id)
      }}
    >
      <NodeChromeLayer show={showChrome && !empty} position={Position.Top}>
        <NodeToolbar
          groups={toolbarGroups}
          ariaLabel={tImage('toolbar.label')}
        />
      </NodeChromeLayer>

      <NodeCardShell
        beside={
          <ImageSearchGroundingSide
            nodeId={id}
            selected={Boolean(selected)}
            onSelect={() => canvas.onSelectNode?.(id)}
          />
        }
        name={imageData.name}
        renameAriaLabel={t('renameNode')}
        onRename={renameNode}
        renameRequest={renameRequest}
        selected={Boolean(selected)}
        edgeBusy={generating || failed || genFinish.holding}
        edgeOverlay={
          generating || genFinish.completing || failed ? (
            <NodeFrameProgress
              elapsedSeconds={elapsed}
              stageLabel={tStage(
                `generatingOverlayStages.${resolveGeneratingStageKey(
                  elapsed,
                  undefined,
                  searchGroundingState?.phase === 'searching',
                )}` as const,
              )}
              isCompleting={genFinish.completing}
              onEdgeRelease={genFinish.release}
              onCompleteAnimationDone={genFinish.finish}
              failure={
                failed
                  ? {
                      message: t('generateDesk.failed', {
                        reason: failureMessage ?? '',
                      }),
                      shortMessage: t('statuses.failed'),
                      retryLabel: tImage('rail.retry'),
                      ...(draft.trim()
                        ? { onRetry: () => submitPrompt() }
                        : {}),
                    }
                  : null
              }
              hideStageLabel={progressNarrow}
            />
          ) : undefined
        }
        width={width}
        empty={empty}
        emptyHeight={emptyCardHeight(width)}
        emptyDragging={emptyDragging}
        emptyContent={
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 text-center text-muted-foreground">
            <span className="text-2sm">{t('chrome.emptyHint')}</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-node-empty-upload
                onClick={() => fileRef.current?.click()}
                className="nodrag nopan inline-flex h-7 items-center justify-center gap-1.25 rounded-full bg-surface-fill-hover px-2.75 text-xs text-foreground transition-colors duration-fast ease-standard hover:bg-surface-fill-track focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Upload aria-hidden className="size-3.5" />
                {t('chrome.emptyUpload')}
              </button>
              <button
                type="button"
                data-node-empty-library
                onClick={() => setAssetPicker(true)}
                className="nodrag nopan inline-flex h-7 items-center justify-center gap-1.25 rounded-full bg-surface-fill-hover px-2.75 text-xs text-foreground transition-colors duration-fast ease-standard hover:bg-surface-fill-track focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <ImageIcon aria-hidden className="size-3.5" />
                {t('chrome.emptyLibrary')}
              </button>
            </div>
          </div>
        }
        surfaceClassName="overflow-hidden"
        changed={canvas.changedNodeIds.includes(id)}
        portSpec={portSpecOf(node)}
      >
        {failed && !imageData.url ? (
          // 失败就地说（加载态 A）：原因 +「重试」在卡边那一层，这里只占住卡的高度。
          <div
            data-image-surface="failed"
            className="relative"
            style={{ height: emptyCardHeight(width) }}
          />
        ) : imageData.url ? (
          <div
            data-image-surface
            className="relative"
            style={{ height: collapsedImageHeight(imageData) }}
          >
            {media.problem ? (
              <NodeMediaMissing
                kind="image"
                problem={media.problem}
                onRetry={media.retry}
                // 卡上不止一版：只拿掉读不出来的这一版，⛔ 连好的那几版一起删掉整张卡。
                scope={versions.length > 1 ? 'version' : 'card'}
                onRemove={() =>
                  void canvas.onApplyOp(
                    versions.length > 1
                      ? {
                          op: NODE_ASSISTANT_OP_V4_IDS.removeOutputVersion,
                          target: id,
                          index: versionIndex,
                        }
                      : { op: NODE_ASSISTANT_OP_V4_IDS.delete, target: id },
                  )
                }
                className="size-full"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={media.attempt}
                src={imageData.url}
                alt={imageData.name}
                draggable={false}
                className={cn(
                  'size-full rounded-node object-cover corner-squircle transition-[filter] duration-slow ease-standard motion-reduce:transition-none',
                  // 出图那一拍：线合拢之前新图压在模糊底下，线淡出时模糊收掉。
                  genFinish.holding && 'motion-safe:blur-sm',
                )}
                onLoad={(event) => rememberImageSize(event.currentTarget)}
                onError={media.onError}
                ref={(image) => {
                  if (image?.complete) rememberImageSize(image)
                }}
              />
            )}
            {showBatchPick && batchPick ? (
              <div
                role="radiogroup"
                aria-label={tImage('batchPick.label', {
                  count: pickUrls.length,
                })}
                data-image-batch-pick
                className="nodrag nopan absolute inset-0 grid grid-cols-2 gap-1 rounded-node bg-background p-1 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-base"
                onDoubleClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key !== 'Escape') return
                  event.stopPropagation()
                  setBatchPick(null)
                }}
              >
                {pickUrls.map((url, index) => {
                  const version = batchPick.from + index
                  return (
                    <button
                      key={version}
                      type="button"
                      role="radio"
                      aria-checked={version === versionIndex}
                      aria-label={tImage('batchPick.option', { n: index + 1 })}
                      data-image-batch-pick-option={version}
                      autoFocus={index === 0}
                      onClick={() => {
                        selectVersion(version)
                        setBatchPick(null)
                      }}
                      className="relative overflow-hidden rounded-lg ring-1 ring-border transition-[box-shadow,transform] duration-fast ease-standard hover:ring-2 hover:ring-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-96"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt=""
                        draggable={false}
                        className="size-full object-cover"
                      />
                    </button>
                  )
                })}
              </div>
            ) : null}
            {storyboardBusy ? (
              <div
                role="status"
                data-storyboard-splitting
                className="absolute inset-0 flex items-center justify-center gap-2 bg-background/60 text-xs text-foreground motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-base"
              >
                <Spinner className="size-4" aria-hidden />
                {tImage('storyboard.splitting')}
              </div>
            ) : null}
            {storyboardIssue === 'notDetected' && storyboard ? (
              <div
                role="status"
                data-storyboard-issue
                className="absolute inset-x-2 bottom-2 flex flex-wrap items-center gap-1.5 rounded-xl border border-border/60 bg-popover px-2.5 py-1.5 text-xs text-foreground shadow-float motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-base"
                onDoubleClick={(event) => event.stopPropagation()}
              >
                <span className="mr-auto">
                  {tImage('storyboard.notDetected')}
                </span>
                <span className="text-muted-foreground">
                  {tImage('storyboard.manualSplit')}
                </span>
                <button
                  type="button"
                  onClick={() => storyboard.split(id, 3)}
                  className="h-7 rounded-lg border border-border px-2 text-xs transition-colors duration-fast hover:bg-surface-fill-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-96"
                >
                  3×3
                </button>
                <button
                  type="button"
                  onClick={() => storyboard.split(id, 2)}
                  className="h-7 rounded-lg border border-border px-2 text-xs transition-colors duration-fast hover:bg-surface-fill-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-96"
                >
                  2×2
                </button>
                <button
                  type="button"
                  aria-label={tImage('storyboard.dismiss')}
                  onClick={() => storyboard.dismissIssue(id)}
                  className="grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </div>
            ) : null}
            {/* 重画 / 出图那一拍 / 失败：图留着，盖一层白纱（加载态 A）；线、原因与
                「重试」在卡边那一层。出图时白纱跟着线一起淡掉。 */}
            {generating || genFinish.completing || failed ? (
              <div
                aria-hidden
                className={cn(
                  'absolute inset-0 bg-background/60 transition-opacity duration-base ease-linear motion-reduce:transition-none',
                  genFinish.completing && !genFinish.holding && 'opacity-0',
                )}
              />
            ) : null}
          </div>
        ) : pendingUpload || upload.isUploading ? (
          <div
            data-image-surface="uploading"
            role="status"
            className="flex flex-col items-center justify-center gap-2 rounded-node bg-surface-fill-track text-sm text-muted-foreground"
            style={{ height: emptyCardHeight(width) }}
          >
            <Spinner className="size-5" aria-hidden />
            <span>{tImage('uploading')}</span>
          </div>
        ) : generating ? (
          <div
            data-image-surface="pending"
            className="relative"
            style={{ height: emptyCardHeight(width) }}
          />
        ) : undefined}
      </NodeCardShell>

      <NodeChromeLayer show={showChrome} position={Position.Bottom}>
        <div className="flex flex-col items-center gap-2">
          <VersionStrip
            urls={versions}
            current={Math.min(versionIndex, versions.length - 1)}
            onSelect={selectVersion}
            pendingCount={pendingShots}
            ariaLabel={t('chrome.versions')}
            labelOf={(index) =>
              t('chrome.versionOf', {
                index: index + 1,
                total: versions.length,
              })
            }
          />
          <NodePromptBar
            safeLeftPx={canvas.safeLeftPx}
            value={draft}
            onValueChange={setDraft}
            onSubmit={() => submitPrompt()}
            generating={generating}
            // 多渠道型号没选渠道 = 这一枪发不出去（D2 Q1：没有「自动」渠道）。
            // 按钮上写「先选渠道」，点了打开这张卡的选择器并定位到那一行。
            {...(channelGate.blocked
              ? {
                  blockedLabel: tPicker('pickChannel'),
                  onBlockedClick: channelGate.requestPick,
                }
              : missingKey
                ? {
                    blockedLabel: tImage('send.needsKeyLabel'),
                    onBlockedClick: openKeySetup,
                  }
                : {})}
            readout={
              <ImageSendReadout
                unit={imageCostEstimate(effectiveModel?.modelId, {
                  quality: imageData.params?.quality,
                })}
                count={submitCount}
                missingKey={missingKey}
                onSetupKey={openKeySetup}
                {...(channelFallback
                  ? {
                      switchTo: {
                        from: channelFallback.current.label,
                        to: channelFallback.fallback.label,
                        unit: imageCostEstimate(
                          channelFallback.fallback.option.modelId,
                          { quality: imageData.params?.quality },
                        ),
                      },
                      onSwitch: switchToFallback,
                    }
                  : {})}
              />
            }
            onCancel={() => {
              const submission = submissionRef.current
              if (submission) {
                submission.cancelled = true
                cancelSubmission(submission, [...submission.inFlight])
              }
              setStartedAt(null)
              setPendingShots(0)
            }}
            placeholder={tImage('promptPlaceholder')}
            ariaLabel={tImage('promptLabel')}
            className="w-160"
            inputRef={promptInputRef}
            slotRow={
              searchGroundingAvailable ? (
                <SearchGroundingSlot
                  open={searchGroundingOn}
                  variant="pill"
                  description=""
                  searching={searchGroundingState?.phase === 'searching'}
                  disabled={generating}
                  onTurnOff={() => setSearchGrounding(false)}
                />
              ) : null
            }
            leadingRow={
              acceptsRefs && hasAttachedRefs ? (
                <div className="flex min-w-0 max-w-full items-start gap-2">
                  {refs.railProps.items.length > 0 ||
                  refs.railProps.pending?.length ? (
                    <ImageRefRail
                      {...refs.railProps}
                      animateOnMount={railMountState.animate}
                    />
                  ) : null}
                  {promptMentions.characterMentions.length > 0 ? (
                    <CharacterMentionRail
                      nodeId={id}
                      mentions={promptMentions.characterMentions}
                      capacity={refs.railProps.capacity}
                      usedImages={refs.railProps.items.length}
                      disabled={generating}
                    />
                  ) : null}
                </div>
              ) : null
            }
            mentionOptions={promptMentions.mentionOptions}
            slashOptions={templateOptions}
            onSlashSelect={(option) => {
              if (isImagePromptTemplateId(option.id))
                setPromptTemplate(option.id)
            }}
            prefix={templateChip}
            onPrefixRemove={() => setPromptTemplate(undefined)}
            renderValue={promptMentions.renderValue}
            {...(promptMentions.textareaProps
              ? { textareaProps: promptMentions.textareaProps }
              : {})}
            addMenu={refAddMenu}
            chips={[paramsChip, advancedChip, modelChip].filter(Boolean)}
          />
        </div>
      </NodeChromeLayer>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) runUpload(file)
          event.target.value = ''
        }}
      />
      {acceptsRefs ? refs.overlays : null}
      {keySetupOpen && keySetupOption ? (
        <QuickSetupDialog
          open
          onOpenChange={(next) => {
            if (!next) setKeySetupOpen(false)
          }}
          modelId={keySetupOption.modelId}
          modelLabel={getTranslatedModelLabel(tModels, keySetupOption.modelId)}
          adapterType={keySetupOption.adapterType}
          optionId={keySetupOption.optionId}
          selectStudioModel={false}
          {...(keySetupChoices
            ? {
                channelChoices: keySetupChoices.map((channel) => {
                  const unit = imageCostEstimate(channel.option.modelId)
                  return {
                    id: channel.channelId,
                    label: channel.label,
                    price: unit === null ? null : formatUnitPriceAmount(unit),
                  }
                }),
                channelId: keySetupOption.optionId,
                onChannelChange: setKeySetupChannelId,
              }
            : {})}
          // 验证过就把这一枪发出去 —— 用户点的是「发送」，配 key 只是半路的一步。
          // 弹窗里换了一家：这一枪走那一家，卡也落到那一家。
          onVerified={() => {
            setKeySetupOpen(false)
            submitPrompt({
              keyVerified: true,
              ...(keySetupOption.optionId !== selectedOption?.optionId
                ? { model: toNodeModelSelection(keySetupOption) }
                : {}),
            })
          }}
        />
      ) : null}

      <AnimatePresence>
        {expanded && imageData.url && !media.problem ? (
          <ImageNodeFrame
            key="frame"
            open
            origin={cardRef}
            onClose={() => canvas.onToggleExpanded(id)}
            nodeId={id}
            title={imageData.name}
            headline={[
              imageData.mediaWidth && imageData.mediaHeight
                ? t('readout.dimensions', {
                    width: imageData.mediaWidth,
                    height: imageData.mediaHeight,
                  })
                : null,
              `${versionIndex + 1} / ${versions.length}`,
            ]
              .filter(Boolean)
              .join(' · ')}
            url={imageData.url}
            mediaWidth={imageData.mediaWidth}
            mediaHeight={imageData.mediaHeight}
            onDownload={() => triggerNodeV4Download(imageData.url!)}
            versionCount={versions.length}
            versionIndex={versionIndex}
            onVersionChange={selectVersion}
            body={draft}
            onBodyChange={setDraft}
            onSave={(body) => {
              if (body !== currentPrompt) canvas.onSetPrompt(id, body)
            }}
            onRegenerate={() => submitPrompt()}
            regenerateDisabled={generating || draft.trim().length === 0}
            footerReadout={t('video.frame.readout', {
              chars: draft.trim().length,
              slots: refs.items.length,
            })}
            paramsChip={paramsChip}
            advancedChip={advancedChip}
            modelChip={modelChip}
            showReferences={acceptsRefs}
            refRail={
              acceptsRefs && hasAttachedRefs ? (
                <div className="flex min-w-0 max-w-full items-center gap-2">
                  {refs.railProps.items.length > 0 ||
                  refs.railProps.pending?.length ? (
                    <ImageRefRail {...refs.railProps} variant="frame" />
                  ) : null}
                  {promptMentions.characterMentions.length > 0 ? (
                    <CharacterMentionRail
                      nodeId={id}
                      mentions={promptMentions.characterMentions}
                      capacity={refs.railProps.capacity}
                      usedImages={refs.railProps.items.length}
                      disabled={generating}
                    />
                  ) : null}
                </div>
              ) : null
            }
            refAddMenu={refAddMenu}
            onAttachFile={refs.attachFile}
            tokens={promptMentions.frameTokens}
            candidates={promptMentions.frameCandidates}
            onMentionSelect={(candidate, handle) =>
              handle.insertToken(candidate.name)
            }
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {quickLook && imageData.url ? (
          <QuickLook
            key="quick-look"
            open
            origin={cardRef}
            onClose={() => setQuickLook(false)}
            ariaLabel={imageData.name}
            {...(versions.length > 1
              ? {
                  versionCount: versions.length,
                  versionIndex,
                  onVersionChange: selectVersion,
                }
              : {})}
            readout={
              imageData.mediaWidth && imageData.mediaHeight
                ? t('readout.dimensions', {
                    width: imageData.mediaWidth,
                    height: imageData.mediaHeight,
                  })
                : undefined
            }
            onDownload={() => triggerNodeV4Download(imageData.url!)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageData.url}
              alt={imageData.name}
              className="max-h-full max-w-full rounded-node object-contain corner-squircle shadow-node-card-expanded"
            />
          </QuickLook>
        ) : null}
      </AnimatePresence>

      {editTask && imageData.url ? (
        <CanvasImageEditWorkspace
          nodeId={id}
          data={{ mediaUrl: imageData.url } as unknown as NodeWorkflowNodeData}
          defaultTask={editTask}
          open
          onOpenChange={(open) => {
            if (!open) setEditTask(null)
          }}
        />
      ) : null}

      {assetPicker ? (
        <AssetSelectorDialog
          open
          onOpenChange={setAssetPicker}
          mediaType="image"
          title={tImage('add.library')}
          description={tImage('add.library')}
          onSelect={(record) => {
            canvas.onSetMedia(id, {
              url: record.url,
              ...(record.width ? { mediaWidth: record.width } : {}),
              ...(record.height ? { mediaHeight: record.height } : {}),
              imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing,
            })
            setAssetPicker(false)
          }}
        />
      ) : null}

      <AnimatePresence>
        {menu ? (
          <NodeV4ContextMenu
            key="menu"
            node={node}
            x={menu.x}
            y={menu.y}
            {...(imageData.url ? { mediaUrl: imageData.url } : {})}
            onClose={() => setMenu(null)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  )
}
