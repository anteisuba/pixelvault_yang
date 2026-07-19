'use client'

import { useState } from 'react'
import Image from 'next/image'
import type { NodeProps } from '@xyflow/react'
import {
  AlertCircle,
  FileText,
  ImageIcon,
  Mic2,
  Video,
  WandSparkles,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  NODE_GENERATION_STATUS_IDS,
  NODE_MEDIA_KIND_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
  type NodeWorkflowMediaKind,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import { NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS } from '@/constants/node-studio'
import { buildNodeWorkflowPrompt } from '@/lib/node-workflow-prompt'
import type {
  NodeWorkflowNode,
  NodeWorkflowNodeData,
} from '@/types/node-workflow'
import { Spinner } from '@/components/ui/spinner'

import { NodeShell } from './NodeShell'

interface NodeMediaPreviewProps extends NodeProps<NodeWorkflowNode> {
  type: NodeWorkflowNodeType
  kind: NodeWorkflowMediaKind
}

function getEmptyIcon(kind: NodeWorkflowMediaKind, type: NodeWorkflowNodeType) {
  switch (kind) {
    case NODE_MEDIA_KIND_IDS.video:
      return <Video className="size-8 text-node-port-video" />
    case NODE_MEDIA_KIND_IDS.audio:
      return <Mic2 className="size-8 text-node-port-voice" />
    case NODE_MEDIA_KIND_IDS.text:
      return <FileText className="size-8 text-node-foreground" />
    default:
      return (
        <ImageIcon
          className={
            type === NODE_TYPE_IDS.characterImage
              ? 'size-8 text-node-port-character'
              : 'size-8 text-node-foreground'
          }
        />
      )
  }
}

/**
 * Per-role header title — nodes with a user-editable identity (character name,
 * background name) show it on the card so renames in the Inspector track here;
 * other roles fall back to the localized type label inside NodeShell.Header.
 *
 * FB-4: frameImage/videoMerge have no dedicated name field — they fall back to
 * the generic `mediaLabel` (the same field the toolbar's rename input now
 * writes for these types, and the same field LooseImageCard already reads for
 * a media-bearing card of the same type), so renaming stays visible once media
 * arrives and the card switches away from this component.
 */
function getHeaderTitle(
  type: NodeWorkflowNodeType,
  data: NodeWorkflowNodeData,
): string | undefined {
  if (type === NODE_TYPE_IDS.characterImage) {
    return (
      data.characterName?.trim() || data.character?.name?.trim() || undefined
    )
  }
  if (type === NODE_TYPE_IDS.backgroundImage) {
    return data.backgroundName?.trim() || undefined
  }
  if (type === NODE_TYPE_IDS.shot) {
    return data.shotName?.trim() || undefined
  }
  if (type === NODE_TYPE_IDS.frameImage || type === NODE_TYPE_IDS.videoMerge) {
    return data.mediaLabel?.trim() || undefined
  }
  return undefined
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
  id,
  type,
  kind,
  data,
  selected,
}: NodeMediaPreviewProps) {
  const [videoAspect, setVideoAspect] = useState<number | null>(null)
  const t = useTranslations('StudioNode.mediaNodes')
  const tWorkflows = useTranslations('StudioNode.workflowNodes')
  const mediaUrl = typeof data.mediaUrl === 'string' ? data.mediaUrl : null
  const videoThumbnailUrl =
    typeof data.videoThumbnailUrl === 'string'
      ? data.videoThumbnailUrl
      : undefined
  const hasWorkflowPrompt = Boolean(buildNodeWorkflowPrompt(type, data))
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
    <NodeShell
      nodeId={id}
      type={type}
      selected={selected}
      status={data.status}
      toolbarData={data}
    >
      <NodeShell.Header
        type={type}
        status={data.status}
        title={getHeaderTitle(type, data)}
      />
      <NodeShell.Ingredients nodeId={id} />
      <NodeShell.Body className="space-y-3">
        <div
          className="node-card-window relative aspect-video overflow-hidden rounded-sm border border-node-panel-inner bg-node-card-window"
          style={
            kind === NODE_MEDIA_KIND_IDS.video && videoAspect
              ? { aspectRatio: videoAspect }
              : undefined
          }
        >
          {mediaUrl && kind === NODE_MEDIA_KIND_IDS.image ? (
            <>
              <Image
                src={mediaUrl}
                alt={t('imageAlt')}
                fill
                sizes="320px"
                className="object-cover"
                unoptimized
              />
              <span className="absolute left-2 top-2 rounded-full border border-node-panel-inner bg-node-canvas/75 px-2 py-1 text-2xs font-semibold text-node-foreground backdrop-blur">
                {data.imageSource ===
                NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing
                  ? t('sourceExisting')
                  : t('sourceGenerated')}
              </span>
            </>
          ) : null}

          {mediaUrl && kind === NODE_MEDIA_KIND_IDS.video ? (
            <video
              src={mediaUrl}
              poster={videoThumbnailUrl}
              className="h-full w-full object-contain"
              controls
              muted
              onLoadedMetadata={(event) => {
                const { videoWidth, videoHeight } = event.currentTarget
                if (videoWidth > 0 && videoHeight > 0) {
                  setVideoAspect(videoWidth / videoHeight)
                }
              }}
            />
          ) : null}

          {mediaUrl && kind === NODE_MEDIA_KIND_IDS.audio ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-4">
              <Mic2 className="size-8 text-node-port-voice" />
              <audio src={mediaUrl} controls className="w-full" />
            </div>
          ) : null}

          {kind === NODE_MEDIA_KIND_IDS.text || !mediaUrl ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
              {getEmptyIcon(kind, type)}
              <p className="text-xs leading-5 text-node-muted">
                {tWorkflows(`${type}.emptyPreview`)}
              </p>
            </div>
          ) : null}

          {isPending ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-node-canvas/70 text-node-foreground backdrop-blur-sm">
              <Spinner size="lg" className="text-node-foreground" />
              <span className="text-xs font-semibold">{t('generating')}</span>
              {/* Fixed dark track (not the scope-relative bg-node-panel-inner): this
                  sits inside the deep window (.node-card-window), where the sweep
                  itself already reads --node-foreground from that scope (light).
                  A track tied to the outer .node-card-paper scope would resolve to
                  paper-strong (light-on-light, invisible) — see S2 report. */}
              <div className="node-canvas-progress-track h-1 w-24 rounded-full bg-node-canvas" />
            </div>
          ) : null}
        </div>

        {isError ? (
          <div className="flex gap-2 rounded-2xl border border-node-status-failed bg-node-status-failed/50 p-3 text-sm text-node-status-failed-fg">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <p className="line-clamp-3 text-xs leading-5 text-node-status-failed-fg/80">
              {data.generationError}
            </p>
          </div>
        ) : null}
      </NodeShell.Body>
      <NodeShell.Footer>
        <p className="truncate text-2xs font-medium text-node-subtle">
          {hasWorkflowPrompt
            ? t(getMediaStatusLabelKey(Boolean(mediaUrl), kind))
            : tWorkflows(`${type}.footerEmpty`)}
        </p>
        <span className="flex size-8 items-center justify-center rounded-2xl bg-node-panel-inner text-node-foreground">
          <WandSparkles className="size-4" />
        </span>
      </NodeShell.Footer>
    </NodeShell>
  )
}
