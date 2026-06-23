'use client'

import { useCallback, useEffect, useMemo } from 'react'
import { useEdges, useNodes } from '@xyflow/react'

import { NODE_TYPE_IDS } from '@/constants/node-types'
import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  VIDEO_BRAND_IDS,
  VIDEO_VARIANT_IDS,
  type VideoVariantId,
} from '@/constants/video-brands'
import { useNodeWorkflowActions } from '@/components/business/node/NodeWorkflowActionsContext'
import {
  getNodeMediaUrl,
  getSeedanceReferenceKind,
  getUpstreamNodes,
  harvestUpstreamAudioBindings,
  isKeyframeNode,
  isVisualReferenceNode,
  isVoiceProfileNode,
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
    const kinds = new Set<'character' | 'background' | 'voice'>()
    for (const node of incoming) {
      const kind = getSeedanceReferenceKind(node)
      if (kind) kinds.add(kind)
    }
    return Array.from(kinds)
  }, [edges, nodes, nodeId])

  // Per-reference tokens for the detail panel's clickable @token chips. Visual
  // refs (character/background) carry their user-given name → @name (natural
  // language; the image itself still rides image_urls). Voices come from the
  // same harvest the generate path uses, so @AudioN order matches the fal
  // builder's audio_urls slots exactly. An empty `token` = unnamed → the chip
  // is a non-insertable indicator until the node is named.
  const referenceTokens = useMemo<
    Array<{
      id: string
      kind: 'character' | 'background' | 'voice'
      label: string
      token: string
    }>
  >(() => {
    const incoming = getUpstreamNodes(nodeId, edges, nodes)
    const tokens: Array<{
      id: string
      kind: 'character' | 'background' | 'voice'
      label: string
      token: string
    }> = []
    for (const node of incoming) {
      const kind = getSeedanceReferenceKind(node)
      if (kind === 'character') {
        const name =
          typeof node.data.characterName === 'string'
            ? node.data.characterName.trim()
            : ''
        tokens.push({
          id: node.id,
          kind,
          label: name,
          token: name ? `@${name}` : '',
        })
      } else if (kind === 'background') {
        const name =
          typeof node.data.backgroundName === 'string'
            ? node.data.backgroundName.trim()
            : ''
        tokens.push({
          id: node.id,
          kind,
          label: name,
          token: name ? `@${name}` : '',
        })
      }
    }
    harvestUpstreamAudioBindings(nodeId, edges, nodes).forEach((binding, i) => {
      tokens.push({
        id: `audio-${i}`,
        kind: 'voice',
        label: binding.characterName ?? '',
        token: `@Audio${i + 1}`,
      })
    })
    return tokens
  }, [edges, nodes, nodeId])

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
