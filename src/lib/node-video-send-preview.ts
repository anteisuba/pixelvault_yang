/**
 * R3-6b §2 发送图例预览（canvas-relationship-v3-2026-07 §7 R3-6b / v4 §7.2⑦）:
 * a PURE, reactive orchestration that mirrors exactly what
 * `StudioNodeWorkbench.handleGenerateMediaNode`'s video branch assembles for
 * the real generate request — same harvest calls, same
 * `assembleReferenceImagePayload` cap step, same `filterReferencedImages`
 * "只送已引用" narrowing, same `buildVideoReferenceLegend` legend builder, same
 * `translatePromptTokensToPositional` @name→@ImageN rewrite — so a UI can show
 * "what will actually be sent" without re-deriving any of those rules a
 * second, divergent way. This module does NOT reimplement any of those
 * pieces; it only calls them in the same order handleGenerateMediaNode does.
 *
 * Deliberately narrow to VIDEO nodes only (the composer's density='detail'
 * host is always a seedance node) — an image/audio node has no reference
 * legend or 图N slot concept, so this isn't a general-purpose "preview any
 * node" utility.
 */
import { NODE_STUDIO_VIDEO_REFERENCE_LEGEND } from '@/constants/node-studio'
import { NODE_REVIEW_STATE_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  getVideoModelSendContract,
  type VideoModelSendContract,
} from '@/constants/video-model-send-plan'
import type {
  NodeWorkflowEdge,
  NodeWorkflowNode,
  NodeWorkflowNodeData,
} from '@/types/node-workflow'
import type { SeedancePromptPlanReferences } from '@/types/seedance-prompt-plan'

import {
  assembleReferenceImagePayload,
  type ReferenceImageOverflowEntry,
} from './node-reference-payload'
import {
  buildVideoReferenceLegend,
  getUpstreamNodes,
  harvestUpstreamAudioBindings,
  harvestUpstreamCloseupUrls,
  harvestUpstreamImageUrls,
  harvestUpstreamShotTextPrompt,
  harvestUpstreamVideoImageReferences,
  harvestUpstreamVideoUrls,
  mergePromptWithUpstreamText,
  type AudioBinding,
  type VideoLegendImageKind,
} from './node-workflow-graph'
import {
  buildReferenceImageIndexByName,
  translatePromptTokensToPositional,
} from './node-video-prompt-translation'
import { planVideoKeyframeImages } from './node-video-keyframe-plan'
import {
  resolveVideoSendSlotLimits,
  type VideoSendSlotLimits,
} from './node-video-send-slots'
import { buildNodeWorkflowPrompt } from './node-workflow-prompt'

export interface VideoSendPreviewImageEntry {
  url: string
  /** 1-based position — matches the 图N / @ImageN slot the legend + the
   *  translated prompt body both reference. */
  index: number
  name?: string
  kind?: VideoLegendImageKind
  category?: string
}

export interface VideoSendPreviewOverflowEntry {
  url: string
  /** Resolved from the SAME name map the images list uses — undefined when
   *  the truncated URL has no known name (e.g. an unnamed keyframe). */
  name?: string
}

export interface VideoSendPreviewAudioEntry {
  index: number
  label: string
  url: string
  characterName?: string
}

export interface VideoSendPreviewDroppedEntry {
  kind: 'image' | 'video' | 'audio'
  url: string
  /**
   * 包 4：新增 `awaiting-review` / `rejected` 两个理由，接进**既有**的「什么被
   * 丢了、为什么」这套，而不是另起一个提示通道 —— 用户不该在两个地方读「这次
   * 少发了什么」。前三个是容量类原因，后两个是审核门。
   */
  reason:
    | 'unsupported'
    | 'model-limit'
    | 'total-limit'
    | 'awaiting-review'
    | 'rejected'
}

