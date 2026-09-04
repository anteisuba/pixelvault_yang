import 'server-only'

import type {
  CancelGenerationsResponseData,
  WorkerCancelRequest,
} from '@/types'
import { notifyWorkerCancel } from '@/services/execution-worker.service'
import { ensureUser } from '@/services/user.service'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

const CANCELLABLE_STATUSES = ['QUEUED', 'RUNNING'] as const

/**
 * Best-effort "stop what you're doing" notify to the execution worker for a
 * job that has just been CAS-transitioned to `CANCELLED` in the DB. Never
 * throws — the DB-side cancel has already succeeded and is the source of
 * truth the status-poll endpoints read from; a slow/unreachable/not-yet-
 * implemented worker `/cancel` route must not turn a successful cancel into
 * an error for the caller.
 *
 * The workflow id the worker knows a run by is always the `GenerationJob`
 * id itself (every dispatcher submits `runId: job.id` and the worker's own
 * acknowledgement echoes it back as `workflowInstanceId` — see the comments
 * in `submit-image.service.ts` / `generate-3d.service.ts` next to their
 * `externalRequestId` writes), so no metadata parsing is needed here.
 */
export async function notifyWorkerCancelBestEffort(job: {
  id: string
  provider: string
  providerJobId?: string | null
}): Promise<void> {
  const request: WorkerCancelRequest = {
    jobId: job.id,
    workflowInstanceId: job.id,
    provider: job.provider,
    ...(job.providerJobId ? { providerJobId: job.providerJobId } : {}),
  }

  try {
    await notifyWorkerCancel(request)
  } catch (error) {
    logger.warn('Execution worker cancel notify failed (best-effort)', {
      jobId: job.id,
      provider: job.provider,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Cross-domain cancel for `GenerationJob` rows (image/video/audio/3D —
 * anything dispatched through the execution worker). Called by
 * `POST /api/generations/cancel` for both single-job cancel and "cancel all"
 * (both send a batch of 1..`GENERATION_CANCEL_MAX_BATCH` ids).
 *
 * Contract:
 *
 * For each `jobId` in `jobIds`:
 * 1. Verify the job belongs to the caller (resolved via `ensureUser`).
 *    Missing row or ownership mismatch → `notFound`. Never leaks whether a
 *    job exists for another user — same bucket either way.
 * 2. If `QUEUED`/`RUNNING`: CAS to `CANCELLED` (`updateMany` scoped to those
 *    two statuses, so a concurrent worker callback finalizing the job first
 *    always wins) → `cancelled` on success, `alreadyFinished` if the CAS
 *    lost the race.
 * 3. Already terminal (`COMPLETED`/`FAILED`/`CANCELLED`) → `alreadyFinished`.
 *    No-op, not an error.
 * 4. For every job actually transitioned in step 2: best-effort notify the
 *    execution worker (see `notifyWorkerCancelBestEffort`).
 *
 * Every input id ends up in exactly one of the three result arrays.
 */
export async function cancelGenerationJobs(
  clerkId: string,
  jobIds: string[],
): Promise<CancelGenerationsResponseData> {
  const dbUser = await ensureUser(clerkId)

  const ownedJobs = await db.generationJob.findMany({
    where: { id: { in: jobIds }, userId: dbUser.id },
    select: { id: true, status: true, provider: true, providerJobId: true },
  })

  const ownedById = new Map(ownedJobs.map((job) => [job.id, job]))
  const notFound = jobIds.filter((id) => !ownedById.has(id))

  const candidateIds = ownedJobs
    .filter((job) =>
      CANCELLABLE_STATUSES.includes(
        job.status as (typeof CANCELLABLE_STATUSES)[number],
      ),
    )
    .map((job) => job.id)

  const alreadyFinished = ownedJobs
    .filter(
      (job) =>
        !CANCELLABLE_STATUSES.includes(
          job.status as (typeof CANCELLABLE_STATUSES)[number],
        ),
    )
    .map((job) => job.id)

  const cancelled: string[] = []

  if (candidateIds.length > 0) {
    await db.generationJob.updateMany({
      where: {
        id: { in: candidateIds },
        userId: dbUser.id,
        status: { in: [...CANCELLABLE_STATUSES] },
      },
      data: { status: 'CANCELLED' },
    })

    // The CAS above doesn't report which rows it actually touched, so
    // re-read to partition candidates into "actually cancelled" vs. "lost
    // the race to a concurrent worker callback finalizing the job first".
    const settled = await db.generationJob.findMany({
      where: { id: { in: candidateIds } },
      select: { id: true, status: true, provider: true, providerJobId: true },
    })

    for (const job of settled) {
      if (job.status === 'CANCELLED') {
        cancelled.push(job.id)
      } else {
        alreadyFinished.push(job.id)
      }
    }

    await Promise.all(
      settled
        .filter((job) => job.status === 'CANCELLED')
        .map((job) => notifyWorkerCancelBestEffort(job)),
    )
  }

  return { cancelled, alreadyFinished, notFound }
}
