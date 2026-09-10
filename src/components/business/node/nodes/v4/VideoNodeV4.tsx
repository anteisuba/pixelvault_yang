'use client'

/**
 * 视频节点（v3 spec §5，画板 `VideoStates` / `VideoSelected` / `VideoPopover` /
 * `VideoExpanded` / `VideoQuickLook`）。
 *
 * 五态：**空卡**（16:9 虚线框 + 一句提示，⌘V / 拖入都落进这张卡）· **有片收起**
 * （卡即封面、右下角只有时长；悬停静音自动播 + 底部细进度线 + 右上静音标）·
 * **选中**（工具条 `续拍 · 抽帧 · 下载 · ⋯` 浮在卡上，版本点 + 已挂小 chip + 提示词栏
 * 浮在卡下）· **生成中**（裱框显影 + 栏变灰可取消）· **展开**（画中框 720：播放器 +
 * 镜头说明 + 生成行 + 写作助手栏）。**双击 = 展开**；快速看片走空格与 ⋯ 菜单
 * （2026-09-10 owner 真机反馈第四条）。
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
  Maximize2,
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
import { readOutputIndex, readOutputVersions } from '@/lib/node-output-versions'
import { pickDefaultModelOption } from '@/lib/pick-default-model-option'
import { listLiveConnectableSlots } from '@/lib/node-slot-binding'
import { readSlotSources } from '@/lib/node-slot-payload'
import {
  readVideoRail,
  videoRailCounts,
  videoRailMentionLabels,
  VIDEO_RAIL_GROUP_IDS,
  type VideoRailEntry,
  type VideoRailGroupId,
} from '@/lib/video-node-rail'
import type {
  MentionCandidate,
  MentionToken,
} from '@/components/ui/mention-input'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type {
  NodeV4,
  NodeV4VideoData,
  NodeWorkflowModelSelection,
} from '@/types/node-workflow'

import {
  NodeCardShell,
  NodeFrameProgress,
  NodePromptBar,
  NodeToolbar,
  QuickLook,
  VersionDots,
  renderPromptMentions,
  useNodeCardFlash,
  type MentionChipMedia,
  type MentionPickerOption,
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
import { VideoRefRail } from './video/VideoRefRail'
import {
  formatVideoSeconds,
  videoCardHeight,
  videoEffectiveParams,
  videoRailCapacity,
  videoSendMode,
  videoVersions,
} from './video/video-node-model'
import { ModelPickerPopover } from '../../../studio-shared/pickers/ModelPickerPopover'

/** 「续拍」那一批里的两个别名（只在这一批之内有效）。 */
const CONTINUE_BATCH_REFS = { tail: 'tail', shot: 'shot' } as const
/** 「抽帧」与「+ 上传落槽」那一批里指代新建素材卡的别名。 */
const ASSET_BATCH_REF = 'asset'

/**
 * 参考轨三组各自的 **kind 与落点**（画板 `VideoRefs.dc.html` 方向 A）。
 *
 * 图与视频同落 `reference`（图默认作参考，首 / 尾是它的角色，在轨上点图改），
 * 语音落 `voice`。⛔ 这不是合法性判据 —— 落不落得下仍由 `canConnect` 说。
 */
const RAIL_GROUP_TARGETS: Readonly<
  Record<
    VideoRailGroupId,
    { readonly kind: 'image' | 'video' | 'audio'; readonly slot: NodeSlotId }
  >
> = {
  [VIDEO_RAIL_GROUP_IDS.image]: {
    kind: NODE_MEDIA_KIND_IDS.image,
    slot: NODE_SLOT_IDS.reference,
  },
  [VIDEO_RAIL_GROUP_IDS.video]: {
    kind: NODE_MEDIA_KIND_IDS.video,
    slot: NODE_SLOT_IDS.reference,
  },
  [VIDEO_RAIL_GROUP_IDS.voice]: {
    kind: NODE_MEDIA_KIND_IDS.audio,
    slot: NODE_SLOT_IDS.voice,
  },
}

