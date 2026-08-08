'use client'

import { useEffect, useMemo } from 'react'
import { useEdges, useNodes } from '@xyflow/react'
import { useTranslations } from 'next-intl'

import { NODE_TYPE_IDS, NODE_WORKFLOW_FIELD_IDS } from '@/constants/node-types'
import { getVideoModelImageLimit } from '@/constants/video-model-send-plan'
import {
  DEFAULT_VIDEO_NODE_MODE,
  DEFAULT_VIDEO_VARIANT,
  getNodeModeForModel,
  type VideoNodeMode,
} from '@/constants/video-node-modes'
import { useNodeWorkflowActions } from '@/components/business/node/NodeWorkflowActionsContext'
import { parseMentions } from '@/components/business/node/composer/MentionInput'
import type { ReferenceTokenData } from '@/components/business/node/composer/ReferenceTokenChip'
import {
  buildVideoSendPreview,
  type VideoSendPreview,
} from '@/lib/node-video-send-preview'
import { getNodeWorkflowFieldValue } from '@/lib/node-workflow-prompt'
import {
  getEdgeStageOverrideUrls,
  getNodeMediaUrl,
  getNodePrimaryMediaUrl,
  getNodeStageMediaUrls,
  getSeedanceReferenceKind,
  getUpstreamNodes,
  harvestUpstreamAudioBindings,
  harvestUpstreamCloseupUrls,
  harvestUpstreamImageUrls,
  harvestUpstreamVideoUrls,
  isCloseupNode,
  isKeyframeNode,
  isVideoSourceNode,
  isVisualReferenceNode,
  isVoiceProfileNode,
  readVoiceCoverImage,
  readVoiceUrl,
} from '@/lib/node-workflow-graph'
import {
  pickDefaultVideoModel,
  resolveVideoModelForMode,
} from '@/lib/video-node-model-resolver'
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

/** A5 (canvas-relationship-v3 §7b): read-only preview of one entry in a
 *  collector's `referenceAssets` gallery — just enough for the 管理素材 overlay's
 *  folder row to render a thumbnail grid. Not the full
 *  `NodeWorkflowReferenceAssetSchema` shape (weight/role/source stay in the
 *  card's own detail panel, `CharacterImageReferenceControls`). */
