'use client'

import { useCallback } from 'react'
import { useTranslations } from 'next-intl'

import { NODE_MEDIA_KIND_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import {
  NODE_STUDIO_IMAGE_CATEGORY_UNSET_ID,
  NODE_STUDIO_REFERENCE_ROLES,
  NODE_STUDIO_REFERENCE_ROLE_CUSTOM_ID,
} from '@/constants/node-studio'
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
import { InspectorField } from '../inspector/InspectorField'
import { NodeMediaInspector } from '../inspector/NodeMediaInspector'
import type { NodeDetailBodyProps } from './registry'

/**
 * Detail body for a role-less (loose) `image` node — §6.0/§6.1 S5d ③
 * "图片=素材原子": media + name + category, no generation-role concept.
 * Reuses `NodeMediaInspector` directly with `type: image` (not `shot`, so
 * the field set falls back to just `prompt` — no camera/composition/action,
 * keeping the "素材" card visually/functionally distinct from "镜头图（生
 * 成）" per the task packet's add-menu split) for the shared upload dropzone
 * / 素材库 / AI 生成 三来源 surface; `roleExtras` adds the 分类 editor
 * (分类 = `NODE_STUDIO_REFERENCE_ROLES`, same list a card's own referenceAssets
 * use, + 自定义标签 when `custom`). 名字 is edited on-card now (S4/S5,
 * canvas-image-card.md §1/§四/§五 — LooseImageCard's EditableNodeLabel), not
 * in this detail panel.
 */
export function LooseImageDetailBody({ nodeId, data }: NodeDetailBodyProps) {
  const t = useTranslations('StudioNode.imageSourceStarter')
  const tRoles = useTranslations('StudioNode.characterImage.reference')
  const { updateNodeData } = useNodeWorkflowActions()

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
    <NodeMediaInspector
      node={{
        id: nodeId,
        type: NODE_TYPE_IDS.image,
        position: { x: 0, y: 0 },
        data,
      }}
      type={NODE_TYPE_IDS.image}
      kind={NODE_MEDIA_KIND_IDS.image}
      // 台账 F1：右栏三格来源行下面此前一片空白——「AI 生成」的表单早就写好
      // 了，只是被 editTarget 的初始 null 藏着。散图面板默认展开它。
      defaultEditTarget="ai"
      roleExtras={
        <>
          {/* S4/S5（2026-07-27，canvas-image-card.md §1/§四/§五）：改名收口
              到卡外的原地可编辑标签（LooseImageCard 的 EditableNodeLabel），
              这里不再重复一份改名输入——分类字段照旧。 */}
          <InspectorField
            label={t('categoryLabel')}
            statusDotClassName="bg-node-foreground"
          >
            {/* 台账 F1（2026-08-02）：原生 <select> 换 shadcn Select——全站
                其它下拉都是后者，这里的原生控件在面板上是唯一的异类（连
                下拉箭头都是浏览器画的）。触发器覆写成域控件同款几何，
                `nodrag nopan nowheel` 保留：React Flow 的手势隔离。 */}
            <Select
              value={category ?? NODE_STUDIO_IMAGE_CATEGORY_UNSET_ID}
              onValueChange={handleCategoryChange}
            >
              <SelectTrigger className="nodrag nopan nowheel h-10 w-full rounded-2xl border-node-panel-inner bg-node-panel-soft px-3 text-sm text-node-foreground">
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
                className="mt-2 h-9 w-full rounded-xl border border-node-panel-inner bg-node-panel px-3 text-xs text-node-foreground outline-none placeholder:text-node-subtle focus-visible:border-node-focus-ring focus-visible:ring-2 focus-visible:ring-node-focus-ring/20"
              />
            ) : null}
          </InspectorField>
        </>
      }
    />
  )
}
