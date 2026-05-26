'use client'

import type { NodeProps } from '@xyflow/react'
import { Film, ImageIcon, Mic2, Video } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  NODE_GENERATION_STATUS_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
} from '@/constants/node-types'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { NodeShell } from './NodeShell'

export function SeedanceNode(props: NodeProps<NodeWorkflowNode>) {
  const { data, selected } = props
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
  const hasPlan = Boolean(
    data.prompt ||
    data.motion ||
    data.camera ||
    data.duration ||
    data.audioIntent,
  )
  const summaryItems = [
    { labelKey: 'motionLabel', value: data.motion },
    { labelKey: 'cameraLabel', value: data.camera },
    { labelKey: 'durationLabel', value: data.duration },
  ] as const

  return (
    <NodeShell type={NODE_TYPE_IDS.seedance} selected={selected}>
      <NodeShell.Header type={NODE_TYPE_IDS.seedance} status={data.status} />
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
              <span className="flex size-11 items-center justify-center rounded-xl bg-node-amber/15 text-node-amber">
                <Video className="size-5" />
              </span>
              <p className="text-xs leading-5 text-node-muted">
                {t('emptyPreview')}
              </p>
            </div>
          )}

          {isPending ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-node-canvas/70 text-node-foreground backdrop-blur-sm">
              <Film className="size-5 animate-pulse text-node-amber" />
              <span className="text-xs font-semibold">{t('generating')}</span>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {summaryItems.map(({ labelKey, value }) => (
            <div
              key={labelKey}
              className="min-w-0 rounded-xl border border-node-panel-inner bg-node-panel-soft p-3"
            >
              <p className="text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
                {t(labelKey)}
              </p>
              <p className="mt-1 truncate text-xs font-semibold text-node-foreground">
                {value || t('fieldEmpty')}
              </p>
            </div>
          ))}
        </div>

        <div className="flex gap-2 rounded-xl border border-node-panel-inner bg-node-panel-soft p-3 text-xs leading-5 text-node-muted">
          <ImageIcon className="mt-0.5 size-4 shrink-0 text-node-amber" />
          <p className="line-clamp-2 flex-1">
            {hasPlan ? t('upstreamHintReady') : t('upstreamHintEmpty')}
          </p>
          <Mic2 className="mt-0.5 size-4 shrink-0 text-node-amber" />
        </div>
      </NodeShell.Body>
      <NodeShell.Footer>
        <p className="truncate text-2xs font-medium text-node-subtle">
          {mediaUrl ? t('footerDone') : t('footerEmpty')}
        </p>
        <span className="flex size-8 items-center justify-center rounded-xl bg-node-panel-inner text-node-amber">
          <Film className="size-4" />
        </span>
      </NodeShell.Footer>
    </NodeShell>
  )
}
