'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useEdges, useNodes } from '@xyflow/react'
import { Mic2, Plus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { NODE_STUDIO_CHARACTER_CARD_UNBOUND_ID } from '@/constants/node-studio'
import { NODE_MEDIA_KIND_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import { getMaxReferenceImages } from '@/constants/provider-capabilities'
import { NODE_STUDIO_CHARACTER_IMAGE_REFERENCES } from '@/constants/node-studio'
import { useCharacterCards } from '@/hooks/cards/use-character-cards'
import { useDownstreamUses } from '@/hooks/node/use-downstream-uses'
import {
  getNodePrimaryMediaUrl,
  getUpstreamNodes,
  isCloseupNode,
  isVoiceProfileNode,
} from '@/lib/node-workflow-graph'
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import {
  CharacterImageReferenceControls,
  type CharacterReferenceGalleryExtraItem,
} from '@/components/business/node/CharacterImageReferenceControls'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { GenerationRecord } from '@/types'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'

import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { EvidenceDrawer, EvidenceRow } from './EvidenceDrawer'
import { RelationsStrip } from './RelationsStrip'
import type { NodeDetailBodyProps } from './registry'
import type { NodeDetailSlots } from './slots'

/**
 * 角色（`characterImage`）—— 十族里唯一**不走** `ImageFamilyBody` 的图片族。
 *
 * 契约 §6 给它的是：图集主体台 · **素材架整栏不渲染** · **编排台空**（本族无生成
 * 能力）· 关系带（角色卡库 + 绑定音色 + 出演）· 证据抽屉（对下游的身份包）·
 * **动作坞空**（编辑即保存）。除身份条外它和媒体井四族没有一个槽同构 ——
 * 硬塞进共用引擎只会长出一堆 `if (isCharacter)`。
 *
 * ⚠ 图集**不画托盘**。前作 D 在井右侧画了一块 1084×237 带边框的浅灰托盘，
 * E 把它删了（账本 §7.2 对照表最后一行）：R11「空余宽度不画表面」——
 * 那块空白就是面板底本身，给它底色只是凭空多一层。
 *
 * ⚠ 名字在卡上原地改（`IdentityCollectorCard` 的 `EditableNodeLabel`），
 * 这里只读地把它列进身份包，不再放第二份改名输入。
 */
export function CharacterDetailBody({
  nodeId,
  data,
  children,
}: NodeDetailBodyProps & {
  children: (slots: NodeDetailSlots) => React.ReactNode
}) {
  const t = useTranslations('StudioNode.characterImage')
  const tDossier = useTranslations('StudioNode.dossier')
  const tDetail = useTranslations('StudioNode.nodeDetail')
  const tTypes = useTranslations('StudioNode.nodeTypes')
  const allNodes = useNodes<NodeWorkflowNode>()
  const edges = useEdges<NodeWorkflowEdge>()
  const { updateNodeData, deleteEdge, spawnReference, extractReference } =
    useNodeWorkflowActions()
  const [voiceDialogOpen, setVoiceDialogOpen] = useState(false)
  const { cards, findCard } = useCharacterCards()
  const boundCard = data.cardId ? findCard(data.cardId) : null
  const uses = useDownstreamUses(nodeId)

  useEffect(() => {
    if (!boundCard || data.cardId !== boundCard.id) return

    const imageUrls = [
      boundCard.sourceImageUrl,
      ...boundCard.sourceImages,
      ...(boundCard.referenceImages ?? []),
    ].filter((url, index, urls) => Boolean(url) && urls.indexOf(url) === index)
    const [primaryUrl, ...referenceUrls] = imageUrls
    if (!primaryUrl) return

    updateNodeData(nodeId, {
      cardId: boundCard.id,
      characterName: boundCard.name,
      character: {
        characterId: boundCard.id,
        name: boundCard.name,
        visualSeed:
          boundCard.characterPrompt || boundCard.description || boundCard.name,
      },
      prompt: data.prompt || boundCard.characterPrompt,
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
  }, [boundCard, data.cardId, data.prompt, nodeId, updateNodeData])

  const referenceAssets = useMemo(
    () => data.referenceAssets ?? [],
    [data.referenceAssets],
  )
  const maxReferenceImages = data.model
    ? getMaxReferenceImages(data.model.adapterType, data.model.modelId)
    : NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.maxItems
  const visualSeed = data.character?.visualSeed?.trim()

  // 上游音色。⚠ 这条绑定走的是**边**不是字段，所以能用图判定；反过来
  // 「哪个角色绑了这个音色」在音色族那边要用字段反查（见 use-downstream-uses 头注）。
  const boundVoice: { voiceName: string | null; edgeId: string } | null =
    (() => {
      for (const candidate of getUpstreamNodes(nodeId, edges, allNodes)) {
        if (!isVoiceProfileNode(candidate)) continue
        const url =
          typeof candidate.data.voiceReferenceAudioUrl === 'string'
            ? candidate.data.voiceReferenceAudioUrl.trim()
            : ''
        if (!url) continue
        const edge = edges.find(
          (candidateEdge) =>
            candidateEdge.source === candidate.id &&
            candidateEdge.target === nodeId,
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

  // 特写并入图集（§二.2「吃进的 closeup 图并入陈列，标来源」）—— closeup 是
  // **另一个绑定节点**（closeup → character 一跳，cast-redesign §9 B），不是本节点
  // 的 referenceAssets 条目，所以在图集里只读（无权重/角色/拆出）。
  const closeupItems = useMemo<CharacterReferenceGalleryExtraItem[]>(() => {
    const items: CharacterReferenceGalleryExtraItem[] = getUpstreamNodes(
      nodeId,
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

    // 台账 #11：卡上有图、展开面板却「参考图 0/3」。卡面读
    // `getNodePrimaryMediaUrl`（imageUrl ?? mediaUrl），而图集只 map
    // `referenceAssets` —— 角色域有几条写路径把主图**只**写进 mediaUrl。
    // ⚠ 修法刻意不是「面板改读 mediaUrl 优先」：图集是收集器卡图片的唯一事实源，
    // 那个建模是对的。这里沿用卡面同款兜底 —— 图集为空时才把主图并进来，
    // 且走只读的 extraItems 通道，不伪装成一条可编辑的图集条目。
    const primaryUrl = getNodePrimaryMediaUrl(data)
    const hasOwnAssets = referenceAssets.some(
      (asset) => asset.url.trim().length > 0,
    )
    if (
      !hasOwnAssets &&
      primaryUrl &&
      !items.some((i) => i.url === primaryUrl)
    ) {
      items.unshift({
        id: `${nodeId}:primary`,
        url: primaryUrl,
        label: tDossier('identityPrimaryLabel'),
        badge: tDossier('identityPrimaryLabel'),
      })
    }
    return items
  }, [allNodes, data, edges, nodeId, referenceAssets, tDossier, tTypes])

  const handleBindVoice = useCallback(
    (generation: GenerationRecord) => {
      if (!generation.url) return
      spawnReference?.({
        targetNodeId: nodeId,
        nodeType: NODE_TYPE_IDS.voice,
        media: {
          url: generation.url,
          generationId: generation.id,
          name: generation.prompt || generation.model || undefined,
        },
      })
      setVoiceDialogOpen(false)
    },
    [nodeId, spawnReference],
  )

  const displayName =
    (typeof data.characterName === 'string' && data.characterName.trim()) ||
    data.character?.name?.trim() ||
    ''

  return (
    <>
      {children({
        stage: (
          <div className="canvas-detail-stage">
            <div className="min-w-0">
              <CharacterImageReferenceControls
                value={referenceAssets}
                maxItems={maxReferenceImages}
                onChange={(next) =>
                  updateNodeData(nodeId, { referenceAssets: next })
                }
                mode="gallery"
                extraItems={closeupItems}
                onExtract={(reference) =>
                  extractReference?.(nodeId, reference.id)
                }
              />
            </div>
          </div>
        ),
        // 组级不适用 → 整栏不渲染。角色不取材（图集就在主体台），也没有生成能力，
        // 编辑即保存所以没有提交动作。
        rack: undefined,
        desk: undefined,
        relations: (
          <RelationsStrip
            uses={uses}
            emptyLabel={tDetail('relationsEmptyCharacter')}
            labelOf={(use) => use.name ?? tTypes(use.type)}
            ariaOf={(name) => tDetail('focusOnCanvas', { name })}
            leading={
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={data.cardId ?? NODE_STUDIO_CHARACTER_CARD_UNBOUND_ID}
                  onValueChange={(next) =>
                    updateNodeData(nodeId, {
                      cardId:
                        next === NODE_STUDIO_CHARACTER_CARD_UNBOUND_ID
                          ? undefined
                          : next,
                    })
                  }
                >
                  {/* ⚠ 触发器**不用** `<SelectValue />`：未绑定项的文案是一整句
                      引导语（「选一张已有角色卡，自动套用到这个节点。」），
                      在旧版有「角色卡库」小标题时说得通，收成 chip 后会把
                      一句话塞进一颗药丸里（真机实拍到）。这里自己排
                      「角色卡 · 值」，下拉里那句引导语原样保留。 */}
                  <SelectTrigger
                    aria-label={t('cardLibrary.title')}
                    className="h-8 w-auto gap-1.5 rounded-full border-node-edge bg-node-panel px-3 text-xs text-node-foreground"
                  >
                    <span className="truncate">
                      {tDetail('cardCharacter')} ·{' '}
                      {boundCard?.name ?? tDetail('valueUnbound')}
                    </span>
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

                {boundVoice ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-node-edge px-3 py-1.5 text-xs text-node-foreground">
                    <Mic2 aria-hidden className="size-3.5 shrink-0" />
                    <span className="max-w-40 truncate">
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
                      className="flex size-4 items-center justify-center rounded-full text-node-muted outline-none transition-colors hover:text-node-foreground focus-visible:ring-2 focus-visible:ring-node-focus-ring/30"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setVoiceDialogOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-node-edge px-3 py-1.5 text-xs font-medium text-node-foreground outline-none transition-colors hover:bg-node-panel-inner focus-visible:ring-2 focus-visible:ring-node-focus-ring/30"
                  >
                    <Plus aria-hidden className="size-3.5" />
                    {tDossier('voiceBind')}
                  </button>
                )}
              </div>
            }
          />
        ),
        evidence: (
          <EvidenceDrawer label={tDetail('identityPackage')} count={3}>
            <EvidenceRow
              label={tDetail('fieldDisplayName')}
              value={displayName || tDetail('valueEmpty')}
              dim={!displayName}
            />
            <EvidenceRow
              label={tDetail('fieldVisualSeed')}
              value={visualSeed || tDetail('valueEmpty')}
              dim={!visualSeed}
            />
            <EvidenceRow
              label={tDetail('fieldBoundVoice')}
              value={
                boundVoice
                  ? (boundVoice.voiceName ?? t('voiceBound.unnamed'))
                  : tDetail('valueUnbound')
              }
              dim={!boundVoice}
            />
          </EvidenceDrawer>
        ),
        dock: undefined,
        overlays: (
          <AssetSelectorDialog
            open={voiceDialogOpen}
            onOpenChange={setVoiceDialogOpen}
            title={tDossier('voiceBind')}
            description={tDossier('voiceBindDialogDescription')}
            mediaType="audio"
            onSelect={handleBindVoice}
          />
        ),
      })}
    </>
  )
}
