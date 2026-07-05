'use client'

import { useCallback, useEffect, useMemo } from 'react'
import { useEdges, useNodes } from '@xyflow/react'
import { useTranslations } from 'next-intl'

import { NODE_TYPE_IDS } from '@/constants/node-types'
import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  VIDEO_BRAND_IDS,
  VIDEO_VARIANT_IDS,
  type VideoVariantId,
} from '@/constants/video-brands'
import { useNodeWorkflowActions } from '@/components/business/node/NodeWorkflowActionsContext'
import type { ReferenceTokenData } from '@/components/business/node/composer/ReferenceTokenChip'
import {
  getNodeMediaUrl,
  getSeedanceReferenceKind,
  getUpstreamNodes,
  harvestUpstreamAudioBindings,
  harvestUpstreamImageUrls,
  harvestUpstreamVideoUrls,
  isKeyframeNode,
  isVideoSourceNode,
  isVisualReferenceNode,
  isVoiceProfileNode,
  readVoiceCoverImage,
  readVoiceUrl,
} from '@/lib/node-workflow-graph'
import {
  deriveSwitcherStateFromModel,
  getBrandVariants,
  getSurfacedVideoBrands,
  isDualProviderBrand,
  pickDefaultProvider,
  resolveVideoModelId,
} from '@/lib/video-model-resolver'
import type {
  NodeWorkflowEdge,
  NodeWorkflowModelOption,
  NodeWorkflowModelSelection,
  NodeWorkflowNode,
  NodeWorkflowNodeData,
} from '@/types/node-workflow'

/** A character's bound voice — its 听觉身份 (cast-redesign §3). A voice node
 *  wired INTO a character node (`voice → character → video`) is that
 *  character's timbre, shown as the 音色徽标 on the character slot, NOT as a
 *  standalone token. `ready=false` = wired but no reference audio, so it
 *  contributes nothing to audio_urls (不静默丢 → dimmed badge). */
export interface BoundVoice {
  nodeId: string
  label: string
  coverImage?: string
  ready: boolean
  /** Payload audio_urls index when ready (shared order with 旁白 voices). */
  audioSlotIndex?: number
  /** The voice→character edge — lets the badge's × detach the voice. */
  edgeId?: string
}

/** A reference token enriched with generate-payload bookkeeping (§7 部门条):
 *  `imageSlotIndex`/`audioSlotIndex`/`videoSlotIndex` tie the slot badge to
 *  the real payload order (image_urls / audio_urls / video_urls); `edgeId` is
 *  the direct edge into this video node (× = delete it). `boundVoice` rides a
 *  character token as its 音色 facet (cast-redesign 五卡：音色收进角色). */
export interface ComposerReferenceToken extends ReferenceTokenData {
  imageSlotIndex?: number
  audioSlotIndex?: number
  videoSlotIndex?: number
  edgeId?: string
  boundVoice?: BoundVoice
}

function toSelection(
  option: NodeWorkflowModelOption,
): NodeWorkflowModelSelection {
  return {
    optionId: option.optionId,
    modelId: option.modelId,
    adapterType: option.adapterType,
    providerConfig: option.providerConfig,
    apiKeyId: option.apiKeyId,
  }
}

/**
 * Drives the two-tier video model switcher + provider picker for a single
 * video node. Derives the current {brand, variant, provider} from
 * `data.model`, computes whether reference inputs are bound (mode-by-input →
 * `_REFERENCE` model id), and exposes brand/variant/provider setters that
 * resolve to a concrete model and persist it via `updateNodeData`.
 *
 * It also owns the autospawn default-model effect (moved out of
 * SeedanceInspector): a seedance node spawned by `scriptDocToGraph` arrives
 * with `data.model` unset and reference edges already wired; this hook gives it
 * a runnable model even if the node is never selected.
 */
