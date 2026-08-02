'use client'

import { useTranslations } from 'next-intl'

import { NODE_TYPE_IDS } from '@/constants/node-types'

import {
  getDefaultEditorFields,
  NodeFieldEditor,
} from '../nodes/NodeCardControls'
import type { NodeDetailBodyProps } from './registry'

/**
 * 镜头文本详情面板 —— 一镜的场景 / 动作 / 镜头 / 构图。
 *
 * 2026-08-02 新增。在这之前 shotText 落 `GenericDetailBody` 兜底，而那个面板
 * 本身**从画布上够不着**（无能力区 ⇒ 空卡不出工具条 ⇒ 没有 ⤢），所以这四个
 * 字段在画布上既看不到也改不了 —— 卡面窗内还是恒定的空态占位。
 *
 * owner 拍板「助手这边只是自动生成，不用助手则用户手动输入然后生成 —— 是一
 * 种东西」，于是镜头文本有了两条对等的路：
 * · 剧本笺起草 → 投影出的节点带 `scriptRef`，在这里编辑会由 `updateNodeData`
 *   回写 ScriptDoc（`syncShotTextPatchToScriptDoc`），下次投影读到的就是用户
 *   改过的值，不存在「编了被覆盖」；
 * · 从 ＋添加 菜单手工建的节点没有 `scriptRef`，不受投影管辖，字段就存在它
 *   自己身上。
 * 两条路在这个面板里长得一样 —— 因为对用户来说本来就是同一件事。
 *
 * 字段集与 prompt 拼接同源（`NODE_WORKFLOW_FIELDS_BY_NODE_TYPE[shotText]`），
 * 所以这里看到的顺序就是送进下游视频节点的顺序。
 */
export function ShotTextDetailBody({ nodeId, data }: NodeDetailBodyProps) {
  const t = useTranslations('StudioNode.workflowNodes.shotText')

  return (
    <div className="space-y-3">
      <NodeFieldEditor
        nodeId={nodeId}
        data={data}
        fields={getDefaultEditorFields(NODE_TYPE_IDS.shotText)}
      />
      <p className="px-1 text-2xs leading-4 text-node-subtle">
        {t('detailHint')}
      </p>
    </div>
  )
}
