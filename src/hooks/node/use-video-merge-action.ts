'use client'

import { useCallback, useMemo, useState } from 'react'
import { useEdges, useNodes } from '@xyflow/react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { useNodeWorkflowActions } from '@/components/business/node/NodeWorkflowActionsContext'
import { NODE_STUDIO_PLACEHOLDER_TOAST } from '@/constants/node-studio'
import {
  NODE_GENERATION_STATUS_IDS,
  NODE_STATUS_IDS,
} from '@/constants/node-types'
import { mergeVideosAPI } from '@/lib/api-client'
import type { MergeVideoClipInput } from '@/lib/api-client/node-workflow'
import {
  getUpstreamNodes,
  harvestUpstreamVideoUrls,
} from '@/lib/node-workflow-graph'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'

const MIN_CLIPS = 2
const MAX_CLIPS = 9

export type VideoMergeDisabledReason =
  | { kind: 'tooFewClips'; min: number }
  | { kind: 'tooManyClips'; max: number }
  | { kind: 'invalidTrim' }
  | null

export interface ClipTrimOverride {
  startSec?: number
  endSec?: number
}

export interface VideoMergeAction {
  upstreamVideoUrls: string[]
  clipCount: number
  minClips: number
  maxClips: number
  clipOverrides: Map<string, ClipTrimOverride>
  hasAnyTrim: boolean
  hasInvalidTrim: boolean
  canMerge: boolean
  isMerging: boolean
  disabledReason: VideoMergeDisabledReason
  handleMerge(): Promise<void>
}

/**
 * R3-3 extraction (canvas-relationship-v3 §7): the 合成 trigger used to live
 * only inside `VideoMergeInspector` (the ⤢ detail body). The selection
 * toolbar's 合成 capability button needs the exact same handler, not a
 * second implementation — this hook is now the single source of truth both
 * consume. Per-clip trim EDITING (the start/end number inputs) stays local
 * to the Inspector; this hook only reads the already-persisted
 * `mergeSettings` to build the payload/validity, identical to the logic it
 * replaced.
 */
export function useVideoMergeAction(node: NodeWorkflowNode): VideoMergeAction {
  const t = useTranslations('StudioNode.videoMerge')
  const allNodes = useNodes<NodeWorkflowNode>()
  const edges = useEdges<NodeWorkflowEdge>()
  const { updateNodeData } = useNodeWorkflowActions()
  const [isMerging, setIsMerging] = useState(false)

  const upstreamVideoUrls = useMemo(() => {
    const upstream = getUpstreamNodes(node.id, edges, allNodes)
    return harvestUpstreamVideoUrls(upstream)
  }, [allNodes, edges, node.id])

  const clipOverrides = useMemo(() => {
    const map = new Map<string, ClipTrimOverride>()
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

  const hasInvalidTrim = useMemo(
    () =>
      upstreamVideoUrls.some((url) => {
        const override = clipOverrides.get(url)
        return (
          typeof override?.startSec === 'number' &&
          typeof override.endSec === 'number' &&
          override.endSec <= override.startSec
        )
      }),
    [clipOverrides, upstreamVideoUrls],
  )

  const clipCount = upstreamVideoUrls.length
  const canMerge =
    clipCount >= MIN_CLIPS &&
    clipCount <= MAX_CLIPS &&
    !hasInvalidTrim &&
    !isMerging

  const disabledReason: VideoMergeDisabledReason =
    clipCount < MIN_CLIPS
      ? { kind: 'tooFewClips', min: MIN_CLIPS }
      : clipCount > MAX_CLIPS
        ? { kind: 'tooManyClips', max: MAX_CLIPS }
        : hasInvalidTrim
          ? { kind: 'invalidTrim' }
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
        ...(response.data.generationId
          ? { generationId: response.data.generationId }
          : {}),
        ...(response.data.lineage ? { lineage: response.data.lineage } : {}),
        generationError: undefined,
      })
      toast.success(t('merged'), {
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
    } catch {
      const errorMessage = t('errors.mergeFailed')
      updateNodeData(node.id, {
        generationStatus: NODE_GENERATION_STATUS_IDS.error,
        status: NODE_STATUS_IDS.failed,
        generationError: errorMessage,
      })
      toast.error(errorMessage, {
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

  return {
    upstreamVideoUrls,
    clipCount,
    minClips: MIN_CLIPS,
    maxClips: MAX_CLIPS,
    clipOverrides,
    hasAnyTrim,
    hasInvalidTrim,
    canMerge,
    isMerging,
    disabledReason,
    handleMerge,
  }
}
