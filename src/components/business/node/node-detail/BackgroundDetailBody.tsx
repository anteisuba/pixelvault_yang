'use client'

import { useCallback, useEffect } from 'react'
import { useTranslations } from 'next-intl'

import { NODE_STUDIO_CHARACTER_CARD_UNBOUND_ID } from '@/constants/node-studio'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { useBackgroundCards } from '@/hooks/cards/use-background-cards'
import { useDownstreamUses } from '@/hooks/node/use-downstream-uses'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'

import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { ImageFamilyBody } from './ImageFamilyBody'
import { RelationsStrip } from './RelationsStrip'
import type { NodeDetailBodyProps } from './registry'
import type { NodeDetailSlots } from './slots'

/**
 * 背景（`backgroundImage`）—— 契约 §6：媒体井 / 素材库·Studio + 图集 /
 * 地点·氛围·光线 + 模型 / **场景卡 + 出演** / 错误 + 禁用因 / 生成。
 *
 * 与角色族的对称只到「有卡可绑」为止：背景没有听觉身份（没有环境音节点、
 * 没有字段、没有上传路径 —— 已知缺口），也没有特写并入（特写是角色专属的
 * 面部细节子参考，cast-redesign §9 B）。
 *
 * ⚠ **场景卡下拉归关系带**（槽 5）不归编排台：绑卡回答的是「它绑了哪张卡」，
 * 与「被哪些节点用」是同一个问题的两个方向，契约 §6 那一行也是这么写的。
 */
export function BackgroundDetailBody({
  nodeId,
  type,
  data,
  children,
}: NodeDetailBodyProps & {
  children: (slots: NodeDetailSlots) => React.ReactNode
}) {
  const tDossier = useTranslations('StudioNode.dossier')
  const tDetail = useTranslations('StudioNode.nodeDetail')
  const tTypes = useTranslations('StudioNode.nodeTypes')
  const { updateNodeData, extractReference } = useNodeWorkflowActions()
  const { cards } = useBackgroundCards()
  const uses = useDownstreamUses(nodeId)
  const boundCard = data.cardId
    ? (cards.find((card) => card.id === data.cardId) ?? null)
    : null

  useEffect(() => {
    if (!boundCard || data.cardId !== boundCard.id || !boundCard.sourceImageUrl)
      return

    updateNodeData(nodeId, {
      cardId: boundCard.id,
      backgroundName: boundCard.name,
      prompt: data.prompt || boundCard.backgroundPrompt,
      imageSource: 'existing',
      mediaKind: NODE_MEDIA_KIND_IDS.image,
      mediaLabel: boundCard.name,
      mediaUrl: boundCard.sourceImageUrl,
      imageUrl: boundCard.sourceImageUrl,
      sourceGenerationId: undefined,
      sourceLabel: boundCard.name,
      referenceAssets: [
        {
          id: `card-${boundCard.id}`,
          url: boundCard.sourceImageUrl,
          role: 'background',
          weight: 1,
          source: 'asset',
          sourceId: boundCard.id,
          name: boundCard.name,
        },
      ],
    })
  }, [boundCard, data.cardId, data.prompt, nodeId, updateNodeData])

  const handleExtractReference = useCallback(
    (referenceId: string) => {
      extractReference?.(nodeId, referenceId)
    },
    [extractReference, nodeId],
  )

  return (
    <ImageFamilyBody
      nodeId={nodeId}
      type={type}
      data={data}
      onExtractReference={handleExtractReference}
      // 背景卡是收集器（下游收割把它展开成 onStage 集合），落点暂留旧通道。
      nestedReferenceAdd
      relations={
        <RelationsStrip
          uses={uses}
          emptyLabel={tDetail('relationsEmptyBackground')}
          labelOf={(use) => use.name ?? tTypes(use.type)}
          ariaOf={(name) => tDetail('focusOnCanvas', { name })}
          leading={
            // ⚠ 原生 <select> 换 shadcn Select —— 全站其它下拉都是后者，
            // 这里的原生控件是详情面板里最后一个异类（连箭头都是浏览器画的）。
            // Radix 禁 value=""，而「未绑定」在数据层就是 cardId: undefined，
            // 用哨兵常量过渡，落库时映射回 undefined。
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
              {/* 触发器自排「场景卡 · 值」，理由同 `CharacterDetailBody` 那条注释。 */}
              <SelectTrigger
                aria-label={tDossier('backgroundCardTitle')}
                className="h-8 w-auto gap-1.5 rounded-full border-node-edge bg-node-panel px-3 text-xs text-node-foreground"
              >
                <span className="truncate">
                  {tDetail('cardBackground')} ·{' '}
                  {boundCard?.name ?? tDetail('valueUnbound')}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NODE_STUDIO_CHARACTER_CARD_UNBOUND_ID}>
                  {tDossier('backgroundCardHint')}
                </SelectItem>
                {cards.map((card) => (
                  <SelectItem key={card.id} value={card.id}>
                    {card.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
      }
    >
      {children}
    </ImageFamilyBody>
  )
}
