'use client'

import { useCallback, useMemo } from 'react'
import { useEdges, useNodes } from '@xyflow/react'
import { useTranslations } from 'next-intl'

import { NODE_MEDIA_KIND_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import { resolveNodePresentationType } from '@/lib/node-presentation'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'

import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { IMEAwareInput } from './IMEAwareField'
import { InspectorField } from './InspectorField'
import { NodeMediaInspector } from './NodeMediaInspector'

interface BackgroundImageInspectorProps {
  node: NodeWorkflowNode
}

/** Same field-precedence copy as `CharacterImageInspector`'s — see that
 *  file's doc comment for why this isn't a shared helper. */
function getParticipantLabel(node: NodeWorkflowNode, fallback: string): string {
  if (
    node.type === NODE_TYPE_IDS.shot ||
    (node.type === NODE_TYPE_IDS.image && node.data.role === 'shot')
  ) {
    return node.data.shotName?.trim() || fallback
  }
  if (node.type === NODE_TYPE_IDS.seedance) {
    return node.data.mediaLabel?.trim() || fallback
  }
  return fallback
}

/**
 * Background image node Inspector — S5c 二.2 "背景卡若同构顺带": structurally
 * the SAME as the character dossier for 视觉身份区 (main photo + reference
 * gallery, `NodeMediaInspector`'s `isImageNode` gate already gives background
 * nodes the identical referenceAssets/LoRA/AI-generate machinery) + 出演区.
 * It's NOT symmetric on 听觉身份区 (backgrounds have no voice binding — no
 * ambient-audio node/field exists yet, a known gap noted by the original
 * `BackgroundDetailBody` doc comment) or closeup merge (§9 B closeups are a
 * character-only face-detail sub-reference).
 */
export function BackgroundImageInspector({
  node,
}: BackgroundImageInspectorProps) {
  const tBg = useTranslations('StudioNode.workflowNodes.backgroundImage')
  const tDossier = useTranslations('StudioNode.dossier')
  const tTypes = useTranslations('StudioNode.nodeTypes')
  const allNodes = useNodes<NodeWorkflowNode>()
  const edges = useEdges<NodeWorkflowEdge>()
  const { updateNodeData, extractReference, focusNode, setExpandedNodeId } =
    useNodeWorkflowActions()

  const backgroundName =
    typeof node.data.backgroundName === 'string' ? node.data.backgroundName : ''
  const handleNameChange = useCallback(
    (next: string) => {
      updateNodeData(node.id, { backgroundName: next })
    },
    [node.id, updateNodeData],
  )

  const performances = useMemo(() => {
    return edges
      .filter((edge) => edge.source === node.id)
      .map((edge) => allNodes.find((candidate) => candidate.id === edge.target))
      .filter((candidate): candidate is NodeWorkflowNode => Boolean(candidate))
  }, [allNodes, edges, node.id])

  const handleExtractReference = useCallback(
    (referenceId: string) => {
      extractReference?.(node.id, referenceId)
    },
    [extractReference, node.id],
  )

  const handleFocusPerformance = useCallback(
    (participantId: string) => {
      setExpandedNodeId(null)
      focusNode?.(participantId)
    },
    [focusNode, setExpandedNodeId],
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
        referenceGalleryMode="gallery"
        onExtractReference={handleExtractReference}
      />

      {/* 出演区 */}
      <div className="space-y-2 rounded-2xl border border-node-panel-inner bg-node-panel-soft p-3">
        <p className="text-sm font-semibold text-node-foreground">
          {tDossier('performanceSection')}
        </p>
        {performances.length === 0 ? (
          <p className="text-xs text-node-muted">
            {tDossier('performanceEmpty')}
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {performances.map((participant) => {
              const label = getParticipantLabel(
                participant,
                tTypes(resolveNodePresentationType(participant)),
              )
              return (
                <button
                  key={participant.id}
                  type="button"
                  onClick={() => handleFocusPerformance(participant.id)}
                  aria-label={tDossier('performanceFocusAria', { name: label })}
                  title={tDossier('performanceFocusAria', { name: label })}
                  className="rounded-full bg-node-panel px-2.5 py-1 text-2xs font-medium text-node-foreground transition-colors hover:bg-node-panel-inner"
                >
                  {label}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
