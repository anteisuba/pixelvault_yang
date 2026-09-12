'use client'

/**
 * 视频卡的**编排件**（参考轨 + 提示词草稿 + 参数 chip + 模型 chip + 发送）——
 * 桌面卡（`VideoNodeV4`）与手机镜头带的底部抽屉（`mobile/MobileNodeSheet`）
 * 共用**这一份**。
 *
 * ⚠ 存在理由（S12）：手机抽屉要的正是桌面提示词栏那一栏的内容。把它在两处各写
 * 一遍，就会出现「桌面挂参考走 `attachToRail`（新建卡 + 连槽，一条撤销），手机上
 * 走另一条」这类语义漂移 —— 而参考轨就是连线，两条路径写出来的图必须一模一样。
 *
 * ── 边界 ────────────────────────────────────────────────────────────────
 * 只管**编排**：轨、草稿、参数、模型、发送。⛔ 不管卡的长相（封面 / 悬停播 /
 * 工具条 / 画中框 / 快速看 / 右键菜单）——那些是各自形态的事。轨那一半单独住在
 * `use-video-rail-binding`（手机列表卡只要它，⛔ 不为一屏几十张卡各算一遍模型表）。
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import type { ReactNode } from 'react'

import { PROGRESS_TICK_MS } from '@/constants/generation-progress'
import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { NODE_SLOT_IDS } from '@/constants/node-slots'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { useNodeMediaGenerationV4 } from '@/hooks/node/use-node-media-generation-v4'
import { cancelGenerationsAPI, checkVideoStatusAPI } from '@/lib/api-client'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { readOutputIndex, readOutputVersions } from '@/lib/node-output-versions'
import { readSlotSources } from '@/lib/node-slot-payload'
import { pickDefaultModelOption } from '@/lib/pick-default-model-option'
import {
  videoRailMentionLabels,
  VIDEO_RAIL_GROUP_IDS,
  type VideoRailGroupId,
} from '@/lib/video-node-rail'
import { videoRailCounts } from '@/lib/video-node-rail'
import type {
  MentionCandidate,
  MentionToken,
} from '@/components/ui/mention-input'
import type {
  NodeV4,
  NodeV4VideoData,
  NodeWorkflowModelSelection,
} from '@/types/node-workflow'

import {
  NodeModelChip,
  renderPromptMentions,
  type MentionChipMedia,
  type MentionPickerOption,
} from '../chrome'
import { useNodeV4Canvas } from '../NodeV4Context'
import { toStudioModelOption } from '../image/image-node-model'
import { VideoFrameChip } from './VideoFrameChip'
import {
  useVideoRailBinding,
  type VideoRailBinding,
} from './use-video-rail-binding'
import {
  videoEffectiveParams,
  videoSendMode,
  videoVersions,
} from './video-node-model'

export interface VideoComposerOptions {
  readonly id: string
  readonly videoData: NodeV4VideoData
  /** 卡上显示的名字（镜头带带 `S02·` 前缀）——上传时当备注写。 */
  readonly displayName: string
  /** 画布上的 `@` 候选与胶囊（由调用方按自己那份 tokens 拼好传进来）。 */
  readonly tokens: readonly MentionToken[]
  readonly candidates: readonly MentionCandidate[]
  readonly mediaOf: (
    name: string,
  ) =>
    | { kind: 'image' | 'video' | 'audio' | 'text'; thumbnailUrl?: string }
    | undefined
}

export interface VideoComposer extends Omit<
  VideoRailBinding,
  'items' | 'candidatesOf' | 'capacity'
> {
  readonly generating: boolean
  readonly elapsed: number
  readonly draft: string
  setDraft(next: string): void
  readonly currentPrompt: string
  submitPrompt(): void
  cancelGeneration(): void

  readonly railItems: VideoRailBinding['items']
  readonly railCandidatesOf: VideoRailBinding['candidatesOf']

  readonly paramsChip: ReactNode
  readonly modelChip: ReactNode
  readonly mentionOptions: readonly MentionPickerOption[]
  readonly frameTokens: readonly MentionToken[]
  readonly frameCandidates: readonly MentionCandidate[]
  renderPromptValue(value: string): ReactNode

  readonly versions: readonly string[]
  readonly versionIndex: number
  selectVersion(index: number): void
  readonly currentSourceLabel: string | undefined

  readonly posterUrl: string | undefined
  readonly modelLabel: string | undefined
  readonly effectiveModel: NodeWorkflowModelSelection | undefined
  readonly effectiveParams: ReturnType<typeof videoEffectiveParams>
}

