'use client'

import { useCallback } from 'react'
import { useTranslations } from 'next-intl'

import {
  NODE_STUDIO_IMAGE_CATEGORY_UNSET_ID,
  NODE_STUDIO_REFERENCE_ROLES,
  NODE_STUDIO_REFERENCE_ROLE_CUSTOM_ID,
} from '@/constants/node-studio'
import { useDownstreamUses } from '@/hooks/node/use-downstream-uses'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { NodeWorkflowReferenceRole } from '@/types'

import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { IMEAwareInput } from '../inspector/IMEAwareField'
import { ImageFamilyBody } from './ImageFamilyBody'
import { RelationsStrip } from './RelationsStrip'
import type { NodeDetailBodyProps } from './registry'
import type { NodeDetailSlots } from './slots'

/**
 * 散图（`image`，无角色的素材原子）—— 契约 §6：`1:1 井 + 分类` / prompt 一个字段。
 *
 * ⚠ 井是 1:1 而不是 16:9：散图是「素材」，来源常是方图或竖图，16:9 会把它裁成
 * 一条横带。这是契约 §6 那一行明写的。
 *
 * ⚠ 名字在卡上原地改（`LooseImageCard` 的 `EditableNodeLabel`，
 * canvas-image-card.md §1/§四/§五），这里不再放第二份改名输入。
 */
export function LooseImageDetailBody({
  nodeId,
  type,
  data,
  children,
}: NodeDetailBodyProps & {
  children: (slots: NodeDetailSlots) => React.ReactNode
}) {
  const t = useTranslations('StudioNode.imageSourceStarter')
  const tRoles = useTranslations('StudioNode.characterImage.reference')
  const tDetail = useTranslations('StudioNode.nodeDetail')
  const tTypes = useTranslations('StudioNode.nodeTypes')
  const { updateNodeData } = useNodeWorkflowActions()
  const uses = useDownstreamUses(nodeId)

  const category = data.imageCategory
  const customLabel = data.imageCategoryLabel ?? ''

  const handleCategoryChange = useCallback(
    (next: string) => {
      updateNodeData(nodeId, {
        // 哨兵映射回 undefined —— 数据层的「未分类」始终是字段不存在，
        // `unset` 只活在 Select 的 value 里（Radix 禁空串 value）。
        imageCategory: (next === NODE_STUDIO_IMAGE_CATEGORY_UNSET_ID
          ? undefined
          : next || undefined) as NodeWorkflowReferenceRole | undefined,
        imageCategoryLabel:
          next === NODE_STUDIO_REFERENCE_ROLE_CUSTOM_ID
            ? data.imageCategoryLabel
            : undefined,
      })
    },
    [data.imageCategoryLabel, nodeId, updateNodeData],
  )

  return (
    <ImageFamilyBody
      nodeId={nodeId}
      type={type}
      data={data}
      aspect="1 / 1"
      pedestal={
        // ⚠ 分类**可编辑**，所以它穿控件壳 —— R6 禁的是给只读/派生值穿壳，
        // 不是禁一切控件。台座这一行因此是「灰标签 + 一颗窄下拉」，
        // 不是原型里那种纯文本。
        <span className="inline-flex items-center gap-2">
          <span>{tDetail('fieldCategory')}</span>
          <Select
            value={category ?? NODE_STUDIO_IMAGE_CATEGORY_UNSET_ID}
            onValueChange={handleCategoryChange}
          >
            <SelectTrigger
              aria-label={t('categoryLabel')}
              className="nodrag nopan nowheel h-7 gap-1.5 rounded-full border-node-edge bg-node-panel px-3 text-xs text-node-foreground"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NODE_STUDIO_IMAGE_CATEGORY_UNSET_ID}>
                {t('categoryUnset')}
              </SelectItem>
              {NODE_STUDIO_REFERENCE_ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {tRoles(`roles.${role}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {category === NODE_STUDIO_REFERENCE_ROLE_CUSTOM_ID ? (
            <IMEAwareInput
              value={customLabel}
              onValueChange={(next) =>
                updateNodeData(nodeId, {
                  imageCategoryLabel: next || undefined,
                })
              }
              aria-label={t('categoryCustomLabel')}
              placeholder={t('categoryCustomPlaceholder')}
              className="h-7 w-40 rounded-full border border-node-edge bg-node-panel px-3 text-xs text-node-foreground outline-none placeholder:text-node-subtle focus-visible:ring-2 focus-visible:ring-node-focus-ring/30"
            />
          ) : null}
        </span>
      }
      relations={
        <RelationsStrip
          uses={uses}
          emptyLabel={tDetail('relationsEmptyImage')}
          labelOf={(use) => use.name ?? tTypes(use.type)}
          ariaOf={(name) => tDetail('focusOnCanvas', { name })}
        />
      }
    >
      {children}
    </ImageFamilyBody>
  )
}
