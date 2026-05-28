import 'server-only'

import { EXECUTION_SWEEPER } from '@/constants/execution'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

const SWEEP_FAILURE_MESSAGE =
  'Reaped by execution sweeper: no worker callback within the stale threshold'

export interface SweepResult {
  staleJobsReaped: number
  expiredOutboxesReaped: number
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
    data: {
      status: 'FAILED',
      completedAt: now,
      errorMessage: SWEEP_FAILURE_MESSAGE,
    },
  })

  const reapedOutboxes = await db.executionOutbox.updateMany({
    where: { status: 'PROCESSING', leaseExpiresAt: { lt: now } },
    data: {
      status: 'FAILED',
      lastError: SWEEP_FAILURE_MESSAGE,
      leaseExpiresAt: null,
      processedAt: now,
    },
  })

  const result: SweepResult = {
    staleJobsReaped: reapedJobs.count,
    expiredOutboxesReaped: reapedOutboxes.count,
  }

  if (result.staleJobsReaped > 0 || result.expiredOutboxesReaped > 0) {
    logger.warn('Execution sweeper reaped orphaned executions', {
      staleJobsReaped: result.staleJobsReaped,
      expiredOutboxesReaped: result.expiredOutboxesReaped,
    })
  }

  return result
}
