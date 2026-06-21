'use client'

import type { NodeProps } from '@xyflow/react'
import { AlertTriangle, Film, Video } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  NODE_GENERATION_STATUS_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
} from '@/constants/node-types'
import { deriveSwitcherStateFromModel } from '@/lib/video-model-resolver'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { VideoComposer } from '../composer/VideoComposer'
import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { NodeExpandButton } from './NodeCardControls'
import { NodeShell } from './NodeShell'

export function SeedanceNode(props: NodeProps<NodeWorkflowNode>) {
  const { id, data, selected } = props
  const t = useTranslations('StudioNode.videoGeneration')
  const mediaUrl = typeof data.mediaUrl === 'string' ? data.mediaUrl : null
  const generationStatus =
    data.generationStatus ??
    (mediaUrl
      ? NODE_GENERATION_STATUS_IDS.success
      : NODE_GENERATION_STATUS_IDS.idle)
  const isPending =
    generationStatus === NODE_GENERATION_STATUS_IDS.pending ||
    data.status === NODE_STATUS_IDS.running

  // §5.1 shot override: this node's model brand differs from the canvas default
  // → flag it (⚠ badge + dashed border) so cross-shot drift is scannable.
  const { defaultVideoModel } = useNodeWorkflowActions()
  const nodeBrand = deriveSwitcherStateFromModel(data.model).brand
  const isOverridden = Boolean(
    defaultVideoModel && nodeBrand && nodeBrand !== defaultVideoModel.brand,
  )

  return (
    <NodeShell
      type={NODE_TYPE_IDS.seedance}
      selected={selected}
      status={data.status}
      overridden={isOverridden}
    >
      <NodeShell.Header
        type={NODE_TYPE_IDS.seedance}
        status={data.status}
        action={
          <div className="flex items-center gap-1">
            {isOverridden ? (
              <span
                title={t('overrideHint')}
                className="flex size-6 items-center justify-center rounded-lg border border-node-muted/50 bg-node-panel-inner text-node-foreground"
              >
                <AlertTriangle className="size-3.5" />
              </span>
            ) : null}
            <NodeExpandButton nodeId={id} />
          </div>
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

        {/* B2/B3: compact composer (model chip + summary + generate). ⤢ opens
            the shared detail panel with the full B2 params — the card never
            grows in place. */}
        <VideoComposer id={id} data={data} density="card" />
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
