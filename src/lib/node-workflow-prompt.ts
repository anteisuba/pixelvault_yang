import {
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
  const fields = NODE_WORKFLOW_FIELDS_BY_NODE_TYPE[type] ?? [
    NODE_WORKFLOW_FIELD_IDS.prompt,
  ]

  return fields
    .map((fieldId) => getNodeWorkflowFieldValue(data, fieldId).trim())
    .filter(Boolean)
    .join('\n')
}
