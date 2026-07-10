'use client'

import { useCallback } from 'react'
import { useEdges, useNodes } from '@xyflow/react'
import { Mic2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { NODE_MEDIA_KIND_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import { getUpstreamNodes, isVoiceProfileNode } from '@/lib/node-workflow-graph'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'

import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { IMEAwareInput } from './IMEAwareField'
import { InspectorField } from './InspectorField'
import { NodeMediaInspector } from './NodeMediaInspector'

interface CharacterImageInspectorProps {
  node: NodeWorkflowNode
}

/**
 * Character image node Inspector — a thin wrapper over the unified
 * NodeMediaInspector (option B / node-consolidation). It feeds the shared
 * component a `roleExtras` slot: the always-visible character name field + the
 * bound-voice hint (so a wired upstream voice node is visible before
 * generation). All preview / source / AI-generate behavior lives in
 * NodeMediaInspector so the character path can never drift from
 * background/shot/frame again.
 */
export function CharacterImageInspector({
  node,
}: CharacterImageInspectorProps) {
  const t = useTranslations('StudioNode.characterImage')
  const allNodes = useNodes<NodeWorkflowNode>()
  const edges = useEdges<NodeWorkflowEdge>()
  const { updateNodeData } = useNodeWorkflowActions()

  const characterName =
    typeof node.data.characterName === 'string'
      ? node.data.characterName
      : (node.data.character?.name ?? '')

  const handleNameChange = useCallback(
    (next: string) => {
      updateNodeData(node.id, { characterName: next })
    },
    [node.id, updateNodeData],
  )

  // Detect an upstream voice node so the binding is visible before the video
  // step. Mirrors the previous bespoke inspector — the downstream Seedance
  // Reference builder labels its @AudioN slot with this character's name.
  const boundVoice: { voiceName: string | null } | null = (() => {
    const upstream = getUpstreamNodes(node.id, edges, allNodes)
    for (const candidate of upstream) {
      if (!isVoiceProfileNode(candidate)) continue
      const url =
        typeof candidate.data.voiceReferenceAudioUrl === 'string'
          ? candidate.data.voiceReferenceAudioUrl.trim()
          : ''
      if (!url) continue
      const voiceName =
        (typeof candidate.data.voiceName === 'string' &&
          candidate.data.voiceName.trim()) ||
        (typeof candidate.data.voiceId === 'string' &&
          candidate.data.voiceId.trim()) ||
        (typeof candidate.data.voiceReferenceAudioName === 'string' &&
          candidate.data.voiceReferenceAudioName.trim()) ||
        null
      return { voiceName }
    }
    return null
  })()

  return (
    <NodeMediaInspector
      node={node}
      type={NODE_TYPE_IDS.characterImage}
      kind={NODE_MEDIA_KIND_IDS.image}
      roleExtras={
        <>
          <InspectorField
            label={t('nameLabel')}
            statusDotClassName="bg-node-port-character"
          >
            <IMEAwareInput
              value={characterName}
              onValueChange={handleNameChange}
              aria-label={t('nameLabel')}
              placeholder={t('namePrefix')}
              className="h-10 w-full rounded-2xl border border-node-panel-inner bg-node-panel-soft px-3 text-sm font-semibold text-node-foreground outline-none placeholder:text-node-subtle focus-visible:border-node-focus-ring focus-visible:ring-2 focus-visible:ring-node-focus-ring/20"
            />
          </InspectorField>

          {boundVoice ? (
            <div className="flex items-center gap-2 rounded-2xl border border-node-paint/30 bg-node-paint/10 px-3 py-2 text-xs leading-5 text-node-paint">
              <Mic2 className="size-3.5 shrink-0" />
              <span className="flex-1 truncate">
                {boundVoice.voiceName
                  ? t('voiceBound.namedVoice', {
                      voiceName: boundVoice.voiceName,
                    })
                  : t('voiceBound.unnamed')}
              </span>
            </div>
          ) : null}
        </>
      }
    />
  )
}
