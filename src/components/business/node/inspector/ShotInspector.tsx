'use client'

import { useCallback, useMemo } from 'react'
import { useEdges, useNodes } from '@xyflow/react'
import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { NODE_MEDIA_KIND_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import { getSeedanceReferenceKind } from '@/lib/node-workflow-graph'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'

import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { NodeMediaInspector } from './NodeMediaInspector'

interface ShotInspectorProps {
  node: NodeWorkflowNode
}

interface ShotUpstreamRef {
  edgeId: string
  kind: 'character' | 'background'
  name: string | null
}

/**
 * Shot (镜头) node Inspector — the unified NodeMediaInspector plus shot-only
 * reference chips: each upstream character/background node wired into the
 * shot shows as a named chip in the AI form. Clicking inserts its name into
 * the prompt (so "让 yangyang…" lines up with the reference image the
 * generator harvests + labels); × drops the edge. The chips read live from
 * the graph — implicit harvest, so a disconnect removes them with no stale
 * node data. The shot's own name is edited on-card now (S4/S5,
 * canvas-image-card.md §1/§四/§五 — IdentityCollectorCard's
 * EditableNodeLabel), not here.
 */
export function ShotInspector({ node }: ShotInspectorProps) {
  const t = useTranslations('StudioNode.mediaNodes')
  const allNodes = useNodes<NodeWorkflowNode>()
  const edges = useEdges<NodeWorkflowEdge>()
  const { updateNodeData, deleteEdge } = useNodeWorkflowActions()

  const upstreamRefs = useMemo<ShotUpstreamRef[]>(() => {
    const refs: ShotUpstreamRef[] = []
    for (const edge of edges) {
      if (edge.target !== node.id) continue
      const source = allNodes.find((candidate) => candidate.id === edge.source)
      if (!source) continue
      const kind = getSeedanceReferenceKind(source)
      if (kind !== 'character' && kind !== 'background') continue
      const rawName =
        kind === 'character'
          ? (typeof source.data.characterName === 'string' &&
              source.data.characterName.trim()) ||
            source.data.character?.name?.trim() ||
            ''
          : typeof source.data.backgroundName === 'string'
            ? source.data.backgroundName.trim()
            : ''
      refs.push({ edgeId: edge.id, kind, name: rawName || null })
    }
    return refs
  }, [allNodes, edges, node.id])

  const handleInsertName = useCallback(
    (name: string) => {
      const current =
        typeof node.data.prompt === 'string' ? node.data.prompt : ''
      if (!name || current.includes(name)) return
      const next = current.trim() ? `${current.trim()} ${name}` : name
      updateNodeData(node.id, { prompt: next })
    },
    [node.data.prompt, node.id, updateNodeData],
  )

  return (
    <div className="space-y-4">
      {/* S4/S5（2026-07-27，canvas-image-card.md §1/§四/§五）：改名收口到
          卡外的原地可编辑标签，这里不再重复一份改名输入。 */}
      <NodeMediaInspector
        node={node}
        type={NODE_TYPE_IDS.shot}
        kind={NODE_MEDIA_KIND_IDS.image}
        referenceChips={
          upstreamRefs.length > 0 ? (
            <div className="space-y-2 rounded-2xl border border-node-panel-inner bg-node-panel-soft p-2">
              <p className="px-1 text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
                {t('upstreamRefsHint')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {upstreamRefs.map((ref) => (
                  <span
                    key={ref.edgeId}
                    className="inline-flex items-center gap-1.5 rounded-full border border-node-panel-inner bg-node-panel px-2 py-1"
                  >
                    <span
                      aria-hidden
                      className={`size-1.5 rounded-full ${
                        ref.kind === 'character'
                          ? 'bg-node-port-character'
                          : 'bg-node-port-background'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => handleInsertName(ref.name ?? '')}
                      disabled={!ref.name}
                      className="text-xs font-medium text-node-foreground outline-none transition-colors hover:text-node-port-character disabled:text-node-subtle focus-visible:underline"
                    >
                      {ref.name ?? t('unnamedRef')}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteEdge(ref.edgeId)}
                      aria-label={t('removeUpstreamRef')}
                      title={t('removeUpstreamRef')}
                      className="flex size-4 items-center justify-center rounded-full text-node-muted outline-none transition-colors hover:text-node-foreground focus-visible:ring-2 focus-visible:ring-node-focus-ring/20"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ) : null
        }
      />
    </div>
  )
}
