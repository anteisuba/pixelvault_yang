import 'server-only'

import {
  EXECUTION_OUTBOX_KINDS,
  EXECUTION_SWEEPER,
} from '@/constants/execution'
import { GENERATION_ERROR_CODES } from '@/constants/generation-errors'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

export const STALE_EXECUTION_FAILURE_MESSAGE =
  'Reaped by execution sweeper: no worker callback within the stale threshold'

const staleFailureData = (now: Date) => ({
  status: 'FAILED' as const,
  completedAt: now,
  errorMessage: STALE_EXECUTION_FAILURE_MESSAGE,
  errorCode: GENERATION_ERROR_CODES.CALLBACK_TIMEOUT,
})

export interface SweepResult {
  staleJobsReaped: number
  expiredOutboxesReaped: number
}

export interface ReconcileGenerationJobInput {
  id: string
  status: string
  startedAt: Date | null
}

/**
 * Authenticated status endpoints call this as a lazy backstop. It keeps the
 * daily Hobby-compatible cron useful while ensuring a user who is actively
 * polling does not wait until the next daily sweep to see a terminal state.
 */
export async function reconcileStaleGenerationJob(
  job: ReconcileGenerationJobInput,
  now = new Date(),
): Promise<boolean> {
  const cutoff = new Date(
    now.getTime() - EXECUTION_SWEEPER.STALE_JOB_THRESHOLD_MS,
  )
  if (
    job.status !== 'RUNNING' ||
    !job.startedAt ||
    job.startedAt.getTime() >= cutoff.getTime()
  ) {
    return false
  }

  const reaped = await db.generationJob.updateMany({
    where: {
      id: job.id,
      status: 'RUNNING',
      startedAt: { lt: cutoff },
    },
    data: staleFailureData(now),
  })

  if (reaped.count > 0) {
    logger.warn('Execution status poll reaped orphaned job', {
      jobId: job.id,
    })
  }

  return reaped.count > 0
}

/**
 * Periodic safety net for orphaned executions. Two independent CAS sweeps:
 *
 *  - RUNNING GenerationJobs whose `startedAt` is older than the stale threshold
 *    — a worker crashed before ever calling /internal/execution/callback. The
 *    `status: 'RUNNING'` filter makes the update a CAS: a late callback that
 *    wins the race (RUNNING→COMPLETED) is left untouched, and vice-versa.
 *  - PROCESSING ExecutionOutbox rows whose lease already expired — normally
 *    reclaimed lazily on the next audio status poll, swept here as a backstop
 *    for callers that never poll again.
 *
 * Billing is not refunded: ApiUsageLedger is only written at finalize, so a
 * stale RUNNING job was never charged. Free-tier slots are intentionally left
 * to expire naturally (per product decision) rather than released here.
 */
export async function sweepStaleExecutions(): Promise<SweepResult> {
  const now = new Date()
  const jobCutoff = new Date(
    now.getTime() - EXECUTION_SWEEPER.STALE_JOB_THRESHOLD_MS,
  )

  const reapedJobs = await db.generationJob.updateMany({
    where: { status: 'RUNNING', startedAt: { lt: jobCutoff } },
    data: staleFailureData(now),
  })

  // Preview generation is idempotent (the processor first checks whether both
  // derivative URLs already exist), so an expired lease is safe to requeue.
  // Provider-submit outboxes are not retried here: a lost provider response is
  // ambiguous and blindly resubmitting could double-charge the user.
  const requeuedPreviewOutboxes = await db.executionOutbox.updateMany({
    where: {
      kind: EXECUTION_OUTBOX_KINDS.IMAGE_PREVIEW_DERIVATIVES,
      status: 'PROCESSING',
      leaseExpiresAt: { lt: now },
    },
    data: {
      status: 'PENDING',
      lastError: STALE_EXECUTION_FAILURE_MESSAGE,
      leaseExpiresAt: null,
      processedAt: null,
    },
  })

  const failedAmbiguousOutboxes = await db.executionOutbox.updateMany({
    where: {
      kind: { not: EXECUTION_OUTBOX_KINDS.IMAGE_PREVIEW_DERIVATIVES },
      status: 'PROCESSING',
      leaseExpiresAt: { lt: now },
    },
    data: {
      status: 'FAILED',
      lastError: STALE_EXECUTION_FAILURE_MESSAGE,
      leaseExpiresAt: null,
      processedAt: now,
    },
  })

  const result: SweepResult = {
    staleJobsReaped: reapedJobs.count,
    expiredOutboxesReaped:
      requeuedPreviewOutboxes.count + failedAmbiguousOutboxes.count,
  }

  if (result.staleJobsReaped > 0 || result.expiredOutboxesReaped > 0) {
    logger.warn('Execution sweeper reaped orphaned executions', {
      staleJobsReaped: result.staleJobsReaped,
      expiredOutboxesReaped: result.expiredOutboxesReaped,
    })
  }

  return result
}
