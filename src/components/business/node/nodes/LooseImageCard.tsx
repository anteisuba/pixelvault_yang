'use client'

import Image from 'next/image'
import { useTranslations } from 'next-intl'

import { NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'

import { NodeShell } from './NodeShell'

interface LooseImageCardProps {
  id: string
  data: NodeWorkflowNodeData
  selected?: boolean
}

/**
 * 散图卡（S5c 三.1）— a role-less `image` node that already carries media.
 * This is a LEGAL standing state on the canvas, not an unresolved "please
 * pick a role" empty state (S5d ③ retires that chooser entirely — a role-less
 * node with NO media yet renders `ImageSourceStarter` instead). It gets its
 * own minimal presentation: deep window + filename caption, no title-bar type
 * badge (§三.1 "无片头徽章") — everything `NodeMediaPreview` adds beyond that
 * (AI-generate form, source existing/generated ribbon, prompt-field summary,
 * footer wand CTA) is meaningless for a plain dropped-in asset.
 *
 * The drag-to-fuse gesture (loose image → character/background card, §三.3,
 * retargeted onto visible canvas cards by S5d ⑤) rides ReactFlow's OWN native
 * node drag (this card sets no pointer handlers of its own) —
 * `StudioNodeWorkbench`'s `onNodeDragStop` hit-tests the drop point against
 * canvas node wrappers / Cast cards. `NodeShell`'s selection toolbar (⤢
 * expand / 🗑 delete) comes for free, same as every other card.
 */
export function LooseImageCard({ id, data, selected }: LooseImageCardProps) {
  const t = useTranslations('StudioNode.ingest.looseImage')
  const mediaUrl = typeof data.mediaUrl === 'string' ? data.mediaUrl : ''
  const label =
    (typeof data.mediaLabel === 'string' && data.mediaLabel.trim()) ||
    (typeof data.sourceLabel === 'string' && data.sourceLabel.trim()) ||
    t('untitled')

  return (
    <NodeShell
      nodeId={id}
      type={NODE_TYPE_IDS.image}
      selected={selected}
      status={data.status}
      showSourceHandle={false}
      showTargetHandle={false}
    >
      <NodeShell.Body className="space-y-2">
        <div className="node-card-window relative aspect-square overflow-hidden rounded-sm border border-node-panel-inner bg-node-card-window">
          {mediaUrl ? (
            <Image
              src={mediaUrl}
              alt={t('cardAlt')}
              fill
              sizes="320px"
              className="object-cover"
              unoptimized
            />
          ) : null}
        </div>
        <p
          className="truncate text-2xs font-medium text-node-card-ink-muted"
          title={label}
        >
          {label}
        </p>
      </NodeShell.Body>
    </NodeShell>
  )
}