export function useVideoComposer({
  id,
  videoData,
  displayName,
  tokens,
  candidates,
  mediaOf,
}: VideoComposerOptions): VideoComposer {
  const tCancel = useTranslations('GenerationCancel')
  const tVideo = useTranslations('StudioNode.v4.video')
  const tModels = useTranslations('Models')
  const canvas = useNodeV4Canvas()
  const generation = useNodeMediaGenerationV4()

  const [draft, setDraft] = useState(videoData.prompt ?? '')
  const [syncedPrompt, setSyncedPrompt] = useState(videoData.prompt ?? '')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const runRef = useRef(0)
  const jobRef = useRef(videoData.mediaJobId)
  const cancelRequestedRef = useRef(false)
  const cancellingRef = useRef(false)
  useEffect(() => {
    jobRef.current = videoData.mediaJobId
  }, [videoData.mediaJobId])

  const cancelGeneration = async () => {
    cancelRequestedRef.current = true
    const jobId = jobRef.current
    if (!jobId || cancellingRef.current) return
    cancellingRef.current = true
    const run = runRef.current
    try {
      const response = await cancelGenerationsAPI([jobId])
      if (run !== runRef.current || jobRef.current !== jobId) return
      if (!response.success || !response.data) throw new Error('cancelFailed')
      if (response.data.alreadyFinished.includes(jobId)) {
        const probe = await checkVideoStatusAPI(jobId)
        if (run !== runRef.current || jobRef.current !== jobId) return
        const data = probe.success ? probe.data : undefined
        if (data?.status === 'COMPLETED' && data.generation) {
          canvas.onSetMedia(id, {
            url: data.generation.url,
            generationId: data.generation.id,
            ...(data.generation.thumbnailUrl
              ? { videoThumbnailUrl: data.generation.thumbnailUrl }
              : {}),
          })
        } else if (data?.status !== 'FAILED' && data?.status !== 'CANCELLED') {
          throw new Error('cancelFailed')
        }
      } else if (!response.data.cancelled.includes(jobId)) {
        throw new Error('cancelFailed')
      }
      runRef.current += 1
      jobRef.current = undefined
      canvas.onSetMedia(id, { mediaJobId: undefined })
      setStartedAt(null)
    } catch {
      cancelRequestedRef.current = false
      toast.error(tCancel('cancelFailed'))
    } finally {
      cancellingRef.current = false
    }
  }

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

  const modelOptions = useMemo(
    () => canvas.modelOptionsByKind[NODE_MEDIA_KIND_IDS.video] ?? [],
    [canvas.modelOptionsByKind],
  )

  /**
   * 新卡即带的默认模型（spec §5「参数 chip 永不为空」）。**只派生不落库**：落库
   * 要走 `set_model` op，那会给「刚建好一张卡」平白多出一个撤销条目（⌘Z 变成
   * 「清掉模型」而不是「撤掉这张卡」）。真正写进节点的时机是用户按下生成那一下。
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

  const effectiveModel = videoData.model ?? defaultModel
  const modelId = effectiveModel?.modelId
  /** 生效的参数 = 存着的 + 这个模型的默认档（⛔ chip 上不留空）。 */
  const effectiveParams = videoEffectiveParams(videoData.params, modelId)
  // 读数上写的是**型号名**，⛔ 不是落库的那串 id —— 与模型 chip 同一份译名表。
  const modelLabel = modelId
    ? getTranslatedModelLabel(tModels, modelId)
    : undefined

  const rail = useVideoRailBinding({
    id,
    displayName,
    model: effectiveModel,
    disabled: generating,
  })
  const node = rail.node

  const versions = videoVersions(videoData)
  const versionIndex = readOutputIndex(videoData)
  /**
   * 当前版的来源（⋯ 里那一行只读小字）。今天只有剪辑台导出的成片会写它。
   */
  const currentSourceLabel =
    readOutputVersions(videoData)[versionIndex]?.source?.label

  /* ── 参考轨派生（模式 / @ 序号 / 读数）───────────────────────────────── */
  const railItems = rail.items
  const railCounts = videoRailCounts(railItems)
  const sendMode = videoSendMode({
    firstFrame: railCounts.firstFrame,
    lastFrame: railCounts.lastFrame,
    referenceImages: railCounts.referenceImages,
    videos: railCounts.video,
    voices: railCounts.voice,
  })
  const railNames = railItems.flatMap((entry) => videoRailMentionLabels(entry))

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
  const railCandidates: MentionCandidate[] = railItems.map((entry) => ({
    id: `rail:${entry.edgeId}`,
    name: `${tVideo(`rail.group.${entry.group}`)}${entry.index}`,
    groupLabel: tVideo('rail.mentionGroup'),
    group: 'rail',
    ...(entry.thumbnailUrl ? { thumbnailUrl: entry.thumbnailUrl } : {}),
  }))
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

  const renderPromptValue = (value: string): ReactNode =>
    renderPromptMentions(value, {
      names: [...railNames, ...tokens.map((token) => token.name)],
      // `@图2` 这类序号项在栏里也带缩略 —— 与轨、与画中框同一份。
      mediaOf: mentionOptionMedia,
    })

  // poster 两级：落库的封面 → 首帧槽的源图。⛔ 不拿成片 url 当 poster：
  // `<img src={视频}>` 什么都画不出来（那是 v3 缩略图空白的老根）。
  const firstFrameSource = node
    ? readSlotSources(
        node,
        NODE_SLOT_IDS.firstFrame,
        canvas.edges,
        canvas.nodes,
      )[0]
    : undefined
  const posterUrl =
    videoData.videoThumbnailUrl ??
    (firstFrameSource?.node.data.kind === NODE_MEDIA_KIND_IDS.image
      ? firstFrameSource.node.data.url
      : undefined)

  const selectVersion = (index: number) =>
    void canvas.onApplyOp({
      op: NODE_ASSISTANT_OP_V4_IDS.setOutputVersion,
      target: id,
      index,
    })

  const setParams = (patch: Partial<NonNullable<NodeV4VideoData['params']>>) =>
    canvas.onSetParams(id, { ...videoData.params, ...patch })

  const submitPrompt = () => {
    if (draft.trim().length === 0 || generating) return
    if (draft !== currentPrompt) canvas.onSetPrompt(id, draft)
    // 默认模型 / 默认档到这一刻才落库：用户按了生成，它就是**用户的**选择了。
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
    const run = ++runRef.current
    jobRef.current = undefined
    cancelRequestedRef.current = false
    setStartedAt(Date.now())
    void generation
      .generateNode(
        id,
        { nodes, edges: canvas.edges },
        {
          prompt: draft,
          onJobCreated: (jobId) => {
            if (run !== runRef.current) return
            jobRef.current = jobId
            canvas.onSetMedia(id, { mediaJobId: jobId })
            if (cancelRequestedRef.current) void cancelGeneration()
          },
          onEach: (result) => {
            if (run !== runRef.current) return
            if (!result.success) {
              if (!result.pending)
                canvas.onSetMedia(id, { mediaJobId: undefined })
              return
            }
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
      .finally(() => {
        if (run === runRef.current) setStartedAt(null)
      })
  }

  const railReadoutGroups = (
    [
      VIDEO_RAIL_GROUP_IDS.image,
      VIDEO_RAIL_GROUP_IDS.video,
      VIDEO_RAIL_GROUP_IDS.voice,
    ] as const
  ).map((group: VideoRailGroupId) => ({
    label: tVideo(`rail.group.${group}`),
    current:
      group === VIDEO_RAIL_GROUP_IDS.image
        ? railCounts.image
        : group === VIDEO_RAIL_GROUP_IDS.video
          ? railCounts.video
          : railCounts.voice,
    limit:
      group === VIDEO_RAIL_GROUP_IDS.image
        ? rail.capacity.images
        : group === VIDEO_RAIL_GROUP_IDS.video
          ? rail.capacity.videos
          : rail.capacity.voices,
  }))

  const paramsChip = (
    <VideoFrameChip
      key="frame"
      params={effectiveParams}
      modelId={modelId}
      {...(modelId ? { modeLabel: tVideo(`mode.${sendMode}`) } : {})}
      modeHint={tVideo('mode.hint')}
      readoutGroups={railReadoutGroups}
      {...(rail.capacity.referenceUnavailable
        ? { referenceNote: tVideo('rail.referenceUnavailable') }
        : {})}
      disabled={generating}
      onDurationChange={(duration) => setParams({ duration })}
      onAspectRatioChange={(aspectRatio) => setParams({ aspectRatio })}
      onResolutionChange={(resolution) => setParams({ resolution })}
      onGenerateAudioChange={(generateAudio) => setParams({ generateAudio })}
    />
  )

  const modelChip = (
    <NodeModelChip
      key="model"
      nodeId={id}
      kind={NODE_MEDIA_KIND_IDS.video}
      value={effectiveModel?.optionId ?? null}
      disabled={generating}
      triggerEmptyLabel={tVideo('model.title')}
    />
  )

  return {
    node,
    generating,
    elapsed,
    draft,
    setDraft,
    currentPrompt,
    submitPrompt,
    cancelGeneration: () => void cancelGeneration(),
    railProps: rail.railProps,
    railItems,
    railCandidatesOf: rail.candidatesOf,
    paramsChip,
    modelChip,
    mentionOptions,
    frameTokens,
    frameCandidates,
    renderPromptValue,
    versions,
    versionIndex,
    selectVersion,
    currentSourceLabel,
    posterUrl,
    modelLabel,
    effectiveModel,
    effectiveParams,
    runUpload: rail.runUpload,
    openFilePicker: rail.openFilePicker,
    selfUploading: rail.selfUploading,
    uploadProgress: rail.uploadProgress,
    backfillMedia: rail.backfillMedia,
    overlays: rail.overlays,
  }
}
