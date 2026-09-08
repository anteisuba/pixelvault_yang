/**
 * R3-6b §2 发送图例预览（canvas-relationship-v3-2026-07 §7 R3-6b / v4 §7.2⑦）:
 * a PURE, reactive orchestration that mirrors exactly what
 * 画布的生成路径's video branch assembles for
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
import {
  NODE_STUDIO_REFERENCE_ROLE_LEGEND_LABELS,
  NODE_STUDIO_VIDEO_REFERENCE_LEGEND,
} from '@/constants/node-studio'
import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  getVideoModelSendContract,
  type VideoModelSendContract,
} from '@/constants/video-model-send-plan'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { NODE_SLOT_IDS } from '@/constants/node-slots'
import {
  buildV4VideoPayload,
  readNodeUrl,
  readSlotSources,
  type SlotSource,
} from './node-slot-payload'
import type { NodeV4, NodeWorkflowEdgeV4 } from '@/types/node-workflow'

import { assembleReferenceImagePayload } from './node-reference-payload'
import {
  buildVideoReferenceLegend,
  type AudioBinding,
  type VideoLegendImageKind,
  type VideoLegendImageReference,
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

/* ═════════════════════════════════════════════════════════════════════════
 * v4 分支（第三期 · 画布 C3c-②Q · 接线清单 5）
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * v4 的发送预览 —— **读 `buildV4VideoPayload` 的那一份结果**，⛔ 不再自己收割。
 *
 * ── 这是本模块存在理由的 v4 版重述 ──────────────────────────────────
 * 删掉的那支 v3 实现，整个头注可以压成一句：「预览必须调用发送路径调用的同一批
 * 函数」。v4 把收割整块换成了具名槽装配（`node-slot-payload.buildV4VideoPayload`），
 * 而发送路径（`useNodeMediaGenerationV4.generateNode`）调的正是它。所以 v4 预览
 * 的正确做法不是把 v3 的收割链改写一遍，而是**直接读同一个装配结果**。
 *
 * 装配之后的每一步照旧共用 v3 的函数：容量解算（`resolveVideoSendSlotLimits`）、
 * 关键帧档守卫（`planVideoKeyframeImages`）、图例（`buildVideoReferenceLegend`）、
 * `@name → @ImageN`（`translatePromptTokensToPositional`）。⛔ 这四件不给 v4 另写
 * 一份 —— 它们回答的是「模型这一侧收什么」，与画布是 v3 还是 v4 无关。
 *
 * ⚠ v3 分支已随 ③e 删除（收割层整块不在了）：画布已原子翻转，再没有第二种图。
 */
export interface BuildVideoSendPreviewV4Input {
  readonly nodeId: string
  readonly nodes: readonly NodeV4[]
  readonly edges: readonly NodeWorkflowEdgeV4[]
  readonly modelId?: string
  readonly adapterType?: AI_ADAPTER_TYPES
  /** 与 v3 同义：`undefined` = 上限不可得，整个截断步跳过（诚实沉默）。 */
  readonly maxReferenceImages: number | undefined
  readonly autoNamePrefix: Record<VideoLegendImageKind | 'video', string>
}

/**
 * url → 这张图在创作层叫什么、是哪一档。
 *
 * v3 靠收割层按 url 反查（已删）；v4 直接问槽 —— 名字就是源
 * 节点的稳定名（`data.name`），档位由**槽**决定（首/尾帧槽 = 关键帧，特写槽 =
 * 特写，其余按源节点子型）。⛔ 不按 url 猜。
 */
