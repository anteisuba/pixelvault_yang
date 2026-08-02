'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useEdges, useNodes } from '@xyflow/react'
import { Mic2, Plus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { NODE_STUDIO_CHARACTER_CARD_UNBOUND_ID } from '@/constants/node-studio'
import { NODE_MEDIA_KIND_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { CharacterReferenceGalleryExtraItem } from '@/components/business/node/CharacterImageReferenceControls'
import { resolveNodePresentationType } from '@/lib/node-presentation'
import {
  getNodePrimaryMediaUrl,
  getUpstreamNodes,
  isCloseupNode,
  isVoiceProfileNode,
} from '@/lib/node-workflow-graph'
import type { GenerationRecord } from '@/types'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'
import { useCharacterCards } from '@/hooks/cards/use-character-cards'

import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { NodeMediaInspector } from './NodeMediaInspector'

interface CharacterImageInspectorProps {
  node: NodeWorkflowNode
  layout?: 'default' | 'object-studio'
}

/**
 * Downstream 出演区 chip label — same field-precedence NodeDetailPanel's
 * `getNodeName` / CastCard's `getCastCardName` already each carry for their
 * own context (a shared helper would need a 4th home to live in; the
 * precedent in this codebase is a small per-context copy, not one import
 * three unrelated files reach into).
 */
function getParticipantLabel(node: NodeWorkflowNode, fallback: string): string {
  if (
    node.type === NODE_TYPE_IDS.shot ||
    (node.type === NODE_TYPE_IDS.image && node.data.role === 'shot')
  ) {
    return node.data.shotName?.trim() || fallback
  }
  if (node.type === NODE_TYPE_IDS.seedance) {
    return node.data.mediaLabel?.trim() || fallback
  }
  return fallback
}

/**
 * Character image node Inspector — the S5c 二.2 档案面板: `NodeMediaInspector`
 * in gallery mode (视觉身份区 = main photo + always-visible reference grid,
 * closeups merged in) + 身份词条区 (name — visualSeed has no existing editor
 * anywhere in the codebase, so it's surfaced read-only rather than growing an
 * ad hoc one here) + 听觉身份区 (bound-voice chip, now with a real "＋绑定"
 * entry point reusing the exact `spawnReference` + audio `AssetSelectorDialog`
 * pattern `VideoComposer`'s ＋配音 slot already established) + 出演区
 * (downstream edges as focus-on-click chips).
 */
export function CharacterImageInspector({
  node,
  layout = 'default',
}: CharacterImageInspectorProps) {
  const t = useTranslations('StudioNode.characterImage')
  const tDossier = useTranslations('StudioNode.dossier')
  const tTypes = useTranslations('StudioNode.nodeTypes')
  const allNodes = useNodes<NodeWorkflowNode>()
  const edges = useEdges<NodeWorkflowEdge>()
  const {
    updateNodeData,
    deleteEdge,
    spawnReference,
    extractReference,
    focusNode,
    setExpandedNodeId,
  } = useNodeWorkflowActions()
  const [voiceDialogOpen, setVoiceDialogOpen] = useState(false)
  const { cards, findCard } = useCharacterCards()
  const boundCard = node.data.cardId ? findCard(node.data.cardId) : null

  useEffect(() => {
    if (!boundCard || node.data.cardId !== boundCard.id) return

    const imageUrls = [
      boundCard.sourceImageUrl,
      ...boundCard.sourceImages,
      ...(boundCard.referenceImages ?? []),
    ].filter((url, index, urls) => Boolean(url) && urls.indexOf(url) === index)
    const [primaryUrl, ...referenceUrls] = imageUrls
    if (!primaryUrl) return

    updateNodeData(node.id, {
      cardId: boundCard.id,
      characterName: boundCard.name,
      character: {
        characterId: boundCard.id,
        name: boundCard.name,
        visualSeed:
          boundCard.characterPrompt || boundCard.description || boundCard.name,
      },
      prompt: node.data.prompt || boundCard.characterPrompt,
      imageSource: 'existing',
      mediaKind: NODE_MEDIA_KIND_IDS.image,
      mediaLabel: boundCard.name,
      mediaUrl: primaryUrl,
      imageUrl: primaryUrl,
      sourceGenerationId: undefined,
      sourceLabel: boundCard.name,
      referenceAssets: referenceUrls.map((url, index) => ({
        id: `card-${boundCard.id}-${index}`,
        url,
        role: 'identity' as const,
        weight: 1,
        source: 'asset' as const,
        sourceId: boundCard.id,
        name: boundCard.name,
      })),
    })
  }, [boundCard, node.data.cardId, node.data.prompt, node.id, updateNodeData])

  const visualSeed = node.data.character?.visualSeed?.trim()

  // Detect an upstream voice node so the binding is visible before the video
  // step. Mirrors the previous bespoke inspector — the downstream Seedance
  // Reference builder labels its @AudioN slot with this character's name.
  // S5b B1-7 / S5c 二.2: also carries the edge id so the binding can be taken
  // back out (听觉身份区's × unbind).
  const boundVoice: { voiceName: string | null; edgeId: string } | null =
    (() => {
      const upstream = getUpstreamNodes(node.id, edges, allNodes)
      for (const candidate of upstream) {
        if (!isVoiceProfileNode(candidate)) continue
        const url =
          typeof candidate.data.voiceReferenceAudioUrl === 'string'
            ? candidate.data.voiceReferenceAudioUrl.trim()
            : ''
        if (!url) continue
        const edge = edges.find(
          (candidateEdge) =>
            candidateEdge.source === candidate.id &&
            candidateEdge.target === node.id,
        )
        if (!edge) continue
        const voiceName =
          (typeof candidate.data.voiceName === 'string' &&
            candidate.data.voiceName.trim()) ||
          (typeof candidate.data.voiceId === 'string' &&
            candidate.data.voiceId.trim()) ||
          (typeof candidate.data.voiceReferenceAudioName === 'string' &&
            candidate.data.voiceReferenceAudioName.trim()) ||
          null
        return { voiceName, edgeId: edge.id }
      }
      return null
    })()

  // 视觉身份区 closeup merge (§二.2 "吃进的 closeup 图并入陈列，标来源") — a
  // closeup is a SEPARATE bound node (closeup → character 1-hop, cast-redesign
  // §9 B), not a referenceAssets entry, so it's read-only in the grid (no
  // weight/role/extract — those only make sense for this node's own array).
  const closeupItems = useMemo<CharacterReferenceGalleryExtraItem[]>(() => {
    const items: CharacterReferenceGalleryExtraItem[] = getUpstreamNodes(
      node.id,
      edges,
      allNodes,
    )
      .filter(isCloseupNode)
      .map((closeup) => ({
        id: closeup.id,
        url:
          typeof closeup.data.mediaUrl === 'string'
            ? closeup.data.mediaUrl
            : '',
        label:
          (typeof closeup.data.characterName === 'string' &&
            closeup.data.characterName.trim()) ||
          tTypes('image'),
      }))
      .filter((item) => item.url.length > 0)

    // 台账 #11（2026-08-02）：卡上有图、展开面板却「参考图 0/3」。
    // 卡面读的是 `getNodePrimaryMediaUrl`（imageUrl ?? mediaUrl，见
    // node-workflow-graph），而这个陈列只 map `referenceAssets` —— 角色域有
    // 几条写路径（角色卡绑定、spawnReference）把主图**只**写进 mediaUrl，
    // 不镜像进图集，于是两边看到的不是同一件事。
    //
    // ⚠ 修法刻意不是「面板改读 mediaUrl 优先」：`IdentityCollectorCard` 的
    // 注释写明「图集是收集器卡图片的唯一事实源，mediaUrl 只是它的封面」，
    // 那个建模是对的，不该为了显示反过来推翻它。这里沿用卡面同款的兜底语义
    // ——图集为空时才把主图并进来，且走 extraItems 通道（只读、标来源），
    // 不伪装成一条可编辑的图集条目。
    const primaryUrl = getNodePrimaryMediaUrl(node.data)
    const hasOwnAssets = (node.data.referenceAssets ?? []).some(
      (asset) => asset.url.trim().length > 0,
    )
    if (
      !hasOwnAssets &&
      primaryUrl &&
      !items.some((i) => i.url === primaryUrl)
    ) {
      items.unshift({
        id: `${node.id}:primary`,
        url: primaryUrl,
        label: tDossier('identityPrimaryLabel'),
        badge: tDossier('identityPrimaryLabel'),
      })
    }
    return items
  }, [allNodes, edges, node.data, node.id, tDossier, tTypes])

  // 出演区: downstream edges FROM this character — every shot/video that has
  // harvested it.
  const performances = useMemo(() => {
    return edges
      .filter((edge) => edge.source === node.id)
      .map((edge) => allNodes.find((candidate) => candidate.id === edge.target))
      .filter((candidate): candidate is NodeWorkflowNode => Boolean(candidate))
  }, [allNodes, edges, node.id])

  const handleExtractReference = useCallback(
    (referenceId: string) => {
      extractReference?.(node.id, referenceId)
    },
    [extractReference, node.id],
  )

  const handleFocusPerformance = useCallback(
    (participantId: string) => {
      // Close the dossier first — fitView on a node behind this modal has no
      // visible effect otherwise (same reasoning S5b's CastCard click already
      // settled on for why the dock opens the panel instead of panning).
      setExpandedNodeId(null)
      focusNode?.(participantId)
    },
    [focusNode, setExpandedNodeId],
  )

  const handleBindVoice = useCallback(
    (generation: GenerationRecord) => {
      if (!generation.url) return
      spawnReference?.({
        targetNodeId: node.id,
        nodeType: NODE_TYPE_IDS.voice,
        media: {
          url: generation.url,
          generationId: generation.id,
          name: generation.prompt || generation.model || undefined,
        },
      })
      setVoiceDialogOpen(false)
    },
    [node.id, spawnReference],
  )

  return (
    <>
      <div
        data-testid="character-object-studio"
        className={
          layout === 'object-studio'
            ? 'canvas-object-studio-grid canvas-object-studio-grid--balanced'
            : 'space-y-4'
        }
      >
        <div
          className={
            layout === 'object-studio'
              ? 'canvas-object-studio-media-rail'
              : undefined
          }
        >
          <NodeMediaInspector
            node={node}
            type={NODE_TYPE_IDS.characterImage}
            kind={NODE_MEDIA_KIND_IDS.image}
            layout={layout === 'object-studio' ? 'stack' : 'object-studio'}
            referenceGalleryMode="gallery"
            identityAssetsOnly
            referenceGalleryExtraItems={closeupItems}
            onExtractReference={handleExtractReference}
            // S4/S5（2026-07-27，canvas-image-card.md §1/§四/§五）：改名收口到
            // 卡外的原地可编辑标签（IdentityCollectorCard 的 EditableNodeLabel），
            // 这里不再重复一份改名输入——只留 visualSeed 的只读展示。
            roleExtras={
              visualSeed ? (
                <div className="rounded-2xl border border-node-panel-inner bg-node-panel-soft px-3 py-2 text-2xs leading-5 text-node-muted">
                  <span className="font-semibold text-node-foreground">
                    {tDossier('identityVisualSeedLabel')}
                  </span>
                  <p className="mt-0.5 line-clamp-3">{visualSeed}</p>
                </div>
              ) : null
            }
          />
        </div>

        <div
          className={
            layout === 'object-studio'
              ? 'canvas-object-studio-task-rail'
              : 'space-y-4'
          }
        >
          <div className="space-y-2 rounded-2xl border border-node-panel-inner bg-node-panel-soft p-3">
            <p className="text-sm font-semibold text-node-foreground">
              {t('cardLibrary.title')}
            </p>
            {/* 台账 #10（2026-08-02）：原生 <select> 换 shadcn Select，与全站
                一致。⚠ Radix 的 SelectItem 禁止 value=""，而「未绑定」在数据
                层就是 cardId: undefined —— 用哨兵常量过渡，落库时映射回
                undefined（做法同批 1 的 LooseImageDetailBody 分类下拉）。 */}
            <Select
              value={node.data.cardId ?? NODE_STUDIO_CHARACTER_CARD_UNBOUND_ID}
              onValueChange={(next) =>
                updateNodeData(node.id, {
                  cardId:
                    next === NODE_STUDIO_CHARACTER_CARD_UNBOUND_ID
                      ? undefined
                      : next,
                })
              }
            >
              <SelectTrigger
                aria-label={t('cardLibrary.title')}
                className="h-10 w-full rounded-xl border-node-panel-inner bg-node-panel px-3 text-xs text-node-foreground"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NODE_STUDIO_CHARACTER_CARD_UNBOUND_ID}>
                  {t('cardLibrary.hint')}
                </SelectItem>
                {cards
                  .flatMap((card) => [card, ...card.variants])
                  .map((card) => (
                    <SelectItem key={card.id} value={card.id}>
                      {card.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {boundCard ? (
              <p className="text-2xs text-node-muted">
                {t('cardLibrary.bound', { name: boundCard.name })}
              </p>
            ) : null}
          </div>

          {/* 听觉身份区 */}
          <div className="space-y-2 rounded-2xl border border-node-panel-inner bg-node-panel-soft p-3">
            <p className="text-sm font-semibold text-node-foreground">
              {tDossier('voiceSection')}
            </p>
            {boundVoice ? (
              <div className="flex items-center gap-2 rounded-2xl border border-node-paint/30 bg-node-paint/10 px-3 py-2 text-xs leading-5 text-node-paint">
                <Mic2 className="size-3.5 shrink-0" />
                <span className="flex-1 truncate">
                  {boundVoice.voiceName
                    ? t('voiceBound.namedVoice', {
                        voiceName: boundVoice.voiceName,
                      })
                    : t('voiceBound.unnamed')}
                </span>
                <button
                  type="button"
                  onClick={() => deleteEdge(boundVoice.edgeId)}
                  aria-label={t('voiceBound.remove')}
                  title={t('voiceBound.remove')}
                  className="flex size-5 shrink-0 items-center justify-center rounded-full text-node-paint/70 transition-colors hover:bg-node-paint/20 hover:text-node-paint"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setVoiceDialogOpen(true)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-node-panel-inner px-3 py-2 text-xs font-semibold text-node-subtle transition-colors hover:border-node-paint/50 hover:text-node-foreground"
              >
                <Plus className="size-3.5" aria-hidden />
                {tDossier('voiceBind')}
              </button>
            )}
          </div>

          {/* 出演区 */}
          <div className="space-y-2 rounded-2xl border border-node-panel-inner bg-node-panel-soft p-3">
            <p className="text-sm font-semibold text-node-foreground">
              {tDossier('performanceSection')}
            </p>
            {performances.length === 0 ? (
              <p className="text-xs text-node-muted">
                {tDossier('performanceEmpty')}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {performances.map((participant) => {
                  const label = getParticipantLabel(
                    participant,
                    tTypes(resolveNodePresentationType(participant)),
                  )
                  return (
                    <button
                      key={participant.id}
                      type="button"
                      onClick={() => handleFocusPerformance(participant.id)}
                      aria-label={tDossier('performanceFocusAria', {
                        name: label,
                      })}
                      title={tDossier('performanceFocusAria', { name: label })}
                      className="rounded-full bg-node-panel px-2.5 py-1 text-2xs font-medium text-node-foreground transition-colors hover:bg-node-panel-inner"
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <AssetSelectorDialog
        open={voiceDialogOpen}
        onOpenChange={setVoiceDialogOpen}
        title={tDossier('voiceBind')}
        description={tDossier('voiceBindDialogDescription')}
        mediaType="audio"
        onSelect={handleBindVoice}
      />
    </>
  )
}