export function useVideoComposer(nodeId: string, data: NodeWorkflowNodeData) {
  const nodes = useNodes<NodeWorkflowNode>()
  const edges = useEdges<NodeWorkflowEdge>()
  const tc = useTranslations('StudioNode.videoComposer')
  const { modelOptionsByType, updateNodeData, defaultVideoModel } =
    useNodeWorkflowActions()

  const options = useMemo(
    () => modelOptionsByType[NODE_TYPE_IDS.seedance] ?? [],
    [modelOptionsByType],
  )

  // Any upstream node feeds the generate request (shotText prompt, references,
  // voices…), so a connected node is enough to enable generation even with an
  // empty own-prompt.
  const hasUpstreamInputs = useMemo(
    () => getUpstreamNodes(nodeId, edges, nodes).length > 0,
    [edges, nodes, nodeId],
  )

  // Reference inputs = bound visual references (character/background/keyframe
  // with media) OR a voice (direct or routed through a character). Mirrors the
  // harvest rules the generate path uses.
  const hasReferenceInputs = useMemo(() => {
    const incoming = getUpstreamNodes(nodeId, edges, nodes)
    const hasVisual = incoming.some(
      (node) =>
        (isVisualReferenceNode(node) || isKeyframeNode(node)) &&
        Boolean(getNodeMediaUrl(node.data)),
    )
    if (hasVisual) return true
    if (incoming.some(isVoiceProfileNode)) return true
    return incoming.some(
      (node) =>
        isVisualReferenceNode(node) &&
        getUpstreamNodes(node.id, edges, nodes).some(isVoiceProfileNode),
    )
  }, [edges, nodes, nodeId])

  // Which upstream reference families are bound — drives the compact card's
  // read-only ref chips (角色/背景/声音). Resolves each node via the shared
  // role-aware classifier so the unified `image` node (type === 'image' +
  // data.role) surfaces as character/background, not just the legacy per-type
  // nodes.
  const referenceKinds = useMemo(() => {
    const incoming = getUpstreamNodes(nodeId, edges, nodes)
    const kinds = new Set<'character' | 'background' | 'shot' | 'voice'>()
    for (const node of incoming) {
      const kind = getSeedanceReferenceKind(node)
      if (kind) kinds.add(kind)
    }
    return Array.from(kinds)
  }, [edges, nodes, nodeId])

  // Per-reference tokens for the detail panel's department strip (§7) +
  // clickable @token slots. Visual refs (character/background/shot) carry
  // their user-given name → @name (natural language; the image itself still
  // rides image_urls) plus `mediaUrl` for the token's thumbnail (§8.2). Voices
  // come from the same harvest the generate path uses, so @AudioN order
  // matches the fal builder's audio_urls slots exactly, and carry `coverImage`
  // (voiceCoverImage / voiceReferenceCoverImage) for their thumbnail. An empty
  // `token` = unnamed → the chip is a non-insertable indicator until the node
  // is named.
  //
  // `imageSlotIndex` / `audioSlotIndex` are the reference's 0-based position
  // in the ACTUAL generate payload (harvestUpstreamImageUrls / audio bindings
  // — same calls StudioNodeWorkbench's generate path makes), so the slot's
  // 图N/音N corner badge (§4 C3) never lies about what the model receives.
  // Keyframes occupy image slots but aren't tokens, so 图N may skip numbers —
  // that's correct, not a bug. `edgeId` is the direct edge feeding this video
  // node when one exists (§7.1: 删除槽位 = 删连线); voices routed through a
  // character have no direct edge → no edgeId → no × button.
  const referenceTokens = useMemo<ComposerReferenceToken[]>(() => {
    const incoming = getUpstreamNodes(nodeId, edges, nodes)
    const payloadImageUrls = harvestUpstreamImageUrls(incoming)
    const directEdgeBySource = new Map<string, string>()
    for (const edge of edges) {
      if (edge.target === nodeId) directEdgeBySource.set(edge.source, edge.id)
    }

    // Payload audio order (audio_urls) — the badge index is shared whether a
    // voice shows as a character's 音色 or as a standalone 旁白, so it never
    // lies about the send order. Maps voice node id → slot.
    const audioBindings = harvestUpstreamAudioBindings(nodeId, edges, nodes)
    const audioSlotByVoiceId = new Map<string, number>()
    audioBindings.forEach((binding, i) => {
      if (binding.nodeId) audioSlotByVoiceId.set(binding.nodeId, i)
    })

    // cast-redesign 五卡：音色收进角色. A voice wired INTO a character
    // (`voice → character`) is that character's 听觉身份 — resolve it here as a
    // BoundVoice facet, not a standalone token. 1:1 by design, so take the
    // first voice upstream of the character (prefer a ready one).
    const resolveBoundVoice = (
      characterNodeId: string,
    ): BoundVoice | undefined => {
      const voiceEdges = edges.filter((edge) => edge.target === characterNodeId)
      const voiceNodes = voiceEdges
        .map((edge) => ({
          node: nodes.find((n) => n.id === edge.source),
          edgeId: edge.id,
        }))
        .filter(
          (entry): entry is { node: NodeWorkflowNode; edgeId: string } =>
            Boolean(entry.node) && isVoiceProfileNode(entry.node!),
        )
      if (voiceNodes.length === 0) return undefined
      const chosen =
        voiceNodes.find(({ node }) => readVoiceUrl(node)) ?? voiceNodes[0]
      const voiceName =
        typeof chosen.node.data.voiceName === 'string'
          ? chosen.node.data.voiceName.trim()
          : ''
      return {
        nodeId: chosen.node.id,
        label: voiceName,
        coverImage: readVoiceCoverImage(chosen.node),
        ready: Boolean(readVoiceUrl(chosen.node)),
        audioSlotIndex: audioSlotByVoiceId.get(chosen.node.id),
        edgeId: chosen.edgeId,
      }
    }

    // cast-redesign §9 C 自动编号: an unnamed-but-connected reference still
    // gets an insertable @name instead of blocking on "需命名" — its number IS
    // the real payload slot (matches the 图N/视N corner badge exactly, so the
    // two never disagree even as connections reorder). A later user rename
    // degrades this auto name to plain text and V2-1's drift rewrite picks it
    // up automatically, same as any other rename.
    const autoName = (
      kind: 'character' | 'background' | 'shot' | 'video',
      slotIndex: number,
    ) => `${tc(`autoName.${kind}`)}${slotIndex + 1}`

    const tokens: ComposerReferenceToken[] = []

    // Image references (character / background / shot). Character tokens carry
    // their 音色 as boundVoice (身份单元); background / shot don't.
    for (const node of incoming) {
      const kind = getSeedanceReferenceKind(node)
      if (kind === null || kind === 'voice') continue
      const nameField =
        kind === 'character'
          ? node.data.characterName
          : kind === 'background'
            ? node.data.backgroundName
            : node.data.shotName
      const name = typeof nameField === 'string' ? nameField.trim() : ''
      const mediaUrl = getNodeMediaUrl(node.data)
      const slotIndex = mediaUrl ? payloadImageUrls.indexOf(mediaUrl) : -1
      const resolvedName =
        name || (slotIndex >= 0 ? autoName(kind, slotIndex) : '')
      tokens.push({
        id: node.id,
        kind,
        label: resolvedName,
        token: resolvedName ? `@${resolvedName}` : '',
        mediaUrl,
        imageSlotIndex: slotIndex >= 0 ? slotIndex : undefined,
        edgeId: directEdgeBySource.get(node.id),
        ...(kind === 'character'
          ? { boundVoice: resolveBoundVoice(node.id) }
          : {}),
      })
    }

    // 旁白 — voices wired DIRECTLY into the video node (no character). Ready →
    // @AudioN insertable token; unready → dimmed non-insertable slot (不静默丢).
    // Character-routed voices are absorbed above and skipped here.
    for (const node of incoming) {
      if (!isVoiceProfileNode(node)) continue
      const voiceName =
        typeof node.data.voiceName === 'string'
          ? node.data.voiceName.trim()
          : ''
      const ready = Boolean(readVoiceUrl(node))
      const slot = audioSlotByVoiceId.get(node.id)
      tokens.push({
        id: node.id,
        kind: 'voice',
        label: voiceName,
        token: ready && slot !== undefined ? `@Audio${slot + 1}` : '',
        coverImage: readVoiceCoverImage(node),
        audioSlotIndex: ready ? slot : undefined,
        insertable: ready,
        dimmed: !ready,
        edgeId: directEdgeBySource.get(node.id),
      })
    }

    // Video references (uploaded videoReference nodes or upstream generated
    // videos) — they ride video_urls automatically AND are now insertable (§9 D
    // 视频可内联引用): auto-numbered off their own video_urls slot, so a phrase
    // like「运镜完全参考 @视频1」works. No user-rename field exists for videos
    // yet, so the auto name is always used.
    const payloadVideoUrls = harvestUpstreamVideoUrls(incoming)
    for (const node of incoming) {
      if (!isVideoSourceNode(node)) continue
      const url =
        typeof node.data.mediaUrl === 'string' ? node.data.mediaUrl : undefined
      if (!url) continue
      const slotIndex = payloadVideoUrls.indexOf(url)
      const resolvedName = slotIndex >= 0 ? autoName('video', slotIndex) : ''
      tokens.push({
        id: node.id,
        kind: 'video',
        label: resolvedName,
        token: resolvedName ? `@${resolvedName}` : '',
        insertable: Boolean(resolvedName),
        mediaUrl:
          typeof node.data.videoThumbnailUrl === 'string'
            ? node.data.videoThumbnailUrl
            : undefined,
        videoSlotIndex: slotIndex >= 0 ? slotIndex : undefined,
        edgeId: directEdgeBySource.get(node.id),
      })
    }

    // Keyframe references (首/尾帧, role=frame) — they ride image_urls (first,
    // per harvestUpstreamImageUrls) but have no name-token, so they surface as
    // projection-only slots in the 镜头 card (cast-redesign §3/§4, keyframe→镜头卡).
    for (const node of incoming) {
      if (!isKeyframeNode(node)) continue
      const url = getNodeMediaUrl(node.data)
      if (!url) continue
      const slotIndex = payloadImageUrls.indexOf(url)
      tokens.push({
        id: node.id,
        kind: 'keyframe',
        label: '',
        token: '',
        insertable: false,
        mediaUrl: url,
        imageSlotIndex: slotIndex >= 0 ? slotIndex : undefined,
        edgeId: directEdgeBySource.get(node.id),
      })
    }

    return tokens
  }, [edges, nodes, nodeId, tc])

  const state = useMemo(
    () => deriveSwitcherStateFromModel(data.model),
    [data.model],
  )
  const brands = useMemo(() => getSurfacedVideoBrands(options), [options])
  const variants = useMemo(
    () => (state.brand ? getBrandVariants(state.brand) : []),
    [state.brand],
  )
  const isDualProvider = useMemo(
    () => (state.brand ? isDualProviderBrand(state.brand, options) : false),
    [options, state.brand],
  )

  const applySelection = useCallback(
    (selection: {
      brand: string
      variant: VideoVariantId
      provider: AI_ADAPTER_TYPES
    }) => {
      const resolved = resolveVideoModelId(
        { ...selection, hasReferenceInputs },
        options,
      )
      if (resolved) updateNodeData(nodeId, { model: toSelection(resolved) })
    },
    [hasReferenceInputs, nodeId, options, updateNodeData],
  )

  const selectBrand = useCallback(
    (brand: string) => {
      const brandVariants = getBrandVariants(brand)
      const variant =
        (state.variant && brandVariants.includes(state.variant)
          ? state.variant
          : brandVariants[0]) ?? VIDEO_VARIANT_IDS.fast
      applySelection({
        brand,
        variant,
        provider: pickDefaultProvider(brand, options),
      })
    },
    [applySelection, options, state.variant],
  )

  const selectVariant = useCallback(
    (variant: VideoVariantId) => {
      if (!state.brand) return
      applySelection({
        brand: state.brand,
        variant,
        provider: state.provider ?? pickDefaultProvider(state.brand, options),
      })
    },
    [applySelection, options, state.brand, state.provider],
  )

  const selectProvider = useCallback(
    (provider: AI_ADAPTER_TYPES) => {
      if (!state.brand) return
      const variant =
        state.variant ??
        getBrandVariants(state.brand)[0] ??
        VIDEO_VARIANT_IDS.fast
      applySelection({ brand: state.brand, variant, provider })
    },
    [applySelection, state.brand, state.variant],
  )

  // Resolve the model id `selectBrand(brand)` WOULD apply, without applying it —
  // lets the composer preview the capability rebind (将映射/将忽略) before the
  // switch commits. Mirrors selectBrand's variant/provider resolution.
  const previewBrandModelId = useCallback(
    (brand: string): string | undefined => {
      const brandVariants = getBrandVariants(brand)
      const variant =
        (state.variant && brandVariants.includes(state.variant)
          ? state.variant
          : brandVariants[0]) ?? VIDEO_VARIANT_IDS.fast
      return resolveVideoModelId(
        {
          brand,
          variant,
          provider: pickDefaultProvider(brand, options),
          hasReferenceInputs,
        },
        options,
      )?.modelId
    },
    [hasReferenceInputs, options, state.variant],
  )

  useEffect(() => {
    if (data.model) return
    if (options.length === 0) return
    // Inherit the canvas-default model (topbar chip); fall back to Seedance Fast
    // when unset or when the default can't resolve, so a spawned node always
    // gets a runnable model even if never selected.
    const brand = defaultVideoModel?.brand ?? VIDEO_BRAND_IDS.seedance
    const variant = defaultVideoModel?.variant ?? VIDEO_VARIANT_IDS.fast
    const resolved =
      resolveVideoModelId(
        {
          brand,
          variant,
          provider: pickDefaultProvider(brand, options),
          hasReferenceInputs,
        },
        options,
      ) ??
      resolveVideoModelId(
        {
          brand: VIDEO_BRAND_IDS.seedance,
          variant: VIDEO_VARIANT_IDS.fast,
          provider: pickDefaultProvider(VIDEO_BRAND_IDS.seedance, options),
          hasReferenceInputs,
        },
        options,
      )
    if (resolved) updateNodeData(nodeId, { model: toSelection(resolved) })
  }, [
    data.model,
    defaultVideoModel,
    hasReferenceInputs,
    nodeId,
    options,
    updateNodeData,
  ])

  return {
    options,
    brands,
    state,
    variants,
    isDualProvider,
    hasReferenceInputs,
    hasUpstreamInputs,
    referenceKinds,
    referenceTokens,
    selectBrand,
    selectVariant,
    selectProvider,
    previewBrandModelId,
  }
}
