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
