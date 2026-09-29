'use client'

/**
 * 视频节点（v3 spec §5，画板 `VideoStates` / `VideoSelected` / `VideoPopover` /
 * `VideoExpanded` / `VideoQuickLook`）。
 *
 * 五态：**空卡**（16:9 虚线框 + 一句提示，⌘V / 拖入都落进这张卡）· **有片收起**
 * （卡即封面、右下角只有时长；悬停静音自动播 + 底部细进度线 + 右上静音标）·
 * **选中**（工具条 `续拍 · 抽帧 · 下载 · ⋯` 浮在卡上，版本点 + 已挂小 chip + 提示词栏
 * 浮在卡下）· **生成中**（边即进度 + 栏变灰可取消）· **展开**（画中框 720：播放器 +
 * 镜头说明 + 生成行 + 写作助手栏）。**双击 = 展开**；快速看片走空格与 ⋯ 菜单
 * （2026-09-10 owner 真机反馈第四条）。
 *
 * ── 四条纪律 ────────────────────────────────────────────────────────────
 * ① **壳全部来自 `chrome/`**：卡骨架 / 工具条 / 提示词栏 / chip 弹层 / 版本点 /
 *    边即进度 / 快速看 / 画中框。⛔ 这里不复制任何一件的形态。
 * ② **卡面不显示槽**（spec §5）：已挂的首帧 / 尾帧 / 语音只在提示词栏首行那排小
 *    chip 上出现。
 * ③ **语义写入走 op**（`onApplyOp` / `onApplyBatch`）；媒体回填走 `onSetMedia`
 *    （上传与生成都是用户的动作）。
 * ④ **抓帧走 `useVideoReferenceSlots`**：续拍要末帧、抽帧要当前画面，两条都在那个
 *    钩子里抓 + 走与手动上传同一条回填链，⛔ 组件里不另开一条写入通道。
 *
 * ⚠ 本片同时**退役 `video.merge` 的合成 UI**（spec §5「不做合成节点」）：九槽阵列与
 * 逐段裁剪面板删除，数据（`mergeSettings.clips`）留给 S8 迁成剪辑台的 `EditProject`
 * ——派生仍在 `src/lib/node-v4-merge.ts`，⛔ 别顺手删。
 */

import { Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import { useModelChannelGate } from '@/hooks/use-model-channel-gate'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Camera,
  Download,
  Maximize2,
  MoreHorizontal,
  Play,
  StepForward,
  Upload,
  ImageIcon,
  VolumeX,
} from '@/components/icons'
import { toast } from 'sonner'

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { DURATION } from '@/constants/motion'
import { getNodeV4Ports, NODE_SLOT_IDS } from '@/constants/node-slots'
import { cn } from '@/lib/utils'
import { NODE_SCRIPT_SHOT_STATE_IDS } from '@/constants/node-script'
import { NODE_V4_CARD } from '@/constants/node-studio'
import { VIDEO_RAIL_GROUP_IDS, VIDEO_RAIL_GROUPS } from '@/lib/video-node-rail'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_IMAGE_SUBTYPE_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'
import { useVideoReferenceSlots } from '@/hooks/node/use-video-reference-slots'
import { getGeneratingStageKey } from '@/lib/generation-progress'
import {
  formatShotDisplayName,
  renameStableNodeName,
} from '@/lib/node-display-name'
import { listLiveConnectableSlots } from '@/lib/node-slot-binding'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type { NodeV4VideoData } from '@/types/node-workflow'

import {
  NodeChromeLayer,
  NodeCardShell,
  NodeFrameProgress,
  NodeMediaMissing,
  useMediaProblem,
  useNodeGenerationFinish,
  useNodeProgressNarrow,
  NodePromptBar,
  NodeToolbar,
  QuickLook,
  VersionDots,
  type NodeToolbarGroup,
} from './chrome'
import { splitVersionOp, useNodeV4Canvas } from './NodeV4Context'
import { NodeV4ContextMenu } from './NodeV4ContextMenu'
import { buildMentionCandidates, buildMentionTokens } from './NodeV4Mentions'
import { triggerNodeV4Download } from './NodeV4SelectionToolbar'
import { VideoNodeFrame } from './video/VideoNodeFrame'
import { VideoAddMenuItems, VideoMoreMenuItems } from './video/VideoNodeMenus'
import { VideoPlayer } from './video/VideoPlayer'
import { VideoRefRail } from './video/VideoRefRail'
import { VideoScriptShotBadge } from './video/VideoScriptShotChips'
import { useVideoComposer } from './video/use-video-composer'
import { ASSET_BATCH_REF } from './video/use-video-rail-binding'
import {
  formatVideoSeconds,
  formatVideoClock,
  videoCardHeight,
  videoContinueSourceHandle,
} from './video/video-node-model'
import { useNodeCanvasActions } from './NodeV4ActionsBridge'
import { CharacterMentionRail } from './character/CharacterMentionRail'

/** 「续拍」那一批里的两个别名（只在这一批之内有效）。 */
const CONTINUE_BATCH_REFS = { tail: 'tail', shot: 'shot' } as const

