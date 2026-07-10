'use client'

import { useCallback, useMemo, useState, type ChangeEvent } from 'react'
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
import type { MergeVideoClipInput } from '@/lib/api-client/node-workflow'
import {
  getUpstreamNodes,
  harvestUpstreamVideoUrls,
} from '@/lib/node-workflow-graph'
import { cn } from '@/lib/utils'
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

  // Trim overrides are keyed by source URL so re-ordering the upstream
  // doesn't lose user edits. When the upstream is disconnected the entry
  // simply doesn't render — it stays in the node's data so reconnecting
  // restores the trim.
  const clipOverrides = useMemo(() => {
    const map = new Map<string, { startSec?: number; endSec?: number }>()
    for (const clip of node.data.mergeSettings?.clips ?? []) {
      map.set(clip.url, { startSec: clip.startSec, endSec: clip.endSec })
    }
    return map
  }, [node.data.mergeSettings])

  const hasAnyTrim = useMemo(() => {
    for (const clip of node.data.mergeSettings?.clips ?? []) {
      if (typeof clip.startSec === 'number' && clip.startSec > 0) return true
      if (typeof clip.endSec === 'number') return true
    }
    return false
  }, [node.data.mergeSettings])

  const clipCount = upstreamVideoUrls.length
  const canMerge =
    clipCount >= MIN_CLIPS && clipCount <= MAX_CLIPS && !isMerging

  const disabledReason =
    clipCount < MIN_CLIPS
      ? t('errors.tooFewClips', { min: MIN_CLIPS })
      : clipCount > MAX_CLIPS
        ? t('errors.tooManyClips', { max: MAX_CLIPS })
        : null

  const handleTrimChange = useCallback(
    (url: string, field: 'startSec' | 'endSec', rawValue: string) => {
      const parsed = Number(rawValue)
      const next: number | undefined =
        rawValue.trim() === '' || !Number.isFinite(parsed)
          ? undefined
          : Math.min(600, Math.max(0, parsed))

      const existingClips = node.data.mergeSettings?.clips ?? []
      const filtered = existingClips.filter((clip) => clip.url !== url)
      const previousOverride = existingClips.find((clip) => clip.url === url)
      const updated = {
        url,
        startSec: field === 'startSec' ? next : previousOverride?.startSec,
        endSec: field === 'endSec' ? next : previousOverride?.endSec,
      }
      // Strip the entry entirely when both bounds are cleared — keeps
      // node.data clean and lets `hasAnyTrim` short-circuit the routing
      // decision back to the merge endpoint.
      const isEmpty =
        updated.startSec === undefined && updated.endSec === undefined
      const nextClips = isEmpty ? filtered : [...filtered, updated]

      updateNodeData(node.id, {
        mergeSettings: nextClips.length > 0 ? { clips: nextClips } : undefined,
      })
    },
    [node.data.mergeSettings, node.id, updateNodeData],
  )

  const handleMerge = useCallback(async () => {
    if (!canMerge) return
    setIsMerging(true)
    updateNodeData(node.id, {
      generationStatus: NODE_GENERATION_STATUS_IDS.pending,
      status: NODE_STATUS_IDS.running,
      generationError: undefined,
    })

    try {
      const payload = hasAnyTrim
        ? {
            clips: upstreamVideoUrls.map<MergeVideoClipInput>((url) => {
              const override = clipOverrides.get(url)
              return {
                url,
                startSec: override?.startSec,
                endSec: override?.endSec,
              }
            }),
          }
        : { videoUrls: upstreamVideoUrls }

      const response = await mergeVideosAPI(payload)

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
  }, [
    canMerge,
    clipOverrides,
    hasAnyTrim,
    node.id,
    t,
    updateNodeData,
    upstreamVideoUrls,
  ])

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
            <span className="flex size-11 items-center justify-center rounded-xl bg-node-port-video/20 text-node-port-video">
              <Layers className="size-5" />
            </span>
            <p className="text-xs leading-5 text-node-muted">
              {t('emptyPreview')}
            </p>
          </div>
        )}
        {isMerging ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-node-canvas/70 text-node-foreground backdrop-blur-sm">
            <Loader2 className="size-5 animate-spin text-node-muted" />
            <span className="text-xs font-semibold">{t('merging')}</span>
          </div>
        ) : null}
      </div>

      <div className="space-y-2 rounded-xl border border-node-panel-inner bg-node-panel-soft p-3">
        <div className="flex items-center justify-between gap-2 text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
          <span className="flex items-center gap-2">
            <Video className="size-3.5 text-node-port-video" />
            {t('upstreamHeader')}
          </span>
          <span className="rounded-full border border-node-panel-inner bg-node-panel px-2 py-0.5 normal-case tracking-normal">
            {t('clipCount', { count: clipCount, max: MAX_CLIPS })}
          </span>
        </div>
        {clipCount > 0 ? (
          <ol className="space-y-2">
            {upstreamVideoUrls.map((url, index) => {
              const override = clipOverrides.get(url)
              const startValue =
                typeof override?.startSec === 'number'
                  ? String(override.startSec)
                  : ''
              const endValue =
                typeof override?.endSec === 'number'
                  ? String(override.endSec)
                  : ''
              const rangeInvalid =
                typeof override?.startSec === 'number' &&
                typeof override?.endSec === 'number' &&
                override.endSec <= override.startSec
              return (
                <li
                  key={url}
                  className="space-y-2 rounded-lg border border-node-panel-inner bg-node-panel px-2 py-2 text-xs text-node-foreground"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-node-port-video/20 text-2xs font-semibold text-node-port-video">
                      {index + 1}
                    </span>
                    <span className="flex-1 truncate text-node-muted">
                      {url}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1 text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
                      {t('trim.startLabel')}
                      <input
                        type="number"
                        min={0}
                        max={600}
                        step={0.1}
                        value={startValue}
                        placeholder={t('trim.startPlaceholder')}
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                          handleTrimChange(url, 'startSec', event.target.value)
                        }
                        aria-label={t('trim.startLabelA11y', { n: index + 1 })}
                        className={cn(
                          'h-8 w-full rounded-lg border bg-node-panel-soft px-2 text-xs leading-4 text-node-foreground outline-none focus-visible:border-node-focus-ring focus-visible:ring-2 focus-visible:ring-node-focus-ring/20',
                          rangeInvalid
                            ? 'border-node-status-failed/60'
                            : 'border-node-panel-inner',
                        )}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
                      {t('trim.endLabel')}
                      <input
                        type="number"
                        min={0}
                        max={600}
                        step={0.1}
                        value={endValue}
                        placeholder={t('trim.endPlaceholder')}
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                          handleTrimChange(url, 'endSec', event.target.value)
                        }
                        aria-label={t('trim.endLabelA11y', { n: index + 1 })}
                        className={cn(
                          'h-8 w-full rounded-lg border bg-node-panel-soft px-2 text-xs leading-4 text-node-foreground outline-none focus-visible:border-node-focus-ring focus-visible:ring-2 focus-visible:ring-node-focus-ring/20',
                          rangeInvalid
                            ? 'border-node-status-failed/60'
                            : 'border-node-panel-inner',
                        )}
                      />
                    </label>
                  </div>
                  {rangeInvalid ? (
                    <p className="text-2xs leading-4 text-node-status-failed">
                      {t('trim.rangeWarning')}
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="text-xs leading-5 text-node-subtle">
            {t('upstreamEmpty')}
          </p>
        )}
        {hasAnyTrim ? (
          <p className="rounded-lg border border-node-panel-inner bg-node-panel-soft px-2 py-1.5 text-2xs leading-4 text-node-muted">
            {t('trim.composeHint')}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          onClick={() => void handleMerge()}
          disabled={!canMerge}
          className="bg-node-paint text-node-canvas hover:bg-node-paint/90"
        >
          <Sparkles className="mr-2 size-4" />
          {mediaUrl ? t('merge.regenerate') : t('merge.run')}
        </Button>
        {disabledReason ? (
          <p className="text-xs leading-5 text-node-status-failed">
            {disabledReason}
          </p>
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
          <p className="text-xs leading-5 text-node-status-failed">
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