export interface VideoSendPreview {
  /** Prompt body AFTER @name → @ImageN positional translation — the literal
   *  text that ships as the request's prompt, BEFORE the legend header gets
   *  prepended (kept separate so the preview reads as "what you wrote" vs
   *  "what we silently added", not one opaque blob). */
  translatedPrompt: string
  /** Auto-prepended reference legend (`buildVideoReferenceLegend`'s output)
   *  — '' when nothing is nameable. */
  legend: string
  /** THIS request's actual image_urls, in order, each carrying its 图N /
   *  @ImageN slot number — post cap AND post the "only send @-mentioned"
   *  narrowing, i.e. exactly what image_urls will contain. */
  images: VideoSendPreviewImageEntry[]
  /** Candidate reference images the model's cap CUT — independent of the
   *  @-mention narrowing (a truncated image never gets a chance to be
   *  "referenced" in the first place). Same fact `ReferenceManagerPanel`'s
   *  overflow badges use (§1 容量透明) — one `assembleReferenceImagePayload`
   *  call, two presentations. */
  overflow: VideoSendPreviewOverflowEntry[]
  /** Post-cap, PRE-mention-filter candidate count — capacity math (N/max)
   *  should compare against THIS, not `images.length` (which can be smaller
   *  once mention-narrowing applies). */
  assembledImageCount: number
  videoUrls: string[]
  audioEntries: VideoSendPreviewAudioEntry[]
  dropped: VideoSendPreviewDroppedEntry[]
  contract: VideoModelSendContract
  /**
   * 这一档**解算后**的各类容量。
   *
   * ⚠ 与 `contract.slots` 不是一回事，别拿后者当上限渲染：`slots.images` 是模型
   * 自己的图片位，而这里的 `images` 已经扣掉了视频/音频吃掉的**跨模态总额**
   * （火山「≤12 个文件」那类），`imagesLimitedByTotal` 还告诉你被砍是因为总额
   * 还是模型自身上限 —— 两者对用户的下一步不同（去减视频 vs 只能换模型）。
   *
   * 槽架的分类清单与「满没满」全部读这里，**不许在组件里手写**：本轮原型逐格
   * 手写分类导致四处漏掉视频区，而契约里 `slots.videos` 一直是 3
   * （见 `references/pages/canvas-slot-rack.md` §4.4）。
   */
  slotLimits: VideoSendSlotLimits
  /** Literal normalized request values consumed by the submit path. */
  request: {
    prompt: string
    referenceImages?: string[]
    videoUrls?: string[]
    audioUrls?: string[]
    audioBindings?: AudioBinding[]
  }
  canSubmit: boolean
  blockers: Array<'execution-not-migrated' | 'audio-requires-visual'>
}

export interface BuildVideoSendPreviewInput {
  nodeId: string
  data: NodeWorkflowNodeData
  edges: readonly NodeWorkflowEdge[]
  nodes: readonly NodeWorkflowNode[]
  modelId?: string
  adapterType?: AI_ADAPTER_TYPES
  /** undefined = model/cap unknown — capping is skipped entirely (§ "上限不可
   *  得时诚实沉默不硬造"): every candidate ships, overflow stays empty. */
  maxReferenceImages: number | undefined
  /** i18n-resolved auto-name prefixes — MUST be the same strings the
   *  composer's own @token auto-naming uses (`StudioNode.videoComposer.autoName.*`),
   *  so an unnamed reference's preview name matches its actual @token. */
  autoNamePrefix: Record<VideoLegendImageKind | 'video', string>
}

function resolveOverflowName(
  entry: ReferenceImageOverflowEntry,
  imageRefByUrl: ReadonlyMap<string, { name?: string }>,
): string | undefined {
  return imageRefByUrl.get(entry.url)?.name
}

