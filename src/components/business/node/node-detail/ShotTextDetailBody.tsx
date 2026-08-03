'use client'

import { useTranslations } from 'next-intl'

import { NODE_TYPE_IDS } from '@/constants/node-types'
import { useDownstreamUses } from '@/hooks/node/use-downstream-uses'
import { buildNodeWorkflowPrompt } from '@/lib/node-workflow-prompt'

import {
  getDefaultEditorFields,
  NodeFieldEditor,
} from '../nodes/NodeCardControls'
import { EvidenceDrawer } from './EvidenceDrawer'
import { RelationsStrip } from './RelationsStrip'
import type { NodeDetailBodyProps } from './registry'
import type { NodeDetailSlots } from './slots'

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
 *
 * ── 方向 E 迁移（S3，2026-08-04）─────────────────────────────
 * 十族里第一个改成**槽表提供者**的。它只有 47 行、只有编排台一槽，是最便宜的
 * 真迁移；同时它必须新建关系带（契约「必须全族有位」），正好把三个共享件
 * （RelationsStrip / EvidenceDrawer / useDownstreamUses）在最小面上做出来验一遍。
 *
 * ⚠ 本族没有主体台（无媒体，状态靠身份条盖章）、没有素材架（不取材）、
 * 没有动作坞（编辑即保存，没有提交动作）—— 三者传 `undefined`，整栏不渲染。
 *
 * ⚠ 原先末尾那行 `detailHint` 脚注（「这些字段会按顺序拼成提示词，送进下游的
 * 视频节点」）**本身就是关系信息**，只是被当成脚注放在正文最后。迁移时它归位成
 * 关系带的空态文案 —— 不是新写的文案，是挪到了它本来该在的槽里。
 */
export function ShotTextDetailBody({
  nodeId,
  data,
  children,
}: NodeDetailBodyProps & {
  children: (slots: NodeDetailSlots) => React.ReactNode
}) {
  const t = useTranslations('StudioNode.workflowNodes.shotText')
  const tDetail = useTranslations('StudioNode.nodeDetail')
  const tTypes = useTranslations('StudioNode.nodeTypes')
  const uses = useDownstreamUses(nodeId)

  const assembledPrompt = buildNodeWorkflowPrompt(NODE_TYPE_IDS.shotText, data)

  return children({
    stage: undefined,
    rack: undefined,
    desk: (
      <NodeFieldEditor
        nodeId={nodeId}
        data={data}
        fields={getDefaultEditorFields(NODE_TYPE_IDS.shotText)}
      />
    ),
    relations: (
      <RelationsStrip
        uses={uses}
        emptyLabel={t('detailHint')}
        labelOf={(use) => use.name ?? tTypes(use.type)}
        ariaOf={(name) => tDetail('focusOnCanvas', { name })}
      />
    ),
    evidence: (
      <EvidenceDrawer label={tDetail('promptPreview')}>
        {/* ⚠ 空态**不能**回落到 detailHint —— 那句已经是关系带的空态文案，
            两处都用它就会在同一屏把同一句话说两遍，正是这轮改版一路在治的病。
            空时用本族自己的 emptyPreview（「把场景、动作、镜头和构图整理成
            可执行镜头文本」），说的是「还没东西可拼」，与关系带说的
            「拼出来会送给谁」是两件事。 */}
        <p className="whitespace-pre-wrap rounded-xl bg-node-panel p-3 text-xs leading-5 text-node-muted">
          {assembledPrompt || t('emptyPreview')}
        </p>
      </EvidenceDrawer>
    ),
    dock: undefined,
  })
}
