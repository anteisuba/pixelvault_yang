'use client'

import { useCallback } from 'react'
import { useTranslations } from 'next-intl'

import { NODE_MEDIA_KIND_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { IMEAwareInput } from './IMEAwareField'
import { InspectorField } from './InspectorField'
import { NodeMediaInspector } from './NodeMediaInspector'

interface BackgroundImageInspectorProps {
  node: NodeWorkflowNode
}

/**
 * Background image node Inspector — a thin wrapper over the unified
 * NodeMediaInspector (option B / node-consolidation). It adds the always-visible
 * background name field; all preview / source / AI-generate behavior lives in
 * NodeMediaInspector so the background path can never drift from
 * character/shot/frame again.
 */
export function BackgroundImageInspector({
  node,
}: BackgroundImageInspectorProps) {
  const tBg = useTranslations('StudioNode.workflowNodes.backgroundImage')
  const { updateNodeData } = useNodeWorkflowActions()

  const backgroundName =
    typeof node.data.backgroundName === 'string' ? node.data.backgroundName : ''
  const handleNameChange = useCallback(
    (next: string) => {
      updateNodeData(node.id, { backgroundName: next })
    },
    [node.id, updateNodeData],
  )

  return (
    <div className="space-y-4">
      <InspectorField label={tBg('nameLabel')}>
        <IMEAwareInput
          value={backgroundName}
          onValueChange={handleNameChange}
          aria-label={tBg('nameLabel')}
          placeholder={tBg('namePlaceholder')}
          className="h-10 w-full rounded-2xl border border-node-panel-inner bg-node-panel-soft px-3 text-sm font-semibold text-node-foreground outline-none placeholder:text-node-subtle focus-visible:border-node-focus-ring focus-visible:ring-2 focus-visible:ring-node-focus-ring/20"
        />
      </InspectorField>
      <NodeMediaInspector
        node={node}
        type={NODE_TYPE_IDS.backgroundImage}
        kind={NODE_MEDIA_KIND_IDS.image}
      />
    </div>
  )
}
