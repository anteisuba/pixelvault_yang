'use client'

import {
  useCallback,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  NODE_MEDIA_KIND_BY_NODE_TYPE,
  NODE_TYPE_IDS,
  NODE_WORKFLOW_FIELD_IDS,
  type NodeWorkflowFieldId,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import { getNodeWorkflowFieldValue } from '@/lib/node-workflow-prompt'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

import { WorkflowModelPicker } from '../WorkflowModelPicker'
import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'

interface NodeExpandButtonProps {
  nodeId: string
}

interface NodeFieldEditorProps {
  nodeId: string
  data: NodeWorkflowNodeData
  fields: readonly NodeWorkflowFieldId[]
}

interface NodeActionButtonProps {
  children: ReactNode
  disabled?: boolean
  onClick(): void | Promise<void>
}

interface NodeModelSelectorProps {
  nodeId: string
  type: NodeWorkflowNodeType
  data: NodeWorkflowNodeData
}

function stopCanvasKeyboardEvent(event: ReactKeyboardEvent<HTMLElement>): void {
  event.stopPropagation()
}

export function NodeExpandButton({ nodeId }: NodeExpandButtonProps) {
  const t = useTranslations('StudioNode.videoComposer')
  const { expandedNodeId, setExpandedNodeId } = useNodeWorkflowActions()
  const expanded = expandedNodeId === nodeId

  return (
    <button
      type="button"
      onClick={() => setExpandedNodeId(expanded ? null : nodeId)}
      onKeyDownCapture={stopCanvasKeyboardEvent}
      aria-label={expanded ? t('collapseCard') : t('expandCard')}
      title={expanded ? t('collapseCard') : t('expandCard')}
      className="nodrag flex size-7 items-center justify-center rounded-lg text-node-muted transition-colors hover:bg-node-panel-inner hover:text-node-foreground"
    >
      {expanded ? (
        <Minimize2 className="size-4" />
      ) : (
        <Maximize2 className="size-4" />
      )}
    </button>
  )
}

export function NodeFieldEditor({
  nodeId,
  data,
  fields,
}: NodeFieldEditorProps) {
  const tFields = useTranslations('StudioNode.workflowFields')
  const { updateNodeData } = useNodeWorkflowActions()

  const updateField = useCallback(
    (fieldId: NodeWorkflowFieldId, value: string) => {
      const patch: Partial<NodeWorkflowNodeData> = { [fieldId]: value }
      updateNodeData(nodeId, patch)
    },
    [nodeId, updateNodeData],
  )

  return (
    <div className="space-y-3 rounded-2xl border border-node-panel-inner bg-node-panel-soft p-3">
      {fields.map((fieldId) => (
        <label key={fieldId} className="block">
          <span className="text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
            {tFields(`${fieldId}.label`)}
          </span>
          <Textarea
            value={getNodeWorkflowFieldValue(data, fieldId)}
            placeholder={tFields(`${fieldId}.placeholder`)}
            onChange={(event) => updateField(fieldId, event.target.value)}
            onKeyDownCapture={stopCanvasKeyboardEvent}
            onKeyUpCapture={stopCanvasKeyboardEvent}
            className="nodrag nopan nowheel mt-2 min-h-20 resize-y rounded-xl border-node-panel-inner bg-node-panel px-3 py-2 text-sm leading-6 text-node-foreground shadow-none placeholder:text-node-subtle focus-visible:border-node-focus-ring focus-visible:ring-2 focus-visible:ring-node-focus-ring/20"
          />
        </label>
      ))}
    </div>
  )
}

export function NodeModelSelector({
  nodeId,
  type,
  data,
}: NodeModelSelectorProps) {
  const { modelOptionsByType, updateNodeData } = useNodeWorkflowActions()
  const options = modelOptionsByType[type] ?? []

  if (options.length === 0) {
    return null
  }

  return (
    <div className="nodrag nopan nowheel rounded-2xl border border-node-panel-inner bg-node-panel-soft p-3">
      <WorkflowModelPicker
        value={data.model}
        options={options}
        kind={NODE_MEDIA_KIND_BY_NODE_TYPE[type]}
        onChange={(model) => updateNodeData(nodeId, { model })}
      />
    </div>
  )
}

export function NodeActionButton({
  children,
  disabled,
  onClick,
}: NodeActionButtonProps) {
  return (
    <Button
      type="button"
      disabled={disabled}
      onClick={() => {
        void onClick()
      }}
      className="nodrag nopan nowheel h-10 w-full rounded-2xl bg-node-success text-xs font-semibold text-node-canvas hover:bg-node-success/90 disabled:bg-node-panel-inner disabled:text-node-subtle"
    >
      {children}
    </Button>
  )
}

export function getDefaultEditorFields(
  type: NodeWorkflowNodeType,
): readonly NodeWorkflowFieldId[] {
  switch (type) {
    case NODE_TYPE_IDS.shotText:
      return [
        NODE_WORKFLOW_FIELD_IDS.scene,
        NODE_WORKFLOW_FIELD_IDS.action,
        NODE_WORKFLOW_FIELD_IDS.camera,
        NODE_WORKFLOW_FIELD_IDS.composition,
      ]
    case NODE_TYPE_IDS.shot:
      return [
        NODE_WORKFLOW_FIELD_IDS.prompt,
        NODE_WORKFLOW_FIELD_IDS.action,
        NODE_WORKFLOW_FIELD_IDS.camera,
        NODE_WORKFLOW_FIELD_IDS.composition,
      ]
    case NODE_TYPE_IDS.backgroundImage:
      return [
        NODE_WORKFLOW_FIELD_IDS.location,
        NODE_WORKFLOW_FIELD_IDS.mood,
        NODE_WORKFLOW_FIELD_IDS.lighting,
        NODE_WORKFLOW_FIELD_IDS.prompt,
      ]
    case NODE_TYPE_IDS.frameImage:
      return [
        NODE_WORKFLOW_FIELD_IDS.frameIntent,
        NODE_WORKFLOW_FIELD_IDS.composition,
        NODE_WORKFLOW_FIELD_IDS.camera,
        NODE_WORKFLOW_FIELD_IDS.prompt,
      ]
    case NODE_TYPE_IDS.voice:
      return [
        NODE_WORKFLOW_FIELD_IDS.voiceName,
        NODE_WORKFLOW_FIELD_IDS.voiceProvider,
        NODE_WORKFLOW_FIELD_IDS.voiceId,
        NODE_WORKFLOW_FIELD_IDS.dialogue,
      ]
    case NODE_TYPE_IDS.agent:
      return [NODE_WORKFLOW_FIELD_IDS.prompt]
    case NODE_TYPE_IDS.composer:
      return [NODE_WORKFLOW_FIELD_IDS.prompt]
    default:
      return [NODE_WORKFLOW_FIELD_IDS.prompt]
  }
}