export function buildVideoSendPreview({
  nodeId,
  data,
  edges,
  nodes,
  modelId,
  adapterType,
  maxReferenceImages,
  autoNamePrefix,
}: BuildVideoSendPreviewInput): VideoSendPreview {
  const legacyMode = !modelId
  const contract = getVideoModelSendContract(modelId, adapterType)
  const upstreamNodes = getUpstreamNodes(nodeId, edges, nodes)
  const ownPrompt = buildNodeWorkflowPrompt(NODE_TYPE_IDS.seedance, data)
  /**
   * 上游文本前置。
   *
   * ⚠ 2026-08-10 **胶囊整套退役**（owner 拍板，契约 §5.2）：文本改成「`@` 菜单里
   * 点一下，把内容原文粘进输入框」。位置由用户粘在哪决定 —— 原文就在正文里，
   * 发送预览拿到的 `ownPrompt` 已经含着它，不需要再展开任何占位符。
   * 「连了边但没粘进正文」的文本仍按老规矩前置，存量图零改动照常跑。
   */
  const mergedPrompt = mergePromptWithUpstreamText(
    ownPrompt,
    harvestUpstreamShotTextPrompt(upstreamNodes, ownPrompt),
  )

  // Video nodes never carry `existingImageReference` (that source only
  // applies to isImageMediaNode in handleGenerateMediaNode) — own
  // referenceAssets stays for parity even though a seedance node practically
  // never populates it.
  const ownReferenceAssetUrls = (data.referenceAssets ?? []).map(
    (asset) => asset.url,
  )
  // 包 4：收割函数自己带审核门，所以预览拿到的就是**真实会发出去的那一批**。
  // 门装在函数里而不是各调用点，正是为了预览和载荷不可能对不上。
  const harvestedImages = harvestUpstreamImageUrls(upstreamNodes, edges, nodeId)
  const harvestedCloseups = harvestUpstreamCloseupUrls(nodeId, edges, nodes)
  const upstreamImageUrls = [...harvestedImages.urls, ...harvestedCloseups.urls]
  const blockedByReview = [
    ...harvestedImages.blocked,
    ...harvestedCloseups.blocked,
  ]
  const audioCandidates: AudioBinding[] = harvestUpstreamAudioBindings(
    nodeId,
    edges,
    nodes,
  )
  const videoCandidates = harvestUpstreamVideoUrls(upstreamNodes)

  // 容量只有一个真相：发送路径（`StudioNodeWorkbench`）调的是**同一个函数**。
  // 此前这里按 `contract.slots` 算、那边写死 `.slice(0, 3)`，于是预览说「这段视频
  // 不会发送」而实际发了出去（cleanup §8.7 第 1 条）。
  const slotLimits = resolveVideoSendSlotLimits({
    contract,
    legacyMode,
    legacyMaxReferenceImages: maxReferenceImages,
    audioCandidateCount: audioCandidates.length,
    videoCandidateCount: videoCandidates.length,
  })
  const audioLimit = slotLimits.audio
  const videoLimit = slotLimits.videos
  const upstreamAudioBindings = audioCandidates.slice(0, audioLimit)
  const upstreamVideoUrls = videoCandidates.slice(0, videoLimit)

  const dropped: VideoSendPreviewDroppedEntry[] = [
    // 审核门挡下的排在最前：它是**用户能立刻处理**的那一类（去点通过就好），
    // 而容量类原因要么换模型要么减参考，处理成本高得多。
    ...blockedByReview.map((item) => ({
      kind: 'image' as const,
      url: item.url,
      reason:
        item.state === NODE_REVIEW_STATE_IDS.rejected
          ? ('rejected' as const)
          : ('awaiting-review' as const),
    })),
    ...audioCandidates.slice(audioLimit).map((binding) => ({
      kind: 'audio' as const,
      url: binding.url,
      reason:
        audioLimit === 0 ? ('unsupported' as const) : ('model-limit' as const),
    })),
    ...videoCandidates.slice(videoLimit).map((url) => ({
      kind: 'video' as const,
      url,
      reason:
        videoLimit === 0 ? ('unsupported' as const) : ('model-limit' as const),
    })),
  ]

  const effectiveMax = slotLimits.images
  const referenceCandidateSources = [
    ...ownReferenceAssetUrls,
    ...upstreamImageUrls,
  ]
  // Cap-only view — `overflow`/`assembledImageCount` below are explicitly
  // independent of the @-mention narrowing (see their doc comments), so this
  // stays exactly as before.
  const assembly = assembleReferenceImagePayload(
    referenceCandidateSources,
    effectiveMax,
  )

  const videoImageRefByUrl = harvestUpstreamVideoImageReferences(
    nodeId,
    edges,
    nodes,
  )

  // 先去重、不设上限地拿到全部候选，再在下面按真实上限截断 —— 顺序不能反
  // （Bug fix 2026-07-27，与 `StudioNodeWorkbench` 发送路径同构）。
  const dedupedReferenceCandidates = assembleReferenceImagePayload(
    referenceCandidateSources,
    Number.POSITIVE_INFINITY,
  ).imageUrls

  // ⚠ **不再按 `@` 提及收窄**（2026-08-09 退役，见
  // `node-video-prompt-translation.ts` 里那段说明）：在槽里就等于会发送，
  // 「发什么」的唯一真相是槽架。这里只算名字 → 位置的索引，供正文里的引用
  // 翻译成 `@ImageN` 位置 token 用。
  const referenceImageIndexByName = buildReferenceImageIndexByName(
    dedupedReferenceCandidates,
    videoImageRefByUrl,
    autoNamePrefix,
  )
  const cappedReferenceImages = dedupedReferenceCandidates.slice(
    0,
    effectiveMax,
  )
  // 切片 6 第 ⑤ 层守卫，与 `StudioNodeWorkbench` 的发送路径共用同一个函数 ——
  // 预览和载荷不可能对不上，正是这个模块存在的意义（见文件头注释）。
  const keyframePlan = planVideoKeyframeImages({
    imageUrls: cappedReferenceImages,
    keyframeUrls: harvestedImages.keyframeUrls,
    modelId,
    adapterType,
  })
  const effectiveReferenceImages = keyframePlan.imageUrls
  // 关键帧档发不出去的图进**既有**的「什么被丢了」通道，不另起一个提示 —— 理由是
  // `unsupported`（这个模式压根没有它的位置），不是容量不够。
  dropped.push(
    ...keyframePlan.dropped.map((url) => ({
      kind: 'image' as const,
      url,
      reason: 'unsupported' as const,
    })),
  )
  // 只保留真正发出去的那几位 —— 一个被上限砍掉的名字不该还能翻译成
  // `@ImageN`，那个 N 在载荷里根本不存在。
  const imageIndexByName = new Map(
    Array.from(referenceImageIndexByName).filter(
      ([, position]) => position <= effectiveReferenceImages.length,
    ),
  )

  const legend = buildVideoReferenceLegend({
    referenceImages: effectiveReferenceImages,
    imageRefByUrl: videoImageRefByUrl,
    videoUrls: upstreamVideoUrls,
    audioBindings: upstreamAudioBindings,
    labels: {
      title: NODE_STUDIO_VIDEO_REFERENCE_LEGEND.title,
      imagePrefix: NODE_STUDIO_VIDEO_REFERENCE_LEGEND.imagePrefix,
      videoPrefix: NODE_STUDIO_VIDEO_REFERENCE_LEGEND.videoPrefix,
      audioPrefix: NODE_STUDIO_VIDEO_REFERENCE_LEGEND.audioPrefix,
      kindLabel: NODE_STUDIO_VIDEO_REFERENCE_LEGEND.kindLabel,
      autoNamePrefix,
      characterVoiceSuffix:
        NODE_STUDIO_VIDEO_REFERENCE_LEGEND.characterVoiceSuffix,
      narration: NODE_STUDIO_VIDEO_REFERENCE_LEGEND.narration,
    },
  })

  const translatedPrompt = translatePromptTokensToPositional(
    mergedPrompt,
    imageIndexByName,
  )

  const images: VideoSendPreviewImageEntry[] = effectiveReferenceImages.map(
    (url, i) => {
      const ref = videoImageRefByUrl.get(url)
      const index = i + 1
      // SF-2b: `ref.kind` is optional (a category-only entry, e.g. a
      // keyframe, never carries one) — that shape always has a real
      // `ref.name` set at harvest time, so the `ref.kind` branch is
      // typed-safe dead code for it, not a real runtime path.
      const name =
        ref?.name ||
        (ref?.kind ? `${autoNamePrefix[ref.kind]}${index}` : undefined)
      return { url, index, name, kind: ref?.kind, category: ref?.category }
    },
  )

  const overflow: VideoSendPreviewOverflowEntry[] = assembly.overflow.map(
    (entry) => ({
      url: entry.url,
      name: resolveOverflowName(entry, videoImageRefByUrl),
    }),
  )
  for (const url of dedupedReferenceCandidates.slice(effectiveMax)) {
    dropped.push({
      kind: 'image',
      url,
      reason: slotLimits.imagesLimitedByTotal ? 'total-limit' : 'model-limit',
    })
  }

  const audioEntries: VideoSendPreviewAudioEntry[] = upstreamAudioBindings.map(
    (binding, i) => ({
      index: i + 1,
      url: binding.url,
      characterName: binding.characterName,
      label: binding.characterName
        ? `${NODE_STUDIO_VIDEO_REFERENCE_LEGEND.kindLabel.character}「${binding.characterName}」${NODE_STUDIO_VIDEO_REFERENCE_LEGEND.characterVoiceSuffix}`
        : NODE_STUDIO_VIDEO_REFERENCE_LEGEND.narration,
    }),
  )

  const usesPositionalTokens =
    legacyMode || contract.positionalImageTokens === true
  const outboundLegend = usesPositionalTokens ? legend : ''
  const outboundPromptBody = usesPositionalTokens
    ? translatedPrompt
    : mergedPrompt
  const requestPrompt = outboundLegend
    ? `${outboundLegend}\n\n${outboundPromptBody}`
    : outboundPromptBody
  const blockers: VideoSendPreview['blockers'] = []
  if (contract.execution !== 'ready') {
    blockers.push('execution-not-migrated')
  }
  if (
    !legacyMode &&
    contract.slots.audioRequiresVisual &&
    upstreamAudioBindings.length > 0 &&
    effectiveReferenceImages.length === 0 &&
    upstreamVideoUrls.length === 0
  ) {
    blockers.push('audio-requires-visual')
  }

  return {
    translatedPrompt: outboundPromptBody,
    legend: outboundLegend,
    images,
    overflow,
    assembledImageCount: assembly.imageUrls.length,
    videoUrls: upstreamVideoUrls,
    audioEntries,
    dropped,
    contract,
    slotLimits,
    request: {
      prompt: requestPrompt,
      referenceImages:
        effectiveReferenceImages.length > 0
          ? effectiveReferenceImages
          : undefined,
      videoUrls: upstreamVideoUrls.length > 0 ? upstreamVideoUrls : undefined,
      audioUrls:
        upstreamAudioBindings.length > 0
          ? upstreamAudioBindings.map((binding) => binding.url)
          : undefined,
      audioBindings:
        upstreamAudioBindings.length > 0 ? upstreamAudioBindings : undefined,
    },
    canSubmit: blockers.length === 0,
    blockers,
  }
}

/**
 * Project a send preview into what the Seedance prompt planner needs to know
 * about the references: every `@ImageN` slot with its creation-layer name /
 * kind / category, how many `@VideoN` clips ride along, and who speaks on
 * each `@AudioN`. Reads the SAME post-cap, post-review `images` /
 * `videoUrls` / `audioEntries` the request ships, so the planner never
 * orchestrates a slot the payload does not contain (the old count-based
 * summary capped at 2.0's 9/3/3 by hand and drifted from 2.5's 30/10/10).
 */
export function summarizeVideoSendReferences(
  preview: Pick<VideoSendPreview, 'images' | 'videoUrls' | 'audioEntries'>,
): SeedancePromptPlanReferences {
  return {
    images: preview.images.map((image) => ({
      index: image.index,
      ...(image.name ? { name: image.name } : {}),
      ...(image.kind ? { kind: image.kind } : {}),
      ...(image.category ? { category: image.category } : {}),
    })),
    videoCount: preview.videoUrls.length,
    audio: preview.audioEntries.map((entry) =>
      entry.characterName ? { characterName: entry.characterName } : {},
    ),
  }
}
