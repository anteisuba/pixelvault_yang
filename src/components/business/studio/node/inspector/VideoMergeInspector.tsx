'use client'

import { useCallback, useMemo, useState } from 'react'
import { useEdges, useNodes } from '@xyflow/react'
import { Layers, Loader2, Sparkles, Trash2, Video } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  NODE_GENERATION_STATUS_IDS,
  NODE_STATUS_IDS,
} from '@/constants/node-types'
import { NODE_STUDIO_PLACEHOLDER_TOAST } from '@/constants/node-studio'
import { mergeVideosAPI } from '@/lib/api-client'
import {
  getUpstreamNodes,
  harvestUpstreamVideoUrls,
} from '@/lib/node-workflow-graph'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'

import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'

interface VideoMergeInspectorProps {
  node: NodeWorkflowNode
}

const MIN_CLIPS = 2
const MAX_CLIPS = 9

export function VideoMergeInspector({ node }: VideoMergeInspectorProps) {
  const t = useTranslations('StudioNode.videoMerge')
  const allNodes = useNodes<NodeWorkflowNode>()
  const edges = useEdges<NodeWorkflowEdge>()
  const { updateNodeData } = useNodeWorkflowActions()
  const [isMerging, setIsMerging] = useState(false)

  const mediaUrl =
    typeof node.data.mediaUrl === 'string' ? node.data.mediaUrl : null
  const generationStatus =
    node.data.generationStatus ??
    (mediaUrl
      ? NODE_GENERATION_STATUS_IDS.success
      : NODE_GENERATION_STATUS_IDS.idle)

  // Walk upstream once + reuse for both the clip-list rendering and the
  // merge request payload, so what users see in the Inspector is exactly
  // what fal receives.
  const upstreamVideoUrls = useMemo(() => {
    const upstream = getUpstreamNodes(node.id, edges, allNodes)
    return harvestUpstreamVideoUrls(upstream)
  }, [allNodes, edges, node.id])

  const clipCount = upstreamVideoUrls.length
  const canMerge =
    clipCount >= MIN_CLIPS && clipCount <= MAX_CLIPS && !isMerging

  const disabledReason =
    clipCount < MIN_CLIPS
      ? t('errors.tooFewClips', { min: MIN_CLIPS })
      : clipCount > MAX_CLIPS
        ? t('errors.tooManyClips', { max: MAX_CLIPS })
        : null

  const handleMerge = useCallback(async () => {
    if (!canMerge) return
    setIsMerging(true)
    updateNodeData(node.id, {
      generationStatus: NODE_GENERATION_STATUS_IDS.pending,
      status: NODE_STATUS_IDS.running,
      generationError: undefined,
    })

    try {
      const response = await mergeVideosAPI({ videoUrls: upstreamVideoUrls })

      if (!response.success || !response.data) {
        const errorMessage = response.error ?? t('errors.mergeFailed')
        updateNodeData(node.id, {
          generationStatus: NODE_GENERATION_STATUS_IDS.error,
          status: NODE_STATUS_IDS.failed,
          generationError: errorMessage,
        })
        toast.error(errorMessage, {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
        return
      }

      updateNodeData(node.id, {
        mediaUrl: response.data.url,
        mediaLabel: t('mediaLabel', { count: upstreamVideoUrls.length }),
        generationStatus: NODE_GENERATION_STATUS_IDS.success,
        status: NODE_STATUS_IDS.done,
        generationError: undefined,
      })
      toast.success(t('merged'), {
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
    } finally {
      setIsMerging(false)
    }
  }, [canMerge, node.id, t, updateNodeData, upstreamVideoUrls])

  const handleClear = useCallback(() => {
    updateNodeData(node.id, {
      mediaUrl: undefined,
      mediaLabel: undefined,
      generationStatus: NODE_GENERATION_STATUS_IDS.idle,
      status: NODE_STATUS_IDS.idle,
      generationError: undefined,
    })
  }, [node.id, updateNodeData])

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-node-panel-inner bg-node-panel-soft p-3">
        <p className="text-sm font-semibold text-node-foreground">
          {t('title')}
        </p>
        <p className="mt-1 text-xs leading-5 text-node-muted">
          {t('description')}
        </p>
      </div>

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
            <span className="flex size-11 items-center justify-center rounded-xl bg-purple-500/15 text-purple-200">
              <Layers className="size-5" />
            </span>
            <p className="text-xs leading-5 text-node-muted">
              {t('emptyPreview')}
            </p>
          </div>
        )}
        {isMerging ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-node-canvas/70 text-node-foreground backdrop-blur-sm">
            <Loader2 className="size-5 animate-spin text-node-amber" />
            <span className="text-xs font-semibold">{t('merging')}</span>
          </div>
        ) : null}
      </div>

      <div className="space-y-2 rounded-xl border border-node-panel-inner bg-node-panel-soft p-3">
        <div className="flex items-center justify-between gap-2 text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
          <span className="flex items-center gap-2">
            <Video className="size-3.5 text-purple-200" />
            {t('upstreamHeader')}
          </span>
          <span className="rounded-full border border-node-panel-inner bg-node-panel px-2 py-0.5 normal-case tracking-normal">
            {t('clipCount', { count: clipCount, max: MAX_CLIPS })}
          </span>
        </div>
        {clipCount > 0 ? (
          <ol className="space-y-1.5">
            {upstreamVideoUrls.map((url, index) => (
              <li
                key={url}
                className="flex items-center gap-2 rounded-lg border border-node-panel-inner bg-node-panel px-2 py-1.5 text-xs text-node-foreground"
              >
                <span className="flex size-5 items-center justify-center rounded-md bg-purple-500/20 text-2xs font-semibold text-purple-200">
                  {index + 1}
                </span>
                <span className="flex-1 truncate text-node-muted">{url}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-xs leading-5 text-node-subtle">
            {t('upstreamEmpty')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          onClick={() => void handleMerge()}
          disabled={!canMerge}
          className="bg-purple-500 text-white hover:bg-purple-500/90"
        >
          <Sparkles className="mr-2 size-4" />
          {mediaUrl ? t('merge.regenerate') : t('merge.run')}
        </Button>
        {disabledReason ? (
          <p className="text-xs leading-5 text-node-danger">{disabledReason}</p>
        ) : null}
        {mediaUrl ? (
          <Button
            type="button"
            variant="outline"
            onClick={handleClear}
            disabled={isMerging}
          >
            <Trash2 className="mr-2 size-4" />
            {t('clear')}
          </Button>
        ) : null}
        {generationStatus === NODE_GENERATION_STATUS_IDS.error &&
        node.data.generationError ? (
          <p className="text-xs leading-5 text-node-danger">
            {node.data.generationError}
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border border-node-panel-inner bg-node-panel-soft p-3 text-xs leading-5 text-node-muted">
        <p>{t('hint')}</p>
      </div>
    </div>
  )
}
