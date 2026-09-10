import {
  NODE_TYPE_IDS,
  NODE_WORKFLOW_FIELDS_BY_NODE_TYPE,
  NODE_WORKFLOW_FIELD_IDS,
  type NodeWorkflowFieldId,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'

export function getNodeWorkflowFieldValue(
  data: NodeWorkflowNodeData,
  fieldId: NodeWorkflowFieldId,
): string {
  const value = data[fieldId]

  return typeof value === 'string' ? value : ''
}

/**
 * 多段文本 → 一段正文：**空段跳过、换行相连**（C3c-① A）。
 *
 * ⚠ 这是「v3 四栏 → v4 单一 Markdown 正文」与「ScriptDoc 一镜 → 文本节点正文」
 * 共用的**唯一**一份合成：`buildNodeWorkflowPrompt`（v3 送进模型的那一串）、
 * `node-workflow-script-doc-v4.buildShotTextBody`（投影）、
 * `node-workflow-migrate-v4`（迁移）三处走它。三处一旦各拼各的，v4 翻转当天
 * 用户就会发现镜头文字变了 —— 而那正是最难被测试抓住的一类回归。
 */
export function composeShotTextBody(
  values: readonly (string | undefined | null)[],
): string {
  return values
    .map((value) => value?.trim() ?? '')
    .filter(Boolean)
    .join('\n')
}

export function buildNodeWorkflowPrompt(
  type: NodeWorkflowNodeType,
  data: NodeWorkflowNodeData,
): string {
  // Voice nodes are timbre donors — spoken lines live in the script / downstream
  // video nodes (剧本后置), not on the voice node UI (which has no 台词 input).
  // The ScriptDoc projection no longer writes `dialogue` onto voice nodes, so this
  // branch only yields a value for legacy/persisted graphs whose voice nodes still
  // carry one; no live UI path drives voice TTS from it. Kept as a backward-
  // compatible reader for that legacy graph-prompt shape.
  if (type === NODE_TYPE_IDS.voice) {
    return getNodeWorkflowFieldValue(
      data,
      NODE_WORKFLOW_FIELD_IDS.dialogue,
    ).trim()
  }

  const fields = NODE_WORKFLOW_FIELDS_BY_NODE_TYPE[type] ?? [
    NODE_WORKFLOW_FIELD_IDS.prompt,
  ]

  return composeShotTextBody(
    fields.map((fieldId) => getNodeWorkflowFieldValue(data, fieldId)),
  )
}

export type MediaGenerateBlockReason = 'noModel' | 'noPrompt'

/**
 * 台账 #12（2026-08-02）：媒体节点「能不能生成」的渲染期判定，与
 * 画布的生成路径 点击后的两道守卫**同一判据、
 * 同一顺序**（先 model 后 prompt）——那边的守卫保留当兜底（触屏没有 hover、
 * 助手 op 与用户共用同一入口），这里让按钮在点击前就说清楚为什么不能点。
 * `GenericDetailBody` / `NodeMediaInspector` 各有一份手写的同款判定，收敛到
 * 这里是后续片，别再新增第四份。
 *
 * `upstreamTextPrompt`：视频节点的 prompt 可由上游 shotText 供给
 * （`mergePromptWithUpstreamText` 两边全空才算空），调用方按 handler 同款
 * 收割后传入；镜头图不读上游文本，不传即可。
 */
export function getMediaGenerateBlockReason(
  type: NodeWorkflowNodeType,
  data: NodeWorkflowNodeData,
  options?: { upstreamTextPrompt?: string },
): MediaGenerateBlockReason | null {
  if (!data.model) {
    return 'noModel'
  }
  const ownPrompt = buildNodeWorkflowPrompt(type, data).trim()
  const upstreamPrompt = options?.upstreamTextPrompt?.trim() ?? ''
  if (!ownPrompt && !upstreamPrompt) {
    return 'noPrompt'
  }
  return null
}
