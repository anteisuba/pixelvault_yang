'use client'

import Image from 'next/image'
import type { NodeProps } from '@xyflow/react'
import {
  AlertCircle,
  FileText,
  ImageIcon,
  Loader2,
  Mic2,
  Video,
  WandSparkles,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  NODE_GENERATION_STATUS_IDS,
  NODE_MEDIA_KIND_IDS,
  NODE_STATUS_IDS,
  type NodeWorkflowMediaKind,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { NodeShell } from './NodeShell'

interface NodeMediaPreviewProps extends NodeProps<NodeWorkflowNode> {
  type: NodeWorkflowNodeType
  kind: NodeWorkflowMediaKind
}

function getEmptyIcon(kind: NodeWorkflowMediaKind) {
  switch (kind) {
    case NODE_MEDIA_KIND_IDS.video:
      return <Video className="size-8 text-teal-200" />
    case NODE_MEDIA_KIND_IDS.audio:
      return <Mic2 className="size-8 text-fuchsia-200" />
    case NODE_MEDIA_KIND_IDS.text:
      return <FileText className="size-8 text-stone-100" />
    default:
      return <ImageIcon className="size-8 text-node-amber" />
  }
}

function getMediaStatusLabelKey(
  hasMedia: boolean,
  kind: NodeWorkflowMediaKind,
): 'statusIdle' | 'statusSuccess' | 'statusTextReady' {
  if (kind === NODE_MEDIA_KIND_IDS.text) {
    return 'statusTextReady'
  }

  return hasMedia ? 'statusSuccess' : 'statusIdle'
}

export function NodeMediaPreview({
  type,
  kind,
  data,
  selected,
}: NodeMediaPreviewProps) {
  const t = useTranslations('StudioNode.mediaNodes')
  const mediaUrl = typeof data.mediaUrl === 'string' ? data.mediaUrl : null
  const generationStatus =
    data.generationStatus ??
    (mediaUrl
      ? NODE_GENERATION_STATUS_IDS.success
      : NODE_GENERATION_STATUS_IDS.idle)
  const isPending =
    generationStatus === NODE_GENERATION_STATUS_IDS.pending ||
    data.status === NODE_STATUS_IDS.running
  const isError =
    generationStatus === NODE_GENERATION_STATUS_IDS.error ||
    (data.status === NODE_STATUS_IDS.failed && Boolean(data.generationError))

  return (
    <NodeShell type={type} selected={selected}>
      <NodeShell.Header type={type} status={data.status} />
      <NodeShell.Body className="space-y-3">
        <div className="relative aspect-video overflow-hidden rounded-2xl border border-node-panel-inner bg-node-panel-soft">
          {mediaUrl && kind === NODE_MEDIA_KIND_IDS.image ? (
            <Image
              src={mediaUrl}
              alt={t('imageAlt')}
              fill
              sizes="320px"
              className="object-cover"
              unoptimized
            />
          ) : null}

          {mediaUrl && kind === NODE_MEDIA_KIND_IDS.video ? (
            <video
              src={mediaUrl}
              className="h-full w-full object-cover"
              controls
              muted
            />
          ) : null}

          {mediaUrl && kind === NODE_MEDIA_KIND_IDS.audio ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-4">
              <Mic2 className="size-8 text-fuchsia-200" />
              <audio src={mediaUrl} controls className="w-full" />
            </div>
          ) : null}

          {kind === NODE_MEDIA_KIND_IDS.text || !mediaUrl ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
              {getEmptyIcon(kind)}
              <p className="text-xs leading-5 text-node-muted">
                {kind === NODE_MEDIA_KIND_IDS.text
                  ? t('textPreview')
                  : t('emptyPreview')}
              </p>
            </div>
          ) : null}

          {isPending ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-node-canvas/70 text-node-foreground backdrop-blur-sm">
              <Loader2 className="size-5 animate-spin text-node-amber" />
              <span className="text-xs font-semibold">{t('generating')}</span>
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-node-panel-inner bg-node-panel-soft p-3">
          <p className="text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
            {t('promptLabel')}
          </p>
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-node-foreground">
            {data.prompt || t('promptPlaceholder')}
          </p>
        </div>

        {isError ? (
          <div className="flex gap-2 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <p className="line-clamp-3 text-xs leading-5 text-red-100/80">
              {data.generationError}
            </p>
          </div>
        ) : null}
      </NodeShell.Body>
      <NodeShell.Footer>
        <p className="truncate text-2xs font-medium text-node-subtle">
          {t(getMediaStatusLabelKey(Boolean(mediaUrl), kind))}
        </p>
        <span className="flex size-8 items-center justify-center rounded-2xl bg-node-panel-inner text-node-amber">
          <WandSparkles className="size-4" />
        </span>
      </NodeShell.Footer>
    </NodeShell>
  )
}
