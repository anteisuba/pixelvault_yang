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

  return fields
    .map((fieldId) => getNodeWorkflowFieldValue(data, fieldId).trim())
    .filter(Boolean)
    .join('\n')
}

export type MediaGenerateBlockReason = 'noModel' | 'noPrompt'

/**
 * 台账 #12（2026-08-02）：媒体节点「能不能生成」的渲染期判定，与
 * `StudioNodeWorkbench.handleGenerateMediaNode` 点击后的两道守卫**同一判据、
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