function buildV4ImageRefByUrl(
  nodeId: string,
  nodes: readonly NodeV4[],
  edges: readonly NodeWorkflowEdgeV4[],
): Map<string, VideoLegendImageReference> {
  const map = new Map<string, VideoLegendImageReference>()
  const node = nodes.find((candidate) => candidate.id === nodeId)
  if (!node) return map
  const record = (
    sources: readonly SlotSource[],
    kind: VideoLegendImageKind | undefined,
  ): void => {
    for (const source of sources) {
      const url = readNodeUrl(source.node.data)
      if (!url || map.has(url)) continue
      map.set(url, {
        name: source.node.data.name,
        ...(kind ? { kind } : {}),
      })
    }
  }
  /**
   * 关键帧不是 `VideoLegendImageKind` 的一档（SF-2b：它没有可插入的 `@token`），
   * 它走的是**分类**那一支 —— 图例打印成「@ImageN = 名字（首帧）」。
   *
   * v3 只能按序位兜底猜首尾（`resolveKeyframeLegendCategory`），因为那边两张
   * 关键帧挂的是同一种边；v4 首尾各有自己的槽，槽本身就是那份语义，所以这里
   * 直接按槽给分类，⛔ 不再猜。
   */
  const recordKeyframe = (
    sources: readonly SlotSource[],
    category: string,
  ): void => {
    for (const source of sources) {
      const url = readNodeUrl(source.node.data)
      if (!url || map.has(url)) continue
      map.set(url, { name: source.node.data.name, category })
    }
  }
  recordKeyframe(
    readSlotSources(node, NODE_SLOT_IDS.firstFrame, edges, nodes),
    NODE_STUDIO_REFERENCE_ROLE_LEGEND_LABELS.frameStart,
  )
  recordKeyframe(
    readSlotSources(node, NODE_SLOT_IDS.lastFrame, edges, nodes),
    NODE_STUDIO_REFERENCE_ROLE_LEGEND_LABELS.frameEnd,
  )
  for (const source of readSlotSources(
    node,
    NODE_SLOT_IDS.reference,
    edges,
    nodes,
  )) {
    const url = readNodeUrl(source.node.data)
    if (!url || map.has(url)) continue
    const data = source.node.data
    const kind: VideoLegendImageKind | undefined =
      data.kind === NODE_MEDIA_KIND_IDS.image && data.subtype === 'character'
        ? 'character'
        : data.kind === NODE_MEDIA_KIND_IDS.image
          ? 'shot'
          : undefined
    map.set(url, { name: data.name, ...(kind ? { kind } : {}) })
    // 一跳：角色卡上的特写。
    if (
      data.kind === NODE_MEDIA_KIND_IDS.image &&
      data.subtype === 'character'
    ) {
      record(
        readSlotSources(source.node, NODE_SLOT_IDS.closeup, edges, nodes),
        'closeup',
      )
    }
  }
  return map
}

