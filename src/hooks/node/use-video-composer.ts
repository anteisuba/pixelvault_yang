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
import {
  buildNodeWorkflowPrompt,
  getNodeWorkflowFieldValue,
} from '@/lib/node-workflow-prompt'
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
  isShotTextNode,
  isVoiceProfileNode,
  orderKeyframes,
  readVoiceCoverImage,
  readVoiceUrl,
} from '@/lib/node-workflow-graph'
import { resolveNodeDisplayName } from '@/lib/node-display-name'
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
 *  `edgeId` 是直连这个视频节点的那条边（× = 删掉它）。 `boundVoice` rides a
 *  character token as its 音色 facet (cast-redesign 五卡：音色收进角色). */
export interface ComposerReferenceToken extends ReferenceTokenData {
  edgeId?: string
  boundVoice?: BoundVoice
  /* ⚠ `routedThroughId` / `routedThroughLabel` 已于阶段 5 删除：音频区改成直接
     由 `audioBindings` 派生之后，「经某个视觉节点绕进来的音色」那一趟单独扫描
     整个成了重复（`harvestUpstreamAudioBindings` 本来就走那条路），而这两个字段
     自始至终**没有任何渲染方**——只写不读。 */
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
 * 单个视频节点的编排状态：模式（关键帧 / 多图参考 / 全能参考）、上游素材的采集与
 * 令牌化、容量上限、送出预览。
 *
 * ⚠ 这段注释此前描述的是 brand/variant/provider 三段切换器 —— 那套已于 2026-08-08
 * 随两套分类收敛一并删除（cleanup §9.9/§9.10）。模型选择走 `BaseModelPickerPanel`
 * 的三层钻取，端点由**模式**决定，`videoMode` 就在这里推导（存量节点从模型反推）。
 *
 * 它还持有 autospawn 的默认模型 effect：`scriptDocToGraph` 投影出来的视频节点
 * `data.model` 是空的、参考边却已经接好，这个 effect 保证它即使从没被选中也有一个
 * 能跑的模型。
 */
export function useVideoComposer(nodeId: string, data: NodeWorkflowNodeData) {
  const nodes = useNodes<NodeWorkflowNode>()
  const edges = useEdges<NodeWorkflowEdge>()
  const tc = useTranslations('StudioNode.videoComposer')
  // 关键帧槽位名（首帧 / 尾帧）与画布上的角色选择器读同一批键，改一处两处都跟着走。
  const tRoles = useTranslations('StudioNode.characterImage.reference')
  const { modelOptionsByType, updateNodeData } = useNodeWorkflowActions()

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
  // ⚠ 这里曾经还挂着 `imageSlotIndex` / `audioSlotIndex` / `videoSlotIndex` 三个字段，
  // 注释说它们喂「图N / 音N 角标」。2026-08-08 实查：**那个角标不存在**，三个字段零
  // 消费者（`grep SlotIndex src/**/*.tsx` 只命中测试里的类型 stub），已删。
  //
  // 但 `payloadImageUrls` 与 `slotIndex` **留着**：它们还喂 `autoName(kind, slotIndex)`
  // —— 「角色1」「镜头2」这种自动名字是用户可见的，而且会变成 `@token`。
  // ⚠ 名字里的数字不必等于真实载荷下标：发送时 `filterReferencedImages` 会按真实候选
  // 表重新解析「名字 → 位置」，那才是权威。这里只负责起一个稳定的名字。
  //
  // `edgeId` 是直连这个视频节点的那条边（§7.1: 删除槽位 = 删连线）；经角色中转的
  // 音色没有直连边 → 没有 edgeId → 没有 × 按钮。
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
      /**
       * ⚠ 走**全仓唯一那个解析器**，不再自己读三个 `*Name` 字段 —— 它们够不到
       * `mediaLabel` / `sourceLabel`，于是卡片标题写着「漂泊者_全身_官方_0016」
       * 的图，在槽架里叫「镜头2」（下面 autoName 的兜底）。同一个节点两个名字，
       * 取决于你在哪看；而候选菜单用的正是这个解析器，所以菜单里选的和槽里显示
       * 的对不上。owner 2026-08-09 真机点出来的。
       *
       * 收割侧（`harvestUpstreamVideoImageReferences`，图例名字的来源）同批改成
       * 同一个解析器 —— 两处必须一起动，否则只是把不一致换个地方。
       */
      const name = resolveNodeDisplayName(node.data) ?? ''
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
            parentCharacterId: node.id,
            edgeId: closeupEdgeId,
          })
        }
      }
    }

    /**
     * 音频区 —— **直接由 `audioBindings` 派生**（阶段 5「声音三形态对称」）。
     *
     * ⚠ 这里以前只扫**直连**视频节点的音色，于是「音色绑角色卡」那一路
     * （`voice → character → video`）在槽架里**完全不存在** —— 而
     * `harvestUpstreamAudioBindings` 走两跳，它照发不误。结果就是槽架说
     * 「音频 0/3」、载荷里却有一条音频：本轮要治的「账对不齐」又长回来一处，
     * 只不过这次藏在两跳后面。
     *
     * 改成直接遍历 `audioBindings`，音频区与 `audio_urls` 就是同一份名单、
     * 同一个顺序、同一个 `@AudioN` 序号 —— 不再有第二次推导可以走偏。
     * 角色绑定的那条按拍板显示 **@角色名**（report §8「音槽显 @角色名」），
     * 因为用户认的是「谁在说话」，不是音色文件叫什么。
     */
    const nodeById = new Map(nodes.map((node) => [node.id, node]))
    for (const [index, binding] of audioBindings.entries()) {
      const voiceNode = binding.nodeId
        ? nodeById.get(binding.nodeId)
        : undefined
      const voiceName =
        voiceNode && typeof voiceNode.data.voiceName === 'string'
          ? voiceNode.data.voiceName.trim()
          : ''
      tokens.push({
        id: binding.nodeId ?? `audio-${index}`,
        kind: 'voice',
        // 角色绑定的显角色名；散件音色显自己的名字。
        label: binding.characterName || voiceName,
        token: `@Audio${index + 1}`,
        coverImage: binding.coverImage,
        insertable: true,
        mediaUrl: binding.url,
        /**
         * 移除槽位 = 删连线。直连的删「音色 → 视频」那条；绑在角色卡上的删
         * 「音色 → 角色」那条 —— 与详情面板的「解绑音色」是同一条边，两处
         * 不会各删各的。
         */
        edgeId:
          directEdgeBySource.get(binding.nodeId ?? '') ??
          edges.find((edge) => edge.source === binding.nodeId)?.id,
      })
    }

    /**
     * 挂上了但**发不出去**的音色：直连视频、却没有任何可用音频（既没录制/上传
     * 的 clip，也没有系统音色的样本）。`harvestUpstreamAudioBindings` 只收有 URL
     * 的，所以这一类不在上面那份名单里 —— 但它确实占着画布上的一条边，静默不
     * 显示等于「我连了却什么都没发生」。标出来，并说明原因（契约 §4.7）。
     */
    for (const node of incoming) {
      if (!isVoiceProfileNode(node)) continue
      if (readVoiceUrl(node)) continue
      const voiceName =
        typeof node.data.voiceName === 'string'
          ? node.data.voiceName.trim()
          : ''
      tokens.push({
        id: node.id,
        kind: 'voice',
        label: voiceName,
        token: '',
        coverImage: readVoiceCoverImage(node),
        insertable: false,
        dimmed: true,
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
        edgeId: directEdgeBySource.get(node.id),
      })
    }

    // Keyframe references (首/尾帧, role=frame) — they ride image_urls (first,
    // per harvestUpstreamImageUrls) but have no name-token, so they surface as
    // projection-only slots in the 镜头 card (cast-redesign §3/§4, keyframe→镜头卡).
    // ⚠ 与采集/图例同一个 `orderKeyframes`：素材条上展示的就是首帧与尾帧这两张，
    // 排列顺序得和真正送出去的顺序一致。
    for (const node of orderKeyframes(incoming)) {
      const url = getNodeMediaUrl(node.data)
      if (!url) continue
      // cleanup §8.6：关键帧档是**两个具名位置**（首帧 / 尾帧），不是两张同名的图。
      // 名字取自节点自己的 `imageCategory` —— 首尾语义的载体本来就是它，这里只是把
      // 它显示出来。没标分类的（存量的旧关键帧节点）仍退回 `refKind.keyframe`。
      const category = node.data.imageCategory
      const namedSlot =
        category === 'frameStart' || category === 'frameEnd'
          ? tRoles(`roles.${category}`)
          : ''
      tokens.push({
        id: node.id,
        kind: 'keyframe',
        label: namedSlot,
        token: '',
        insertable: false,
        mediaUrl: url,
        edgeId: directEdgeBySource.get(node.id),
      })
    }

    return tokens
  }, [edges, nodes, nodeId, tc, tRoles])

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
    // 用默认型号起手 —— 新生成的节点必须带一个能跑的模型。
    // （项目级默认型号已随 `defaultVideoModel` 一并删除，见 cleanup §9.10。）
    // ⚠ 端点按**模式**挑，不再按「这次接了什么」自动判：一个刚生成、还什么都没接
    // 的节点，也该落在它那一档对应的端点上。
    const resolved = pickDefaultVideoModel(
      DEFAULT_VIDEO_VARIANT,
      videoMode,
      options,
    )
    if (resolved) updateNodeData(nodeId, { model: toSelection(resolved) })
  }, [data.model, videoMode, nodeId, options, updateNodeData])

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

  /**
   * 画布上全部**有名字、有内容**的文本节点 —— `@` 菜单里的文本候选。
   *
   * ⚠ 不过「可连」过滤：菜单问的是「我能把谁的文字粘进来」，不是「我能连谁」。
   * 全图的文本节点都能粘，连不连线是另一回事。
   *
   * `text` 是四字段（场景/动作/镜头/构图）拼成的那一段 —— 与发送时前置进提示词的
   * 是**同一个 `buildNodeWorkflowPrompt`**，所以「预览里看到的」「粘进去的」
   * 「模型收到的」是同一份字，中间没有第二套拼法。
   * ⚠ 没内容的不进表：粘一段空字符串是纯噪音，菜单里也没什么可预览。
   */
  const textNodes = useMemo(
    () =>
      nodes
        .filter(isShotTextNode)
        .map((node) => ({
          id: node.id,
          name: resolveNodeDisplayName(node.data)?.trim() ?? '',
          text: buildNodeWorkflowPrompt(node.type, node.data).trim(),
        }))
        .filter((entry) => entry.name.length > 0 && entry.text.length > 0),
    [nodes],
  )

  return {
    options,
    videoMode,
    textNodes,
    hasReferenceInputs,
    hasUpstreamInputs,
    referenceKinds,
    referenceTokens,
    referencedTokenIds,
    maxReferenceImages,
    sendPreview,
  }
}
