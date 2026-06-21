'use client'

import { WandSparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { NODE_TYPE_IDS } from '@/constants/node-types'
import { buildNodeWorkflowPrompt } from '@/lib/node-workflow-prompt'

import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import {
  getDefaultEditorFields,
  NodeActionButton,
  NodeFieldEditor,
  NodeModelSelector,
} from '../nodes/NodeCardControls'
import type { NodeDetailBodyProps } from './registry'

/**
 * Fallback detail body — composes Codex's NodeCardControls (model selector +
 * field editor + per-type action) relocated out of the card into the panel.
 * Used for every node type without a dedicated detail body.
 */
export function GenericDetailBody({ nodeId, type, data }: NodeDetailBodyProps) {
  const t = useTranslations('StudioNode.nodeDetail')
  const { generateCharacterImage, generateMediaNode } = useNodeWorkflowActions()

  let onAction: (() => void) | null = null
  const actionIcon = <WandSparkles className="mr-1.5 size-4" />
  const actionLabel = t('generate')
  let actionDisabled = false

  if (type === NODE_TYPE_IDS.characterImage) {
    onAction = () => void generateCharacterImage?.(nodeId)
    actionDisabled = !data.prompt.trim()
  } else if (
    type === NODE_TYPE_IDS.shot ||
    type === NODE_TYPE_IDS.backgroundImage ||
    type === NODE_TYPE_IDS.frameImage
  ) {
    onAction = () => void generateMediaNode?.(nodeId)
    actionDisabled = !buildNodeWorkflowPrompt(type, data).trim()
  }

  return (
    <div className="space-y-3">
      {/* NodeModelSelector self-hides when the type has no model options. */}
      <NodeModelSelector nodeId={nodeId} type={type} data={data} />
      <NodeFieldEditor
        nodeId={nodeId}
        data={data}
        fields={getDefaultEditorFields(type)}
      />
      {onAction ? (
        <NodeActionButton disabled={actionDisabled} onClick={onAction}>
          {actionIcon}
          {actionLabel}
        </NodeActionButton>
      ) : null}
    </div>
  )
}
