'use client'

import { useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import { Film, Maximize2, Minimize2, Video } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  NODE_GENERATION_STATUS_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
} from '@/constants/node-types'
import { cn } from '@/lib/utils'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { VideoComposer } from '../composer/VideoComposer'
import { NodeShell } from './NodeShell'

export function SeedanceNode(props: NodeProps<NodeWorkflowNode>) {
  const { id, data, selected } = props
  const t = useTranslations('StudioNode.videoGeneration')
  const tc = useTranslations('StudioNode.videoComposer')
  // ⤢ expands the card IN PLACE (B3): compact card shows only the essentials,
  // expanded grows the same card to host the full composer. Ephemeral per node.
  const [expanded, setExpanded] = useState(false)

  const mediaUrl = typeof data.mediaUrl === 'string' ? data.mediaUrl : null
  const generationStatus =
    data.generationStatus ??
    (mediaUrl
      ? NODE_GENERATION_STATUS_IDS.success
      : NODE_GENERATION_STATUS_IDS.idle)
  const isPending =
    generationStatus === NODE_GENERATION_STATUS_IDS.pending ||
    data.status === NODE_STATUS_IDS.running

  return (
    <NodeShell
      type={NODE_TYPE_IDS.seedance}
      selected={selected}
      status={data.status}
      className={cn(
        'node-canvas-panel-motion',
        expanded && 'z-10 w-node-card-expanded',
      )}
    >
      <NodeShell.Header
        type={NODE_TYPE_IDS.seedance}
        status={data.status}
        action={
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            onKeyDownCapture={(event) => event.stopPropagation()}
            aria-label={expanded ? tc('collapseCard') : tc('expandCard')}
            title={expanded ? tc('collapseCard') : tc('expandCard')}
            className="nodrag flex size-7 items-center justify-center rounded-lg text-node-muted transition-colors hover:bg-node-panel-inner hover:text-node-foreground"
          >
            {expanded ? (
              <Minimize2 className="size-4" />
            ) : (
              <Maximize2 className="size-4" />
            )}
          </button>
        }
      />
      <NodeShell.Body className="space-y-3">
        <div className="relative aspect-video overflow-hidden rounded-xl border border-node-panel-inner bg-node-panel-soft">
          {mediaUrl ? (
            <video
              src={mediaUrl}
              className="h-full w-full object-cover"
              controls
              muted
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
              <span className="flex size-11 items-center justify-center rounded-xl bg-node-panel-inner text-node-muted">
                <Video className="size-5" />
              </span>
              <p className="text-xs leading-5 text-node-muted">
                {t('emptyPreview')}
              </p>
            </div>
          )}

          {isPending ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-node-canvas/70 text-node-foreground backdrop-blur-sm">
              <Film className="size-5 animate-pulse text-node-foreground" />
              <span className="text-xs font-semibold">{t('generating')}</span>
            </div>
          ) : null}
        </div>

        {/* B2/B3: model-aware composer on the node. Compact card = essentials;
            ⤢ grows the card to the full param set. Right rail stays assistant. */}
        <VideoComposer
          id={id}
          data={data}
          density={expanded ? 'expand' : 'card'}
        />
      </NodeShell.Body>
      <NodeShell.Footer>
        <p className="truncate text-2xs font-medium text-node-subtle">
          {mediaUrl ? t('footerDone') : t('footerEmpty')}
        </p>
        <span className="flex size-8 items-center justify-center rounded-xl bg-node-panel-inner text-node-foreground">
          <Film className="size-4" />
        </span>
      </NodeShell.Footer>
    </NodeShell>
  )
}
