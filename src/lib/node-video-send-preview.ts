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
  filterReferencedImages,
  translatePromptTokensToPositional,
} from './node-video-prompt-translation'
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
  const upstreamTextPrompt = harvestUpstreamShotTextPrompt(upstreamNodes)
  const mergedPrompt = mergePromptWithUpstreamText(
    ownPrompt,
    upstreamTextPrompt,
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

  const audioLimit = legacyMode ? 3 : contract.slots.audio
  const videoLimit = legacyMode ? 3 : contract.slots.videos
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

  const configuredImageLimit = legacyMode
    ? maxReferenceImages
    : contract.slots.images
  const remainingTotalSlots =
    typeof contract.slots.total === 'number'
      ? Math.max(
          0,
          contract.slots.total -
            upstreamAudioBindings.length -
            upstreamVideoUrls.length,
        )
      : Number.POSITIVE_INFINITY
  const effectiveMax = Math.min(
    typeof configuredImageLimit === 'number'
      ? configuredImageLimit
      : Number.POSITIVE_INFINITY,
    remainingTotalSlots,
  )
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

  // Bug fix 2026-07-27（@ 过滤顺序）: mirrors the StudioNodeWorkbench.
  // handleGenerateMediaNode fix this module promises to mirror (see the file
  // doc comment) — filter against every DEDUPED candidate, not just the ones
  // that survived the cap, or an @-mentioned image ranked past `effectiveMax`
  // gets cut before the filter can keep it for being referenced.
  const dedupedReferenceCandidates = assembleReferenceImagePayload(
    referenceCandidateSources,
    Number.POSITIVE_INFINITY,
  ).imageUrls

  const referencedFilter = filterReferencedImages(
    mergedPrompt,
    dedupedReferenceCandidates,
    videoImageRefByUrl,
    autoNamePrefix,
  )
  // Cap re-applied AFTER filtering — the entire fix. `imageIndexByName` is
  // re-filtered to the positions that survive so a name past the real cap
  // never resolves to an @ImageN token nothing was actually sent for.
  const effectiveReferenceImages = referencedFilter.referenceImages.slice(
    0,
    effectiveMax,
  )
  const imageIndexByName = new Map(
    Array.from(referencedFilter.imageIndexByName).filter(
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
  for (const url of referencedFilter.referenceImages.slice(effectiveMax)) {
    dropped.push({
      kind: 'image',
      url,
      reason:
        remainingTotalSlots < (configuredImageLimit ?? Number.POSITIVE_INFINITY)
          ? 'total-limit'
          : 'model-limit',
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