/** 上传 / 素材库落进轨时新建的那张卡是什么子型。 */
const RAIL_SUBTYPE_OF: Readonly<Record<'image' | 'video' | 'audio', string>> = {
  [NODE_MEDIA_KIND_IDS.image]: NODE_V4_IMAGE_SUBTYPE_IDS.shot,
  [NODE_MEDIA_KIND_IDS.video]: NODE_V4_VIDEO_SUBTYPE_IDS.clip,
  [NODE_MEDIA_KIND_IDS.audio]: 'voice',
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
  /** 素材库开在哪一组（`null` = 没开）—— 选中后按组新建卡并挂进轨。 */
  const [assetPicker, setAssetPicker] = useState<VideoRailGroupId | null>(null)
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
  /** `+` / 轨上加号的「上传」要落到哪一组；`null` = 落到这张卡自己（成片）。 */
  const pendingTargetRef = useRef<VideoRailGroupId | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const frameVideoRef = useRef<HTMLVideoElement | null>(null)
  const promptInputRef = useRef<HTMLTextAreaElement>(null)

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

  /**
   * 一批 op **之后**的媒体回填。
   *
   * ⚠ 必须用**批之后**那份 `canvas`：`onSetMedia` 闭包着调用时的图，拿批之前那
   * 份写回去，等于把刚建出来的卡与边一起抹掉（2026-09-10 真机实测：素材库落卡
   * 后节点凭空消失）。所以这里等到新卡出现在 `latest.current` 里再写。
   */
  const backfillMedia = useCallback(
    (nodeId: string, patch: { readonly url: string }) => {
      const step = (attempt: number): void => {
        const fresh = latest.current.canvas
        if (fresh.nodes.some((item) => item.id === nodeId) || attempt >= 10) {
          fresh.onSetMedia(nodeId, patch)
          return
        }
        requestAnimationFrame(() => step(attempt + 1))
      }
      step(0)
    },
    [],
  )

  /**
   * 新建一张卡挂进轨的某一组 —— **上传与素材库共用这一条**（画板：两条来路落点
   * 相同，⛔ 素材库不再 `onSetMedia` 换本片）。
   */
  const attachToRail = useCallback(
    async (group: VideoRailGroupId, patch: { readonly url: string }) => {
      const bound = latest.current
      const target = RAIL_GROUP_TARGETS[group]
      const outcome = await bound.canvas.onApplyBatch([
        {
          op: NODE_ASSISTANT_OP_V4_IDS.addNode,
          kind: target.kind,
          subtype: RAIL_SUBTYPE_OF[target.kind],
          ref: ASSET_BATCH_REF,
        },
        {
          op: NODE_ASSISTANT_OP_V4_IDS.connect,
          source: ASSET_BATCH_REF,
          target: bound.id,
          slot: target.slot,
        },
      ] as readonly NodeAssistantOpV4[])
      const created = outcome?.createdNodeIds?.[0]
      if (created) backfillMedia(created, patch)
    },
    [backfillMedia],
  )

  /** 上传一份素材：给了组就新建一张卡挂进轨，没给就落进这张卡自己（成片）。 */
  const runUpload = useCallback(
    (file: File, group: VideoRailGroupId | null) => {
      const bound = latest.current
      const kind = group
        ? RAIL_GROUP_TARGETS[group].kind
        : NODE_MEDIA_KIND_IDS.video
      void bound.upload.upload(kind, file, bound.name).then((patch) => {
        if (!patch?.url) return
        if (!group) {
          bound.canvas.onSetMedia(bound.id, patch)
          return
        }
        void attachToRail(group, { ...patch, url: patch.url })
      })
    },
    [attachToRail],
  )

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
  const modelOptions = useMemo(
    () => canvas.modelOptionsByKind[NODE_MEDIA_KIND_IDS.video] ?? [],
    [canvas.modelOptionsByKind],
  )
  /**
   * 新卡即带的默认模型（spec §5「参数 chip 永不为空」）。
   *
   * ⚠ **只派生不落库**：落库要走 `set_model` op，那会给「刚建好一张卡」平白多出
   * 一个撤销条目（⌘Z 变成「清掉模型」而不是「撤掉这张卡」）。真正写进节点的时机
   * 是用户按下生成那一下 —— 那时它已经是用户的动作。
   *
   * ⚠ 健康度这一档不参与：它要 `ApiKeysProvider`，而节点卡在没有模型清单时并不
   * 渲染选择器（也就不在那个 provider 的保证之内）。档 / 价 / 清单顺序三档一致，
   * 与选择器同一条 `resolveModelChannel`。
   */
  const defaultModel = useMemo<NodeWorkflowModelSelection | undefined>(() => {
    const picked = pickDefaultModelOption(modelOptions.map(toStudioModelOption))
    const source = picked
      ? modelOptions.find((item) => item.optionId === picked.optionId)
      : undefined
    if (!source) return undefined
    return {
      optionId: source.optionId,
      modelId: source.modelId,
      adapterType: source.adapterType,
      providerConfig: source.providerConfig,
      ...(source.apiKeyId ? { apiKeyId: source.apiKeyId } : {}),
    }
  }, [modelOptions])

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
  /**
   * 当前版的来源（⋯ 里那一行只读小字）。今天只有剪辑台导出的成片会写它
   * （`source.kind === 'render'`，`node-canvas-v2.md` §6「导出」）——本卡自己生成
   * 的版本没有来源，整行不出。
   */
  const currentSourceLabel =
    readOutputVersions(videoData)[versionIndex]?.source?.label
  /** 卡上生效的模型 = 用户选过的，否则默认那条。 */
  const effectiveModel = videoData.model ?? defaultModel
  const modelId = effectiveModel?.modelId
  /** 生效的参数 = 存着的 + 这个模型的默认档（⛔ chip 上不留空）。 */
  const effectiveParams = videoEffectiveParams(videoData.params, modelId)
  // 读数上写的是**型号名**（画板：`Seedance 2.0`），⛔ 不是落库的那串 id
  // ——与模型 chip 同一份译名表，两处对不上用户会以为选的是两个模型。
  const modelLabel = modelId
    ? getTranslatedModelLabel(tModels, modelId)
    : undefined

  /* ── 参考轨（spec §5，画板 `VideoRefs.dc.html` 方向 A）─────────────── */
  const railItems = readVideoRail(node, canvas.edges, canvas.nodes)
  const railCounts = videoRailCounts(railItems)
  const sendMode = videoSendMode({
    firstFrame: railCounts.firstFrame,
    lastFrame: railCounts.lastFrame,
    referenceImages: railCounts.referenceImages,
    videos: railCounts.video,
    voices: railCounts.voice,
  })
  const railCapacity = videoRailCapacity(effectiveModel)
  const railNames = railItems.flatMap((entry) => videoRailMentionLabels(entry))
  /**
   * `@图1` 这类序号引用的缩略 —— 与轨上画的是同一张图（序号也是同一份）。
   * ⛔ 不另查一次节点：轨已经把来源与缩略算好了。
   */
  const mentionMediaOf = (name: string) => {
    const entry = railItems.find((item) =>
      videoRailMentionLabels(item).includes(name),
    )
    if (!entry) return mediaOf(name)
    if (entry.group === VIDEO_RAIL_GROUP_IDS.voice)
      return { kind: 'audio' as const }
    return {
      kind:
        entry.group === VIDEO_RAIL_GROUP_IDS.video
          ? ('video' as const)
          : ('image' as const),
      ...(entry.thumbnailUrl ? { thumbnailUrl: entry.thumbnailUrl } : {}),
    }
  }
  /** `@` 候选与胶囊上的缩略 —— 与轨、与画布上的卡同一份。 */
  const mentionOptionMedia = (name: string): MentionChipMedia | undefined => {
    const found = mentionMediaOf(name)
    if (!found) return undefined
    if (found.kind === 'audio') return { kind: 'audio' }
    if (found.kind === 'text') return { kind: 'text' }
    return {
      kind: found.kind,
      ...(found.thumbnailUrl ? { thumbnailUrl: found.thumbnailUrl } : {}),
    }
  }
  /**
   * 轨上的序号项**也是引用物种**（`@图1`）：它们与画布上的卡拼成同一份候选与同
   * 一份胶囊表，提示词栏与画中框读的都是这一份。⛔ 不在两处各拼一次。
   */
  const railTokens: MentionToken[] = railItems.flatMap((entry) =>
    videoRailMentionLabels(entry).map((label) => ({
      name: label,
      kind:
        entry.group === VIDEO_RAIL_GROUP_IDS.voice
          ? ('voice' as const)
          : entry.group === VIDEO_RAIL_GROUP_IDS.video
            ? ('video' as const)
            : ('shot' as const),
      ...(entry.thumbnailUrl ? { thumbnailUrl: entry.thumbnailUrl } : {}),
    })),
  )
  /**
   * ⚠ 候选里每一项**只出当前界面语言那一个写法**（`图1` / `画像1` / `image1` 三
   * 个串解析时都认，但列表里摆三份等于同一项出现三次）。
   */
  const railCandidates: MentionCandidate[] = railItems.map((entry) => {
    const label = `${tVideo(`rail.group.${entry.group}`)}${entry.index}`
    return {
      id: `rail:${entry.edgeId}`,
      name: label,
      groupLabel: tVideo('rail.mentionGroup'),
      group: 'rail',
      ...(entry.thumbnailUrl ? { thumbnailUrl: entry.thumbnailUrl } : {}),
    }
  })
  const frameTokens = [...railTokens, ...tokens]
  const frameCandidates = [...railCandidates, ...candidates]
  const mentionOptions: MentionPickerOption[] = frameCandidates.map(
    (candidate) => {
      const media = mentionOptionMedia(candidate.name)
      return {
        id: candidate.id,
        name: candidate.name,
        groupLabel: candidate.groupLabel ?? tVideo('rail.mentionGroup'),
        ...(media ? { media } : {}),
      }
    },
  )

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
    // 默认模型 / 默认档到这一刻才落库：用户按了生成，它就是**用户的**选择了
    // （⛔ 不在挂载时写，那会给新建一张卡多出一个撤销条目）。
    if (!videoData.model && effectiveModel)
      canvas.onSetModel(id, effectiveModel)
    if (!videoData.params) canvas.onSetParams(id, effectiveParams)
    // ⚠ 这一枪读的图是**打过补丁的**那份：上面两次写是异步落库，这一帧的
    // `canvas.nodes` 还是旧的，照它发出去就会少掉模型（发不出）与默认档。
    const nodes = canvas.nodes.map((item) =>
      item.id === id
        ? ({
            ...item,
            data: {
              ...item.data,
              ...(effectiveModel ? { model: effectiveModel } : {}),
              params: effectiveParams,
            },
          } as NodeV4)
        : item,
    )
    setStartedAt(Date.now())
    void generation
      .generateNode(
        id,
        { nodes, edges: canvas.edges },
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
    if (tailId) backfillMedia(tailId, { url: grabbed.url })
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
    if (created) backfillMedia(created, { url: grabbed.url })
  }

  /** 「画布上的 X ›」的候选。⚠ 只列**有产物**的卡：挂一张还没生成出来的空卡，
   *  生成时那一格发不出去，用户却以为已经挂好了。 */
  const railCandidatesOf = (group: VideoRailGroupId) => {
    const kind = RAIL_GROUP_TARGETS[group].kind
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

  const openFilePicker = (group: VideoRailGroupId | null) => {
    pendingTargetRef.current = group
    fileRef.current?.click()
  }

  /** 轨上的公共动作 —— 提示词栏与画中框摆的是同一个组件、同一批回调。 */
  const railProps = {
    items: railItems,
    capacity: railCapacity,
    referenceUnavailable: railCapacity.referenceUnavailable,
    disabled: generating,
    onOpen: canvas.onFocusNode,
    onRemove: (edgeId: string) =>
      void canvas.onApplyOp({
        op: NODE_ASSISTANT_OP_V4_IDS.disconnect,
        edgeId,
      }),
    // 换角色 = 同一批 `disconnect + connect(slot)` —— **一条撤销**，
    // ⛔ 不发两个 op（那会让用户按两次 ⌘Z 才回到原样，中间还路过一个断开态）。
    onChangeRole: (item: VideoRailEntry, slot: NodeSlotId) =>
      void canvas.onApplyBatch([
        { op: NODE_ASSISTANT_OP_V4_IDS.disconnect, edgeId: item.edgeId },
        {
          op: NODE_ASSISTANT_OP_V4_IDS.connect,
          source: item.sourceNodeId,
          target: id,
          slot,
        },
      ] as readonly NodeAssistantOpV4[]),
    candidatesOf: railCandidatesOf,
    onPickFromCanvas: (group: VideoRailGroupId, sourceNodeId: string) =>
      void canvas.onApplyOp({
        op: NODE_ASSISTANT_OP_V4_IDS.connect,
        source: sourceNodeId,
        target: id,
        slot: RAIL_GROUP_TARGETS[group].slot,
      }),
    onUpload: (group: VideoRailGroupId) => openFilePicker(group),
    // ⚠ 弹层要等菜单**关完**再开：Radix 的菜单与对话框各自往 `body` 上写
    // `pointer-events:none`，同一帧里一开一关会把它留在 body 上，整页从此点不动
    // （2026-09-10 真机实测）。⛔ 不要改成同帧直接 setState。
    onLibrary: (group: VideoRailGroupId) =>
      window.setTimeout(() => setAssetPicker(group), 0),
  }

  const toolbarGroups: readonly NodeToolbarGroup[] = [
    [
      {
        // 画板：工具条第一键 = 展开（画中框）。双击仍是快速看片，右键菜单里的
        // 「展开」保留 —— 三条路进的是同一个框。
        id: 'expand',
        label: tVideo('toolbar.expand'),
        icon: Maximize2,
        onSelect: () => canvas.onToggleExpanded(id),
      },
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

  const railReadoutGroups = [
    {
      label: tVideo('rail.group.image'),
      current: railCounts.image,
      limit: railCapacity.images,
    },
    {
      label: tVideo('rail.group.video'),
      current: railCounts.video,
      limit: railCapacity.videos,
    },
    {
      label: tVideo('rail.group.voice'),
      current: railCounts.voice,
      limit: railCapacity.voices,
    },
  ]

  const paramsChip = (
    <VideoFrameChip
      key="frame"
      params={effectiveParams}
      modelId={modelId}
      {...(modelId ? { modeLabel: tVideo(`mode.${sendMode}`) } : {})}
      modeHint={tVideo('mode.hint')}
      readoutGroups={railReadoutGroups}
      {...(railCapacity.referenceUnavailable
        ? { referenceNote: tVideo('rail.referenceUnavailable') }
        : {})}
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
        key="model"
        options={modelOptions.map(toStudioModelOption)}
        value={effectiveModel?.optionId ?? null}
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
      onDoubleClick={() => canvas.onToggleExpanded(id)}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key !== ' ' || expanded) return
        // 栏里 / 框里打字的空格不是快捷键。
        if (event.target !== event.currentTarget) return
        event.preventDefault()
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
              leadingRow={<VideoRefRail {...railProps} />}
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
                  candidatesOf={railCandidatesOf}
                  onPickSlotSource={railProps.onPickFromCanvas}
                  onUploadForSlot={(group) => openFilePicker(group)}
                  onUpload={() => openFilePicker(null)}
                  onMention={() => {
                    setDraft(`${draft}@`)
                    // 插完 `@` 把光标交回正文 —— 候选列表是跟着光标弹的。
                    window.setTimeout(() => promptInputRef.current?.focus(), 0)
                  }}
                  onLibrary={() =>
                    railProps.onLibrary(VIDEO_RAIL_GROUP_IDS.image)
                  }
                />
              }
              inputRef={promptInputRef}
              mentionOptions={mentionOptions}
              renderValue={(value) =>
                renderPromptMentions(value, {
                  names: [...railNames, ...tokens.map((token) => token.name)],
                })
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
          if (file) runUpload(file, pendingTargetRef.current)
          pendingTargetRef.current = null
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
            slots: railItems.length,
          })}
          paramsChip={paramsChip}
          modelChip={modelChip}
          refRail={<VideoRefRail {...railProps} />}
          tokens={frameTokens}
          candidates={frameCandidates}
          onMentionSelect={(candidate, handle) =>
            handle.insertToken(candidate.name)
          }
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
          onOpenChange={(next) => {
            if (!next) setAssetPicker(null)
          }}
          mediaType={RAIL_GROUP_TARGETS[assetPicker].kind}
          title={tVideo('add.library')}
          description={tVideo('add.library')}
          onSelect={(record) => {
            // 素材库与上传落的是**同一条**创建路径：新建一张对应 kind 的卡
            // （url 落卡）再连到槽。⛔ 不 `onSetMedia` 换本片 —— 本片替换只留在
            // `+` 菜单的「上传视频 / 图」。
            if (record.url) void attachToRail(assetPicker, { url: record.url })
            setAssetPicker(null)
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
