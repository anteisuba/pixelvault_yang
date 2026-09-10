'use client'

/**
 * 视频节点（v3 spec §5，画板 `VideoStates` / `VideoSelected` / `VideoPopover` /
 * `VideoExpanded` / `VideoQuickLook`）。
 *
 * 五态：**空卡**（16:9 虚线框 + 一句提示，⌘V / 拖入都落进这张卡）· **有片收起**
 * （卡即封面、右下角只有时长；悬停静音自动播 + 底部细进度线 + 右上静音标）·
 * **选中**（工具条 `续拍 · 抽帧 · 下载 · ⋯` 浮在卡上，版本点 + 已挂小 chip + 提示词栏
 * 浮在卡下）· **生成中**（裱框显影 + 栏变灰可取消）· **展开**（画中框 720：播放器 +
 * 镜头说明 + 生成行 + 写作助手栏）。双击 = 快速看片。
 *
 * ── 四条纪律 ────────────────────────────────────────────────────────────
 * ① **壳全部来自 `chrome/`**：卡骨架 / 工具条 / 提示词栏 / chip 弹层 / 版本点 /
 *    裱框显影 / 快速看 / 画中框。⛔ 这里不复制任何一件的形态。
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

import { NodeToolbar as FlowNodeToolbar, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Download,
  MoreHorizontal,
  Scissors,
  StepForward,
  VolumeX,
} from 'lucide-react'
import { toast } from 'sonner'

import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { PROGRESS_TICK_MS } from '@/constants/generation-progress'
import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import {
  getNodeV4Ports,
  NODE_SLOT_IDS,
  NODE_SLOT_OUTPUT_IDS,
  type NodeSlotId,
} from '@/constants/node-slots'
import { NODE_V4_CARD } from '@/constants/node-studio'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_IMAGE_SUBTYPE_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'
import { useNodeMediaGenerationV4 } from '@/hooks/node/use-node-media-generation-v4'
import { useNodeUploadV4 } from '@/hooks/node/use-node-upload-v4'
import { useVideoReferenceSlots } from '@/hooks/node/use-video-reference-slots'
import { getGeneratingStageKey } from '@/lib/generation-progress'
import {
  formatShotDisplayName,
  renameStableNodeName,
} from '@/lib/node-display-name'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { readOutputIndex } from '@/lib/node-output-versions'
import { listLiveConnectableSlots } from '@/lib/node-slot-binding'
import { readSlotSources } from '@/lib/node-slot-payload'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type { NodeV4, NodeV4VideoData } from '@/types/node-workflow'

import {
  NodeCardShell,
  NodeFrameProgress,
  NodePromptBar,
  NodeToolbar,
  QuickLook,
  VersionDots,
  useNodeCardFlash,
  type NodeToolbarGroup,
} from './chrome'
import { useNodeV4Canvas } from './NodeV4Context'
import { NodeV4ContextMenu } from './NodeV4ContextMenu'
import { buildMentionCandidates, buildMentionTokens } from './NodeV4Mentions'
import { triggerNodeV4Download } from './NodeV4SelectionToolbar'
import { toStudioModelOption } from './image/image-node-model'
import { VideoFrameChip } from './video/VideoFrameChip'
import { VideoNodeFrame } from './video/VideoNodeFrame'
import { VideoAddMenuItems, VideoMoreMenuItems } from './video/VideoNodeMenus'
import { VideoPlayer } from './video/VideoPlayer'
import { VideoSlotChips, type VideoSlotChipItem } from './video/VideoSlotChips'
import {
  formatVideoSeconds,
  videoCardHeight,
  videoVersions,
} from './video/video-node-model'
import { ModelPickerPopover } from '../../../studio-shared/pickers/ModelPickerPopover'

/** 「续拍」那一批里的两个别名（只在这一批之内有效）。 */
const CONTINUE_BATCH_REFS = { tail: 'tail', shot: 'shot' } as const
/** 「抽帧」与「+ 上传落槽」那一批里指代新建素材卡的别名。 */
const ASSET_BATCH_REF = 'asset'

/** 栏首行小 chip 只显示这三个槽（画板：首帧 / 尾帧 / 语音）。 */
const CHIP_SLOTS: readonly NodeSlotId[] = [
  NODE_SLOT_IDS.firstFrame,
  NODE_SLOT_IDS.lastFrame,
  NODE_SLOT_IDS.voice,
]