export function VideoNodeV4({ id, data, selected }: NodeProps) {
  const t = useTranslations('StudioNode.v4')
  const tVideo = useTranslations('StudioNode.v4.video')
  const tStage = useTranslations('StudioV3')
  const tPicker = useTranslations('ModelPicker')
  // 这张卡自己的「未选渠道」闸（gateId = 节点 id，与卡上那颗 chip 同一对）。
  const channelGate = useModelChannelGate(NODE_MEDIA_KIND_IDS.video, id)
  const tCapture = useTranslations('VideoAnalysis')
  const canvas = useNodeV4Canvas()
  const frames = useVideoReferenceSlots()
  /** ⋯「加入剪辑台」的出口（模式不是 op，见 `NodeV4ActionsBridge`）。 */
  const { openEditDesk } = useNodeCanvasActions()
  const videoData = data as unknown as NodeV4VideoData
  /**
   * 这一镜与剧本的关系（进度表 24）。⚠ 只有 `video.shot` 有 —— 参考片段与成片
   * 不由剧本投影产生。
   */
  const scriptShot =
    videoData.subtype === NODE_V4_VIDEO_SUBTYPE_IDS.shot
      ? videoData.scriptShot
      : undefined

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [quickLook, setQuickLook] = useState(false)
  const [hovering, setHovering] = useState(false)
  const [emptyDragging, setEmptyDragging] = useState(false)
  const dragDepthRef = useRef(0)
  const reduceMotion = useReducedMotion()
  // 源文件没了（素材库删了）/ 暂时读不到：换成灰底一句话，⛔ 不露裂图。
  const media = useMediaProblem(videoData.url)
  const [hoverProgress, setHoverProgress] = useState(0)
  const [renameRequest, setRenameRequest] = useState(0)
  /**
   * 从静帧那只 `<video>` 的元数据里读到的时长。
   *
   * ⚠ 手传进来的片子身上**没有** `durationSec`（上传补丁只回 url 与体积），而画板
   * 上「右下角只有时长」是有片卡唯一的读数。⛔ 不写 `0s` 顶上：那是一句假话。
   */
  const [probedDuration, setProbedDuration] = useState<number | null>(null)
  const [frameReady, setFrameReady] = useState(false)
  const frameVideoRef = useRef<HTMLVideoElement | null>(null)
  /** 画中框与快速看的来处（§1 第 12 条：从卡上长出来、缩回卡）。 */
  const cardRef = useRef<HTMLDivElement>(null)
  const promptInputRef = useRef<HTMLTextAreaElement>(null)
  const tokens = useMemo(
    () => buildMentionTokens(canvas.nodes, id),
    [canvas.nodes, id],
  )
  const candidates = useMemo(
    () =>
      buildMentionCandidates(canvas.nodes, id, (item) =>
        t(`mentionGroups.${item.data.kind}`),
      ),
    [canvas.nodes, id, t],
  )

  const mediaOf = useMemo(() => {
    const byName = new Map<
      string,
      {
        kind: 'image' | 'video' | 'audio' | 'text'
        thumbnailUrl?: string
        videoUrl?: string
      }
    >()
    for (const item of canvas.nodes) {
      const itemData = item.data
      if (itemData.kind === NODE_MEDIA_KIND_IDS.text) continue
      if (itemData.kind === NODE_MEDIA_KIND_IDS.audio) {
        byName.set(itemData.name, { kind: 'audio' })
        continue
      }
      // ⚠ 视频的 `url` 是 mp4：封面走 `videoThumbnailUrl`，片子只给第一帧兜底用。
      if (itemData.kind === NODE_MEDIA_KIND_IDS.video) {
        byName.set(itemData.name, {
          kind: 'video',
          ...(itemData.videoThumbnailUrl
            ? { thumbnailUrl: itemData.videoThumbnailUrl }
            : {}),
          ...(itemData.url ? { videoUrl: itemData.url } : {}),
        })
        continue
      }
      byName.set(itemData.name, {
        kind: 'image',
        ...(itemData.url ? { thumbnailUrl: itemData.url } : {}),
      })
    }
    return (name: string) => byName.get(name)
  }, [canvas.nodes])

  const displayName =
    videoData.subtype === NODE_V4_VIDEO_SUBTYPE_IDS.shot
      ? formatShotDisplayName(videoData.label, videoData.shotNo)
      : videoData.name
  const editName =
    videoData.subtype === NODE_V4_VIDEO_SUBTYPE_IDS.shot
      ? videoData.label
      : videoData.name

  /**
   * 轨 / 草稿 / 参数 / 模型 / 发送 / 上传落卡 —— 与手机镜头带的底部抽屉共用
   * **同一份编排件**（`use-video-composer`）。⛔ 这里不再自己接一遍那条路径。
   */
  const {
    node,
    failureMessage,
    generating,
    elapsed,
    draft,
    setDraft,
    currentPrompt,
    submitPrompt,
    cancelGeneration,
    railProps,
    railItems,
    railCandidatesOf,
    paramsChip,
    modelChip,
    audioToggle,
    mentionOptions,
    characterMentions,
    characterRail,
    frameTokens,
    frameCandidates,
    renderPromptValue,
    versions,
    versionIndex,
    selectVersion,
    currentSourceLabel,
    posterUrl,
    modelLabel,
    acceptsRefs,
    effectiveParams,
    runUpload,
    openFilePicker,
    openReferenceFilePicker,
    openLibrary,
    selfUploading,
    uploadProgress,
    backfillMedia,
    overlays,
  } = useVideoComposer({
    id,
    videoData,
    displayName,
    tokens,
    candidates,
    mediaOf,
  })
  const frameKey = JSON.stringify([
    videoData.url ?? '',
    posterUrl ?? '',
    media.attempt,
  ])
  const [previousFrameKey, setPreviousFrameKey] = useState(frameKey)
  if (frameKey !== previousFrameKey) {
    setPreviousFrameKey(frameKey)
    setFrameReady(false)
  }

  /**
   * ⌘V 落进**这张卡**（spec §1.3「粘贴不做按钮」）。捕获阶段挂在 `window` 上并
   * `stopPropagation`：工作台那条粘贴路径是「在鼠标处新建一张卡」，选中态下两条都跑
   * 会同时落进这张卡又多出一张。选中的卡优先。
   */
  useEffect(() => {
    if (!selected || canvas.selectedNodeIds.length >= 2) return
    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((item) =>
        item.type.startsWith('video/'),
      )
      if (!file) return
      event.preventDefault()
      event.stopPropagation()
      runUpload(file, null)
    }
    window.addEventListener('paste', onPaste, true)
    return () => window.removeEventListener('paste', onPaste, true)
  }, [selected, canvas.selectedNodeIds.length, runUpload])

  // 卡宽恒是收起宽度 —— 在提前返回之前取（hook 不能跟着 `node` 有无走）。
  const progressNarrow = useNodeProgressNarrow(NODE_V4_CARD.collapsedWidth)
  const genFinish = useNodeGenerationFinish({
    generating,
    failed: Boolean(failureMessage),
    mediaUrl: videoData.url,
  })
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

  if (!node) return null

  const canvasCandidates = acceptsRefs
    ? VIDEO_RAIL_GROUPS.flatMap((group) => {
        const limit =
          group === VIDEO_RAIL_GROUP_IDS.image
            ? railProps.capacity.images
            : group === VIDEO_RAIL_GROUP_IDS.video
              ? railProps.capacity.videos
              : railProps.capacity.voices
        const occupied =
          railItems.filter((item) => item.group === group).length +
          (railProps.pending?.filter(
            (item) => item.group === group && !item.error,
          ).length ?? 0)
        return railCandidatesOf(group).map((candidate) => {
          const attached = railItems.some(
            (item) => item.sourceNodeId === candidate.id,
          )
          const blockedReason =
            !attached &&
            railProps.referenceUnavailable &&
            group !== VIDEO_RAIL_GROUP_IDS.image
              ? tVideo('rail.referenceUnavailable')
              : !attached && limit !== null && occupied >= limit
                ? tVideo('rail.full', { limit })
                : undefined
          return {
            ...candidate,
            group,
            attached,
            ...(blockedReason ? { blockedReason } : {}),
          }
        })
      })
    : []

  const expanded = canvas.expandedNodeId === id
  const showChrome =
    Boolean(selected) &&
    canvas.selectedNodeIds.length < 2 &&
    canvas.expandedNodeId === null
  const width = NODE_V4_CARD.collapsedWidth
  const height = videoCardHeight(width)
  const durationSeconds =
    videoData.durationSec ??
    probedDuration ??
    Number(videoData.params?.duration) ??
    0
  const effectiveDuration = Number(effectiveParams.duration)
  const frameHeadline = [
    effectiveParams.aspectRatio,
    effectiveParams.resolution,
    Number.isFinite(effectiveDuration) && effectiveDuration > 0
      ? formatVideoSeconds(effectiveDuration)
      : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ')

  const ports = getNodeV4Ports(node.data.kind, node.data.subtype)
  const dragSource = canvas.draggingFrom
    ? canvas.nodes.find((item) => item.id === canvas.draggingFrom)
    : undefined
  const litSlots = dragSource
    ? listLiveConnectableSlots(dragSource, node, canvas.edges, {
        nodes: canvas.nodes,
      })
    : []

  const renameNode = (next: string): boolean => {
    const taken = new Set(
      canvas.nodes
        .filter((item) => item.id !== id)
        .map((item) => item.data.name),
    )
    const result = renameStableNodeName(editName, next, taken)
    if (!result.ok) return false
    // 镜头节点的稳定名是 `label`；`name` 与它写同一个值，⛔ 只改一个会让两处显示对不上。
    void canvas.onApplyBatch(
      (videoData.subtype === NODE_V4_VIDEO_SUBTYPE_IDS.shot
        ? ([
            {
              op: NODE_ASSISTANT_OP_V4_IDS.setField,
              target: id,
              field: 'label',
              value: result.name,
            },
            {
              op: NODE_ASSISTANT_OP_V4_IDS.setField,
              target: id,
              field: 'name',
              value: result.name,
            },
          ] as const)
        : ([
            {
              op: NODE_ASSISTANT_OP_V4_IDS.setField,
              target: id,
              field: 'name',
              value: result.name,
            },
          ] as const)) as readonly NodeAssistantOpV4[],
    )
    return true
  }

  const reportCaptureFailure = (reasonKey: string) =>
    toast.error(tCapture(`captureReason.${reasonKey}` as never))

  /** 续拍：抓这一段的末帧 → 落成一张图 → 当下一段的首帧。 */
  const runContinue = async () => {
    if (!videoData.url) return
    const grabbed = await frames.captureLastFrame(videoData.url, displayName)
    if (!grabbed.ok) {
      reportCaptureFailure(grabbed.reasonKey)
      return
    }
    // 末帧 → 下一镜排成一行，落在本卡右边第一个空位（§7 摆放 A「让位」）。
    const [tailAt, shotAt] =
      canvas.onPlaceBeside(id, [
        {
          kind: NODE_MEDIA_KIND_IDS.image,
          subtype: NODE_V4_IMAGE_SUBTYPE_IDS.shot,
        },
        {
          kind: NODE_MEDIA_KIND_IDS.video,
          subtype: NODE_V4_VIDEO_SUBTYPE_IDS.shot,
        },
      ]) ?? []
    const outcome = await canvas.onApplyBatch([
      {
        op: NODE_ASSISTANT_OP_V4_IDS.addNode,
        kind: NODE_MEDIA_KIND_IDS.image,
        subtype: NODE_V4_IMAGE_SUBTYPE_IDS.shot,
        ref: CONTINUE_BATCH_REFS.tail,
        name: tVideo('tailFrameName', { name: displayName }),
        ...(tailAt ? { position: tailAt } : {}),
      },
      {
        op: NODE_ASSISTANT_OP_V4_IDS.addNode,
        kind: NODE_MEDIA_KIND_IDS.video,
        subtype: NODE_V4_VIDEO_SUBTYPE_IDS.shot,
        ref: CONTINUE_BATCH_REFS.shot,
        ...(shotAt ? { position: shotAt } : {}),
      },
      {
        op: NODE_ASSISTANT_OP_V4_IDS.connect,
        source: CONTINUE_BATCH_REFS.tail,
        target: CONTINUE_BATCH_REFS.shot,
        slot: NODE_SLOT_IDS.firstFrame,
      },
      {
        op: NODE_ASSISTANT_OP_V4_IDS.connect,
        source: id,
        sourceHandle: videoContinueSourceHandle(videoData.subtype),
        target: CONTINUE_BATCH_REFS.shot,
        slot: NODE_SLOT_IDS.reference,
      },
    ])
    const tailId = outcome?.createdNodeIds?.[0]
    if (tailId) backfillMedia(tailId, { url: grabbed.url })
  }

  /**
   * 抽帧：截当前画面 → 落成一张图片卡 → 连线**指回**这一段的参考槽。⚠ 没有
   * 参考槽的卡（退役的 `merge`）只落那张图、不连（⛔ 连一条不存在的入口 = 报错 + 孤卡）。
   */
  const runExtract = async (video: HTMLVideoElement) => {
    const grabbed = await frames.captureCurrentFrame(video, displayName)
    if (!grabbed.ok) {
      reportCaptureFailure(grabbed.reasonKey)
      return
    }
    const position = canvas.onPlaceBeside(id, [
      {
        kind: NODE_MEDIA_KIND_IDS.image,
        subtype: NODE_V4_IMAGE_SUBTYPE_IDS.shot,
      },
    ])?.[0]
    const outcome = await canvas.onApplyBatch([
      {
        op: NODE_ASSISTANT_OP_V4_IDS.addNode,
        kind: NODE_MEDIA_KIND_IDS.image,
        subtype: NODE_V4_IMAGE_SUBTYPE_IDS.shot,
        ref: ASSET_BATCH_REF,
        ...(position ? { position } : {}),
      },
      ...(acceptsRefs
        ? ([
            {
              op: NODE_ASSISTANT_OP_V4_IDS.connect,
              source: ASSET_BATCH_REF,
              target: id,
              slot: NODE_SLOT_IDS.reference,
            },
          ] as const)
        : []),
    ])
    const created = outcome?.createdNodeIds?.[0]
    if (created) backfillMedia(created, { url: grabbed.url })
  }

  const toolbarGroups: readonly NodeToolbarGroup[] = [
    [
      {
        id: 'continue',
        // 主动作带字（§1 第 4 条 · 方向 B）：视频卡的第一件事是「续拍」。
        primary: true,
        label: tVideo('toolbar.continue'),
        icon: StepForward,
        disabled: !videoData.url || frames.grabbing !== null,
        onSelect: () => void runContinue(),
      },
      {
        // 展开（画中框）。双击仍是快速看片，右键菜单里的「展开」保留 —— 三条路进的是
        // 同一个框。
        id: 'expand',
        label: tVideo('toolbar.expand'),
        icon: Maximize2,
        onSelect: () => canvas.onToggleExpanded(id),
      },
      {
        id: 'extract',
        label: tVideo('toolbar.extract'),
        // 抽帧 = 抓一帧画面；⛔ 不用剪刀（剪刀只留给「裁剪」）。
        icon: Camera,
        // 抽帧要一只**正在放**的 `<video>`（「当前」是它的 currentTime）——
        // 卡上那只只在悬停时才挂，所以这颗键在画中框之外读的是卡上悬停的那只。
        disabled: !videoData.url || frames.grabbing !== null,
        onSelect: () => {
          const video = frameVideoRef.current
          if (!video) {
            toast.error(tVideo('toolbar.extractNeedsPlayback'))
            return
          }
          void runExtract(video)
        },
      },
    ],
    [
      {
        id: 'download',
        label: t('toolbar.download'),
        icon: Download,
        disabled: !videoData.url,
        onSelect: () => videoData.url && triggerNodeV4Download(videoData.url),
      },
      {
        id: 'more',
        label: tVideo('toolbar.more'),
        icon: MoreHorizontal,
        onSelect: () => {},
        menu: (
          <VideoMoreMenuItems
            {...(videoData.url
              ? { onQuickLook: () => setQuickLook(true) }
              : {})}
            onRename={() => setRenameRequest((count) => count + 1)}
            onDuplicate={() =>
              void canvas.onApplyOp({
                op: NODE_ASSISTANT_OP_V4_IDS.addNode,
                kind: NODE_MEDIA_KIND_IDS.video,
                subtype: videoData.subtype,
                ...(videoData.shotNo === undefined
                  ? {}
                  : { shotNo: videoData.shotNo }),
              })
            }
            onAddToEditDesk={() => openEditDesk([id])}
            addToEditDeskDisabled={!videoData.url}
            onSplitVersion={
              versions.length > 1
                ? () =>
                    void canvas.onApplyOp(
                      splitVersionOp(canvas, id, videoData, versionIndex),
                    )
                : undefined
            }
            {...(currentSourceLabel ? { sourceLabel: currentSourceLabel } : {})}
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
  const failed = Boolean(failureMessage && !selfUploading)
  const empty = !videoData.url && !generating && !selfUploading && !failed
  const hasLeadingReferences =
    acceptsRefs &&
    (railItems.length > 0 ||
      Boolean(railProps.pending?.length) ||
      characterMentions.length > 0)

  return (
    <div
      ref={cardRef}
      data-node-kind={NODE_MEDIA_KIND_IDS.video}
      data-node-subtype={videoData.subtype}
      data-generating={generating ? 'true' : 'false'}
      className="relative"
      onContextMenu={(event) => {
        event.preventDefault()
        setMenu({ x: event.nativeEvent.offsetX, y: event.nativeEvent.offsetY })
      }}
      onDragEnter={(event) => {
        if (!empty || !Array.from(event.dataTransfer.types).includes('Files'))
          return
        dragDepthRef.current += 1
        setEmptyDragging(true)
      }}
      onDragOver={(event) => {
        event.preventDefault()
        event.stopPropagation()
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={() => {
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
        if (dragDepthRef.current === 0) setEmptyDragging(false)
      }}
      onDrop={(event) => {
        dragDepthRef.current = 0
        setEmptyDragging(false)
        const file = Array.from(event.dataTransfer?.files ?? []).find(
          (item) =>
            item.type.startsWith('video/') ||
            item.type.startsWith('image/') ||
            item.type.startsWith('audio/'),
        )
        if (!file) return
        event.preventDefault()
        event.stopPropagation()
        // 画板（2026-09-10 定稿）：拖进来的东西**落进对应组** —— 图默认作
        // **参考**（⛔ 不再「第一张 = 首帧」：首 / 尾是图的角色，在轨上点图改），
        // 语音进语音组。拖一段**视频**进来仍是这张卡自己的成片（本片替换）。
        if (file.type.startsWith('image/')) {
          runUpload(file, VIDEO_RAIL_GROUP_IDS.image)
          return
        }
        if (file.type.startsWith('audio/')) {
          runUpload(file, VIDEO_RAIL_GROUP_IDS.voice)
          return
        }
        runUpload(file, null)
      }}
      // 画板 `VideoRefs.dc.html` 底注（2026-09-10 owner 真机反馈第四条）：
      // **双击卡片 = 展开**（与工具条第一键、右键菜单同一个框）；快速看片改走
      // 选中态的**空格**与 ⋯ 菜单里的「快速看」。⛔ 双击不再是快速看。
      onDoubleClick={() => {
        if (empty || !videoData.url || media.problem || expanded) return
        canvas.onToggleExpanded(id)
      }}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key !== ' ' || expanded) return
        // 栏里 / 框里打字的空格不是快捷键。
        if (event.target !== event.currentTarget) return
        event.preventDefault()
        if (videoData.url && !media.problem) setQuickLook(true)
      }}
    >
      <NodeChromeLayer show={showChrome && !empty} position={Position.Top}>
        <NodeToolbar
          groups={toolbarGroups}
          ariaLabel={tVideo('toolbar.label')}
        />
      </NodeChromeLayer>

      <NodeCardShell
        name={displayName}
        editName={editName}
        renameAriaLabel={t('renameNode')}
        onRename={renameNode}
        renameRequest={renameRequest}
        selected={Boolean(selected)}
        edgeBusy={generating || selfUploading || failed || genFinish.holding}
        edgeOverlay={
          generating || genFinish.completing || failed ? (
            <NodeFrameProgress
              elapsedSeconds={elapsed}
              stageLabel={tStage(
                `generatingOverlayStages.${getGeneratingStageKey(elapsed)}` as const,
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
                      retryLabel: tVideo('rail.retry'),
                      ...(draft.trim() ? { onRetry: submitPrompt } : {}),
                    }
                  : null
              }
              hideStageLabel={progressNarrow}
            />
          ) : selfUploading ? (
            // 换本片的上传也走同一条边（owner 真机反馈第七条）——⛔ 不让卡在上传的那几秒里一动不动。
            <NodeFrameProgress
              elapsedSeconds={0}
              realProgress={uploadProgress}
              stageLabel={tVideo('rail.uploading', {
                name: displayName,
              })}
              hideStageLabel={progressNarrow}
            />
          ) : undefined
        }
        expanded={expanded}
        width={width}
        empty={empty}
        emptyDragging={empty && emptyDragging}
        emptyContent={
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 text-center">
            <p className="text-2sm text-muted-foreground">
              {tVideo('emptyHint')}
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-node-empty-upload
                onClick={(event) => {
                  event.stopPropagation()
                  openFilePicker(null)
                }}
                className="nodrag nopan inline-flex h-7 items-center justify-center gap-1.25 rounded-full bg-surface-fill-hover px-2.75 text-xs text-foreground transition-colors duration-fast ease-standard hover:bg-surface-fill-track focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Upload aria-hidden className="size-3.5" />
                {t('chrome.emptyUpload')}
              </button>
              <button
                type="button"
                data-node-empty-library
                onClick={(event) => {
                  event.stopPropagation()
                  openLibrary(null)
                }}
                className="nodrag nopan inline-flex h-7 items-center justify-center gap-1.25 rounded-full bg-surface-fill-hover px-2.75 text-xs text-foreground transition-colors duration-fast ease-standard hover:bg-surface-fill-track focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <ImageIcon aria-hidden className="size-3.5" />
                {t('chrome.emptyLibrary')}
              </button>
            </div>
          </div>
        }
        emptyHeight={height}
        surfaceClassName={cn(
          'overflow-hidden',
          // 剧本里那一段改了 → 卡描边转琥珀（画板 ③ 的 warning 描边）。
          scriptShot?.state === NODE_SCRIPT_SHOT_STATE_IDS.changed &&
            'ring-[1.5px] ring-status-warning',
        )}
        // 剧本里删掉的镜**标灰不删**：上面可能挂着已经生成的产物。
        className={cn(
          scriptShot?.state === NODE_SCRIPT_SHOT_STATE_IDS.dropped &&
            'opacity-50',
        )}
        {...(scriptShot
          ? { nameTrailing: <VideoScriptShotBadge state={scriptShot.state} /> }
          : {})}
        changed={canvas.changedNodeIds.includes(id)}
        portSpec={{
          kind: NODE_MEDIA_KIND_IDS.video,
          left: (ports?.inputs ?? []).map((spec) => ({
            id: spec.slot,
            ariaLabel: t(`slots.${spec.slot}`),
            lit: litSlots.includes(spec.slot),
          })),
          right: (ports?.outputs ?? []).map((output) => ({
            id: output,
            ariaLabel: t(`outputs.${output}`),
          })),
          dragging: Boolean(dragSource) && dragSource?.id !== id,
        }}
      >
        {failed && !videoData.url ? (
          // 失败就地说（加载态 A）：原因 +「重试」在卡边那一层，这里只占住卡的高度。
          <div
            data-video-surface="failed"
            className="relative"
            style={{ height }}
          />
        ) : videoData.url || generating || selfUploading ? (
          <div
            data-video-surface={videoData.url ? 'ready' : 'pending'}
            className="relative bg-surface-fill-hover"
            style={{ height }}
            onMouseEnter={() => {
              if (!videoData.url || !frameReady || generating || media.problem)
                return
              setHovering(true)
            }}
            onMouseLeave={() => {
              setHovering(false)
              setHoverProgress(0)
            }}
          >
            {/* 封面。⚠ 悬停时那只 `<video>` 盖在它上面 —— ⛔ 不换掉它：
                换掉会在视频首帧解码出来之前闪一下白。 */}
            {media.problem ? (
              <NodeMediaMissing
                kind="video"
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
            ) : posterUrl ? (
              <motion.img
                key={frameKey}
                src={posterUrl}
                onError={media.onError}
                onLoad={() => setFrameReady(true)}
                initial={false}
                animate={{ opacity: frameReady ? 1 : 0 }}
                transition={{
                  duration: reduceMotion ? DURATION.fast : DURATION.base,
                  ease: 'linear',
                }}
                alt={displayName}
                draggable={false}
                className={cn(
                  'size-full rounded-node object-cover corner-squircle transition-[filter] duration-slow ease-standard motion-reduce:transition-none',
                  // 出图那一拍：线合拢之前新封面压在模糊底下，线淡出时模糊收掉。
                  genFinish.holding && 'motion-safe:blur-sm',
                )}
              />
            ) : videoData.url ? (
              // 没有落库封面时，静帧就是这段片子自己的第一帧 —— 一只
              // `preload="metadata"` 的 `<video>`。⛔ 不用 `<img src={视频}>`：
              // 那什么都画不出来（v3 缩略图空白的老根）。顺带把时长读回来。
              <motion.video
                key={frameKey}
                src={videoData.url}
                muted
                playsInline
                preload="metadata"
                aria-label={displayName}
                data-video-still
                onError={media.onError}
                onLoadedData={() => setFrameReady(true)}
                initial={false}
                animate={{ opacity: frameReady ? 1 : 0 }}
                transition={{
                  duration: reduceMotion ? DURATION.fast : DURATION.base,
                  ease: 'linear',
                }}
                className={cn(
                  'size-full rounded-node object-cover corner-squircle transition-[filter] duration-slow ease-standard motion-reduce:transition-none',
                  genFinish.holding && 'motion-safe:blur-sm',
                )}
                onLoadedMetadata={(event) => {
                  const value = event.currentTarget.duration
                  if (Number.isFinite(value) && value > 0) {
                    setProbedDuration(value)
                  }
                }}
              />
            ) : (
              <div className="size-full rounded-node bg-surface-sunken corner-squircle" />
            )}

            {hovering && frameReady && videoData.url && !media.problem ? (
              <>
                <video
                  ref={frameVideoRef}
                  src={videoData.url}
                  poster={posterUrl}
                  muted
                  autoPlay
                  loop
                  playsInline
                  preload="metadata"
                  aria-label={displayName}
                  data-video-hover-preview
                  className="absolute inset-0 size-full rounded-node object-cover corner-squircle"
                  onTimeUpdate={(event) => {
                    const element = event.currentTarget
                    setHoverProgress(
                      element.duration > 0
                        ? element.currentTime / element.duration
                        : 0,
                    )
                  }}
                />
                {/* 底部一条 2px 细进度线（画板 68 行）。 */}
                <div
                  data-video-hover-progress
                  className="absolute inset-x-0 bottom-0 h-0.5 bg-white/35"
                >
                  <div
                    className="h-full bg-white"
                    style={{ width: `${Math.round(hoverProgress * 100)}%` }}
                  />
                </div>
                {/* 右上静音标：说明「现在是静音在放」，⛔ 不是开关。 */}
                <span
                  data-video-muted-badge
                  aria-label={t('player.mute')}
                  className="absolute top-2 right-2 flex size-6.5 items-center justify-center rounded-full surface-glass"
                >
                  <VolumeX aria-hidden className="size-3.5" />
                </span>
              </>
            ) : null}

            {videoData.url && !media.problem && !frameReady ? (
              <div
                aria-hidden
                data-video-first-frame-pending="true"
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
              >
                <span className="flex size-8.5 items-center justify-center rounded-full bg-card/70 text-foreground/45">
                  <Play aria-hidden weight="fill" className="size-4" />
                </span>
              </div>
            ) : null}

            {/* 右下角只有时长（画板 65 行）。⛔ 没有播放钮、没有角标、没有槽。 */}
            {videoData.url && durationSeconds > 0 && !hovering ? (
              <span
                data-video-duration
                className="absolute right-2.5 bottom-2.25 bg-foreground/45 px-1.5 py-0.25 font-mono text-2xs leading-3.5 tabular-nums text-card"
                style={{ borderRadius: 'calc(var(--radius-node-thumb) / 2)' }}
              >
                {formatVideoClock(durationSeconds)}
              </span>
            ) : null}

            {/* 重画 / 出图那一拍 / 失败：片留着，盖一层白纱（加载态 A）；线、原因与
                「重试」在卡边那一层。出图时白纱跟着线一起淡掉。 */}
            {videoData.url && (generating || genFinish.completing || failed) ? (
              <div
                aria-hidden
                className={cn(
                  'absolute inset-0 bg-background/60 transition-opacity duration-base ease-linear motion-reduce:transition-none',
                  genFinish.completing && !genFinish.holding && 'opacity-0',
                )}
              />
            ) : null}
          </div>
        ) : undefined}
      </NodeCardShell>

      <NodeChromeLayer show={showChrome} position={Position.Bottom}>
        <div className="flex flex-col items-center gap-2">
          <VersionDots
            count={versions.length}
            current={Math.min(versionIndex, versions.length - 1)}
            onSelect={selectVersion}
            ariaLabel={t('chrome.versions')}
            labelOf={(index) =>
              t('chrome.versionOf', {
                index: index + 1,
                total: versions.length,
              })
            }
          />
          <NodePromptBar
            sidebarOpen={canvas.sidebarOpen}
            // 栏**内**首行：已挂的首帧 / 尾帧 / 语音（画板 `VideoSelected.dc.html`
            // 第 57 行 —— 那排 chip 与正文同一片玻璃，⛔ 不是栏上方另一条）。
            // 不收参考的卡不摆参考轨（判据查端口表，与图片卡 `image.reference` 同一条）。
            leadingRow={
              hasLeadingReferences ? (
                <>
                  {railItems.length > 0 || railProps.pending?.length ? (
                    <VideoRefRail
                      {...railProps}
                      animateOnMount={railMountState.animate}
                    />
                  ) : null}
                  <CharacterMentionRail
                    nodeId={id}
                    mentions={characterMentions}
                    capacity={characterRail.capacity}
                    usedImages={characterRail.usedImages}
                    disabled={generating}
                  />
                </>
              ) : null
            }
            value={draft}
            onValueChange={setDraft}
            onSubmit={submitPrompt}
            // 多渠道型号没选渠道 = 这一枪发不出去（D2 Q1：没有「自动」渠道）。
            // 按钮上写「先选渠道」，点了打开这张卡的选择器并定位到那一行。
            {...(channelGate.blocked
              ? {
                  blockedLabel: tPicker('pickChannel'),
                  onBlockedClick: channelGate.requestPick,
                }
              : {})}
            generating={generating}
            onCancel={cancelGeneration}
            placeholder={
              empty
                ? tVideo('emptyPromptPlaceholder')
                : tVideo('promptPlaceholder')
            }
            ariaLabel={tVideo('promptLabel')}
            // 素材横向滚动，正文与参数留在同一块编辑面。
            className="w-160"
            addMenu={
              <VideoAddMenuItems
                acceptsRefs={acceptsRefs}
                canvasCandidates={canvasCandidates}
                onPickSlotSource={railProps.onPickFromCanvas}
                onUpload={() =>
                  acceptsRefs ? openReferenceFilePicker() : openFilePicker(null)
                }
                onLibrary={() =>
                  acceptsRefs
                    ? railProps.onLibrary(VIDEO_RAIL_GROUP_IDS.image)
                    : openLibrary(null)
                }
              />
            }
            inputRef={promptInputRef}
            mentionOptions={mentionOptions}
            renderValue={renderPromptValue}
            chips={[paramsChip, modelChip].filter(Boolean)}
            // chip 与发送钮之间那颗声音开关（画板「画布提示词栏 · 结果」）。
            // ⛔ 不当第三颗 chip：出不出声是这一枪的开关，不是规格。
            {...(audioToggle ? { trailing: audioToggle } : {})}
          />
        </div>
      </NodeChromeLayer>

      {/* 隐藏的 file input 与素材库对话框都住在编排件里（`use-video-composer`）。 */}
      {overlays}

      <AnimatePresence>
        {expanded ? (
          <VideoNodeFrame
            key="frame"
            open
            origin={cardRef}
            onClose={() => canvas.onToggleExpanded(id)}
            nodeId={id}
            title={displayName}
            // 方向 A：模型只在页脚 chip 里出现一次，顶栏读数不再写它。
            headline={frameHeadline}
            url={videoData.url}
            posterUrl={posterUrl}
            onExtractFrame={(video) => void runExtract(video)}
            extracting={frames.grabbing !== null}
            onDownload={() =>
              videoData.url && triggerNodeV4Download(videoData.url)
            }
            failureMessage={failureMessage}
            body={draft}
            onBodyChange={setDraft}
            onSave={(body) => {
              if (body !== currentPrompt) canvas.onSetPrompt(id, body)
            }}
            onRegenerate={submitPrompt}
            regenerateDisabled={generating || draft.trim().length === 0}
            onUpload={() => openFilePicker(null)}
            onLibrary={() => openLibrary(null)}
            footerReadout={tVideo('frame.readout', {
              chars: draft.trim().length,
              slots: railItems.length,
            })}
            paramsChip={paramsChip}
            modelChip={modelChip}
            refRail={
              acceptsRefs ? (
                <div className="flex min-w-0 max-w-full items-start gap-2">
                  <VideoRefRail {...railProps} expanded />
                  <CharacterMentionRail
                    nodeId={id}
                    mentions={characterMentions}
                    capacity={characterRail.capacity}
                    usedImages={characterRail.usedImages}
                    disabled={generating}
                    expanded
                  />
                </div>
              ) : null
            }
            addMenu={
              acceptsRefs ? (
                <VideoAddMenuItems
                  acceptsRefs
                  canvasCandidates={canvasCandidates}
                  onPickSlotSource={railProps.onPickFromCanvas}
                  onUpload={openReferenceFilePicker}
                  onLibrary={() =>
                    railProps.onLibrary(VIDEO_RAIL_GROUP_IDS.image)
                  }
                />
              ) : undefined
            }
            tokens={frameTokens}
            candidates={frameCandidates}
            onMentionSelect={(candidate, handle) =>
              handle.insertToken(candidate.name)
            }
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {quickLook && videoData.url ? (
          <QuickLook
            key="quick-look"
            open
            origin={cardRef}
            onClose={() => setQuickLook(false)}
            ariaLabel={displayName}
            {...(versions.length > 1
              ? {
                  versionCount: versions.length,
                  versionIndex,
                  onVersionChange: selectVersion,
                }
              : {})}
            readout={[
              durationSeconds > 0 ? formatVideoSeconds(durationSeconds) : null,
              videoData.params?.resolution,
              modelLabel,
            ]
              .filter(Boolean)
              .join(' · ')}
            onDownload={() => triggerNodeV4Download(videoData.url as string)}
          >
            <VideoPlayer
              url={videoData.url}
              {...(posterUrl ? { posterUrl } : {})}
              title={displayName}
              className="w-175 max-w-full"
            />
          </QuickLook>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {menu ? (
          <NodeV4ContextMenu
            key="menu"
            node={node}
            x={menu.x}
            y={menu.y}
            {...(videoData.url ? { mediaUrl: videoData.url } : {})}
            onClose={() => setMenu(null)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  )
}
