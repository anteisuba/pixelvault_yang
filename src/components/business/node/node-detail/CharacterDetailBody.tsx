'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useEdges, useNodes } from '@xyflow/react'
import { Mic2, Plus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { NODE_STUDIO_CHARACTER_CARD_UNBOUND_ID } from '@/constants/node-studio'
import {
  NODE_IMAGE_ROLE_IDS,
  NODE_MEDIA_KIND_IDS,
  NODE_TYPE_IDS,
} from '@/constants/node-types'
import { resolveReferenceAssetLimit } from '@/constants/node-studio'
import { useCharacterCards } from '@/hooks/cards/use-character-cards'
import { useDownstreamUses } from '@/hooks/node/use-downstream-uses'
import { resolveNodeDisplayName } from '@/lib/node-display-name'
import {
  getNodePrimaryMediaUrl,
  getUpstreamNodes,
  isCloseupNode,
  isVoiceProfileNode,
  readVoiceUrl,
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
  const [closeupDialogOpen, setCloseupDialogOpen] = useState(false)
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
  const maxReferenceImages = resolveReferenceAssetLimit(data.model)
  const visualSeed = data.character?.visualSeed?.trim()

  // 上游音色。⚠ 这条绑定走的是**边**不是字段，所以能用图判定；反过来
  // 「哪个角色绑了这个音色」在音色族那边要用字段反查（见 use-downstream-uses 头注）。
  /**
   * ⚠ **绑定 = 连线，不是「有没有可发送的音频」**（2026-08-10 owner 真机撞到）。
   *
   * 这里原本只认 `voiceReferenceAudioUrl` 一个字段，于是两处判据分岔：
   *   · 收割侧 `readVoiceUrl` 有**三档**（audioClip → voiceReferenceAudioUrl →
   *     voiceSampleUrl，第三档是阶段 0-A 为「系统 TTS 音色送不出声」补的）
   *   · 角色卡只读第二档 → 一个已经连上、且能发声的系统音色，卡上照样写「未绑定」
   * 更糟的是**连了但没有任何可用音频**的那种：边真实存在、用户看得见那条线，
   * 卡上却说「未绑定」——等于告诉用户「你没连」，而他明明连了。
   *
   * 改成：**有边就是绑定**，能不能发单独用 `ready` 表达（与 composer 的
   * `BoundVoice.ready` 同一套语义）。
   */
  const boundVoice: {
    voiceName: string | null
    edgeId: string
    ready: boolean
  } | null = (() => {
    for (const candidate of getUpstreamNodes(nodeId, edges, allNodes)) {
      if (!isVoiceProfileNode(candidate)) continue
      const edge = edges.find(
        (candidateEdge) =>
          candidateEdge.source === candidate.id &&
          candidateEdge.target === nodeId,
      )
      if (!edge) continue
      // 画布修法 08-A：直接读 candidate.data.voiceName 绕开了机器值守卫，
      // 改走共享解析器；voiceId/voiceReferenceAudioName 两档兜底是本处
      // 独有的（resolver 不认这两个字段），原样保留。
      const voiceName =
        resolveNodeDisplayName(candidate.data) ||
        (typeof candidate.data.voiceId === 'string' &&
          candidate.data.voiceId.trim()) ||
        (typeof candidate.data.voiceReferenceAudioName === 'string' &&
          candidate.data.voiceReferenceAudioName.trim()) ||
        null
      return {
        voiceName,
        edgeId: edge.id,
        // 三档判据与收割侧同一个函数 —— 卡上说「能发」和实际发得出去必须是一回事。
        ready: Boolean(readVoiceUrl(candidate)),
      }
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
        // 画布修法 08-A：直接读 closeup.data.characterName 绕开了机器值
        // 守卫，改走共享解析器。
        label: resolveNodeDisplayName(closeup.data) || tTypes('image'),
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

  /**
   * ＋面部特写（§9 B）：spawn 一张 `closeup → character` 的一跳子参考，骑在本角色
   * 的 image_urls 后面。
   *
   * ⚠ 这个入口原先长在**视频节点的素材面板**里（退役的 `ReferenceManagerPanel`
   * 行菜单）。那是「在 A 的界面里改 B」—— 素材槽架只回答「这次挂了什么、满没满、
   * 会不会发」，而特写是**角色身份的一部分**，家在角色卡自己这里，和绑定音色并排。
   * 搬过来之前它是全仓唯一入口（添加菜单里没有 closeup 项）。
   */
  const handleAddCloseup = useCallback(
    (generation: GenerationRecord) => {
      if (!generation.url) return
      spawnReference?.({
        targetNodeId: nodeId,
        nodeType: NODE_TYPE_IDS.image,
        role: NODE_IMAGE_ROLE_IDS.closeup,
        media: {
          url: generation.url,
          generationId: generation.id,
          name: generation.prompt || generation.model || undefined,
        },
      })
      setCloseupDialogOpen(false)
    },
    [nodeId, spawnReference],
  )

  // 画布修法 08-A：直接读 data.characterName 绕开了机器值守卫——「选已有图」
  // 写入口把上传备注常量当名字写进这个字段时，角色详情面板的大标题会照单
  // 展示。改走共享解析器。
  const displayName = resolveNodeDisplayName(data) ?? ''

  return (
    <>
      {children({
        stage: (
          <div className="canvas-detail-stage">
            <div className="canvas-detail-character-gallery min-w-0">
              <CharacterImageReferenceControls
                value={referenceAssets}
                targetNodeId={nodeId}
                // 角色卡是收集器：新素材仍进本卡图集，理由见
                // `ReferenceLandingTabs` 的 `onResolved` 头注。
                nestedAdd
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
                    {/* 绑上了但发不出去，要当场说明白 —— 不然用户只看到「已绑定」，
                        到生成时才发现配音是空的（契约「不许静默」）。 */}
                    <span className="max-w-40 truncate">
                      {!boundVoice.ready
                        ? t('voiceBound.notReady', {
                            voiceName:
                              boundVoice.voiceName ?? t('voiceBound.unnamed'),
                          })
                        : boundVoice.voiceName
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

                {/* ＋面部特写 —— 与绑定音色并排：两者都是「这个角色是谁」的一部分。
                    特写可以有多张（都并入上方图集陈列），所以按钮常显，不像音色那样
                    绑定后换成 chip。 */}
                <button
                  type="button"
                  onClick={() => setCloseupDialogOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-node-edge px-3 py-1.5 text-xs font-medium text-node-foreground outline-none transition-colors hover:bg-node-panel-inner focus-visible:ring-2 focus-visible:ring-node-focus-ring/30"
                >
                  <Plus aria-hidden className="size-3.5" />
                  {tDossier('closeupAdd')}
                </button>
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
                !boundVoice
                  ? tDetail('valueUnbound')
                  : boundVoice.ready
                    ? (boundVoice.voiceName ?? t('voiceBound.unnamed'))
                    : tDetail('valueBoundNotReady')
              }
              // 未就绪也算「有内容」——它不是空，是有问题，两者不该长一样。
              dim={!boundVoice}
            />
          </EvidenceDrawer>
        ),
        dock: undefined,
        overlays: (
          <>
            <AssetSelectorDialog
              open={voiceDialogOpen}
              onOpenChange={setVoiceDialogOpen}
              title={tDossier('voiceBind')}
              description={tDossier('voiceBindDialogDescription')}
              mediaType="audio"
              onSelect={handleBindVoice}
            />
            <AssetSelectorDialog
              open={closeupDialogOpen}
              onOpenChange={setCloseupDialogOpen}
              title={tDossier('closeupAdd')}
              description={tDossier('closeupAddDialogDescription')}
              mediaType="image"
              onSelect={handleAddCloseup}
            />
          </>
        ),
      })}
    </>
  )
}
