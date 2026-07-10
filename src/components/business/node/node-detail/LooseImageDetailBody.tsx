'use client'

import { useCallback } from 'react'
import { useTranslations } from 'next-intl'

import { NODE_MEDIA_KIND_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import {
  NODE_STUDIO_REFERENCE_ROLES,
  NODE_STUDIO_REFERENCE_ROLE_CUSTOM_ID,
} from '@/constants/node-studio'
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
 * / 素材库 / AI 生成 三来源 surface; `roleExtras` adds the 名字 + 分类 editor
 * (分类 = `NODE_STUDIO_REFERENCE_ROLES`, same list a card's own referenceAssets
 * use, + 自定义标签 when `custom`).
 */
export function LooseImageDetailBody({ nodeId, data }: NodeDetailBodyProps) {
  const t = useTranslations('StudioNode.imageSourceStarter')
  const tRoles = useTranslations('StudioNode.characterImage.reference')
  const { updateNodeData } = useNodeWorkflowActions()

  const name =
    (typeof data.mediaLabel === 'string' && data.mediaLabel) ||
    (typeof data.sourceLabel === 'string' && data.sourceLabel) ||
    ''
  const category = data.imageCategory
  const customLabel = data.imageCategoryLabel ?? ''

  const handleNameChange = useCallback(
    (next: string) => {
      updateNodeData(nodeId, { mediaLabel: next, sourceLabel: next })
    },
    [nodeId, updateNodeData],
  )

  const handleCategoryChange = useCallback(
    (next: string) => {
      updateNodeData(nodeId, {
        imageCategory: (next || undefined) as
          | NodeWorkflowReferenceRole
          | undefined,
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
      roleExtras={
        <>
          <InspectorField
            label={t('nameLabel')}
            statusDotClassName="bg-node-foreground"
          >
            <IMEAwareInput
              value={name}
              onValueChange={handleNameChange}
              aria-label={t('nameLabel')}
              placeholder={t('namePlaceholder')}
              className="h-10 w-full rounded-2xl border border-node-panel-inner bg-node-panel-soft px-3 text-sm font-semibold text-node-foreground outline-none placeholder:text-node-subtle focus-visible:border-node-focus-ring focus-visible:ring-2 focus-visible:ring-node-focus-ring/20"
            />
          </InspectorField>

          <InspectorField
            label={t('categoryLabel')}
            statusDotClassName="bg-node-foreground"
          >
            <select
              value={category ?? ''}
              onChange={(event) => handleCategoryChange(event.target.value)}
              className="nodrag nopan nowheel h-10 w-full rounded-2xl border border-node-panel-inner bg-node-panel-soft px-3 text-sm text-node-foreground"
            >
              <option value="">{t('categoryUnset')}</option>
              {NODE_STUDIO_REFERENCE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {tRoles(`roles.${role}`)}
                </option>
              ))}
            </select>
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
