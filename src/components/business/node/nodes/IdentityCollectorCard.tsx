'use client'

import Image from 'next/image'
import { useMemo } from 'react'
import { useEdges, useNodes } from '@xyflow/react'
import { Mic2, UserRound } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  NODE_TYPE_IDS,
  NODE_WORKFLOW_FIELD_IDS,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import { getNodeWorkflowFieldValue } from '@/lib/node-workflow-prompt'
import { getUpstreamNodes, isVoiceProfileNode } from '@/lib/node-workflow-graph'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'

import { NodeExpandButton } from './NodeCardControls'
import { NodeShell } from './NodeShell'

interface IdentityCollectorCardProps {
  id: string
  /** Presentation type — `characterImage` or `backgroundImage` (legacy type
   *  the unified node's role maps to, same as NodeMediaPreview's `type`). */
  legacyType: NodeWorkflowNodeType
  data: NodeWorkflowNode['data']
  selected?: boolean
}

const MAX_THUMBNAILS = 4

function getName(
  legacyType: NodeWorkflowNodeType,
  data: NodeWorkflowNode['data'],
) {
  if (legacyType === NODE_TYPE_IDS.characterImage) {
    return data.characterName?.trim() || data.character?.name?.trim()
  }
  if (legacyType === NODE_TYPE_IDS.backgroundImage) {
    return data.backgroundName?.trim()
  }
  return undefined
}

/** 词条摘要 — a one-line gist of the card's own entries, distinct per legacy
 *  type: background has location/mood/lighting fields; character only has a
 *  free prompt (visualSeed is assistant-owned, shown read-only in the
 *  dossier, not summarized here to avoid duplicating that surface). */
function getSummaryLine(
  legacyType: NodeWorkflowNodeType,
  data: NodeWorkflowNode['data'],
): string | undefined {
  if (legacyType === NODE_TYPE_IDS.backgroundImage) {
    const parts = [
      NODE_WORKFLOW_FIELD_IDS.location,
      NODE_WORKFLOW_FIELD_IDS.mood,
      NODE_WORKFLOW_FIELD_IDS.lighting,
    ]
      .map((fieldId) => getNodeWorkflowFieldValue(data, fieldId).trim())
      .filter(Boolean)
    return parts.length > 0 ? parts.join(' · ') : undefined
  }
  const prompt = getNodeWorkflowFieldValue(
    data,
    NODE_WORKFLOW_FIELD_IDS.prompt,
  ).trim()
  return prompt || undefined
}

/**
 * §6.0/§6.1 S5d ④「卡片收集器 UI」: the archive-card face for a character/
 * background node visible on canvas (post S5d ② hidden-condition fix, a
 * zero-reference identity card now renders here instead of staying hidden).
 * Deliberately a DIFFERENT face from `NodeMediaPreview` (image-container
 * cards: shot/frame/closeup) — a collector card reads as a dossier (gallery
 * thumbnail grid + ♪ voice badge + name + entry summary), not a single-image
 * result. The full editing surface (gallery grid with role/weight controls,
 * voice bind, 出演 list) already exists in the expand panel
 * (`CharacterImageInspector`/`BackgroundImageInspector`, S5c) — this is only
 * the collapsed canvas presentation, so it reads referenceAssets/edges but
 * writes nothing itself.
 */
export function IdentityCollectorCard({
  id,
  legacyType,
  data,
  selected,
}: IdentityCollectorCardProps) {
  const t = useTranslations('StudioNode.dossier')
  const nodes = useNodes<NodeWorkflowNode>()
  const edges = useEdges<NodeWorkflowEdge>()
  const name = getName(legacyType, data)
  const summaryLine = getSummaryLine(legacyType, data)
  const referenceAssets = useMemo(
    () => data.referenceAssets ?? [],
    [data.referenceAssets],
  )

  const hasVoice = useMemo(() => {
    if (legacyType !== NODE_TYPE_IDS.characterImage) return false
    return getUpstreamNodes(id, edges, nodes).some(isVoiceProfileNode)
  }, [edges, id, legacyType, nodes])

  const thumbnails = useMemo(() => {
    const urls: string[] = []
    if (typeof data.mediaUrl === 'string' && data.mediaUrl.trim()) {
      urls.push(data.mediaUrl.trim())
    }
    for (const reference of referenceAssets) {
      if (urls.length >= MAX_THUMBNAILS) break
      if (!urls.includes(reference.url)) urls.push(reference.url)
    }
    return urls.slice(0, MAX_THUMBNAILS)
  }, [data.mediaUrl, referenceAssets])

  const totalImageCount =
    (typeof data.mediaUrl === 'string' && data.mediaUrl.trim() ? 1 : 0) +
    referenceAssets.length
  const overflowCount = Math.max(0, totalImageCount - thumbnails.length)

  return (
    <NodeShell
      nodeId={id}
      type={legacyType}
      selected={selected}
      status={data.status}
    >
      <NodeShell.Header
        type={legacyType}
        status={data.status}
        title={name}
        action={<NodeExpandButton nodeId={id} />}
      />
      <NodeShell.Ingredients nodeId={id} />
      <NodeShell.Body className="space-y-3">
        {thumbnails.length > 0 ? (
          <div className="grid grid-cols-2 gap-1">
            {thumbnails.map((url, index) => (
              <div
                key={`${url}-${index}`}
                className="node-card-window relative aspect-square overflow-hidden rounded-sm bg-node-card-window"
              >
                <Image
                  src={url}
                  alt=""
                  fill
                  sizes="120px"
                  className="object-cover"
                  unoptimized
                />
                {index === thumbnails.length - 1 && overflowCount > 0 ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-node-canvas/70 text-xs font-semibold text-node-foreground">
                    +{overflowCount}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="node-card-window flex aspect-square w-full items-center justify-center rounded-sm bg-node-card-window">
            <UserRound className="size-8 text-node-foreground" aria-hidden />
          </div>
        )}

        {hasVoice ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-node-port-voice/10 px-2 py-0.5 text-2xs font-semibold text-node-port-voice">
            <Mic2 className="size-3" aria-hidden />
            {t('voiceSection')}
          </span>
        ) : null}

        {summaryLine ? (
          <p className="line-clamp-2 text-xs leading-5 text-node-card-ink-muted">
            {summaryLine}
          </p>
        ) : null}
      </NodeShell.Body>
    </NodeShell>
  )
}
