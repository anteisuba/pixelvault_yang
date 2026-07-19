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
import { NODE_TYPE_IDS } from '@/constants/node-types'
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
}

export interface BuildVideoSendPreviewInput {
  nodeId: string
  data: NodeWorkflowNodeData
  edges: readonly NodeWorkflowEdge[]
  nodes: readonly NodeWorkflowNode[]
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
  maxReferenceImages,
  autoNamePrefix,
}: BuildVideoSendPreviewInput): VideoSendPreview {
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
  const upstreamImageUrls = [
    ...harvestUpstreamImageUrls(upstreamNodes, edges, nodeId),
    ...harvestUpstreamCloseupUrls(nodeId, edges, nodes),
  ]
  const upstreamAudioBindings: AudioBinding[] = harvestUpstreamAudioBindings(
    nodeId,
    edges,
    nodes,
  ).slice(0, 3)
  const upstreamVideoUrls = harvestUpstreamVideoUrls(upstreamNodes).slice(0, 3)

  const effectiveMax =
    typeof maxReferenceImages === 'number'
      ? maxReferenceImages
      : Number.POSITIVE_INFINITY
  const assembly = assembleReferenceImagePayload(
    [...ownReferenceAssetUrls, ...upstreamImageUrls],
    effectiveMax,
  )

  const videoImageRefByUrl = harvestUpstreamVideoImageReferences(
    nodeId,
    edges,
    nodes,
  )

  const referencedFilter = filterReferencedImages(
    mergedPrompt,
    assembly.imageUrls,
    videoImageRefByUrl,
    autoNamePrefix,
  )
  const effectiveReferenceImages = referencedFilter.referenceImages

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
    referencedFilter.imageIndexByName,
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

  const audioEntries: VideoSendPreviewAudioEntry[] = upstreamAudioBindings.map(
    (binding, i) => ({
      index: i + 1,
      label: binding.characterName
        ? `${NODE_STUDIO_VIDEO_REFERENCE_LEGEND.kindLabel.character}「${binding.characterName}」${NODE_STUDIO_VIDEO_REFERENCE_LEGEND.characterVoiceSuffix}`
        : NODE_STUDIO_VIDEO_REFERENCE_LEGEND.narration,
    }),
  )

  return {
    translatedPrompt,
    legend,
    images,
    overflow,
    assembledImageCount: assembly.imageUrls.length,
    videoUrls: upstreamVideoUrls,
    audioEntries,
  }
}