/** `+` 里那四项各自接受什么 kind —— 落槽合法性仍由 `canConnect` 判，这只是筛候选。 */
const SLOT_SOURCE_KINDS: Readonly<Record<string, 'image' | 'video' | 'audio'>> =
  {
    [NODE_SLOT_IDS.firstFrame]: NODE_MEDIA_KIND_IDS.image,
    [NODE_SLOT_IDS.lastFrame]: NODE_MEDIA_KIND_IDS.image,
    [NODE_SLOT_IDS.reference]: NODE_MEDIA_KIND_IDS.video,
    [NODE_SLOT_IDS.voice]: NODE_MEDIA_KIND_IDS.audio,
  }

export function VideoNodeV4({ id, data, selected }: NodeProps) {
  const t = useTranslations('StudioNode.v4')
  const tVideo = useTranslations('StudioNode.v4.video')
  const tStage = useTranslations('StudioV3')
  const tCapture = useTranslations('VideoAnalysis')
  const tModels = useTranslations('Models')
  const canvas = useNodeV4Canvas()
  const generation = useNodeMediaGenerationV4()
  const upload = useNodeUploadV4()
  const frames = useVideoReferenceSlots()
  const videoData = data as unknown as NodeV4VideoData
  /** 别人「连到镜头」连到这张卡时那一下高亮（spec §1.13）。 */
  const flashed = useNodeCardFlash(id)

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [quickLook, setQuickLook] = useState(false)
  const [assetPicker, setAssetPicker] = useState(false)
  const [hovering, setHovering] = useState(false)
  const [hoverProgress, setHoverProgress] = useState(0)
  const [draft, setDraft] = useState(videoData.prompt ?? '')
  const [syncedPrompt, setSyncedPrompt] = useState(videoData.prompt ?? '')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [renameRequest, setRenameRequest] = useState(0)
  /**
   * 从静帧那只 `<video>` 的元数据里读到的时长。
   *
   * ⚠ 手传进来的片子身上**没有** `durationSec`（上传补丁只回 url 与体积），而画板
   * 上「右下角只有时长」是有片卡唯一的读数 —— 没有它这张卡就什么都不写。⛔ 不写
   * `0s` 顶上：那是一句假话。
   */
  const [probedDuration, setProbedDuration] = useState<number | null>(null)
  /** `+` 的「上传」要落到哪个槽；`null` = 落到这张卡自己（成片）。 */
  const pendingSlotRef = useRef<NodeSlotId | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const frameVideoRef = useRef<HTMLVideoElement | null>(null)

  // 助手 `set_prompt` 落下来时草稿跟上 —— 渲染期同步，⛔ 不放 effect 里。
  const currentPrompt = videoData.prompt ?? ''
  if (syncedPrompt !== currentPrompt) {
    setSyncedPrompt(currentPrompt)
    setDraft(currentPrompt)
  }

  const generating = Boolean(videoData.mediaJobId) || startedAt !== null

  useEffect(() => {
    if (!generating) return
    const begin = startedAt ?? Date.now()
    const tick = () => setElapsed((Date.now() - begin) / 1000)
    tick()
    const timer = window.setInterval(tick, PROGRESS_TICK_MS)
    return () => window.clearInterval(timer)
  }, [generating, startedAt])

  // ⚠ 走「最新值 ref」而不是把依赖列进 `useCallback`：`useNodeUploadV4()` 每次渲染
  // 都返回一个新对象，列进去等于每渲染一次就把粘贴监听拆装一遍。
  const latest = useRef({ upload, canvas, id, name: videoData.name })
  useEffect(() => {
    latest.current = { upload, canvas, id, name: videoData.name }
  })

  /** 上传一份素材：给了槽就新建一张卡挂进那个槽，没给就落进这张卡自己。 */
  const runUpload = useCallback((file: File, slot: NodeSlotId | null) => {
    const bound = latest.current
    const kind = slot
      ? (SLOT_SOURCE_KINDS[slot] ?? NODE_MEDIA_KIND_IDS.image)
      : NODE_MEDIA_KIND_IDS.video
    void bound.upload.upload(kind, file, bound.name).then(async (patch) => {
      if (!patch?.url) return
      if (!slot) {
        bound.canvas.onSetMedia(bound.id, patch)
        return
      }
      const outcome = await bound.canvas.onApplyBatch([
        {
          op: NODE_ASSISTANT_OP_V4_IDS.addNode,
          kind,
          subtype:
            kind === NODE_MEDIA_KIND_IDS.image
              ? NODE_V4_IMAGE_SUBTYPE_IDS.shot
              : kind === NODE_MEDIA_KIND_IDS.video
                ? NODE_V4_VIDEO_SUBTYPE_IDS.clip
                : 'voice',
          ref: ASSET_BATCH_REF,
        },
        {
          op: NODE_ASSISTANT_OP_V4_IDS.connect,
          source: ASSET_BATCH_REF,
          target: bound.id,
          slot,
        },
      ])
      const created = outcome?.createdNodeIds?.[0]
      if (created) bound.canvas.onSetMedia(created, patch)
    })
  }, [])

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
      { kind: 'image' | 'video' | 'audio' | 'text'; thumbnailUrl?: string }
    >()
    for (const item of canvas.nodes) {
      const itemData = item.data
      if (itemData.kind === NODE_MEDIA_KIND_IDS.text) continue
      if (itemData.kind === NODE_MEDIA_KIND_IDS.audio) {
        byName.set(itemData.name, { kind: 'audio' })
        continue
      }
      byName.set(itemData.name, {
        kind: itemData.kind === NODE_MEDIA_KIND_IDS.video ? 'video' : 'image',
        ...(itemData.url ? { thumbnailUrl: itemData.url } : {}),
      })
    }
    return (name: string) => byName.get(name)
  }, [canvas.nodes])

  const node = canvas.nodes.find((item) => item.id === id) as NodeV4 | undefined
  if (!node) return null

  const displayName =
    videoData.subtype === NODE_V4_VIDEO_SUBTYPE_IDS.shot
      ? formatShotDisplayName(videoData.label, videoData.shotNo)
      : videoData.name
  const editName =
    videoData.subtype === NODE_V4_VIDEO_SUBTYPE_IDS.shot
      ? videoData.label
      : videoData.name

  const expanded = canvas.expandedNodeId === id
  const showChrome = Boolean(selected) && canvas.selectedNodeIds.length < 2
  const width = NODE_V4_CARD.collapsedWidth
  const height = videoCardHeight(width)
  const versions = videoVersions(videoData)
  const versionIndex = readOutputIndex(videoData)
  const modelOptions =
    canvas.modelOptionsByKind[NODE_MEDIA_KIND_IDS.video] ?? []
  const modelId = videoData.model?.modelId
  // 读数上写的是**型号名**（画板：`Seedance 2.0`），⛔ 不是落库的那串 id
  // ——与模型 chip 同一份译名表，两处对不上用户会以为选的是两个模型。
  const modelLabel = modelId
    ? getTranslatedModelLabel(tModels, modelId)
    : undefined
  // poster 两级：落库的封面 → 首帧槽的源图。⚠ ⛔ 不拿成片 url 当 poster：
  // `<img src={视频}>` 什么都画不出来（那是 v3 缩略图空白的老根）。
  const firstFrameSource = readSlotSources(
    node,
    NODE_SLOT_IDS.firstFrame,
    canvas.edges,
    canvas.nodes,
  )[0]
  const posterUrl =
    videoData.videoThumbnailUrl ??
    (firstFrameSource?.node.data.kind === NODE_MEDIA_KIND_IDS.image
      ? firstFrameSource.node.data.url
      : undefined)
  const durationSeconds =
    videoData.durationSec ??
    probedDuration ??
    Number(videoData.params?.duration) ??
    0

  const ports = getNodeV4Ports(node.data.kind, node.data.subtype)
  const dragSource = canvas.draggingFrom
    ? canvas.nodes.find((item) => item.id === canvas.draggingFrom)
    : undefined
  const litSlots = dragSource
    ? listLiveConnectableSlots(dragSource, node, canvas.edges, {
        nodes: canvas.nodes,
      })
    : []

  const selectVersion = (index: number) =>
    void canvas.onApplyOp({
      op: NODE_ASSISTANT_OP_V4_IDS.setOutputVersion,
      target: id,
      index,
    })

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

  const setParams = (patch: Partial<NonNullable<NodeV4VideoData['params']>>) =>
    canvas.onSetParams(id, { ...videoData.params, ...patch })

  const submitPrompt = () => {
    if (draft.trim().length === 0 || generating) return
    if (draft !== currentPrompt) canvas.onSetPrompt(id, draft)
    setStartedAt(Date.now())
    void generation
      .generateNode(
        id,
        { nodes: canvas.nodes, edges: canvas.edges },
        {
          prompt: draft,
          onJobCreated: (jobId) => canvas.onSetMedia(id, { mediaJobId: jobId }),
          onEach: (result) => {
            if (!result.success) return
            canvas.onSetMedia(id, {
              url: result.mediaUrl,
              generationId: result.generation.id,
              mediaJobId: undefined,
              ...(result.thumbnailUrl
                ? { videoThumbnailUrl: result.thumbnailUrl }
                : {}),
            })
          },
        },
      )
      .then(() => setStartedAt(null))
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
    const outcome = await canvas.onApplyBatch([
      {
        op: NODE_ASSISTANT_OP_V4_IDS.addNode,
        kind: NODE_MEDIA_KIND_IDS.image,
        subtype: NODE_V4_IMAGE_SUBTYPE_IDS.shot,
        ref: CONTINUE_BATCH_REFS.tail,
        name: tVideo('tailFrameName', { name: displayName }),
      },
      {
        op: NODE_ASSISTANT_OP_V4_IDS.addNode,
        kind: NODE_MEDIA_KIND_IDS.video,
        subtype: NODE_V4_VIDEO_SUBTYPE_IDS.shot,
        ref: CONTINUE_BATCH_REFS.shot,
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
        sourceHandle: NODE_SLOT_OUTPUT_IDS.tailFrame,
        target: CONTINUE_BATCH_REFS.shot,
        slot: NODE_SLOT_IDS.reference,
      },
    ])
    const tailId = outcome?.createdNodeIds?.[0]
    if (tailId) canvas.onSetMedia(tailId, { url: grabbed.url })
  }

  /** 抽帧：截当前画面 → 落成一张图片卡 → 连线**指回**这一段的参考槽。 */
  const runExtract = async (video: HTMLVideoElement) => {
    const grabbed = await frames.captureCurrentFrame(video, displayName)
    if (!grabbed.ok) {
      reportCaptureFailure(grabbed.reasonKey)
      return
    }
    const outcome = await canvas.onApplyBatch([
      {
        op: NODE_ASSISTANT_OP_V4_IDS.addNode,
        kind: NODE_MEDIA_KIND_IDS.image,
        subtype: NODE_V4_IMAGE_SUBTYPE_IDS.shot,
        ref: ASSET_BATCH_REF,
      },
      {
        op: NODE_ASSISTANT_OP_V4_IDS.connect,
        source: ASSET_BATCH_REF,
        target: id,
        slot: NODE_SLOT_IDS.reference,
      },
    ])
    const created = outcome?.createdNodeIds?.[0]
    if (created) canvas.onSetMedia(created, { url: grabbed.url })
  }

  /** 栏首行那排小 chip：已挂的首帧 / 尾帧 / 语音。 */
  const slotChips: readonly VideoSlotChipItem[] = CHIP_SLOTS.flatMap((slot) =>
    readSlotSources(node, slot, canvas.edges, canvas.nodes).map((source) => {
      const sourceData = source.node.data
      return {
        slot,
        edgeId: source.edgeId,
        sourceNodeId: source.node.id,
        sourceName: sourceData.name,
        ...(sourceData.kind === NODE_MEDIA_KIND_IDS.audio
          ? { waveform: true }
          : sourceData.kind !== NODE_MEDIA_KIND_IDS.text && sourceData.url
            ? { thumbnailUrl: sourceData.url }
            : {}),
      }
    }),
  )

  const slotCandidatesOf = (slot: NodeSlotId) => {
    const kind = SLOT_SOURCE_KINDS[slot]
    return canvas.nodes
      .filter(
        (item) =>
          item.id !== id &&
          item.data.kind === kind &&
          'url' in item.data &&
          Boolean(item.data.url),
      )
      .map((item) => ({ id: item.id, name: item.data.name }))
  }

  const openFilePicker = (slot: NodeSlotId | null) => {
    pendingSlotRef.current = slot
    fileRef.current?.click()
  }

  const toolbarGroups: readonly NodeToolbarGroup[] = [
    [
      {
        id: 'continue',
        label: tVideo('toolbar.continue'),
        icon: StepForward,
        disabled: !videoData.url || frames.grabbing !== null,
        onSelect: () => void runContinue(),
      },
      {
        id: 'extract',
        label: tVideo('toolbar.extract'),
        icon: Scissors,
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
            onSplitVersion={
              versions.length > 1
                ? () =>
                    void canvas.onApplyOp({
                      op: NODE_ASSISTANT_OP_V4_IDS.splitOutputVersion,
                      target: id,
                      index: versionIndex,
                    })
                : undefined
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

  const paramsChip = (
    <VideoFrameChip
      params={videoData.params}
      modelId={modelId}
      disabled={generating}
      onDurationChange={(duration) => setParams({ duration })}
      onAspectRatioChange={(aspectRatio) => setParams({ aspectRatio })}
      onResolutionChange={(resolution) => setParams({ resolution })}
      onGenerateAudioChange={(generateAudio) => setParams({ generateAudio })}
    />
  )

  const modelChip =
    modelOptions.length > 0 ? (
      <ModelPickerPopover
        options={modelOptions.map(toStudioModelOption)}
        value={videoData.model?.optionId ?? null}
        memoryScope={NODE_MEDIA_KIND_IDS.video}
        disabled={generating}
        triggerEmptyLabel={tVideo('model.title')}
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
    ) : null

  return (
    <div
      data-node-kind={NODE_MEDIA_KIND_IDS.video}
      data-node-subtype={videoData.subtype}
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
      }}
      onDrop={(event) => {
        const file = Array.from(event.dataTransfer?.files ?? []).find(
          (item) =>
            item.type.startsWith('video/') || item.type.startsWith('image/'),
        )
        if (!file) return
        event.preventDefault()
        event.stopPropagation()
        // 画板：拖一张**图**到视频卡上 = 直接当首帧（已有首帧则当尾帧）；
        // 拖视频进来则是这张卡自己的成片。
        if (file.type.startsWith('image/')) {
          runUpload(
            file,
            firstFrameSource
              ? NODE_SLOT_IDS.lastFrame
              : NODE_SLOT_IDS.firstFrame,
          )
          return
        }
        runUpload(file, null)
      }}
      onDoubleClick={() => {
        if (videoData.url) setQuickLook(true)
      }}
    >
      <FlowNodeToolbar
        isVisible={showChrome && !expanded}
        position={Position.Top}
      >
        <NodeToolbar
          groups={toolbarGroups}
          ariaLabel={tVideo('toolbar.label')}
        />
      </FlowNodeToolbar>

      <NodeCardShell
        name={displayName}
        editName={editName}
        renameAriaLabel={t('renameNode')}
        onRename={renameNode}
        renameRequest={renameRequest}
        selected={Boolean(selected)}
        expanded={expanded}
        width={width}
        emptyHint={t('chrome.emptyHint')}
        emptyAddAriaLabel={tVideo('add.upload')}
        emptyHeight={height}
        onEmptyAdd={() => openFilePicker(null)}
        surfaceClassName="overflow-hidden"
        changed={canvas.changedNodeIds.includes(id) || flashed}
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
        {videoData.url || generating ? (
          <div
            data-video-surface={videoData.url ? 'ready' : 'pending'}
            className="relative"
            style={{ height }}
            onMouseEnter={() => {
              if (!videoData.url || generating) return
              setHovering(true)
            }}
            onMouseLeave={() => {
              setHovering(false)
              setHoverProgress(0)
            }}
          >
            {/* 封面。⚠ 悬停时那只 `<video>` 盖在它上面 —— ⛔ 不换掉它：
                换掉会在视频首帧解码出来之前闪一下白。 */}
            {posterUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={posterUrl}
                alt={displayName}
                draggable={false}
                className="size-full rounded-node object-cover corner-squircle"
              />
            ) : videoData.url ? (
              // 没有落库封面时，静帧就是这段片子自己的第一帧 —— 一只
              // `preload="metadata"` 的 `<video>`。⛔ 不用 `<img src={视频}>`：
              // 那什么都画不出来（v3 缩略图空白的老根）。顺带把时长读回来。
              <video
                src={videoData.url}
                muted
                playsInline
                preload="metadata"
                aria-label={displayName}
                data-video-still
                className="size-full rounded-node object-cover corner-squircle"
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

            {hovering && videoData.url ? (
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

            {/* 右下角只有时长（画板 65 行）。⛔ 没有播放钮、没有角标、没有槽。 */}
            {videoData.url && durationSeconds > 0 && !hovering ? (
              <span
                data-video-duration
                className="absolute right-2 bottom-2 rounded-full px-1.75 py-0.5 text-3xs tabular-nums surface-glass"
              >
                {formatVideoSeconds(durationSeconds)}
              </span>
            ) : null}

            {generating && (
              <NodeFrameProgress
                elapsedSeconds={elapsed}
                stageLabel={tStage(
                  `generatingOverlayStages.${getGeneratingStageKey(elapsed)}` as const,
                )}
              />
            )}
          </div>
        ) : undefined}
      </NodeCardShell>

      {showChrome && !expanded && (
        <FlowNodeToolbar isVisible position={Position.Bottom}>
          <div className="flex flex-col items-center gap-2.5">
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
              // 栏**内**首行：已挂的首帧 / 尾帧 / 语音（画板 `VideoSelected.dc.html`
              // 第 57 行 —— 那排 chip 与正文同一片玻璃，⛔ 不是栏上方另一条）。
              leadingRow={
                slotChips.length > 0 ? (
                  <VideoSlotChips
                    items={slotChips}
                    onOpen={canvas.onFocusNode}
                    onRemove={(edgeId) =>
                      void canvas.onApplyOp({
                        op: NODE_ASSISTANT_OP_V4_IDS.disconnect,
                        edgeId,
                      })
                    }
                  />
                ) : null
              }
              value={draft}
              onValueChange={setDraft}
              onSubmit={submitPrompt}
              generating={generating}
              onCancel={() => setStartedAt(null)}
              placeholder={tVideo('promptPlaceholder')}
              ariaLabel={tVideo('promptLabel')}
              className="w-95"
              addMenu={
                <VideoAddMenuItems
                  candidatesOf={slotCandidatesOf}
                  onPickSlotSource={(slot, sourceNodeId) =>
                    void canvas.onApplyOp({
                      op: NODE_ASSISTANT_OP_V4_IDS.connect,
                      source: sourceNodeId,
                      target: id,
                      slot,
                    })
                  }
                  onUploadForSlot={(slot) => openFilePicker(slot)}
                  onUpload={() => openFilePicker(null)}
                  onMention={() => setDraft(`${draft}@`)}
                  onLibrary={() => setAssetPicker(true)}
                />
              }
              chips={[paramsChip, modelChip].filter(Boolean)}
            />
          </div>
        </FlowNodeToolbar>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="video/*,image/*,audio/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) runUpload(file, pendingSlotRef.current)
          pendingSlotRef.current = null
          event.target.value = ''
        }}
      />

      {expanded ? (
        <VideoNodeFrame
          open
          onClose={() => canvas.onToggleExpanded(id)}
          nodeId={id}
          title={displayName}
          headline={[
            durationSeconds > 0 ? formatVideoSeconds(durationSeconds) : null,
            videoData.params?.aspectRatio,
            videoData.params?.resolution,
            modelLabel,
          ]
            .filter(Boolean)
            .join(' · ')}
          url={videoData.url}
          posterUrl={posterUrl}
          onExtractFrame={(video) => void runExtract(video)}
          extracting={frames.grabbing !== null}
          onDownload={() =>
            videoData.url && triggerNodeV4Download(videoData.url)
          }
          versionCount={versions.length}
          versionIndex={versionIndex}
          onVersionChange={selectVersion}
          body={currentPrompt}
          onSave={(body) => canvas.onSetPrompt(id, body)}
          onRegenerate={submitPrompt}
          regenerateDisabled={generating || currentPrompt.trim().length === 0}
          footerReadout={tVideo('frame.readout', {
            chars: currentPrompt.trim().length,
            slots: slotChips.length,
          })}
          paramsChip={paramsChip}
          modelChip={modelChip}
          tokens={tokens}
          candidates={candidates}
          onMentionSelect={(candidate, handle) =>
            handle.insertToken(candidate.name)
          }
          mediaOf={mediaOf}
        />
      ) : null}

      {quickLook && videoData.url ? (
        <QuickLook
          open
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

      {assetPicker ? (
        <AssetSelectorDialog
          open
          onOpenChange={setAssetPicker}
          mediaType="video"
          title={tVideo('add.library')}
          description={tVideo('add.library')}
          onSelect={(record) => {
            canvas.onSetMedia(id, { url: record.url })
            setAssetPicker(false)
          }}
        />
      ) : null}

      {menu ? (
        <NodeV4ContextMenu
          node={node}
          x={menu.x}
          y={menu.y}
          {...(videoData.url ? { mediaUrl: videoData.url } : {})}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </div>
  )
}