export function buildVideoSendPreviewV4({
  nodeId,
  nodes,
  edges,
  modelId,
  adapterType,
  maxReferenceImages,
  autoNamePrefix,
}: BuildVideoSendPreviewV4Input): VideoSendPreview {
  const legacyMode = !modelId
  const contract = getVideoModelSendContract(modelId, adapterType)
  const node = nodes.find((candidate) => candidate.id === nodeId)
  const ownPrompt =
    node && node.data.kind !== 'text' ? (node.data.prompt ?? '') : ''
  // ⭐ 唯一的收割来源。
  const payload = buildV4VideoPayload({ nodeId, nodes, edges, ownPrompt })

  const slotLimits = resolveVideoSendSlotLimits({
    contract,
    legacyMode,
    legacyMaxReferenceImages: maxReferenceImages,
    audioCandidateCount: payload.audioBindings.length,
    videoCandidateCount: payload.videoUrls.length,
  })
  const audioBindings = payload.audioBindings.slice(0, slotLimits.audio)
  const videoUrls = payload.videoUrls.slice(0, slotLimits.videos)

  const dropped: VideoSendPreviewDroppedEntry[] = [
    ...payload.audioBindings.slice(slotLimits.audio).map((binding) => ({
      kind: 'audio' as const,
      url: binding.url,
      reason:
        slotLimits.audio === 0
          ? ('unsupported' as const)
          : ('model-limit' as const),
    })),
    ...payload.videoUrls.slice(slotLimits.videos).map((url) => ({
      kind: 'video' as const,
      url,
      reason:
        slotLimits.videos === 0
          ? ('unsupported' as const)
          : ('model-limit' as const),
    })),
  ]

  // 去重已在装配层做过（`pushUnique`），这里只按上限截断。
  const assembly = assembleReferenceImagePayload(
    [...payload.imageUrls],
    slotLimits.images,
  )
  const cappedImages = payload.imageUrls.slice(0, slotLimits.images)
  const keyframePlan = planVideoKeyframeImages({
    imageUrls: cappedImages,
    keyframeUrls: [...payload.keyframeUrls],
    modelId,
    adapterType,
  })
  const effectiveImages = keyframePlan.imageUrls
  dropped.push(
    ...keyframePlan.dropped.map((url) => ({
      kind: 'image' as const,
      url,
      reason: 'unsupported' as const,
    })),
  )
  for (const url of payload.imageUrls.slice(slotLimits.images)) {
    dropped.push({
      kind: 'image',
      url,
      reason: slotLimits.imagesLimitedByTotal ? 'total-limit' : 'model-limit',
    })
  }

  const imageRefByUrl = buildV4ImageRefByUrl(nodeId, nodes, edges)
  const indexByName = buildReferenceImageIndexByName(
    payload.imageUrls,
    imageRefByUrl,
    autoNamePrefix,
  )
  const imageIndexByName = new Map(
    Array.from(indexByName).filter(
      ([, position]) => position <= effectiveImages.length,
    ),
  )

  const legend = buildVideoReferenceLegend({
    referenceImages: effectiveImages,
    imageRefByUrl,
    videoUrls,
    audioBindings,
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

  const images: VideoSendPreviewImageEntry[] = effectiveImages.map((url, i) => {
    const ref = imageRefByUrl.get(url)
    const index = i + 1
    const name =
      ref?.name ||
      (ref?.kind ? `${autoNamePrefix[ref.kind]}${index}` : undefined)
    return { url, index, name, kind: ref?.kind, category: ref?.category }
  })

  const audioEntries: VideoSendPreviewAudioEntry[] = audioBindings.map(
    (binding, i) => ({
      index: i + 1,
      url: binding.url,
      ...(binding.characterName
        ? { characterName: binding.characterName }
        : {}),
      label: binding.characterName
        ? `${NODE_STUDIO_VIDEO_REFERENCE_LEGEND.kindLabel.character}「${binding.characterName}」${NODE_STUDIO_VIDEO_REFERENCE_LEGEND.characterVoiceSuffix}`
        : NODE_STUDIO_VIDEO_REFERENCE_LEGEND.narration,
    }),
  )

  const usesPositionalTokens =
    legacyMode || contract.positionalImageTokens === true
  const outboundLegend = usesPositionalTokens ? legend : ''
  const outboundPromptBody = usesPositionalTokens
    ? translatePromptTokensToPositional(payload.prompt, imageIndexByName)
    : payload.prompt
  const requestPrompt = outboundLegend
    ? `${outboundLegend}\n\n${outboundPromptBody}`
    : outboundPromptBody

  const blockers: VideoSendPreview['blockers'] = []
  if (contract.execution !== 'ready') blockers.push('execution-not-migrated')
  if (
    !legacyMode &&
    contract.slots.audioRequiresVisual &&
    audioBindings.length > 0 &&
    effectiveImages.length === 0 &&
    videoUrls.length === 0
  ) {
    blockers.push('audio-requires-visual')
  }

  return {
    translatedPrompt: outboundPromptBody,
    legend: outboundLegend,
    images,
    overflow: assembly.overflow.map((entry) => ({
      url: entry.url,
      ...(imageRefByUrl.get(entry.url)?.name
        ? { name: imageRefByUrl.get(entry.url)?.name }
        : {}),
    })),
    assembledImageCount: assembly.imageUrls.length,
    videoUrls,
    audioEntries,
    dropped,
    contract,
    slotLimits,
    request: {
      prompt: requestPrompt,
      referenceImages: effectiveImages.length > 0 ? effectiveImages : undefined,
      videoUrls: videoUrls.length > 0 ? videoUrls : undefined,
      audioUrls:
        audioBindings.length > 0
          ? audioBindings.map((binding) => binding.url)
          : undefined,
      audioBindings: audioBindings.length > 0 ? audioBindings : undefined,
    },
    canSubmit: blockers.length === 0,
    blockers,
  }
}
