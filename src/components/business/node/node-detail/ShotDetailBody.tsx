'use client'

import { useCallback, useMemo } from 'react'
import { useEdges, useNodes } from '@xyflow/react'
import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useDownstreamUses } from '@/hooks/node/use-downstream-uses'
import { getSeedanceReferenceKind } from '@/lib/node-workflow-graph'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'

import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { ImageFamilyBody } from './ImageFamilyBody'
import { RelationsStrip } from './RelationsStrip'
import type { NodeDetailBodyProps } from './registry'
import type { NodeDetailSlots } from './slots'

interface ShotUpstreamRef {
  edgeId: string
  kind: 'character' | 'background'
  name: string | null
}

/**
 * 镜头图（`shot`）—— 契约 §6：`媒体井` / `素材库/Studio + 上游 chip` /
 * `prompt·镜头·构图 + 模型` / 下游反查 / 错误 + 禁用因 / 生成。
 *
 * 本族独有的是**上游 chip**：连进来的每个角色/背景节点显示成一颗带名字的 chip，
 * 点名字把它插进提示词（让「让 yangyang…」和生成器真正收割并标注的那张参考图对上），
 * × 断开这条边。chip 直接读图，是隐式收割 —— 断开后不留任何陈旧节点数据。
 *
 * ⚠ 上游 chip 归**素材架**（槽 3）不归编排台：它回答的是「这次用什么材料、从哪来」。
 * 它原本挂在 `showAiForm` 里（也就是编排台的位置），那是槽位错放。
 */
export function ShotDetailBody({
  nodeId,
  type,
  data,
  children,
}: NodeDetailBodyProps & {
  children: (slots: NodeDetailSlots) => React.ReactNode
}) {
  const t = useTranslations('StudioNode.mediaNodes')
  const tDetail = useTranslations('StudioNode.nodeDetail')
  const tTypes = useTranslations('StudioNode.nodeTypes')
  const allNodes = useNodes<NodeWorkflowNode>()
  const edges = useEdges<NodeWorkflowEdge>()
  const { updateNodeData, deleteEdge } = useNodeWorkflowActions()
  const uses = useDownstreamUses(nodeId)

  const upstreamRefs = useMemo<ShotUpstreamRef[]>(() => {
    const refs: ShotUpstreamRef[] = []
    for (const edge of edges) {
      if (edge.target !== nodeId) continue
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
  }, [allNodes, edges, nodeId])

  const handleInsertName = useCallback(
    (name: string) => {
      const current = typeof data.prompt === 'string' ? data.prompt : ''
      if (!name || current.includes(name)) return
      updateNodeData(nodeId, {
        prompt: current.trim() ? `${current.trim()} ${name}` : name,
      })
    },
    [data.prompt, nodeId, updateNodeData],
  )

  return (
    <ImageFamilyBody
      nodeId={nodeId}
      type={type}
      data={data}
      rackExtras={
        // R4：空而合法 → 彻底安静。没有上游就整行不出现，不预埋「还没有连接参考」。
        upstreamRefs.length === 0 ? null : (
          <div className="canvas-detail-ref-row">
            <span className="canvas-detail-ref-label">
              {t('upstreamRefsHint')}
            </span>
            <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
              {upstreamRefs.map((ref) => (
                <span
                  key={ref.edgeId}
                  className="inline-flex items-center gap-1.5 rounded-full border border-node-edge px-2.5 py-1"
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
                    className="text-2xs font-medium text-node-foreground outline-none transition-colors focus-visible:underline disabled:text-node-subtle"
                  >
                    {ref.name ?? t('unnamedRef')}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteEdge(ref.edgeId)}
                    aria-label={t('removeUpstreamRef')}
                    title={t('removeUpstreamRef')}
                    className="flex size-4 items-center justify-center rounded-full text-node-muted outline-none transition-colors hover:text-node-foreground focus-visible:ring-2 focus-visible:ring-node-focus-ring/30"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )
      }
      relations={
        <RelationsStrip
          uses={uses}
          emptyLabel={tDetail('relationsEmptyShot')}
          labelOf={(use) => use.name ?? tTypes(use.type)}
          ariaOf={(name) => tDetail('focusOnCanvas', { name })}
        />
      }
    >
      {children}
    </ImageFamilyBody>
  )
}
