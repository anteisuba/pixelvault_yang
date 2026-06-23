'use client'

import { useCallback, useEffect, useRef } from 'react'

import {
  NODE_GENERATION_STATUS_IDS,
  NODE_MEDIA_KIND_BY_NODE_TYPE,
  NODE_MEDIA_KIND_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
} from '@/constants/node-types'
import {
  NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS,
  NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS,
} from '@/constants/node-studio'
import {
  checkAudioStatusAPI,
  checkImageGenerationStatusAPI,
  checkVideoStatusAPI,
} from '@/lib/api-client'
import type {
  GenerationStatusProbe,
  GenerationStatusProbeResponse,
} from '@/lib/poll-generation-status'
import type {
  NodeWorkflowNode,
  NodeWorkflowNodeData,
} from '@/types/node-workflow'

interface GenerationFailurePayload {
  error?: string
  errorCode?: string
  i18nKey?: string
}

interface UseNodeGenerationReconcileInput {
  nodes: NodeWorkflowNode[]
  updateNodeData(id: string, patch: Partial<NodeWorkflowNodeData>): void
  /**
   * Localizes a FAILED status payload. The Workbench wires this to its `Errors`
   * translator so a reconcile-detected failure reads the same as a foreground
   * one, instead of leaking a raw provider string.
   */
  formatError(payload: GenerationFailurePayload): string
}

function isReconcilable(node: NodeWorkflowNode): boolean {
  return (
    node.data.generationStatus === NODE_GENERATION_STATUS_IDS.pending &&
    typeof node.data.mediaJobId === 'string' &&
    node.data.mediaJobId.length > 0
  )
}

function statusProbeForKind(kind: string | undefined): GenerationStatusProbe {
  if (kind === NODE_MEDIA_KIND_IDS.video) return checkVideoStatusAPI
  if (kind === NODE_MEDIA_KIND_IDS.audio) return checkAudioStatusAPI
  return checkImageGenerationStatusAPI
}

/**
 * Reconcile in-flight node generations that the foreground poll loop couldn't
 * see through to a terminal state — a poll window that timed out, or a reload
 * mid-generation. Such a node persists `generationStatus: 'pending'` plus its
 * `mediaJobId`; the worker finishes server-side regardless. On mount, on tab
 * refocus, and whenever a new pending job appears, this re-queries each job by
 * id and backfills its result.
 *
 * It only ever reads status — never re-submits — so credits are not charged
 * twice. A still-IN_PROGRESS probe, a transient failure, or a thrown fetch
 * simply leaves the node pending for the next pass.
 */
export function useNodeGenerationReconcile({
  nodes,
  updateNodeData,
  formatError,
}: UseNodeGenerationReconcileInput): void {
  // Read the latest nodes inside async passes without re-subscribing the
  // focus/visibility listeners on every render.
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  // Guards against overlapping passes (e.g. focus firing while a pass is still
  // resolving its probes).
  const isReconcilingRef = useRef(false)

  const reconcileNode = useCallback(
    async (node: NodeWorkflowNode): Promise<void> => {
      const jobId = node.data.mediaJobId
      if (!jobId) return

      const kind =
        node.data.mediaKind ?? NODE_MEDIA_KIND_BY_NODE_TYPE[node.type]
      if (!kind || kind === NODE_MEDIA_KIND_IDS.text) return

      let response: GenerationStatusProbeResponse | null = null
      try {
        response = await statusProbeForKind(kind)(jobId)
      } catch {
        return // transient (network) — leave pending for the next pass
      }

      const data = response?.success ? response.data : undefined
      if (!data) return // transient/empty envelope — leave pending

      if (data.status === 'COMPLETED' && data.generation) {
        const generation = data.generation

        if (node.type === NODE_TYPE_IDS.characterImage) {
          updateNodeData(node.id, {
            generationError: undefined,
            generationId: generation.id,
            generationStatus: NODE_GENERATION_STATUS_IDS.success,
            imageMode: NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.ai,
            imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.generated,
            imageUrl: generation.url,
            mediaJobId: undefined,
            sourceGenerationId: undefined,
            sourceLabel: undefined,
            status: NODE_STATUS_IDS.done,
          })
          return
        }

        updateNodeData(node.id, {
          generationError: undefined,
          generationId: generation.id,
          generationStatus: NODE_GENERATION_STATUS_IDS.success,
          ...(kind === NODE_MEDIA_KIND_IDS.image
            ? {
                imageMode: NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.ai,
                imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.generated,
                sourceGenerationId: undefined,
                sourceLabel: undefined,
              }
            : {}),
          mediaJobId: undefined,
          mediaKind: kind,
          mediaUrl: generation.url,
          mediaLabel: generation.model,
          lastSeed:
            typeof generation.seed === 'number' ? generation.seed : undefined,
          status: NODE_STATUS_IDS.done,
        })
        return
      }

      if (data.status === 'FAILED') {
        updateNodeData(node.id, {
          generationError: formatError({
            error: data.error,
            errorCode: data.errorCode,
            i18nKey: data.i18nKey,
          }),
          generationStatus: NODE_GENERATION_STATUS_IDS.error,
          mediaJobId: undefined,
          status: NODE_STATUS_IDS.failed,
        })
      }
      // IN_QUEUE / IN_PROGRESS → still running; leave pending for the next pass.
    },
    [formatError, updateNodeData],
  )

  const reconcileAll = useCallback(async (): Promise<void> => {
    if (isReconcilingRef.current) return
    const pendingNodes = nodesRef.current.filter(isReconcilable)
    if (pendingNodes.length === 0) return

    isReconcilingRef.current = true
    try {
      await Promise.all(pendingNodes.map(reconcileNode))
    } finally {
      isReconcilingRef.current = false
    }
  }, [reconcileNode])

  // Consume reconcileAll through a ref so the effects below don't re-fire (or
  // re-register listeners) on every unrelated canvas render — dragging/selecting
  // nodes churns this hook's inputs many times a second.
  const reconcileAllRef = useRef(reconcileAll)
  reconcileAllRef.current = reconcileAll

  // A stable key of the currently-pending job ids. Re-runs the pass on mount
  // and whenever a job enters (or leaves) the pending set — e.g. a fresh
  // poll-window timeout — without re-firing on unrelated node edits/drags.
  const pendingKey = nodes
    .filter(isReconcilable)
    .map((node) => node.data.mediaJobId)
    .sort()
    .join(',')

  useEffect(() => {
    void reconcileAllRef.current()
  }, [pendingKey])

  // Tab refocus / visibility return is the canonical "came back to check on it"
  // moment — reconcile jobs that finished while the tab was backgrounded.
  useEffect(() => {
    const onActivate = () => {
      void reconcileAllRef.current()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void reconcileAllRef.current()
      }
    }
    window.addEventListener('focus', onActivate)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', onActivate)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])
}