export interface ComposerGalleryAssetPreview {
  id: string
  url: string
  isPrimary?: boolean
  /** R3-6a §4: read-only mirror of the asset's `onStage` curation — lets the
   *  folder row's thumbnail grid show which extras ride along in the harvest
   *  alongside the ★ primary. The checkbox to TOGGLE it here is R3-6b (see
   *  the reserved gutter in `FolderRow`); this panel only displays it. */
  onStage?: boolean
  /** R3-6b §3 每镜覆写: whether this URL is in THIS video's resolved stage set
   *  RIGHT NOW — override-aware (falls back to the card's own `onStage` set
   *  when the collector→video edge carries no override). Drives the
   *  per-thumbnail checkbox's checked state in `FolderRow`; distinct from
   *  `onStage` (the card's OWN default, unaware of any particular video). */
  stagedForVideo?: boolean
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
  /** A standalone voice can reach the video through a non-character visual
   *  node (`voice -> image/shot -> video`). The generate payload already
   *  follows that route; keep the intermediate node visible so the UI can
   *  explain why the audio is included instead of presenting it as a direct
   *  video input. */
  routedThroughId?: string
  routedThroughLabel?: string
  /** For a closeup token (§9 B): the character node it wires into, so the strip
   *  can group it under that character's identity unit. */
  parentCharacterId?: string
  /** A5: only set for collector kinds (character/background) — the card's full
   *  `referenceAssets` gallery, read-only, so the 管理素材 overlay's folder row
   *  can show "图集 N 张" + an expandable thumbnail grid without the video node
   *  reaching into `referenceAssets` shape itself. undefined for file kinds
   *  (shot/keyframe/closeup/voice/video), which aren't collectors. */
  galleryAssets?: ComposerGalleryAssetPreview[]
  /** R3-6b §3: true when the collector→video edge feeding THIS token carries
   *  an explicit `stageOverrideUrls` (vs inheriting the card's own onStage
   *  set). Only ever set for a collector kind (character/background) — same
   *  scope as `galleryAssets`. Drives the folder row's "恢复默认" button. */
  stageOverrideActive?: boolean
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
    // V-2 主图: a fusion-built card (referenceAssets only, no mediaUrl) now
    // contributes a real image via getNodePrimaryMediaUrl's fallback chain —
    // this flag has to agree, or the model switcher could pick a non-
    // reference variant for a node that actually sends an image.
    const hasVisual = incoming.some(
      (node) =>
        (isVisualReferenceNode(node) || isKeyframeNode(node)) &&
        Boolean(getNodePrimaryMediaUrl(node.data)),
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
    // image_urls order = keyframes → main refs → 1-hop closeups, matching the
    // generate path (StudioNodeWorkbench). Closeups append last so 特写N's slot
    // number lines up with its 图N badge and the model's cap keeps main refs.
    // R3-6b §3: edges + nodeId thread through so a collector's contribution
    // honors its per-edge stageOverrideUrls — otherwise the slot badges shown
    // here would disagree with what an active override actually sends.
    // 包 4：`.urls` 只含已过审的图。槽位编号（图N / 特写N）因此**跟着门禁走** ——
    // 未过审的图不占号，否则界面标的 @Image2 会和真实发出去的第 2 张对不上。
    const payloadImageUrls = [
      ...harvestUpstreamImageUrls(incoming, edges, nodeId).urls,
      ...harvestUpstreamCloseupUrls(nodeId, edges, nodes).urls,
    ]
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
      kind: 'character' | 'background' | 'shot' | 'video' | 'closeup',
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
      // V-2 主图: show/slot-match the ★-starred image (or its fallback — see
      // getNodePrimaryMediaUrl), not the raw mediaUrl, so the token's
      // thumbnail and its 图N badge always agree with what's actually in
      // payloadImageUrls (built via the same primary-aware harvest).
      const mediaUrl = getNodePrimaryMediaUrl(node.data)
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
        // A5: collectors (character/background) carry their gallery for the
        // 管理素材 folder row — `shot` isn't a collector (§3.0 档案卡 vs 产出立
        // 卡), so it's left unset there even though the schema technically
        // allows referenceAssets on any image node.
        // R3-6b §3 每镜覆写: the SAME collector→video edge override
        // (`getEdgeStageOverrideUrls`) the actual harvest resolves is read
        // here too, so the folder row's per-thumbnail checkbox state never
        // disagrees with what will actually be sent.
        ...(kind === 'character' || kind === 'background'
          ? (() => {
              const edgeId = directEdgeBySource.get(node.id)
              const edge = edgeId
                ? edges.find((candidate) => candidate.id === edgeId)
                : undefined
              const overrideUrls = getEdgeStageOverrideUrls(edge)
              const stagedUrls = new Set(
                getNodeStageMediaUrls(node.data, overrideUrls),
              )
              return {
                galleryAssets: (node.data.referenceAssets ?? []).map(
                  (asset) => ({
                    id: asset.id,
                    url: asset.url,
                    isPrimary: asset.isPrimary,
                    onStage: asset.onStage,
                    stagedForVideo: stagedUrls.has(asset.url),
                  }),
                ),
                stageOverrideActive: overrideUrls !== undefined,
              }
            })()
          : {}),
      })

      // Closeup sub-references (§9 B): a character's face-detail images wire
      // INTO the character (closeup → character), so they're resolved 1-hop from
      // here — surfaced as insertable `@特写N` tokens tagged with their parent
      // character so the strip can group them into its identity unit. Their edge
      // is the closeup→character one, so × detaches the closeup (not the video
      // edge). They ride image_urls via harvestUpstreamCloseupUrls.
      if (kind === 'character') {
        for (const upstream of getUpstreamNodes(node.id, edges, nodes)) {
          if (!isCloseupNode(upstream)) continue
          const closeupUrl = getNodePrimaryMediaUrl(upstream.data)
          const closeupSlot = closeupUrl
            ? payloadImageUrls.indexOf(closeupUrl)
            : -1
          const closeupNameField =
            typeof upstream.data.characterName === 'string'
              ? upstream.data.characterName.trim()
              : ''
          const closeupName =
            closeupNameField ||
            (closeupSlot >= 0 ? autoName('closeup', closeupSlot) : '')
          // The closeup's edge is into the CHARACTER (closeup → character), not
          // the video — so × on this slot detaches the closeup from its subject.
          const closeupEdgeId = edges.find(
            (edge) => edge.source === upstream.id && edge.target === node.id,
          )?.id
          tokens.push({
            id: upstream.id,
            kind: 'closeup',
            label: closeupName,
            token: closeupName ? `@${closeupName}` : '',
            mediaUrl: closeupUrl,
            imageSlotIndex: closeupSlot >= 0 ? closeupSlot : undefined,
            parentCharacterId: node.id,
            edgeId: closeupEdgeId,
          })
        }
      }
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

    // Voices can also be wired through a non-character visual node
    // (`voice -> shot/image -> video`). The request harvester already follows
    // this route, but the reference UI used to omit the voice because it only
    // inspected direct video inputs. Surface it as its own audio token and
    // retain the route edge so disconnect/locate actions operate on the real
    // binding. Character-routed voices remain absorbed into `boundVoice`.
    const representedVoiceIds = new Set<string>()
    for (const token of tokens) {
      if (token.kind === 'voice') representedVoiceIds.add(token.id)
      if (token.boundVoice) representedVoiceIds.add(token.boundVoice.nodeId)
    }
    for (const visualNode of incoming) {
      const visualKind = getSeedanceReferenceKind(visualNode)
      if (
        visualKind === null ||
        visualKind === 'voice' ||
        visualKind === 'character'
      ) {
        continue
      }
      const routeToken = tokens.find((token) => token.id === visualNode.id)
      for (const routeEdge of edges) {
        if (routeEdge.target !== visualNode.id) continue
        const voiceNode = nodes.find((node) => node.id === routeEdge.source)
        if (
          !voiceNode ||
          !isVoiceProfileNode(voiceNode) ||
          representedVoiceIds.has(voiceNode.id)
        ) {
          continue
        }
        const voiceName =
          typeof voiceNode.data.voiceName === 'string'
            ? voiceNode.data.voiceName.trim()
            : ''
        const ready = Boolean(readVoiceUrl(voiceNode))
        const slot = audioSlotByVoiceId.get(voiceNode.id)
        tokens.push({
          id: voiceNode.id,
          kind: 'voice',
          label: voiceName,
          token: ready && slot !== undefined ? `@Audio${slot + 1}` : '',
          coverImage: readVoiceCoverImage(voiceNode),
          audioSlotIndex: ready ? slot : undefined,
          insertable: ready,
          dimmed: !ready,
          edgeId: routeEdge.id,
          routedThroughId: visualNode.id,
          routedThroughLabel: routeToken?.label,
        })
        representedVoiceIds.add(voiceNode.id)
      }
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

  // V-3a 管理素材面板（docs/references/pages/canvas-video-card.md
  // §10 V-3 起点）: "已引用" = a token whose `@name` (the SAME name space
  // MentionInput renders chips for — `token` stripped of its leading `@`, not
  // `label`; voice/video tokens are positional like `@Audio1`/`@视频1`, not
  // their display label) literally appears in the node's OWN prompt text right
  // now. "已连接" is simply every wired token (`referenceTokens.length`),
  // named or not — matches the drawer's "已连接 N 全量列". Recomputed from the
  // live prompt on every render so the strip/drawer status never lags what the
  // user just typed.
  const promptValue = getNodeWorkflowFieldValue(
    data,
    NODE_WORKFLOW_FIELD_IDS.prompt,
  )
  const referencedTokenIds = useMemo(() => {
    const idsByName = new Map<string, string[]>()
    for (const token of referenceTokens) {
      if (!token.token) continue
      const name = token.token.replace(/^@/, '')
      idsByName.set(name, [...(idsByName.get(name) ?? []), token.id])
    }
    const knownNames = Array.from(idsByName.keys())
    const ids = new Set<string>()
    for (const segment of parseMentions(promptValue, knownNames)) {
      if (segment.type !== 'token') continue
      for (const id of idsByName.get(segment.name) ?? []) ids.add(id)
    }
    return ids
  }, [referenceTokens, promptValue])

  // 2026-08-08 收敛：brand/variant/provider 这一整套 switcher 状态与它的三个
  // setter（selectBrand / selectVariant / selectProvider）、以及 brands /
  // variants / isDualProvider / previewBrandModelId 全部删除 —— 模型选择早就交给
  // `CanvasRoutePicker`（→ `BaseModelPickerPanel` 三层钻取）了，这套 API 在 UI 上
  // **零消费**，只是还挂在返回值里，让人以为画布用的是另一套分类。
  // 见 canvas-video-domain-cleanup-2026-08-08.md §9.8。

  /**
   * 节点当前的模式 —— **这一份是唯一事实源**，`VideoComposer` 也从这里取，别在组件里
   * 再算一遍。
   *
   * 存量节点没有 `videoMode` 字段时从它当前的模型反推（模式与契约的 `referenceMode`
   * 一一对应，反推是精确的）。默认成关键帧会让存量的「全能参考」节点一打开就显示错档。
   */
  const videoMode: VideoNodeMode =
    data.videoMode ??
    (data.model
      ? getNodeModeForModel(data.model.modelId, data.model.adapterType)
      : DEFAULT_VIDEO_NODE_MODE)

  useEffect(() => {
    if (data.model) return
    if (options.length === 0) return
    // 继承项目默认型号，取不到就用 DEFAULT_VIDEO_VARIANT —— 新生成的节点必须带一个
    // 能跑的模型。⚠ 端点按**模式**挑，不再按「这次接了什么」自动判：一个刚生成、还
    // 什么都没接的节点，也该落在它那一档对应的端点上。
    const resolved = pickDefaultVideoModel(
      defaultVideoModel?.variant ?? DEFAULT_VIDEO_VARIANT,
      videoMode,
      options,
    )
    if (resolved) updateNodeData(nodeId, { model: toSelection(resolved) })
  }, [
    data.model,
    defaultVideoModel,
    videoMode,
    nodeId,
    options,
    updateNodeData,
  ])

  // V-3b 容量护栏 / R3-6b §1: single source for the model's reference-image
  // cap — VideoComposer.tsx used to compute this itself from `data.model`,
  // a second independent copy of the exact same ternary. Hoisted here so
  // BOTH the panel's capacity math AND `sendPreview` below read the same
  // value; undefined (model unknown) degrades to "no cap known", never a
  // guessed number.
  //
  // ⚠ 与提交链路（`StudioNodeWorkbench`）走**同一个** `resolveVideoModelForMode`：
  // 「实际会跑哪个模型」只留一份实现，容量上限与送出预览就不会和真正发出去的请求
  // 对不上。此前这里自己拆 brand/variant/provider 算了一遍，于是一个 2.5 节点的
  // 容量按 2.0 算（9/3/3 而不是 30/10/10）。
  const effectivePreviewModel = useMemo(() => {
    if (!data.model) return data.model
    return (
      resolveVideoModelForMode(data.model, videoMode, options) ?? data.model
    )
  }, [data.model, videoMode, options])
  const maxReferenceImages = getVideoModelImageLimit(
    effectivePreviewModel?.modelId,
    effectivePreviewModel?.adapterType,
  )

  // R3-6b §2 发送图例预览: reactive, read-only mirror of exactly what
  // StudioNodeWorkbench.handleGenerateMediaNode's video branch would send
  // RIGHT NOW — same harvest + assemble + legend + translate pipeline (see
  // node-video-send-preview.ts), recomputed live off the same edges/nodes
  // this hook already reads. `overflow` doubles as ReferenceManagerPanel's
  // "N/max ⚠" capacity fact source (§1) — one assembly call, two UI surfaces.
  const sendPreview: VideoSendPreview = useMemo(
    () =>
      buildVideoSendPreview({
        nodeId,
        data,
        edges,
        nodes,
        modelId: effectivePreviewModel?.modelId,
        adapterType: effectivePreviewModel?.adapterType,
        maxReferenceImages,
        autoNamePrefix: {
          character: tc('autoName.character'),
          background: tc('autoName.background'),
          shot: tc('autoName.shot'),
          closeup: tc('autoName.closeup'),
          video: tc('autoName.video'),
        },
      }),
    [
      nodeId,
      data,
      edges,
      nodes,
      effectivePreviewModel?.modelId,
      effectivePreviewModel?.adapterType,
      maxReferenceImages,
      tc,
    ],
  )

  return {
    options,
    videoMode,
    hasReferenceInputs,
    hasUpstreamInputs,
    referenceKinds,
    referenceTokens,
    referencedTokenIds,
    maxReferenceImages,
    sendPreview,
  }
}
